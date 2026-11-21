"""
A code by email when someone signs in on a device this account has not used.

The password alone opens the account from anywhere. With this, a password
that has leaked is not enough: the sign-in also needs a code sent to the
account's email, once per device. A device that passes is remembered for
TRUST_DAYS, so people are not asked every time.

The device is a random id the app keeps in the browser. Only a hash of it is
stored, under the account's email so the buyer and seller rows (one person)
share it. Everything lives in the key-value store with an expiry, so nothing
here needs a migration and stale entries clean themselves up.

The check is off when email cannot be sent (local runs, tests): a code that
can never arrive would lock everyone out.
"""

import hashlib
import json
import secrets
import time
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from core.configs import redis, settings
from core.logger import logger

TRUST_DAYS = 30
CHALLENGE_SECONDS = 10 * 60
MAX_TRIES = 5
RESEND_COOLDOWN_SECONDS = 30


def enabled() -> bool:
    from app.services.notification_prefs import email_configured

    return bool(settings.NEW_DEVICE_CODE) and email_configured()


def _hash(device_id: str) -> str:
    return hashlib.sha256(device_id.encode()).hexdigest()


def _trust_key(email: str, device_id: str) -> str:
    return f"trusted_device:{email.strip().lower()}:{_hash(device_id)}"


def _challenge_key(challenge: str) -> str:
    return f"login_challenge:{challenge}"


def mask_email(email: str) -> str:
    """a****@gmail.com: enough to recognise, not enough to harvest."""
    local, _, domain = email.partition("@")
    if not domain:
        return "your email"
    return f"{local[:1]}{'*' * max(len(local) - 1, 3)}@{domain}"


async def is_trusted(email: str, device_id: Optional[str]) -> bool:
    if not device_id:
        return False
    return bool(await redis.get(_trust_key(email, device_id)))


async def trust(email: str, device_id: Optional[str]) -> None:
    if device_id:
        await redis.setex(_trust_key(email, device_id), TRUST_DAYS * 86400, "1")


async def mark_email_verified(email: str, db: AsyncSession) -> None:
    """A code that reached the inbox proves the email: on every row of it."""
    from app.models.user import BaseUser

    await db.execute(update(BaseUser).where(BaseUser.email == email).values(verified=True))
    await db.commit()


async def start(user, device_id: Optional[str]) -> str:
    """Email a code and return the challenge the app answers it with."""
    from app.utils.email import create_send_otp

    challenge = secrets.token_urlsafe(24)
    await redis.setex(
        _challenge_key(challenge),
        CHALLENGE_SECONDS,
        json.dumps({"user_id": user.id, "email": user.email, "device_id": device_id or "", "tries": 0, "sent_at": time.time()}),
    )
    if not await create_send_otp(user.email, purpose="signin"):
        await redis.delete(_challenge_key(challenge))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="We couldn't send your sign-in code. Please try again in a minute.",
        )
    logger.info(f"New-device sign-in code sent for user {user.id}")
    return challenge


async def _load(challenge: str) -> dict:
    raw = await redis.get(_challenge_key(challenge))
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This sign-in has expired. Please sign in again.",
        )
    return json.loads(raw)


async def resend(challenge: str) -> None:
    from app.utils.email import create_send_otp

    data = await _load(challenge)
    if time.time() - float(data.get("sent_at") or 0) < RESEND_COOLDOWN_SECONDS:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Please wait a moment before asking again.")
    email = data.get("email")
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in again.")
    data["sent_at"] = time.time()
    await redis.setex(_challenge_key(challenge), CHALLENGE_SECONDS, json.dumps(data))
    if not await create_send_otp(email, purpose="signin"):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="We couldn't send the code. Please try again.")


async def finish(challenge: str, otp: str, db: AsyncSession):
    """Check the code. Returns the user row the sign-in was for."""
    from app.models.user import BaseUser
    from app.utils.utils import verify_otp

    data = await _load(challenge)
    user = await db.get(BaseUser, data["user_id"])
    if user is None:
        await redis.delete(_challenge_key(challenge))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in again.")

    if not await verify_otp(str(otp), user.email):
        data["tries"] = int(data.get("tries") or 0) + 1
        if data["tries"] >= MAX_TRIES:
            # Four digits can be guessed given enough tries: a handful, then
            # the whole sign-in starts over with the password.
            await redis.delete(_challenge_key(challenge))
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Too many wrong codes. Please sign in again.",
            )
        await redis.setex(_challenge_key(challenge), CHALLENGE_SECONDS, json.dumps(data))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid code. Please check it and try again.")

    await redis.delete(_challenge_key(challenge))
    await trust(user.email, data.get("device_id") or None)
    await mark_email_verified(user.email, db)
    await db.refresh(user)
    return user
