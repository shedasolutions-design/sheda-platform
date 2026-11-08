from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import MintedPropertyDraft
from app.schemas.minted_property_schema import MintedPropertyCreate, MintedPropertyLinkRequest
from app.services.listing import create_property_listing
from app.services.wallets import get_wallet_for_user
from app.models.user import BaseUser


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def create_minted_property_draft(
    payload: MintedPropertyCreate, current_user: BaseUser, db: AsyncSession
) -> MintedPropertyDraft:
    wallet_mapping = await get_wallet_for_user(current_user.id, db)
    if not wallet_mapping:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Wallet mapping required to register minted property",
        )

    if wallet_mapping.wallet_id != payload.owner_wallet_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Wallet does not match minted property owner",
        )
    existing = await db.execute(
        select(MintedPropertyDraft).where(
            MintedPropertyDraft.blockchain_property_id == payload.blockchain_property_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Minted property already registered",
        )

    minted = MintedPropertyDraft(
        blockchain_property_id=payload.blockchain_property_id,
        owner_wallet_id=payload.owner_wallet_id,
        metadata_uri=payload.metadata_uri,
        title=payload.title,
        description=payload.description,
    )
    db.add(minted)
    await db.commit()
    await db.refresh(minted)
    return minted


async def link_minted_property_to_listing(
    minted_id: int,
    payload: MintedPropertyLinkRequest,
    current_user: BaseUser,
    db: AsyncSession,
):
    minted_result = await db.execute(
        select(MintedPropertyDraft).where(MintedPropertyDraft.id == minted_id)
    )
    minted = minted_result.scalar_one_or_none()
    if not minted:
        raise HTTPException(status_code=404, detail="Minted property not found")

    if minted.linked_property_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Minted property already linked to a listing",
        )

    wallet_mapping = await get_wallet_for_user(current_user.id, db)
    if not wallet_mapping:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Wallet mapping required to link minted property",
        )

    if wallet_mapping.wallet_id != minted.owner_wallet_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Wallet does not match minted property owner",
        )

    property_payload = payload.property_data.model_copy(
        update={"blockchain_property_id": minted.blockchain_property_id}
    )
    created_property = await create_property_listing(current_user, property_payload, db)

    minted.linked_property_id = created_property.id
    minted.linked_at = utc_now()
    db.add(minted)
    await db.commit()
    await db.refresh(minted)

    return minted, created_property
