"""Booking a viewing: what is taken is one seller at one time, nothing more.

Found in the two-account test:
- the time was unique across the whole platform, so two buyers could not
  view two different properties at 10:00 on the same day;
- booking marked the seller's whole recurring weekday window as booked and
  nothing cleared it, so one viewing closed that weekday for good.
"""

from datetime import datetime, time

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.property import AgentAvailability, Appointment, Property
from app.models.user import Agent, Client
from app.services.listing import run_book_appointment
from app.utils.enums import AccountTypeEnum, AppointmentStatEnum
from app.utils.utils import hash_password

FRIDAY_10 = datetime(2026, 11, 13, 10, 0)


async def _seller(db: AsyncSession, n: int):
    hashed = hash_password("whatever-password-1")
    seller = Agent(email=f"s{n}@example.com", username=f"seller{n}", password=hashed, verified=True,
                   account_type=AccountTypeEnum.agent, near_account_id=f"seller{n}.testnet")
    db.add(seller)
    await db.commit()
    await db.refresh(seller)
    db.add(AgentAvailability(agent_id=seller.id, weekday="FRIDAY", start_time=time(8), end_time=time(20)))
    listing = Property(agent_id=seller.id, title="Flat", description="d", location="Yaba",
                       price=1.0, bathroom=1, bedroom=1)
    db.add(listing)
    await db.commit()
    await db.refresh(listing)
    return seller, listing


async def _buyer(db: AsyncSession, n: int):
    buyer = Client(email=f"b{n}@example.com", username=f"buyer{n}", password=hash_password("whatever-password-1"),
                   verified=True, account_type=AccountTypeEnum.client, near_account_id=f"buyer{n}.testnet")
    db.add(buyer)
    await db.commit()
    await db.refresh(buyer)
    return buyer


async def test_two_sellers_can_both_have_a_viewing_at_ten(db: AsyncSession):
    s1, p1 = await _seller(db, 1)
    s2, p2 = await _seller(db, 2)
    b1, b2 = await _buyer(db, 1), await _buyer(db, 2)

    a1 = await run_book_appointment(b1.id, s1.id, p1.id, FRIDAY_10, db, bid_id=1)
    a2 = await run_book_appointment(b2.id, s2.id, p2.id, FRIDAY_10, db, bid_id=2)

    assert a1.bid_id == 1 and a2.bid_id == 2


async def test_same_seller_same_time_is_refused(db: AsyncSession):
    s1, p1 = await _seller(db, 1)
    b1, b2 = await _buyer(db, 1), await _buyer(db, 2)
    await run_book_appointment(b1.id, s1.id, p1.id, FRIDAY_10, db)

    with pytest.raises(HTTPException) as err:
        await run_book_appointment(b2.id, s1.id, p1.id, FRIDAY_10, db)
    assert err.value.status_code == 409


async def test_one_booking_leaves_the_rest_of_the_day_open(db: AsyncSession):
    s1, p1 = await _seller(db, 1)
    b1, b2 = await _buyer(db, 1), await _buyer(db, 2)
    await run_book_appointment(b1.id, s1.id, p1.id, FRIDAY_10, db)

    later = await run_book_appointment(b2.id, s1.id, p1.id, datetime(2026, 11, 13, 11, 0), db)
    next_week = await run_book_appointment(b2.id, s1.id, p1.id, datetime(2026, 11, 20, 10, 0), db)

    assert later.id and next_week.id


async def test_a_canceled_time_can_be_booked_again(db: AsyncSession):
    s1, p1 = await _seller(db, 1)
    b1, b2 = await _buyer(db, 1), await _buyer(db, 2)
    first = await run_book_appointment(b1.id, s1.id, p1.id, FRIDAY_10, db)
    first.status = AppointmentStatEnum.canceled
    await db.commit()

    again = await run_book_appointment(b2.id, s1.id, p1.id, FRIDAY_10, db)
    assert again.id != first.id


async def test_outside_the_sellers_hours_is_refused(db: AsyncSession):
    s1, p1 = await _seller(db, 1)
    b1 = await _buyer(db, 1)
    with pytest.raises(HTTPException) as err:
        await run_book_appointment(b1.id, s1.id, p1.id, datetime(2026, 11, 13, 21, 0), db)
    assert err.value.status_code == 404
