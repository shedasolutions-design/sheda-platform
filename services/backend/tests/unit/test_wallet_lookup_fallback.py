"""A wallet nobody registered still finds its owner by the sign-up name.

Found in the two-account test: registration ran only on the History page,
so a buyer who never opened it was "User not found for wallet" and the
seller's acceptance had nobody to notify.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import WalletMapping
from app.models.user import Agent, Client
from app.services.wallets import get_user_by_wallet
from app.utils.enums import AccountTypeEnum
from app.utils.utils import hash_password


async def _pair(db: AsyncSession, wallet: str):
    hashed = hash_password("whatever-password-1")
    client = Client(email="wl@example.com", username="wl_user", password=hashed, verified=True,
                    account_type=AccountTypeEnum.client, near_account_id=wallet)
    agent = Agent(email="wl@example.com", username="wl_user", password=hashed, verified=True,
                  account_type=AccountTypeEnum.agent, near_account_id=wallet)
    db.add_all([agent, client])
    await db.commit()
    await db.refresh(client)
    await db.refresh(agent)
    return client, agent


async def test_unregistered_wallet_resolves_to_the_buyer_row(db: AsyncSession):
    client, _ = await _pair(db, "wl-user.shedauser.testnet")
    user = await get_user_by_wallet("wl-user.shedauser.testnet", db)
    assert user is not None and user.id == client.id


async def test_registration_still_wins(db: AsyncSession):
    _, agent = await _pair(db, "wl-user.shedauser.testnet")
    db.add(WalletMapping(user_id=agent.id, wallet_id="wl-user.shedauser.testnet"))
    await db.commit()
    user = await get_user_by_wallet("wl-user.shedauser.testnet", db)
    assert user is not None and user.id == agent.id


async def test_unknown_wallet_is_none(db: AsyncSession):
    assert await get_user_by_wallet("nobody.testnet", db) is None
