"""Sensitive changes need proof it's the owner: a password or an emailed code."""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import app.utils.email as email_mod
from app.models.user import Agent, Client
from app.schemas.auth_schema import ChangeEmailStart, CodeRequest, ConfirmPasswordRequest
from app.schemas.user_schema import UserUpdate
from app.services.profile import update_user
from app.utils.enums import AccountTypeEnum
from app.utils.utils import hash_password


@pytest.fixture
def codes(monkeypatch, db: AsyncSession):
    """Codes are stored but not emailed; the key-value store uses the test DB."""
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from core.configs import redis, settings
    from core.kv import PostgresKV

    kv = PostgresKV()
    monkeypatch.setattr(kv, "_session", async_sessionmaker(db.bind, expire_on_commit=False))
    monkeypatch.setattr(redis, "_client", kv)
    sent = []

    async def fake_send(email, length=4, purpose="verify"):
        await redis.setex(settings.OTP_PREFIX.format(email), 300, "4821")
        sent.append((email, purpose))
        return True

    class FakeSender:
        async def send_email(self, text, to, subject, **_):
            sent.append((to, subject))
            return True

    import app.routers.auth as auth_router

    monkeypatch.setattr(email_mod, "create_send_otp", fake_send)
    monkeypatch.setattr(auth_router, "create_send_otp", fake_send)
    monkeypatch.setattr(email_mod, "email_sender", FakeSender())
    return sent


async def _person(db: AsyncSession, email="owner@example.com"):
    hashed = hash_password("whatever-password-1")
    rows = [
        Client(email=email, username=email, password=hashed, verified=True,
               account_type=AccountTypeEnum.client, near_account_id=email.split("@")[0] + ".testnet"),
        Agent(email=email, username=email, password=hashed, verified=True,
              account_type=AccountTypeEnum.agent, near_account_id=email.split("@")[0] + ".testnet"),
    ]
    db.add_all(rows)
    await db.commit()
    for r in rows:
        await db.refresh(r)
    return rows


async def test_confirm_password(db: AsyncSession):
    from app.routers.auth import confirm_password

    me, _ = await _person(db)
    assert await confirm_password(ConfirmPasswordRequest(password="whatever-password-1"), me) == {"ok": True}
    with pytest.raises(HTTPException) as e:
        await confirm_password(ConfirmPasswordRequest(password="wrong"), me)
    assert e.value.status_code == 401


async def test_verify_code_keeps_the_session(db: AsyncSession, codes):
    from app.routers.auth import send_otp, verify_code

    me, _ = await _person(db)
    await send_otp(me, purpose="action")
    assert codes[-1] == (me.email, "action")
    with pytest.raises(HTTPException):
        await verify_code(CodeRequest(otp="0000"), me, db)
    # Returns a plain ok, not a replacement token.
    assert await verify_code(CodeRequest(otp="4821"), me, db) == {"ok": True}


async def test_email_cannot_change_through_profile_edit(db: AsyncSession):
    me, _ = await _person(db)
    with pytest.raises(HTTPException) as e:
        await update_user(UserUpdate(account_type="client", email="new@example.com"), db, me)
    assert e.value.status_code == 400
    # The same address (any case) is not a change and is fine.
    await update_user(UserUpdate(account_type="client", email="OWNER@example.com", fullname="Ada"), db, me)


async def test_email_change_needs_the_new_inbox(db: AsyncSession, codes):
    from app.routers.auth import change_email_confirm, change_email_start

    me, seller = await _person(db)
    await _person(db, "someone@example.com")

    with pytest.raises(HTTPException) as e:
        await change_email_start(ChangeEmailStart(new_email="someone@example.com"), me, db)
    assert e.value.status_code == 409

    out = await change_email_start(ChangeEmailStart(new_email="New@Example.com"), me, db)
    assert out["sent_to"] == "n***@example.com"
    assert codes[-1] == ("new@example.com", "email_change")

    with pytest.raises(HTTPException):
        await change_email_confirm(CodeRequest(otp="0000"), me, db)
    assert (await change_email_confirm(CodeRequest(otp="4821"), me, db)) == {"email": "new@example.com"}

    await db.refresh(me)
    await db.refresh(seller)
    assert me.email == seller.email == "new@example.com"
    # The old address was told.
    assert ("owner@example.com", "Your Sheda email was changed") in codes


async def test_delete_needs_a_code_and_closes_both_profiles(db: AsyncSession, codes):
    from app.routers.auth import send_otp
    from app.routers.user import delete_account

    me, seller = await _person(db)
    with pytest.raises(HTTPException) as e:
        await delete_account(me, db, code="")
    assert e.value.status_code == 400

    await send_otp(me, purpose="action")
    with pytest.raises(HTTPException):
        await delete_account(me, db, code="0000")
    await delete_account(me, db, code="4821")
    await db.refresh(me)
    await db.refresh(seller)
    assert me.is_deleted and seller.is_deleted and not me.is_active and not seller.is_active
