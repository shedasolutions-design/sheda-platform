"""Deal notifications take the on-chain property id and land on the listing.

Found in the two-account test: every caller sends the contract's property
id, the notification row stored it as a backend property id, and the
foreign key refused it, so every notification answered 500 and testnet had
none at all. Where the numbers overlap it would have linked the wrong
property instead.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.services.notifications as notifications
from app.models.property import Property
from app.models.transaction import TransactionNotification, TransactionRecord
from app.models.user import Agent, Client
from app.schemas.notification_schema import TransactionNotificationRequest
from app.utils.enums import AccountTypeEnum
from app.utils.utils import hash_password


async def _setup(db: AsyncSession):
    hashed = hash_password("whatever-password-1")
    seller = Agent(email="nt@example.com", username="nt_seller", password=hashed, verified=True,
                   account_type=AccountTypeEnum.agent, near_account_id="nt-seller.testnet")
    buyer = Client(email="nb@example.com", username="nt_buyer", password=hashed, verified=True,
                   account_type=AccountTypeEnum.client, near_account_id="nt-buyer.testnet")
    db.add_all([seller, buyer])
    await db.commit()
    await db.refresh(seller)
    await db.refresh(buyer)
    listing = Property(agent_id=seller.id, title="Flat", description="d", location="Yaba",
                       price=1000.0, blockchain_property_id="10", bathroom=1, bedroom=1)
    db.add(listing)
    await db.commit()
    await db.refresh(listing)
    return seller, buyer, listing


async def _no_push(**_):
    return None


async def test_chain_id_is_translated_to_the_listing(db: AsyncSession, monkeypatch):
    monkeypatch.setattr(notifications, "send_push_notification", _no_push)
    seller, _, listing = await _setup(db)

    note = await notifications.create_transaction_notification(
        TransactionNotificationRequest(transaction_id="2", event="bid_placed",
                                       recipient_user_id=seller.id, property_id=10, metadata={}),
        db,
    )

    assert note.property_id == listing.id
    assert note.metadata_payload["blockchain_property_id"] == "10"


async def test_unknown_chain_id_still_records_the_deal(db: AsyncSession, monkeypatch):
    monkeypatch.setattr(notifications, "send_push_notification", _no_push)
    seller, _, _ = await _setup(db)

    with pytest.raises(HTTPException) as err:
        await notifications.create_transaction_notification(
            TransactionNotificationRequest(transaction_id="9", event="bid_placed",
                                           recipient_user_id=seller.id, property_id=999, metadata={}),
            db,
        )
    assert err.value.status_code == 404
    record = (await db.execute(select(TransactionRecord).where(TransactionRecord.bid_id == "9"))).scalar_one()
    assert record.property_id == "999"
    assert (await db.execute(select(TransactionNotification))).scalars().all() == []
