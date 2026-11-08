from types import SimpleNamespace

import pytest

from app.schemas.property_schema import PropertyShow
from app.services.listing import get_property_by_id


class FakeCache:
    def __init__(self, cached_detail=None):
        self.cached_detail = cached_detail
        self.get_calls = 0
        self.set_calls = 0

    async def get_property_detail(self, _property_id: int):
        self.get_calls += 1
        return self.cached_detail

    async def set_property_detail(self, _property_id: int, _detail: dict):
        self.set_calls += 1
        return True


def _property_payload():
    return {
        "id": 1,
        "agent_id": 9,
        "title": "Test Property",
        "description": "A valid test property",
        "blockchain_property_id": None,
        "blockchain_owner_id": None,
        "is_nft_minted": False,
        "transaction_hash": None,
        "location": "Lagos",
        "price": 1200000,
        "property_type": "apartment",
        "listing_type": "sale",
        "status": "available",
        "furnished": False,
        "is_active": True,
        "bathroom": 2,
        "bedroom": 3,
        "air_condition": False,
        "pop_ceiling": False,
        "floor_tiles": False,
        "running_water": True,
        "furniture": False,
        "prepaid_meter": True,
        "wifi": False,
        "is_negotiable": False,
        "images": [],
    }


@pytest.mark.asyncio
async def test_get_property_by_id_cache_hit_returns_property_show(monkeypatch):
    cached_payload = _property_payload()
    fake_cache = FakeCache(cached_detail=cached_payload)

    async def _fake_get_cache_service():
        return fake_cache

    monkeypatch.setattr("app.services.cache.get_cache_service", _fake_get_cache_service)

    class FailingDB:
        async def execute(self, _query):
            raise AssertionError("DB should not be called on cache hit")

    result = await get_property_by_id(1, FailingDB())

    assert isinstance(result, PropertyShow)
    assert result.id == 1
    assert fake_cache.get_calls == 1
    assert fake_cache.set_calls == 0


@pytest.mark.asyncio
async def test_get_property_by_id_use_cache_false_skips_cache_read(monkeypatch):
    payload = _property_payload()
    property_obj = SimpleNamespace(**payload)
    fake_cache = FakeCache(cached_detail=payload)

    async def _fake_get_cache_service():
        return fake_cache

    monkeypatch.setattr("app.services.cache.get_cache_service", _fake_get_cache_service)

    class FakeResult:
        def scalar_one_or_none(self):
            return property_obj

    class FakeDB:
        async def execute(self, _query):
            return FakeResult()

    result = await get_property_by_id(1, FakeDB(), use_cache=False)

    assert result is property_obj
    assert fake_cache.get_calls == 0
    assert fake_cache.set_calls == 1
