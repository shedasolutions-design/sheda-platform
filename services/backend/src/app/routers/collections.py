"""Sheda Collections: the off-chain half of a fractional property raise.

What this serves and what it refuses to serve is the whole design.

It serves the material a person reads before committing money, and the
counts a reputation is built from. It does not serve a target, a raised
figure, a share balance or a rank. Those either live on chain, where they
cannot be edited by anyone with database access, or are computed by the
client from inputs it can check. A second copy of a number that decides who
owns what is a second answer waiting to contradict the first.

Browsing needs no token. Someone deciding whether this is worth their money
has not decided to sign up, and a wall in front of the catalogue is how a
catalogue stops being read.
"""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.collection import (
    CollectionChainRecord,
    CollectionDocument,
    CollectionPhase,
    CollectionPhaseUpdate,
    CollectionProfile,
    CollectionProject,
    CollectionProjectImage,
    CollectionRoleEnum,
    CollectionUnit,
    DocumentStatusEnum,
    PhaseStateEnum,
    RaiseStatusEnum,
)
from app.models.user import BaseUser
from app.schemas.collection_schema import (
    ChainRecordOut,
    CollectionProfileCreate,
    CollectionProfileOut,
    CollectionProfileUpdate,
    DirectoryEntryOut,
    DocumentCreate,
    DocumentOut,
    DocumentVerify,
    ImageCreate,
    ImageOut,
    PhaseUpdateCreate,
    PhaseUpdateOut,
    ProjectCreate,
    ProjectDetailOut,
    ProjectPublish,
    ProjectSummaryOut,
    ProjectUpdate,
    UnitOut,
)
from app.services.user_service import ActiveUser, AdminUser
from core.database import get_db

router = APIRouter(tags=["Collections"], prefix="/collections")

#: Enough to show a development properly without letting one raise fill the
#: bucket. The marketplace uses the same ceiling for a listing.
MAX_PROJECT_IMAGES = 10


# ---- helpers ---------------------------------------------------------------


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _kyc_verified(user: Optional[BaseUser]) -> bool:
    """Whether the Sheda account behind a profile passed identity checks.

    Shown on a profile, deliberately kept out of the ranking. KYC says who
    someone is; it says nothing about whether they finish buildings.
    """
    if user is None:
        return False
    return bool(getattr(user, "verified", False))


def _profile_out(profile: CollectionProfile) -> CollectionProfileOut:
    out = CollectionProfileOut.model_validate(profile)
    out.kyc_verified = _kyc_verified(profile.user)
    out.avatar_url = getattr(profile.user, "avatar_url", None)
    if profile.chain_record is not None:
        out.chain_record = ChainRecordOut.model_validate(profile.chain_record)
    return out


def _cover(project: CollectionProject) -> Optional[str]:
    images = sorted(project.images, key=lambda i: i.position)
    return images[0].image_url if images else None


def _released_bps(project: CollectionProject) -> int:
    return sum(p.tranche_bps for p in project.phases if p.state == PhaseStateEnum.released)


def _summary_out(project: CollectionProject) -> ProjectSummaryOut:
    out = ProjectSummaryOut.model_validate(project)
    out.cover_image_url = _cover(project)
    out.builder = _profile_out(project.builder) if project.builder else None
    out.manager = _profile_out(project.manager) if project.manager else None
    out.phases_released_bps = _released_bps(project)
    return out


def _detail_out(project: CollectionProject, units: List[CollectionUnit]) -> ProjectDetailOut:
    out = ProjectDetailOut.model_validate(project)
    out.cover_image_url = _cover(project)
    out.builder = _profile_out(project.builder) if project.builder else None
    out.manager = _profile_out(project.manager) if project.manager else None
    out.image_urls = [i.image_url for i in sorted(project.images, key=lambda i: i.position)]
    out.documents = [DocumentOut.model_validate(d) for d in project.documents]
    out.unit_list = [UnitOut.model_validate(u) for u in units]
    out.phases_released_bps = _released_bps(project)
    return out


async def _my_profile(
    db: AsyncSession, user: BaseUser, role: CollectionRoleEnum
) -> CollectionProfile:
    result = await db.execute(
        select(CollectionProfile).where(
            CollectionProfile.user_id == user.id, CollectionProfile.role == role
        )
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not have a {role.value} profile yet.",
        )
    if profile.suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This profile is suspended and cannot act on raises.",
        )
    return profile


