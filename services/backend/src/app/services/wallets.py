from sqlalchemy import select
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import WalletMapping
from app.models.user import BaseUser
from app.utils.enums import AccountTypeEnum


async def get_wallet_for_user(user_id: int, db: AsyncSession) -> WalletMapping | None:
    result = await db.execute(select(WalletMapping).where(WalletMapping.user_id == user_id))
    return result.scalar_one_or_none()


async def get_wallet_ids_for_users(
    user_ids: list[int], db: AsyncSession
) -> list[str]:
    """Every wallet registered to any of these user rows.

    A wallet is mapped to a single *row*, not to the person, and registration
    binds it to whichever row was active at the time — historically always the
    buyer row, because login resolved buyer for everyone. The seller row of
    the same person therefore has no mapping at all.

    Anything looking up "my wallet" from the active row alone consequently
    finds nothing in a seller session and returns an empty result. That is not
    a missing wallet, it is the wrong half of one person being asked, so
    resolve across every row they own.
    """
    if not user_ids:
        return []
    result = await db.execute(
        select(WalletMapping.wallet_id).where(WalletMapping.user_id.in_(user_ids))
    )
    # wallet_id is UNIQUE, so the rows cannot actually collide today — which
    # is also why registering the same wallet against the seller row is not an
    # option and spanning is the only fix. Deduplicated anyway so this stays
    # correct if that constraint is ever relaxed. Order is whatever the
    # database returns; callers use this for membership, not precedence.
    return list(dict.fromkeys(result.scalars().all()))


async def get_user_by_wallet(wallet_id: str, db: AsyncSession) -> BaseUser | None:
    result = await db.execute(
        select(BaseUser)
        .join(WalletMapping, WalletMapping.user_id == BaseUser.id)
        .where(WalletMapping.wallet_id == wallet_id)
    )
    mapped = result.scalar_one_or_none()
    if mapped is not None:
        return mapped
    # Not registered yet (the app used to register only from the History
    # page). The wallet name saved at sign-up still identifies the person;
    # prefer their buyer row, which is the row registration would have used.
    result = await db.execute(
        select(BaseUser)
        .where(BaseUser.near_account_id == wallet_id)
        .order_by((BaseUser.account_type == AccountTypeEnum.client).desc(), BaseUser.id)
        .limit(1)
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
