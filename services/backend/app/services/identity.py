"""Linked profile identities.

One person owns two user rows here — a Client and an Agent sharing an email,
created together at signup. Every read scoped by `current_user.id` therefore
shows one half of that person's data, which is why a message sent to someone
as a seller is invisible while they are signed in as a buyer.

This module resolves both rows so a read can span them and tag each row with
the profile it belongs to. It is deliberately read-only: writes stay bound to
the identity the token actually holds, because a write performed as the wrong
row is a real correctness bug (a reply arriving from an account the
counterparty has never dealt with), while a read spanning both is just a
fuller view of a person's own data.
"""

from dataclasses import dataclass, field
from typing import Annotated, Optional

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import BaseUser
from app.services.user_service import ActiveUser
from app.utils.enums import AccountTypeEnum, ProfileEnum, account_type_to_profile
from core.dependecies import DBSession


@dataclass
class LinkedIdentity:
    """Every user row belonging to one person, with the active one marked."""

    active_id: int
    active_profile: ProfileEnum
    #: Active row first — callers that only want "me" can take ids[0].
    ids: list[int] = field(default_factory=list)
    #: Which profile each id belongs to, for tagging rows on the way out.
    profile_by_id: dict[int, ProfileEnum] = field(default_factory=dict)

    @property
    def has_linked_profile(self) -> bool:
        """True when the other profile exists at all.

        Accounts predating paired signup have only one row. The UI uses this
        to stay exactly as it was — no profile chips, no split counters — for
        anyone who cannot have cross-profile data in the first place.
        """
        return len(self.ids) > 1

    def profile_for(self, user_id: Optional[int]) -> Optional[ProfileEnum]:
        """The profile a row id belongs to, or None if it isn't this person's."""
        if user_id is None:
            return None
        return self.profile_by_id.get(user_id)


async def resolve_linked_identity(
    user: BaseUser, db: AsyncSession
) -> LinkedIdentity:
    """Find every non-admin row sharing this user's email.

    One indexed lookup — (email, account_type) is unique, so this is a narrow
    index scan returning at most two rows. It runs only on the handful of
    endpoints that merge, not on every request, so it is not worth caching
    until profiling says otherwise.

    admin rows are excluded for the same reason they are excluded from the
    password sync: they are not part of the pair created at signup and share
    nothing with it but an email address. Folding one in would let an ordinary
    session read an admin's messages.
    """
    active_profile = account_type_to_profile(user.account_type) or ProfileEnum.buyer

    result = await db.execute(
        select(BaseUser.id, BaseUser.account_type).where(
            BaseUser.email == user.email,
            BaseUser.account_type != AccountTypeEnum.admin,
        )
    )
    rows = result.all()

    profile_by_id: dict[int, ProfileEnum] = {}
    for row_id, account_type in rows:
        profile = account_type_to_profile(account_type)
        if profile is not None:
            profile_by_id[row_id] = profile

    # The active row must always be present and first, even if the lookup
    # returned nothing — a read that silently excludes the caller's own data
    # is worse than one that fails.
    profile_by_id.setdefault(user.id, active_profile)
    ids = [user.id] + [row_id for row_id in profile_by_id if row_id != user.id]

    return LinkedIdentity(
        active_id=user.id,
        active_profile=active_profile,
        ids=ids,
        profile_by_id=profile_by_id,
    )


async def get_linked_identity(user: ActiveUser, db: DBSession) -> LinkedIdentity:
    return await resolve_linked_identity(user, db)


LinkedIdentityDep = Annotated[LinkedIdentity, Depends(get_linked_identity)]