async def _owned_project(
    db: AsyncSession, slug: str, user: BaseUser
) -> tuple[CollectionProject, CollectionProfile]:
    builder = await _my_profile(db, user, CollectionRoleEnum.builder)
    result = await db.execute(
        select(CollectionProject).where(CollectionProject.slug == slug)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.builder_id != builder.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="That raise belongs to another builder.",
        )
    return project, builder


# ---- profiles --------------------------------------------------------------


@router.get("/profiles/me", response_model=List[CollectionProfileOut])
async def my_profiles(current_user: ActiveUser, db: AsyncSession = Depends(get_db)):
    """Every Collections profile on this account.

    A list rather than one object because a company that both builds and
    manages holds two, and their records must never be averaged together.
    """
    result = await db.execute(
        select(CollectionProfile).where(CollectionProfile.user_id == current_user.id)
    )
    return [_profile_out(p) for p in result.scalars().all()]


@router.post(
    "/profiles",
    response_model=CollectionProfileOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_profile(
    payload: CollectionProfileCreate,
    current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(CollectionProfile).where(
            CollectionProfile.user_id == current_user.id,
            CollectionProfile.role == payload.role,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You already have a {payload.role.value} profile.",
        )

    if payload.near_account_id:
        await _assert_near_account_free(db, payload.near_account_id, exclude_id=None)

    profile = CollectionProfile(
        user_id=current_user.id,
        role=payload.role,
        display_name=payload.display_name,
        near_account_id=payload.near_account_id,
        location=payload.location or getattr(current_user, "location", None),
        about=payload.about,
        since_year=payload.since_year or _utc_now().year,
        part_of_group=payload.part_of_group,
    )
    db.add(profile)
    await db.flush()

    # Created empty rather than left null, so a brand new profile reads as
    # "nothing has happened yet" instead of "we could not load this".
    db.add(CollectionChainRecord(profile_id=profile.id))
    await db.commit()
    await db.refresh(profile)
    return _profile_out(profile)


@router.patch("/profiles/{profile_id}", response_model=CollectionProfileOut)
async def update_profile(
    profile_id: int,
    payload: CollectionProfileUpdate,
    current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
):
    profile = await db.get(CollectionProfile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    if profile.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="That profile is not yours.")

    data = payload.model_dump(exclude_unset=True)
    if data.get("near_account_id"):
        await _assert_near_account_free(db, data["near_account_id"], exclude_id=profile.id)

    for field, value in data.items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return _profile_out(profile)


async def _assert_near_account_free(
    db: AsyncSession, near_account_id: str, exclude_id: Optional[int]
) -> None:
    """One NEAR account backs at most one profile of each kind.

    Two profiles sharing a chain identity would each show the other's stake
    as their own cover, which is the same lie as a builder promising one
    deposit to three raises.
    """
    query = select(CollectionProfile).where(
        CollectionProfile.near_account_id == near_account_id
    )
    if exclude_id is not None:
        query = query.where(CollectionProfile.id != exclude_id)
    clash = (await db.execute(query)).scalars().first()
    if clash is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That NEAR account is already linked to another profile.",
        )


@router.get("/profiles/{profile_id}", response_model=CollectionProfileOut)
async def get_profile(profile_id: int, db: AsyncSession = Depends(get_db)):
    """Open to anyone. A reputation nobody can read is not a reputation."""
    profile = await db.get(CollectionProfile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _profile_out(profile)


@router.get("/directory", response_model=List[DirectoryEntryOut])
async def directory(
    role: CollectionRoleEnum = Query(..., description="builder or manager"),
    db: AsyncSession = Depends(get_db),
):
    """Everyone of one kind, with the inputs a rank is computed from.

    Unordered on purpose. Ordering would mean scoring, scoring here would
    make the rank a server's opinion, and the product's claim is that it is
    not one. The client sorts what it is given with a function it can show.
    """
    result = await db.execute(
        select(CollectionProfile)
        .where(CollectionProfile.role == role, CollectionProfile.suspended.is_(False))
        .order_by(CollectionProfile.display_name)
    )
    profiles = result.scalars().all()

    counts = dict(
        (
            await db.execute(
                select(CollectionProject.builder_id, func.count(CollectionProject.id))
                .where(
                    CollectionProject.status.in_(
                        [
                            RaiseStatusEnum.open,
                            RaiseStatusEnum.funded,
                            RaiseStatusEnum.building,
                        ]
                    )
                )
                .group_by(CollectionProject.builder_id)
            )
        ).all()
    )

    return [
        DirectoryEntryOut(
            profile=_profile_out(p),
            live_projects=int(counts.get(p.id, 0)),
        )
        for p in profiles
    ]


# ---- projects --------------------------------------------------------------


@router.get("/projects", response_model=List[ProjectSummaryOut])
async def list_projects(
    status_filter: Optional[RaiseStatusEnum] = Query(default=None, alias="status"),
    builder_profile_id: Optional[int] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Raises, open to everyone.

    Drafts are never returned here. A draft is a builder's working copy, and
    an unpublished raise appearing in a public list would be read as an
    invitation to put money into something nobody has agreed terms for.
    """
    query = select(CollectionProject).where(
        CollectionProject.status != RaiseStatusEnum.draft
    )
    if status_filter is not None:
        if status_filter == RaiseStatusEnum.draft:
            raise HTTPException(status_code=400, detail="Drafts are not public.")
        query = query.where(CollectionProject.status == status_filter)
    if builder_profile_id is not None:
        query = query.where(CollectionProject.builder_id == builder_profile_id)

    result = await db.execute(query.order_by(CollectionProject.created_at.desc()))
    return [_summary_out(p) for p in result.scalars().all()]


@router.get("/projects/mine", response_model=List[ProjectSummaryOut])
async def my_projects(current_user: ActiveUser, db: AsyncSession = Depends(get_db)):
    """A builder's own raises, drafts included."""
    builder = await _my_profile(db, current_user, CollectionRoleEnum.builder)
    result = await db.execute(
        select(CollectionProject)
        .where(CollectionProject.builder_id == builder.id)
        .order_by(CollectionProject.created_at.desc())
    )
    return [_summary_out(p) for p in result.scalars().all()]


@router.get("/projects/{slug}", response_model=ProjectDetailOut)
async def get_project(slug: str, db: AsyncSession = Depends(get_db)):
    project = (
        await db.execute(select(CollectionProject).where(CollectionProject.slug == slug))
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status == RaiseStatusEnum.draft:
        raise HTTPException(status_code=404, detail="Project not found")

    units = (
        (
            await db.execute(
                select(CollectionUnit)
                .where(CollectionUnit.project_id == project.id)
                .order_by(CollectionUnit.code)
            )
        )
        .scalars()
        .all()
    )
    return _detail_out(project, list(units))


@router.post(
    "/projects", response_model=ProjectDetailOut, status_code=status.HTTP_201_CREATED
)
async def create_project(
    payload: ProjectCreate,
    current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
):
    """Open a draft raise.

    Created as a draft always. Publishing is a separate call because it
    needs the escrow account, and an escrow account only exists after the
    builder has signed a deployment from their own wallet.
    """
    builder = await _my_profile(db, current_user, CollectionRoleEnum.builder)

    clash = (
        await db.execute(
            select(CollectionProject).where(CollectionProject.slug == payload.slug)
        )
    ).scalar_one_or_none()
    if clash is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That slug is taken."
        )

    manager_id = payload.manager_profile_id
    if manager_id is not None:
        await _assert_usable_manager(db, manager_id)

    project = CollectionProject(
        slug=payload.slug,
        builder_id=builder.id,
        manager_id=manager_id,
        name=payload.name,
        description=payload.description,
        location=payload.location,
        units=payload.units,
        estimated_return_pct=payload.estimated_return_pct,
        closes_at=payload.closes_at,
        status=RaiseStatusEnum.draft,
    )
    db.add(project)
    await db.flush()

    for position, phase in enumerate(payload.phases):
        db.add(
            CollectionPhase(
                project_id=project.id,
                position=position,
                name=phase.name,
                tranche_bps=phase.tranche_bps,
                # Only the first phase can be worked on. The rest are locked
                # behind it, which is what the release schedule means.
                state=PhaseStateEnum.building
                if position == 0
                else PhaseStateEnum.locked,
            )
        )

    for unit in payload.unit_list:
        db.add(
            CollectionUnit(
                project_id=project.id,
                code=unit.code,
                label=unit.label,
                bedrooms=unit.bedrooms,
                price_atomic=unit.price_atomic,
                total_shares=unit.total_shares,
                shares_sold="0",
            )
        )

    await db.commit()
    await db.refresh(project)
    units = (
        (
            await db.execute(
                select(CollectionUnit).where(CollectionUnit.project_id == project.id)
            )
        )
        .scalars()
        .all()
    )
    return _detail_out(project, list(units))


async def _assert_usable_manager(db: AsyncSession, manager_profile_id: int) -> CollectionProfile:
    manager = await db.get(CollectionProfile, manager_profile_id)
    if manager is None or manager.role != CollectionRoleEnum.manager:
        raise HTTPException(status_code=404, detail="Manager profile not found")
    if manager.suspended:
        raise HTTPException(
            status_code=400, detail="That manager is suspended and cannot take a mandate."
        )
    return manager


@router.patch("/projects/{slug}", response_model=ProjectSummaryOut)
async def update_project(
    slug: str,
    payload: ProjectUpdate,
    current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
):
    """Edit a raise.

    Once it is open the terms are frozen. People committed money against
    what was written, and a description or a return estimate that can be
    rewritten underneath them makes the disclosure worthless. Only a draft
    is editable.
    """
    project, _ = await _owned_project(db, slug, current_user)
    if project.status != RaiseStatusEnum.draft:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This raise is already open. Its terms are what investors committed "
                "against and cannot be edited now."
            ),
        )

    data = payload.model_dump(exclude_unset=True)
    manager_id = data.pop("manager_profile_id", None)
    if manager_id is not None:
        await _assert_usable_manager(db, manager_id)
        project.manager_id = manager_id
    for field, value in data.items():
        setattr(project, field, value)

    await db.commit()
    await db.refresh(project)
    return _summary_out(project)


@router.post("/projects/{slug}/publish", response_model=ProjectSummaryOut)
async def publish_project(
    slug: str,
    payload: ProjectPublish,
    current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
):
    """Take a draft live, once it is actually on chain."""
    project, builder = await _owned_project(db, slug, current_user)
    if project.status != RaiseStatusEnum.draft:
        raise HTTPException(status_code=409, detail="This raise is already published.")

    manager = await _assert_usable_manager(db, payload.manager_profile_id)

    # R2. The party inspecting a phase decides whether the builder gets paid
    # for it, so it cannot be the builder. A group can hold both profiles,
    # which is exactly the case this has to catch: same account, or a manager
    # that names this builder's group as its own.
    if manager.user_id == builder.user_id or (
        manager.part_of_group
        and manager.part_of_group.strip().lower() == builder.display_name.strip().lower()
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "A raise cannot be inspected by the builder's own group. Name an "
                "independent property manager before publishing."
            ),
        )

    phases = (
        (
            await db.execute(
                select(CollectionPhase).where(CollectionPhase.project_id == project.id)
            )
        )
        .scalars()
        .all()
    )
    if not phases:
        raise HTTPException(
            status_code=400,
            detail="A raise needs a phase schedule before it can take money.",
        )
    total = sum(p.tranche_bps for p in phases)
    if total != 10_000:
        raise HTTPException(
            status_code=400,
            detail=(
                f"The phase schedule releases {total / 100:.2f}% of the raise. "
                "It has to release exactly 100%."
            ),
        )

    project.manager_id = manager.id
    project.escrow_account_id = payload.escrow_account_id
    project.vault_account_id = payload.vault_account_id
    project.status = RaiseStatusEnum.open
    await db.commit()
    await db.refresh(project)
    return _summary_out(project)


