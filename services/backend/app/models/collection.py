"""Fractional property raises: the part of them that is not on chain.

Sheda Collections lets many people fund one building and own a share of the
rent it earns once it is let. The money, the shares, the stake and the phase
releases all live on NEAR, because those are the parts that have to be true
without trusting us.

What lives here is everything a contract is the wrong place for:

* the prose, photographs and documents that describe a development
* the phase names a builder publishes, and the updates they post against them
* which Sheda account a builder or manager profile belongs to
* a cache of chain events, so the directory can sort and page without every
  client replaying the chain for itself

One rule runs through the whole module and is worth stating once here. The
backend stores the **inputs** to a ranking and never the ranking itself. The
app tells people that Sheda does not adjust these scores, and that stops
being true the moment a server computes the number. Counting how many raises
a builder abandoned is bookkeeping; deciding what an abandonment is worth is
a judgement, and it belongs in code the reader can audit rather than in a
column anyone with database access could edit.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


def utc_now() -> datetime:
    """Return current UTC time as timezone-aware datetime."""
    return datetime.now(timezone.utc)


class CollectionRoleEnum(str, Enum):
    """What a profile does on a raise.

    Deliberately separate from AccountTypeEnum. A builder is an agent in the
    marketplace sense, but not every agent builds, and a property manager is
    an agent who never raises at all. Folding these into account_type would
    overload the polymorphic discriminator to win a vocabulary argument.
    """

    builder = "builder"
    manager = "manager"


class RaiseStatusEnum(str, Enum):
    draft = "draft"
    open = "open"
    funded = "funded"
    building = "building"
    delivered = "delivered"
    stalled = "stalled"
    cancelled = "cancelled"


class PhaseStateEnum(str, Enum):
    """Mirrors the raise contract's own phase states.

    Stored rather than derived because the backend must be able to show a
    phase, and say which party is holding it up, when the chain is briefly
    unreachable. The chain stays authoritative: a disagreement is resolved by
    re-reading it, never by trusting this column.
    """

    locked = "locked"
    building = "building"
    awaiting_inspection = "awaiting_inspection"
    objection_window = "objection_window"
    held = "held"
    released = "released"


class DocumentStatusEnum(str, Enum):
    verified = "verified"
    uploaded = "uploaded"
    missing = "missing"


class OutcomeEnum(str, Enum):
    """How a job ended. The only inputs the delivery score is built from."""

    on_time = "on_time"
    late = "late"
    abandoned = "abandoned"
    running = "running"


class CollectionProfile(Base):
    """A builder or manager, tied to a Sheda account and a NEAR account.

    Both links matter and they do different jobs. The Sheda account is who
    signs in, carries the KYC and can be contacted. The NEAR account is what
    the chain knows: it holds the stake, signs the attestations and is the
    name a slash is recorded against. A profile with no NEAR account can be
    filled in but cannot raise, because there would be nothing behind its
    promises.
    """

    __tablename__ = "collection_profile"
    __table_args__ = (
        # One builder profile and one manager profile per account at most.
        # A company that both builds and manages holds two, as the chain
        # does, because their records must not be averaged together.
        UniqueConstraint("user_id", "role", name="uq_collection_profile_user_role"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[CollectionRoleEnum] = mapped_column(
        SAEnum(CollectionRoleEnum, name="collection_role"), nullable=False, index=True
    )

    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    near_account_id: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True
    )
    location: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    about: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    since_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    #: Set where a manager belongs to a builder's own group. The app refuses
    #: to let such a manager sign off that builder's phases, so it has to be
    #: recorded rather than inferred from a shared surname.
    part_of_group: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    #: Admin switch for a profile that may not raise or take mandates. Kept
    #: apart from is_active on the user so suspending a builder does not also
    #: lock them out of the marketplace.
    suspended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    user = relationship("BaseUser", lazy="selectin", passive_deletes=True)
    chain_record = relationship(
        "CollectionChainRecord",
        back_populates="profile",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class CollectionChainRecord(Base):
    """A cache of what the chain says about one profile.

    Every column here is a count or a sum that the chain already publishes.
    Nothing is a score and nothing is a grade, because the app computes those
    and tells people it does.

    It exists so the directory can sort a hundred builders without a hundred
    RPC round trips. `synced_at` is served with it so a client can see how
    stale it is and go to the chain itself when the answer has to be current,
    which is the case at the moment somebody commits money.
    """

    __tablename__ = "collection_chain_record"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("collection_profile.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Builder inputs.
    projects_on_time: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    projects_late: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    projects_abandoned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    projects_running: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: Atomic units of the stablecoin, as strings. A u128 does not fit in a
    #: database integer, and rounding someone's stake to make it fit would be
    #: a silent corruption of the one number backing their promises.
    total_raised: Mapped[str] = mapped_column(String(40), nullable=False, default="0")
    stake_total: Mapped[str] = mapped_column(String(40), nullable=False, default="0")
    stake_allocated: Mapped[str] = mapped_column(String(40), nullable=False, default="0")
    stake_slashed_total: Mapped[str] = mapped_column(
        String(40), nullable=False, default="0"
    )
    slash_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Manager inputs.
    units_managed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    let_months: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    mandate_months: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rent_paid_out: Mapped[str] = mapped_column(String(40), nullable=False, default="0")
    periods_paid_on_time: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    periods_due: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    disputes_upheld: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    #: When this was last rebuilt from chain events. Served to clients so a
    #: stale cache is visible rather than silently believed.
    synced_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    #: Block height the sync reached, so the next one resumes rather than
    #: replaying the whole history.
    synced_block_height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    profile = relationship(
        "CollectionProfile", back_populates="chain_record", lazy="selectin"
    )


class CollectionProject(Base):
    """One raise, as described rather than as funded.

    Target, raised and released are not here. Those are the chain's, and a
    second copy of a number that decides who owns what is a second answer
    waiting to contradict the first. What is here is the material a person
    reads before deciding: what is being built, where, by whom, and what has
    been checked.
    """

    __tablename__ = "collection_project"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    #: Stable public identifier, used in URLs and as the contract's project
    #: key. Set by the builder, never reused.
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)

    builder_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("collection_profile.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    #: Nullable because a builder names the manager when the raise opens, and
    #: a draft exists before that.
    manager_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("collection_profile.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    location: Mapped[str] = mapped_column(String(120), nullable=False)
    units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    status: Mapped[RaiseStatusEnum] = mapped_column(
        SAEnum(RaiseStatusEnum, name="raise_status"),
        nullable=False,
        default=RaiseStatusEnum.draft,
        index=True,
    )

    #: The builder's own estimate, stored as given and always labelled as
    #: theirs wherever it is shown. Sheda does not verify it and must never
    #: present it as though it had.
    estimated_return_pct: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    #: Account the vault and escrow were deployed to. Null until the raise is
    #: actually on chain, which is what distinguishes a draft from a raise.
    vault_account_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    escrow_account_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    #: Marketplace NFT this raise is for, once the unit exists.
    property_token_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    closes_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    builder = relationship(
        "CollectionProfile", foreign_keys=[builder_id], lazy="selectin"
    )
    manager = relationship(
        "CollectionProfile", foreign_keys=[manager_id], lazy="selectin"
    )
    documents = relationship(
        "CollectionDocument",
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    phases = relationship(
        "CollectionPhase",
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="CollectionPhase.position",
    )
    images = relationship(
        "CollectionProjectImage",
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class CollectionProjectImage(Base):
    __tablename__ = "collection_project_image"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("collection_project.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    project = relationship("CollectionProject", back_populates="images", lazy="selectin")


class CollectionDocument(Base):
    """Title, planning permission, registration, and whether anyone checked.

    `missing` is a status rather than an absent row on purpose. The app shows
    an unverified document as loudly as a verified one, because a blank space
    where a document belongs reads as approval, and that is exactly the
    reading that costs somebody money.
    """

    __tablename__ = "collection_document"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("collection_project.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[DocumentStatusEnum] = mapped_column(
        SAEnum(DocumentStatusEnum, name="collection_document_status"),
        nullable=False,
        default=DocumentStatusEnum.missing,
    )
    file_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    #: Who at Sheda marked it verified, and when. A verification nobody is
    #: named against is a claim with no one behind it.
    verified_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    project = relationship(
        "CollectionProject", back_populates="documents", lazy="selectin"
    )


class CollectionPhase(Base):
    """A step in the build, and the slice of the raise it releases.

    `tranche_bps` is mirrored from the contract so the schedule can be read
    and explained while the chain is unreachable. The contract remains the
    only thing that can actually move the money.
    """

    __tablename__ = "collection_phase"
    __table_args__ = (
        UniqueConstraint("project_id", "position", name="uq_collection_phase_position"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("collection_project.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    #: Basis points of the target released when this phase passes.
    tranche_bps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    state: Mapped[PhaseStateEnum] = mapped_column(
        SAEnum(PhaseStateEnum, name="collection_phase_state"),
        nullable=False,
        default=PhaseStateEnum.locked,
    )

    attested_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("collection_profile.id", ondelete="SET NULL"), nullable=True
    )
    attested_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    #: When the holders' window to object closes.
    objection_closes_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    project = relationship("CollectionProject", back_populates="phases", lazy="selectin")
    attested_by = relationship(
        "CollectionProfile", foreign_keys=[attested_by_id], lazy="selectin"
    )
    updates = relationship(
        "CollectionPhaseUpdate",
        back_populates="phase",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="CollectionPhaseUpdate.created_at.desc()",
    )


class CollectionPhaseUpdate(Base):
    """What the builder told holders while they were deciding whether to object.

    The objection window asks holders to make a judgement within seven days.
    Giving them a vote and nothing to base it on is a formality rather than a
    safeguard, so the builder's updates are kept, timestamped, and shown
    beside the phase they concern.
    """

    __tablename__ = "collection_phase_update"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    phase_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("collection_phase.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )

    phase = relationship("CollectionPhase", back_populates="updates", lazy="selectin")
    author = relationship("BaseUser", lazy="selectin", passive_deletes=True)


class CollectionUnit(Base):
    """One flat inside a raise.

    Share counts and prices are mirrored from the contract for display and
    for listing units a client has not yet opened. `shares_sold` is advisory
    here: the commit screen reads it from the chain, because a stale number
    at that moment is the difference between a stake that fits and one the
    contract rejects.
    """

    __tablename__ = "collection_unit"
    __table_args__ = (
        UniqueConstraint("project_id", "code", name="uq_collection_unit_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("collection_project.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    #: Short identifier within the project, such as "1b".
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    bedrooms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: Atomic units, as a string. See CollectionChainRecord on why not an int.
    price_atomic: Mapped[str] = mapped_column(String(40), nullable=False, default="0")
    total_shares: Mapped[str] = mapped_column(String(40), nullable=False, default="0")
    shares_sold: Mapped[str] = mapped_column(String(40), nullable=False, default="0")
    #: The vault that owns this unit once it exists.
    vault_account_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    project = relationship("CollectionProject", lazy="selectin")
