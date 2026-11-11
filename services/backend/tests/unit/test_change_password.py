"""Changing a password while signed in requires the current one.

reset-password trusts the session alone, which is right for the forgot-
password flow (the emailed code is the proof) and wrong for a settings page:
anyone holding an open session could set a new password and lock the owner
out. change-password checks the current password first.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import Agent, BaseUser, Client
from app.routers.auth import change_pwd
from app.schemas.auth_schema import PasswordChange
from app.utils.enums import AccountTypeEnum
from app.utils.utils import hash_password, verify_password

CURRENT = "current-password-1"
NEW = "brand-new-password-2"


async def _pair(db: AsyncSession) -> Client:
    hashed = hash_password(CURRENT)
    client = Client(
        email="change@example.com",
        username="change_user",
        password=hashed,
        verified=True,
        account_type=AccountTypeEnum.client,
        near_account_id="change_user.testnet",
    )
    agent = Agent(
        email="change@example.com",
        username="change_user",
        password=hashed,
        verified=True,
        account_type=AccountTypeEnum.agent,
        near_account_id="change_user.testnet",
    )
    db.add_all([client, agent])
    await db.commit()
    await db.refresh(client)
    return client


async def test_correct_current_password_changes_both_profiles(db: AsyncSession):
    client = await _pair(db)
    token = await change_pwd(client, PasswordChange(current_password=CURRENT, new_password=NEW), db)
    assert token.access_token

    rows = (await db.execute(select(BaseUser).where(BaseUser.email == "change@example.com"))).scalars().all()
    assert len(rows) == 2
    for row in rows:
        await db.refresh(row)
        assert verify_password(NEW, row.password)
        assert not verify_password(CURRENT, row.password)


async def test_wrong_current_password_is_refused(db: AsyncSession):
    client = await _pair(db)
    with pytest.raises(HTTPException) as err:
        await change_pwd(client, PasswordChange(current_password="not-it", new_password=NEW), db)
    assert err.value.status_code == 400
    await db.refresh(client)
    assert verify_password(CURRENT, client.password)


def test_new_password_needs_eight_characters():
    with pytest.raises(ValueError):
        PasswordChange(current_password=CURRENT, new_password="short")
