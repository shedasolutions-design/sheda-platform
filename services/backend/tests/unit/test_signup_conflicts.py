"""Signup refuses real duplicates, and only real duplicates.

The apps propose a wallet id from the part of an email before the @, so two
different people can ask for the same one. That must not block the second
signup; a second signup with the same email must.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.user_schema import UserCreate
from app.services.auth import create_account

PASSWORD = "correct horse battery staple"


def _user(email: str, near: str = "john.shedauser.testnet") -> UserCreate:
    return UserCreate(username=email, email=email, password=PASSWORD, near_account_id=near)


async def test_same_wallet_prefix_gets_the_next_free_id(db: AsyncSession):
    first = await create_account(_user("john@gmail.com"), db)
    second = await create_account(_user("john@yahoo.com"), db)
    third = await create_account(_user("john@outlook.com"), db)

    assert first.near_account_id == "john.shedauser.testnet"
    assert second.near_account_id == "john2.shedauser.testnet"
    assert third.near_account_id == "john3.shedauser.testnet"


async def test_same_email_is_still_refused(db: AsyncSession):
    await create_account(_user("jane@example.com", "jane.shedauser.testnet"), db)
    with pytest.raises(HTTPException) as err:
        await create_account(_user("jane@example.com", "jane.shedauser.testnet"), db)
    assert err.value.status_code == 409


async def test_long_email_is_accepted(db: AsyncSession):
    email = "a-rather-long-address-for-testing@example-domain.com"
    assert len(email) > 30
    user = await create_account(_user(email, "longaddress.shedauser.testnet"), db)
    assert user.username == email
