"""Ratings are of sellers, can be read back, and cannot be self-awarded.

Before: there was no way to read ratings at all, so reviews on listings and
profiles never loaded; and the self-rating check compared row ids, which a
person's two profile rows (buyer and seller, sharing an email) slipped past.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import Agent, Client
from app.routers.rating import create_rating, list_ratings
from app.schemas.rating_schema import RatingCreate
from app.utils.enums import AccountTypeEnum


async def _person(db: AsyncSession, email: str, name: str):
    client = Client(email=email, username=f"{name}_c", password="x", verified=True,
                    account_type=AccountTypeEnum.client, near_account_id=f"{name}.testnet")
    agent = Agent(email=email, username=f"{name}_a", password="x", verified=True,
                  account_type=AccountTypeEnum.agent, near_account_id=f"{name}.testnet")
    db.add_all([client, agent])
    await db.commit()
    await db.refresh(client)
    await db.refresh(agent)
    return client, agent


async def test_a_seller_can_be_rated_and_the_rating_read_back(db: AsyncSession):
    buyer, _ = await _person(db, "buyer@example.com", "buyer")
    _, seller = await _person(db, "seller@example.com", "seller")

    await create_rating(RatingCreate(ratee_id=seller.id, score=4, comment="Smooth viewing"), buyer, db)

    ratings = await list_ratings(ratee_id=seller.id, db=db)
    assert len(ratings) == 1
    assert ratings[0].score == 4
    assert ratings[0].rater_id == buyer.id
    await db.refresh(seller)
    assert seller.rating == 4


async def test_you_cannot_rate_your_own_seller_profile(db: AsyncSession):
    me_as_buyer, me_as_seller = await _person(db, "me@example.com", "me")
    with pytest.raises(HTTPException) as err:
        await create_rating(RatingCreate(ratee_id=me_as_seller.id, score=5), me_as_buyer, db)
    assert err.value.status_code == 400
