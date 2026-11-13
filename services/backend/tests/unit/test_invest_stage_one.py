"""Invest stage one: nominated managers, the project pack, project updates."""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.collection import CollectionDocument, CollectionProfile, DocumentStatusEnum
from app.models.user import Agent
from app.routers.collections import (
    create_project,
    post_project_update,
    publish_project,
    respond_to_nomination,
)
from app.schemas.collection_schema import (
    NominationRespond,
    PhaseCreate,
    ProjectCreate,
    ProjectPublish,
    ProjectUpdateCreate,
    UnitCreate,
)
from app.services.identity import LinkedIdentity
from app.utils.enums import AccountTypeEnum, ProfileEnum
from app.utils.utils import hash_password


def _ident(user) -> LinkedIdentity:
    return LinkedIdentity(active_id=user.id, active_profile=ProfileEnum.seller, ids=[user.id])


async def _user(db: AsyncSession, name: str) -> Agent:
    u = Agent(email=f"{name}@example.com", username=name, password=hash_password("whatever-password-1"),
              verified=True, account_type=AccountTypeEnum.agent, near_account_id=f"{name}.testnet")
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


async def _profile(db, user, role, name, **extra) -> CollectionProfile:
    p = CollectionProfile(user_id=user.id, role=role, display_name=name, near_account_id=f"{name.lower()}.testnet", **extra)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


def _payload(nominees):
    return ProjectCreate(
        slug="s1-flats", name="S1 Flats", location="Yaba, Lagos", units=1,
        project_type="completed", latitude=6.5, longitude=3.37,
        nominee_profile_ids=nominees,
        phases=[PhaseCreate(name="Handover", tranche_bps=10_000)],
        unit_list=[UnitCreate(code="1a", label="Flat 1A", bedrooms=2, price_atomic="40000000000", total_shares="10000")],
    )


async def test_manager_accepts_only_with_fee_and_pledge(db: AsyncSession):
    builder_user = await _user(db, "s1builder")
    manager_user = await _user(db, "s1manager")
    await _profile(db, builder_user, "builder", "S1 Homes")
    manager = await _profile(db, manager_user, "manager", "Eze PM")

    out = await create_project(_payload([manager.id]), builder_user, db)
    assert out.project_type == "completed" and out.latitude == 6.5
    nom = out.nominations[0]
    assert nom.status == "invited" and not nom.self_managed

    with pytest.raises(HTTPException) as e:
        await respond_to_nomination(nom.id, NominationRespond(accept=True), manager_user, _ident(manager_user), db)
    assert e.value.status_code == 400

    manager.fee_bps = 800
    manager.pledge = "Rent paid into the vault within 5 days of receipt."
    await db.commit()
    accepted = await respond_to_nomination(nom.id, NominationRespond(accept=True), manager_user, _ident(manager_user), db)
    assert accepted.status == "accepted" and accepted.fee_bps == 800
    assert accepted.pledge.startswith("Rent paid")


async def test_builders_own_company_is_marked_self_managed(db: AsyncSession):
    builder_user = await _user(db, "s1self")
    await _profile(db, builder_user, "builder", "Self Homes")
    own = await _profile(db, builder_user, "manager", "Self Homes Management", fee_bps=500, pledge="We manage our own.")
    out = await create_project(_payload([own.id]), builder_user, db)
    assert out.nominations[0].self_managed is True
    assert out.nominations[0].status == "accepted"
    assert out.self_managed is True


async def test_publish_needs_the_project_pack(db: AsyncSession):
    builder_user = await _user(db, "s1pack")
    manager_user = await _user(db, "s1packmgr")
    await _profile(db, builder_user, "builder", "Pack Homes")
    manager = await _profile(db, manager_user, "manager", "Pack PM", fee_bps=700, pledge="Monthly reports.")
    out = await create_project(_payload([manager.id]), builder_user, db)
    await respond_to_nomination(out.nominations[0].id, NominationRespond(accept=True), manager_user, _ident(manager_user), db)

    publish = ProjectPublish(escrow_account_id="raise.testnet", manager_profile_id=manager.id)
    with pytest.raises(HTTPException) as e:
        await publish_project("s1-flats", publish, builder_user, db)
    assert "project pack" in e.value.detail

    db.add(CollectionDocument(project_id=out.id, label="Project pack", file_url="https://example.com/pack.pdf",
                              is_pack=True, status=DocumentStatusEnum.uploaded))
    await db.commit()
    published = await publish_project("s1-flats", publish, builder_user, db)
    assert published.status == "open"


async def test_only_builder_or_manager_posts_updates(db: AsyncSession):
    builder_user = await _user(db, "s1upd")
    stranger = await _user(db, "s1stranger")
    await _profile(db, builder_user, "builder", "Upd Homes")
    await create_project(_payload([]), builder_user, db)
    posted = await post_project_update("s1-flats", ProjectUpdateCreate(kind="progress", body="Roof is on."),
                                       builder_user, _ident(builder_user), db)
    assert posted.author_name == "Upd Homes"
    with pytest.raises(HTTPException) as e:
        await post_project_update("s1-flats", ProjectUpdateCreate(body="Hello"), stranger, _ident(stranger), db)
    assert e.value.status_code == 403


async def test_admin_publish_opens_a_checked_draft(db: AsyncSession):
    from app.routers.collections import AdminPublish, admin_publish

    builder_user = await _user(db, "s1adm")
    manager_user = await _user(db, "s1admmgr")
    await _profile(db, builder_user, "builder", "Adm Homes")
    manager = await _profile(db, manager_user, "manager", "Adm PM", fee_bps=600, pledge="Reports monthly.")
    out = await create_project(_payload([manager.id]), builder_user, db)
    await respond_to_nomination(out.nominations[0].id, NominationRespond(accept=True), manager_user, _ident(manager_user), db)

    with pytest.raises(HTTPException):
        await admin_publish("s1-flats", AdminPublish(escrow_account_id="sheda-raise-v5.testnet"), builder_user, db)

    db.add(CollectionDocument(project_id=out.id, label="Project pack", file_url="https://example.com/pack.pdf",
                              is_pack=True, status=DocumentStatusEnum.uploaded))
    await db.commit()
    opened = await admin_publish("s1-flats", AdminPublish(escrow_account_id="sheda-raise-v5.testnet"), builder_user, db)
    assert opened.status == "open"
    assert opened.escrow_account_id == "sheda-raise-v5.testnet"
    assert opened.manager is not None and opened.manager.id == manager.id
