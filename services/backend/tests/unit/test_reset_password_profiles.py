"""reset_password must reach every profile row a person owns.

signup creates a Client and an Agent for one human, sharing an email and
seeded with the same hash (create_account, app/services/auth.py). Login
resolves whichever row matches the requested profile, so a reset that writes
to only one of them leaves the other rejecting the user's real password.

That divergence is dormant while login always resolves the client row, and
becomes a live "correct password refused" bug the moment sign-in as seller
ships — which is why this is pinned before the profile chooser lands.
"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import Admin, Agent, BaseUser, Client
from app.services.user_service import reset_password
from app.utils.enums import AccountTypeEnum

OLD = "old_hash"
NEW = "new_hash"


async def _make_pair(db: AsyncSession, email: str = "pair@example.com"):
    """The two rows signup creates for one person."""
    client = Client(
        email=email,
        fullname="Pair User",
        username="pair_user",
        password=OLD,
        verified=True,
        account_type=AccountTypeEnum.client,
        near_account_id="pair_user.testnet",
    )
    agent = Agent(
        email=email,
        fullname="Pair User",
        username="pair_user",
        password=OLD,
        verified=True,
        account_type=AccountTypeEnum.agent,
        near_account_id="pair_user.testnet",
    )
    db.add_all([client, agent])
    await db.commit()
    await db.refresh(client)
    await db.refresh(agent)
    return client, agent


async def _password_for(db: AsyncSession, email: str, account_type: AccountTypeEnum):
    result = await db.execute(
        select(BaseUser).where(
            BaseUser.email == email, BaseUser.account_type == account_type
        )
    )
    return result.scalars().one().password


@pytest.mark.unit
async def test_reset_from_client_updates_agent_twin(db: AsyncSession):
    client, _ = await _make_pair(db)

    await reset_password(client, db, NEW)

    assert await _password_for(db, client.email, AccountTypeEnum.client) == NEW
    # The actual regression: without the fix this row keeps OLD, and signing
    # in as a seller with the new password fails.
    assert await _password_for(db, client.email, AccountTypeEnum.agent) == NEW


@pytest.mark.unit
async def test_reset_from_agent_updates_client_twin(db: AsyncSession):
    """Symmetric — a reset performed while in the seller profile."""
    _, agent = await _make_pair(db)

    await reset_password(agent, db, NEW)

    assert await _password_for(db, agent.email, AccountTypeEnum.client) == NEW
    assert await _password_for(db, agent.email, AccountTypeEnum.agent) == NEW


@pytest.mark.unit
async def test_reset_does_not_touch_admin_sharing_the_email(db: AsyncSession):
    """An admin row is not part of the signup pair.

    Syncing into it would let anyone holding the ordinary user password for
    that address rewrite an admin credential.
    """
    email = "staff@example.com"
    client, _ = await _make_pair(db, email=email)
    admin = Admin(
        email=email,
        fullname="Staff Admin",
        username="staff_admin",
        password="admin_hash",
        verified=True,
        account_type=AccountTypeEnum.admin,
        near_account_id="staff_admin.testnet",
    )
    db.add(admin)
    await db.commit()

    await reset_password(client, db, NEW)

    assert await _password_for(db, email, AccountTypeEnum.client) == NEW
    assert await _password_for(db, email, AccountTypeEnum.agent) == NEW
    assert await _password_for(db, email, AccountTypeEnum.admin) == "admin_hash"


@pytest.mark.unit
async def test_reset_does_not_touch_other_people(db: AsyncSession):
    client, _ = await _make_pair(db)
    other = Client(
        email="someone_else@example.com",
        fullname="Other User",
        username="other_user",
        password=OLD,
        verified=True,
        account_type=AccountTypeEnum.client,
        near_account_id="other_user.testnet",
    )
    db.add(other)
    await db.commit()

    await reset_password(client, db, NEW)

    assert (
        await _password_for(db, "someone_else@example.com", AccountTypeEnum.client)
        == OLD
    )


@pytest.mark.unit
async def test_reset_still_works_for_a_lone_row(db: AsyncSession):
    """Accounts predating the paired-signup behaviour have no twin."""
    lone = Client(
        email="lone@example.com",
        fullname="Lone User",
        username="lone_user",
        password=OLD,
        verified=True,
        account_type=AccountTypeEnum.client,
        near_account_id="lone_user.testnet",
    )
    db.add(lone)
    await db.commit()
    await db.refresh(lone)

    assert await reset_password(lone, db, NEW) is True
    assert await _password_for(db, "lone@example.com", AccountTypeEnum.client) == NEW
