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


async def test_closed_account_is_not_found(db: AsyncSession):
    viewer = await _row(db, Client, "viewer2@example.com", True, "viewer2.testnet")
    gone = await _row(db, Agent, "gone@example.com", True, "gone.testnet")
    gone.is_deleted = True
    gone.is_active = False
    await db.commit()
    with pytest.raises(HTTPException) as e:
        await get_user_by_id(gone.id, viewer, db)
    assert e.value.status_code == 404
