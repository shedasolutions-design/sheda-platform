"""A completed sale takes the listing off the market.

Found in the two-account test: after the buyer paid and completed, the
listing stayed "available" and active, still offered to other buyers whose
bids the contract would refuse, and counted as the seller's vacant home.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.property import Property
from app.models.user import Agent
from app.services.transactions import upsert_transaction_from_event
from app.utils.enums import AccountTypeEnum, ListingTypeEnum, PropertyStatEnum
from app.utils.utils import hash_password


async def _listing(db: AsyncSession, listing_type=ListingTypeEnum.sale) -> Property:
    seller = Agent(email="sc@example.com", username="sc_seller", password=hash_password("whatever-password-1"),
                   verified=True, account_type=AccountTypeEnum.agent, near_account_id="sc-seller.testnet")
    db.add(seller)
    await db.commit()
    await db.refresh(seller)
    listing = Property(agent_id=seller.id, title="Flat", description="d", location="Yaba", price=1.0,
                       bathroom=1, bedroom=1, blockchain_property_id="10", listing_type=listing_type,
                       blockchain_owner_id="sc-seller.testnet")
    db.add(listing)
    await db.commit()
    await db.refresh(listing)
    return listing


WALLETS = {"buyer_wallet_id": "sc-buyer.testnet", "seller_wallet_id": "sc-seller.testnet"}


async def test_completed_purchase_marks_the_listing_sold(db: AsyncSession):
    listing = await _listing(db)
    await upsert_transaction_from_event("2", "bid_placed", 10, {**WALLETS, "action": "purchase"}, db)
    await upsert_transaction_from_event("2", "payment_released", 10, {}, db)

    await db.refresh(listing)
    assert listing.status == PropertyStatEnum.sold
    assert listing.is_active is False
    assert listing.blockchain_owner_id == "sc-buyer.testnet"


async def test_record_without_action_falls_back_to_the_listing_type(db: AsyncSession):
    listing = await _listing(db)
    await upsert_transaction_from_event("3", "payment_released", 10, WALLETS, db)

    await db.refresh(listing)
    assert listing.status == PropertyStatEnum.sold


async def test_a_lease_leaves_the_listing_with_its_owner(db: AsyncSession):
    listing = await _listing(db, ListingTypeEnum.rent)
    await upsert_transaction_from_event("4", "bid_placed", 10, {**WALLETS, "action": "lease"}, db)
    await upsert_transaction_from_event("4", "payment_released", 10, {}, db)

    await db.refresh(listing)
    assert listing.status == PropertyStatEnum.available
    assert listing.blockchain_owner_id == "sc-seller.testnet"
