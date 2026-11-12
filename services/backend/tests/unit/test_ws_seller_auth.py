"""A seller's token opens the chat socket.

Found in the two-account test: the socket looked users up as the client
row whatever the token said, so a seller's `sub` was never found, the
lookup raised after the connection had been accepted, and the socket died
(1006) a second after opening, forever. Sellers had no live chat at all.
"""

from datetime import timedelta

import jwt
from sqlalchemy.ext.asyncio import AsyncSession

import app.services.user_service as user_service
from app.models.user import Agent, Client
from app.utils.enums import AccountTypeEnum
from app.utils.utils import hash_password
from core.configs import settings


class FakeSocket:
    def __init__(self):
        self.headers = {}
        self.accepted = False
        self.closed = None

    async def accept(self, subprotocol=None):
        self.accepted = True

    async def close(self, code=1000, reason=""):
        self.closed = (code, reason)


class NoBlacklist:
    async def get(self, key):
        return None


def _token(sub: int, scope: str) -> str:
    from datetime import datetime, timezone

    exp = datetime.now(timezone.utc) + timedelta(minutes=5)
    return jwt.encode({"sub": str(sub), "scopes": [scope], "exp": exp}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def _pair(db: AsyncSession):
    hashed = hash_password("whatever-password-1")
    client = Client(email="ws@example.com", username="ws_user", password=hashed, verified=True,
                    account_type=AccountTypeEnum.client, near_account_id="ws_user.testnet")
    agent = Agent(email="ws@example.com", username="ws_user", password=hashed, verified=True,
                  account_type=AccountTypeEnum.agent, near_account_id="ws_user.testnet")
    db.add_all([client, agent])
    await db.commit()
    await db.refresh(client)
    await db.refresh(agent)
    return client, agent


async def test_seller_token_opens_the_socket(db: AsyncSession, monkeypatch):
    monkeypatch.setattr(user_service, "redis", NoBlacklist())
    _, agent = await _pair(db)
    ws = FakeSocket()

    user = await user_service.get_websocket_user(ws, db, _token(agent.id, "agent"))

    assert user is not None and user.id == agent.id
    assert ws.closed is None


async def test_buyer_token_still_opens_the_socket(db: AsyncSession, monkeypatch):
    monkeypatch.setattr(user_service, "redis", NoBlacklist())
    client, _ = await _pair(db)
    ws = FakeSocket()

    user = await user_service.get_websocket_user(ws, db, _token(client.id, "client"))

    assert user is not None and user.id == client.id


async def test_unknown_user_is_refused_not_crashed(db: AsyncSession, monkeypatch):
    monkeypatch.setattr(user_service, "redis", NoBlacklist())
    ws = FakeSocket()

    user = await user_service.get_websocket_user(ws, db, _token(999999, "agent"))

    assert user is None
    assert ws.closed == (1008, "User not found")
