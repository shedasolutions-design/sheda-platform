import pytest
import jwt
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.services.user_service import get_token_payload
from core.configs import settings


class FailingRedis:
    async def get(self, *args, **kwargs):
        raise TimeoutError("Timeout connecting to server")


class BlacklistHitRedis:
    async def get(self, *args, **kwargs):
        return "blacklisted"


class CleanRedis:
    async def get(self, *args, **kwargs):
        return None


@pytest.mark.asyncio
async def test_get_token_payload_valid_token(monkeypatch):
    monkeypatch.setattr("app.services.user_service.redis", CleanRedis())
    token = jwt.encode(
        {"sub": "user@example.com", "scopes": ["client"]},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    token_data = await get_token_payload(creds)
    assert token_data.sub == "user@example.com"
    assert "client" in token_data.scopes


@pytest.mark.asyncio
async def test_get_token_payload_blacklisted_token(monkeypatch):
    monkeypatch.setattr("app.services.user_service.redis", BlacklistHitRedis())
    token = jwt.encode(
        {"sub": "user@example.com", "scopes": ["client"]},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    with pytest.raises(HTTPException) as exc:
        await get_token_payload(creds)
    assert exc.value.status_code == 401
    assert "revoked" in exc.value.detail


@pytest.mark.asyncio
async def test_get_token_payload_redis_timeout_resilience(monkeypatch):
    monkeypatch.setattr("app.services.user_service.redis", FailingRedis())
    token = jwt.encode(
        {"sub": "user@example.com", "scopes": ["client"]},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    # Should not raise 500 or crash on redis timeout
    token_data = await get_token_payload(creds)
    assert token_data.sub == "user@example.com"
    assert "client" in token_data.scopes
