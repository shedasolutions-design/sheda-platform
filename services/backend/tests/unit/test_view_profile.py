"""Anyone signed in can view a profile; private details stay private."""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import Agent, Client
from app.routers.user import get_user_by_id
from app.utils.enums import AccountTypeEnum
from app.utils.utils import hash_password


async def _row(db, cls, email, verified, wallet):
    kind = AccountTypeEnum.agent if cls is Agent else AccountTypeEnum.client
    row = cls(email=email, username=email, password=hash_password("whatever-password-1"), verified=verified,
              account_type=kind, near_account_id=wallet, phone_number="+2348012345678")
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def test_unverified_viewer_sees_profile_without_contact(db: AsyncSession):
    viewer = await _row(db, Client, "viewer@example.com", False, "viewer.testnet")
    seller = await _row(db, Agent, "seller@example.com", False, "seller.testnet")
    shown = await get_user_by_id(seller.id, viewer, db)
    assert shown.id == seller.id
    assert shown.email is None and shown.phone_number is None
    # Never someone else's appointments, payment accounts or hours.
    assert shown.appointments == [] and shown.account_info == [] and shown.availabilities == []


async def test_closed_account_is_not_found(db: AsyncSession):
    viewer = await _row(db, Client, "viewer2@example.com", True, "viewer2.testnet")
    gone = await _row(db, Agent, "gone@example.com", True, "gone.testnet")
    gone.is_deleted = True
    gone.is_active = False
    await db.commit()
    with pytest.raises(HTTPException) as e:
        await get_user_by_id(gone.id, viewer, db)
    assert e.value.status_code == 404


async def test_seller_profile_carries_the_agency(db: AsyncSession):
    """The agency name is on the agent table: it must come back, not crash."""
    viewer = await _row(db, Client, "viewer3@example.com", False, "viewer3.testnet")
    seller = await _row(db, Agent, "agency@example.com", False, "agency.testnet")
    seller.agency_name = "Obi Homes"
    await db.commit()
    seller_id = seller.id
    db.expire_all()  # as in production: nothing already loaded to lean on
    await db.refresh(viewer)  # the signed-in person is loaded fresh, as live
    shown = await get_user_by_id(seller_id, viewer, db)
    assert shown.agency_name == "Obi Homes"
