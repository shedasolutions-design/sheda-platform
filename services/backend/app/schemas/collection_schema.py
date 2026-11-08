"""Request and response shapes for Collections.

Two conventions run through this file and both exist to stop the API quietly
lying about money.

Amounts are strings, always. They are u128 atomic units of a stablecoin, and
a JSON number is an IEEE double, exact only up to 2**53.

A single unit price sits below that line: 18,000,000 naira at six decimals
is 1.8e13, comfortably inside it. What does not is everything computed from
one. The vault's income accumulator is scaled by 1e18 and runs past 1e25 in
ordinary use, a holder's claim is `balance * acc_per_share` before it is
divided back down, and a raise beyond roughly 9 billion naira crosses the
line by itself. Serialising any of those as a number loses the low digits
somewhere between here and the client, and nobody finds out until a holder
is shown a figure the chain disagrees with. One rule for every amount is
cheaper than remembering which ones happen to be safe.

Scores are absent, also always. The directory returns the counts a ranking is
computed from and never the ranking. The app tells people Sheda does not
adjust these numbers, and the only way that stays true is if the server has
no number to adjust.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.collection import (
    CollectionRoleEnum,
    DocumentStatusEnum,
    PhaseStateEnum,
    RaiseStatusEnum,
)

# A u128 in base 10 is at most 39 digits. Anything longer is not an amount.
_ATOMIC = Field(pattern=r"^\d{1,39}$", examples=["18000000000000"])


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- profiles --------------------------------------------------------------


class ChainRecordOut(_Base):
    """The inputs a rank is computed from, exactly as the chain reported them.

    `synced_at` is part of the payload rather than a header because a client
    has to be able to tell how old this is. Anything deciding whether to show
    a figure at the moment someone commits money should read the chain
    directly instead of trusting a cache of unknown age.
    """

    projects_on_time: int = 0
    projects_late: int = 0
    projects_abandoned: int = 0
    projects_running: int = 0
    total_raised: str = "0"
    stake_total: str = "0"
    stake_allocated: str = "0"
    stake_slashed_total: str = "0"
    slash_count: int = 0

    units_managed: int = 0
    let_months: int = 0
    mandate_months: int = 0
    rent_paid_out: str = "0"
    periods_paid_on_time: int = 0
    periods_due: int = 0
    disputes_upheld: int = 0

    synced_at: Optional[datetime] = None
    synced_block_height: Optional[int] = None


class CollectionProfileCreate(BaseModel):
    role: CollectionRoleEnum
    display_name: str = Field(min_length=2, max_length=120)
    near_account_id: Optional[str] = Field(default=None, max_length=64)
    location: Optional[str] = Field(default=None, max_length=120)
    about: Optional[str] = None
    since_year: Optional[int] = Field(default=None, ge=2000, le=2100)
    part_of_group: Optional[str] = Field(default=None, max_length=120)


class CollectionProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    near_account_id: Optional[str] = Field(default=None, max_length=64)
    location: Optional[str] = Field(default=None, max_length=120)
    about: Optional[str] = None
    since_year: Optional[int] = Field(default=None, ge=2000, le=2100)
    part_of_group: Optional[str] = Field(default=None, max_length=120)


class CollectionProfileOut(_Base):
    id: int
    user_id: int
    role: CollectionRoleEnum
    display_name: str
    near_account_id: Optional[str] = None
    location: Optional[str] = None
    about: Optional[str] = None
    since_year: Optional[int] = None
    part_of_group: Optional[str] = None
    suspended: bool = False

    #: Carried over from the Sheda account so a profile can show that the
    #: person behind it was identity checked. The ranking ignores it: KYC
    #: says who someone is, not how they have behaved.
    kyc_verified: bool = False
    avatar_url: Optional[str] = None

    chain_record: Optional[ChainRecordOut] = None
    created_at: datetime


class DirectoryEntryOut(_Base):
    """One row of the directory.

    No rank and no score. The client holds the scoring function, computes
    both from `chain_record`, and is therefore able to show its working. A
    server that returned "87, strong" would be asking to be trusted on
    exactly the point the product promises not to need trust for.
    """

    profile: CollectionProfileOut
    #: Projects this profile is attached to right now, for the summary line.
    live_projects: int = 0


# ---- documents, phases, units ---------------------------------------------


class DocumentOut(_Base):
    id: int
    label: str
    status: DocumentStatusEnum
    file_url: Optional[str] = None
    verified_at: Optional[datetime] = None


class DocumentCreate(BaseModel):
    label: str = Field(min_length=2, max_length=120)
    file_url: Optional[str] = Field(default=None, max_length=500)


class PhaseUpdateOut(_Base):
    id: int
    body: str
    image_url: Optional[str] = None
    author_id: int
    created_at: datetime


class PhaseUpdateCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    image_url: Optional[str] = Field(default=None, max_length=500)


class PhaseOut(_Base):
    id: int
    position: int
    name: str
    tranche_bps: int
    state: PhaseStateEnum
    attested_at: Optional[datetime] = None
    objection_closes_at: Optional[datetime] = None
    updates: List[PhaseUpdateOut] = []


class PhaseCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    tranche_bps: int = Field(ge=1, le=10_000)


class UnitOut(_Base):
    id: int
    code: str
    label: str
    bedrooms: int
    price_atomic: str
    total_shares: str
    shares_sold: str
    vault_account_id: Optional[str] = None


class UnitCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    label: str = Field(min_length=1, max_length=120)
    bedrooms: int = Field(ge=0, le=99)
    price_atomic: str = _ATOMIC
    total_shares: str = _ATOMIC


# ---- projects --------------------------------------------------------------


class ProjectSummaryOut(_Base):
    """Enough for a card, without the documents and phases behind it."""

    id: int
    slug: str
    name: str
    location: str
    units: int
    status: RaiseStatusEnum
    estimated_return_pct: Optional[int] = None
    vault_account_id: Optional[str] = None
    escrow_account_id: Optional[str] = None
    closes_at: Optional[datetime] = None
    cover_image_url: Optional[str] = None

    builder: Optional[CollectionProfileOut] = None
    manager: Optional[CollectionProfileOut] = None

    #: Share of the raise whose phases have passed, in basis points.
    #: Derived from the phase states rather than stored, so it cannot drift
    #: away from the schedule it is a summary of. It is a proportion, not an
    #: amount: how much money that is remains the chain's to say.
    phases_released_bps: int = 0


class ProjectDetailOut(ProjectSummaryOut):
    description: Optional[str] = None
    property_token_id: Optional[str] = None
    image_urls: List[str] = []
    documents: List[DocumentOut] = []
    phases: List[PhaseOut] = []
    #: The flats themselves. Named apart from `units` on the summary, which
    #: is how many there are: one field cannot be both a count and a list.
    unit_list: List[UnitOut] = []


class ProjectCreate(BaseModel):
    slug: str = Field(min_length=2, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]*$")
    name: str = Field(min_length=2, max_length=160)
    location: str = Field(min_length=2, max_length=120)
    units: int = Field(ge=0, le=100_000)
    description: Optional[str] = None
    estimated_return_pct: Optional[int] = Field(default=None, ge=0, le=1000)
    manager_profile_id: Optional[int] = None
    closes_at: Optional[datetime] = None

    phases: List[PhaseCreate] = []
    unit_list: List[UnitCreate] = []

    @field_validator("phases")
    @classmethod
    def tranches_must_total_everything(cls, phases: List[PhaseCreate]):
        """Refuse a schedule that does not release the whole raise.

        A schedule summing to less than 100% strands money in escrow with no
        phase that would ever free it; one summing to more promises the
        builder money the raise never collected. Both are only discovered
        near handover, long after the raise closed and the terms stopped
        being changeable, so the check belongs at the point of creation.
        """
        if not phases:
            return phases
        total = sum(p.tranche_bps for p in phases)
        if total != 10_000:
            raise ValueError(
                f"Phase tranches must add up to 100% of the raise. "
                f"These add up to {total / 100:.2f}%."
            )
        return phases


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    description: Optional[str] = None
    location: Optional[str] = Field(default=None, min_length=2, max_length=120)
    units: Optional[int] = Field(default=None, ge=0, le=100_000)
    estimated_return_pct: Optional[int] = Field(default=None, ge=0, le=1000)
    manager_profile_id: Optional[int] = None
    closes_at: Optional[datetime] = None


class ProjectPublish(BaseModel):
    """Takes a draft on chain.

    The accounts are supplied rather than created here. Deploying a vault is
    a signed transaction from the builder's own wallet, so the client does it
    and tells the backend where it landed.
    """

    vault_account_id: Optional[str] = Field(default=None, max_length=64)
    escrow_account_id: str = Field(max_length=64)
    manager_profile_id: int


class DocumentVerify(BaseModel):
    status: DocumentStatusEnum
