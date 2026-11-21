"""A new device needs the emailed code; a remembered one does not."""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import app.services.device_check as dc
import app.utils.email as email_mod
from app.models.user import Agent, Client
from app.utils.enums import AccountTypeEnum
from app.utils.utils import hash_password


@pytest.fixture
def codes(monkeypatch, db: AsyncSession):
    """Capture codes instead of emailing them; the stored copy is still checked.

    The key-value store is pointed at the test database, as test_kv_race does."""
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from core.configs import redis

    from core.kv import PostgresKV

    kv = PostgresKV()
    monkeypatch.setattr(kv, "_session", async_sessionmaker(db.bind, expire_on_commit=False))
    monkeypatch.setattr(redis, "_client", kv)
    sent = []

    async def fake_send(email, length=4, purpose="verify"):
        from core.configs import redis, settings

        otp = "4821"
        await redis.setex(settings.OTP_PREFIX.format(email), 300, otp)
        sent.append((email, purpose, otp))
        return True

    monkeypatch.setattr(email_mod, "create_send_otp", fake_send)
    return sent


async def _person(db: AsyncSession, email="dev@example.com"):
    hashed = hash_password("whatever-password-1")
    buyer = Client(email=email, username="dev_user", password=hashed, verified=False,
                   account_type=AccountTypeEnum.client, near_account_id="dev.testnet")
    seller = Agent(email=email, username="dev_user", password=hashed, verified=False,
                   account_type=AccountTypeEnum.agent, near_account_id="dev.testnet")
    db.add_all([buyer, seller])
    await db.commit()
    await db.refresh(buyer)
    await db.refresh(seller)
    return buyer, seller


def test_mask_email():
    assert dc.mask_email("adesina@gmail.com") == "a******@gmail.com"
    assert dc.mask_email("ab@x.io") == "a***@x.io"


async def test_code_trusts_device_and_verifies_both_rows(db: AsyncSession, codes):
    buyer, seller = await _person(db)
    assert not await dc.is_trusted(buyer.email, "device-1")

    challenge = await dc.start(buyer, "device-1")
    assert codes[-1][:2] == (buyer.email, "signin")

    user = await dc.finish(challenge, "4821", db)
    assert user.id == buyer.id
    assert await dc.is_trusted(buyer.email, "device-1")
    assert not await dc.is_trusted(buyer.email, "device-2")
    await db.refresh(seller)
    assert buyer.verified and seller.verified

    # One use only.
    with pytest.raises(HTTPException):
        await dc.finish(challenge, "4821", db)


async def test_wrong_codes_end_the_challenge(db: AsyncSession, codes):
    buyer, _ = await _person(db, "tries@example.com")
    challenge = await dc.start(buyer, "device-1")
    for _ in range(dc.MAX_TRIES - 1):
        with pytest.raises(HTTPException) as e:
            await dc.finish(challenge, "0000", db)
        assert "Invalid code" in e.value.detail
    with pytest.raises(HTTPException) as e:
        await dc.finish(challenge, "0000", db)
    assert "Too many" in e.value.detail
    # Even the right code is refused now: start again with the password.
    with pytest.raises(HTTPException):
        await dc.finish(challenge, "4821", db)
    assert not await dc.is_trusted(buyer.email, "device-1")


async def test_no_device_id_is_never_remembered(db: AsyncSession, codes):
    buyer, _ = await _person(db, "nodev@example.com")
    challenge = await dc.start(buyer, None)
    await dc.finish(challenge, "4821", db)
    assert not await dc.is_trusted(buyer.email, None)
    assert not await dc.is_trusted(buyer.email, "")


async def test_off_without_email(monkeypatch):
    import app.services.notification_prefs as prefs

    monkeypatch.setattr(prefs, "email_configured", lambda: False)
    assert dc.enabled() is False
    monkeypatch.setattr(prefs, "email_configured", lambda: True)
    assert dc.enabled() is True


async def test_login_route_holds_new_device_until_code(db: AsyncSession, async_client, codes, monkeypatch):
    monkeypatch.setattr(dc, "enabled", lambda: True)
    await _person(db, "route@example.com")
    form = {"username": "route@example.com", "password": "whatever-password-1", "device_id": "laptop-1"}

    first = await async_client.post("/api/v1/auth/login", data=form)
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["access_token"] == ""
    assert body["device_check"]["email_hint"] == "r****@example.com"

    bad = await async_client.post("/api/v1/auth/login/verify-device",
                                  json={"challenge": body["device_check"]["challenge"], "otp": "1111"})
    assert bad.status_code == 401

    ok = await async_client.post("/api/v1/auth/login/verify-device",
                                 json={"challenge": body["device_check"]["challenge"], "otp": "4821"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["access_token"]

    # Same device again: straight in, no code.
    again = await async_client.post("/api/v1/auth/login", data=form)
    assert again.json()["access_token"] and not again.json().get("device_check")

    # A wrong password never reaches the code step.
    wrong = await async_client.post("/api/v1/auth/login", data={**form, "password": "nope-nope-1", "device_id": "phone-9"})
    assert wrong.status_code == 401
