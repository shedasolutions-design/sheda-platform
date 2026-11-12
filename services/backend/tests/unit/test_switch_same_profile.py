"""Switching to the profile you are already on keeps your token.

The web app confirms the active profile with switch-account on every page
load. Each call used to revoke the token it was sent with, so any request
still in flight with that token (wallet funding, the chat socket) failed
with "Token has been revoked". A real switch still revokes the old token.
"""

from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

import app.routers.auth as auth_router
from app.models.user import Agent, Client
from app.schemas.auth_schema import SwitchAccountType
from app.utils.enums import AccountTypeEnum, ProfileEnum
from app.utils.utils import hash_password


async def _pair(db: AsyncSession) -> Client:
    hashed = hash_password("whatever-password-1")
    client = Client(email="sw@example.com", username="sw_user", password=hashed, verified=True,
                    account_type=AccountTypeEnum.client, near_account_id="sw_user.testnet")
    agent = Agent(email="sw@example.com", username="sw_user", password=hashed, verified=True,
                  account_type=AccountTypeEnum.agent, near_account_id="sw_user.testnet")
    db.add_all([client, agent])
    await db.commit()
    await db.refresh(client)
    return client


def _spy(monkeypatch):
    revoked = []

    async def fake_blacklist(token, exp):
        revoked.append(token)

    async def fake_exp(token):
        return 60

    monkeypatch.setattr(auth_router, "blacklist_token", fake_blacklist)
    monkeypatch.setattr(auth_router, "token_exp_time", fake_exp)
    return revoked


async def test_same_profile_keeps_the_token(db: AsyncSession, monkeypatch):
    client = await _pair(db)
    revoked = _spy(monkeypatch)
    cred = HTTPAuthorizationCredentials(scheme="Bearer", credentials="current-token")

    out = await auth_router.switch_account_type(
        cred, SwitchAccountType(switch_to=AccountTypeEnum.client), client, db
    )

    assert out.access_token == "current-token"
    assert out.active_profile == ProfileEnum.buyer
    assert revoked == []


async def test_real_switch_still_revokes(db: AsyncSession, monkeypatch):
    client = await _pair(db)
    revoked = _spy(monkeypatch)
    cred = HTTPAuthorizationCredentials(scheme="Bearer", credentials="current-token")

    out = await auth_router.switch_account_type(
        cred, SwitchAccountType(switch_to=AccountTypeEnum.agent), client, db
    )

    assert out.access_token != "current-token"
    assert revoked == ["current-token"]
