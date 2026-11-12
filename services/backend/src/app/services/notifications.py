from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.property import Property

from app.models.transaction import TransactionNotification
from app.models.user import BaseUser
from app.schemas.notification_schema import (
    DeviceTokenRequest,
    TransactionNotificationRequest,
)
from app.services.transactions import upsert_transaction_from_event
from app.services.push import send_push_notification



async def create_transaction_notification(
    payload: TransactionNotificationRequest, db: AsyncSession
) -> TransactionNotification:
    # payload.property_id is the ON-CHAIN id: every caller sends the bid's
    # property id from the contract, and the deal record stores it that way.
    # The notification row points at the backend listing instead, so it is
    # translated here. Storing the chain id directly broke the foreign key
    # (no backend row with that id: every notification answered 500 and the
    # table stayed empty), or, where the numbers overlap, would have linked
    # the notification to somebody else's property.
    chain_id = str(payload.property_id)

    # The deal record first: it does not depend on the listing existing, and
    # a missing listing must not stop the deal's state from advancing.
    await upsert_transaction_from_event(
        transaction_id=payload.transaction_id,
        event=payload.event,
        property_id=payload.property_id,
        metadata=payload.metadata,
        db=db,
    )

    listing_id = (
        await db.execute(
            select(Property.id).where(Property.blockchain_property_id == chain_id).limit(1)
        )
    ).scalar_one_or_none()
    if listing_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No listing for on-chain property {chain_id}",
        )

    notification = TransactionNotification(
        transaction_id=payload.transaction_id,
        event=payload.event,
        recipient_user_id=payload.recipient_user_id,
        property_id=listing_id,
        metadata_payload={**(payload.metadata or {}), "blockchain_property_id": chain_id},
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)

    await send_push_notification(
        user_id=payload.recipient_user_id,
        title="Transaction update",
        body=f"Event: {payload.event}",
        data=payload.metadata or {},
        db=db,
    )

    return notification


async def register_device_token(
    payload: DeviceTokenRequest, user_id: int, db: AsyncSession
) -> BaseUser:
    result = await db.execute(select(BaseUser).where(BaseUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
        
    user.device_token = payload.device_token
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def list_notifications(
    user_id: int | list[int],
    db: AsyncSession,
    unread_only: bool = False,
) -> list[TransactionNotification]:
    """Notifications for one recipient, or for every profile a person owns.

    Takes a list because a person's buyer and seller rows are separate
    recipients: a bid notification addressed to the seller row is invisible to
    a session holding the buyer row, which is how a seller misses bids on
    their own listing. Passing a single id keeps the previous behaviour.
    """
    recipient_ids = user_id if isinstance(user_id, list) else [user_id]
    stmt = (
        select(TransactionNotification)
        .where(TransactionNotification.recipient_user_id.in_(recipient_ids))
        .order_by(TransactionNotification.created_at.desc())
    )
    if unread_only:
        stmt = stmt.where(TransactionNotification.is_read == False)
    result = await db.execute(stmt)
    return result.scalars().all()


async def mark_notification_read(
    notification_id: int, user_id: int, db: AsyncSession
) -> TransactionNotification | None:
    result = await db.execute(
        select(TransactionNotification).where(
            TransactionNotification.id == notification_id,
            TransactionNotification.recipient_user_id == user_id,
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        return None

    notification.is_read = True
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return notification