# ---- documents -------------------------------------------------------------


@router.post(
    "/projects/{slug}/documents",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_document(
    slug: str,
    payload: DocumentCreate,
    current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
):
    """Upload a document against a raise.

    It lands as `uploaded`, never as `verified`. Only Sheda marks something
    verified, because the badge means Sheda checked it, and a builder who
    could set it themselves would make the badge worth nothing.
    """
    project, _ = await _owned_project(db, slug, current_user)
    document = CollectionDocument(
        project_id=project.id,
        label=payload.label,
        file_url=payload.file_url,
        status=DocumentStatusEnum.uploaded
        if payload.file_url
        else DocumentStatusEnum.missing,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return DocumentOut.model_validate(document)


@router.patch("/documents/{document_id}/verify", response_model=DocumentOut)
async def verify_document(
    document_id: int,
    payload: DocumentVerify,
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Sheda's own check. Admin only, and the admin is recorded."""
    document = await db.get(CollectionDocument, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    document.status = payload.status
    if payload.status == DocumentStatusEnum.verified:
        document.verified_by_id = current_user.id
        document.verified_at = _utc_now()
    else:
        document.verified_by_id = None
        document.verified_at = None

    await db.commit()
    await db.refresh(document)
    return DocumentOut.model_validate(document)


# ---- images ----------------------------------------------------------------


@router.get("/projects/{slug}/images", response_model=List[ImageOut])
async def list_images(slug: str, db: AsyncSession = Depends(get_db)):
    """Public. The photographs are the first thing anyone judges a raise on."""
    project = (
        await db.execute(select(CollectionProject).where(CollectionProject.slug == slug))
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return [
        ImageOut.model_validate(i) for i in sorted(project.images, key=lambda x: x.position)
    ]


@router.post(
    "/projects/{slug}/images",
    response_model=ImageOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_image(
    slug: str,
    payload: ImageCreate,
    current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
):
    """Attach a photograph to a raise.

    Takes a URL rather than the bytes. The media endpoint already handles
    uploads for the marketplace, and routing images through a second path
    here would mean two places where a file size limit, a content type
    check and a storage bucket could disagree.

    Allowed after publishing, unlike the rest of the raise. The terms are
    frozen once people commit against them, but a photograph of the site as
    it stands is a progress report, not a term, and holders watching a
    building go up are the people it is for.
    """
    project, _ = await _owned_project(db, slug, current_user)

    count = len(project.images)
    if count >= MAX_PROJECT_IMAGES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A raise can carry at most {MAX_PROJECT_IMAGES} images.",
        )

    image = CollectionProjectImage(
        project_id=project.id,
        image_url=payload.image_url,
        # Appended by default, so the first image uploaded stays the cover
        # unless somebody deliberately reorders them.
        position=payload.position or count,
    )
    db.add(image)
    await db.commit()
    await db.refresh(image)
    return ImageOut.model_validate(image)


@router.delete("/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_image(
    image_id: int,
    current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
):
    image = await db.get(CollectionProjectImage, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")

    project = await db.get(CollectionProject, image.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    # Reuses the ownership check rather than repeating it, so a builder can
    # only ever remove a photograph from their own raise.
    await _owned_project(db, project.slug, current_user)

    await db.delete(image)
    await db.commit()


# ---- phase updates ---------------------------------------------------------


@router.get("/phases/{phase_id}/updates", response_model=List[PhaseUpdateOut])
async def phase_updates(phase_id: int, db: AsyncSession = Depends(get_db)):
    """What the builder has said about this phase. Public.

    Holders have seven days to object to a release and need something to
    base that on, so these are readable by anyone rather than only by people
    who already hold shares.
    """
    result = await db.execute(
        select(CollectionPhaseUpdate)
        .where(CollectionPhaseUpdate.phase_id == phase_id)
        .order_by(CollectionPhaseUpdate.created_at.desc())
    )
    return [PhaseUpdateOut.model_validate(u) for u in result.scalars().all()]


@router.post(
    "/phases/{phase_id}/updates",
    response_model=PhaseUpdateOut,
    status_code=status.HTTP_201_CREATED,
)
async def post_phase_update(
    phase_id: int,
    payload: PhaseUpdateCreate,
    current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
):
    """Post an update to holders.

    Open to the builder and to the manager inspecting the phase, and to
    nobody else. These are the two parties with something to report, and an
    update from anyone else would carry an authority it does not have.
    """
    phase = await db.get(CollectionPhase, phase_id)
    if phase is None:
        raise HTTPException(status_code=404, detail="Phase not found")

    project = await db.get(CollectionProject, phase.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    allowed_profiles = (
        (
            await db.execute(
                select(CollectionProfile).where(
                    CollectionProfile.user_id == current_user.id
                )
            )
        )
        .scalars()
        .all()
    )
    allowed_ids = {p.id for p in allowed_profiles}
    if project.builder_id not in allowed_ids and project.manager_id not in allowed_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the builder or the property manager can post an update here.",
        )

    update = CollectionPhaseUpdate(
        phase_id=phase_id,
        author_id=current_user.id,
        body=payload.body,
        image_url=payload.image_url,
    )
    db.add(update)
    await db.commit()
    await db.refresh(update)
    return PhaseUpdateOut.model_validate(update)


# ---- chain sync ------------------------------------------------------------


@router.post("/profiles/{profile_id}/chain-record", response_model=ChainRecordOut)
async def put_chain_record(
    profile_id: int,
    payload: ChainRecordOut,
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Write the cached chain counts for one profile.

    Admin only, and that restriction is the point rather than an
    afterthought. These counts are what a rank is computed from, so letting
    a builder post their own would hand them their own reputation. The
    indexer runs as an admin and is the only intended caller.
    """
    profile = await db.get(CollectionProfile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    record = (
        await db.execute(
            select(CollectionChainRecord).where(
                CollectionChainRecord.profile_id == profile_id
            )
        )
    ).scalar_one_or_none()
    if record is None:
        record = CollectionChainRecord(profile_id=profile_id)
        db.add(record)

    for field, value in payload.model_dump(exclude={"synced_at"}).items():
        setattr(record, field, value)
    record.synced_at = _utc_now()

    await db.commit()
    await db.refresh(record)
    return ChainRecordOut.model_validate(record)
