from sqlalchemy import select
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import WalletMapping
from app.models.user import BaseUser


async def get_wallet_for_user(user_id: int, db: AsyncSession) -> WalletMapping | None:
    result = await db.execute(select(WalletMapping).where(WalletMapping.user_id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_wallet(wallet_id: str, db: AsyncSession) -> BaseUser | None:
    result = await db.execute(
        select(BaseUser)
        .join(WalletMapping, WalletMapping.user_id == BaseUser.id)
        .where(WalletMapping.wallet_id == wallet_id)
    )
    return result.scalar_one_or_none()


async def register_wallet_for_user(
    user_id: int, wallet_id: str, db: AsyncSession
) -> WalletMapping:
    existing_wallet = await db.execute(
        select(WalletMapping).where(WalletMapping.wallet_id == wallet_id)
    )
    if existing_wallet.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Wallet already registered",
        )

    existing_user_wallet = await db.execute(
        select(WalletMapping).where(WalletMapping.user_id == user_id)
    )
    if existing_user_wallet.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already has a registered wallet",
        )

    mapping = WalletMapping(user_id=user_id, wallet_id=wallet_id)
    db.add(mapping)
    await db.commit()
    await db.refresh(mapping)
    return mapping
