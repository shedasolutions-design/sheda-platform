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

    assert isinstance(result, PropertyShow)
    assert result.id == 1
    assert fake_cache.get_calls == 0
    assert fake_cache.set_calls == 1


@pytest.mark.asyncio
async def test_filtered_property_cache_hit(monkeypatch):
    from app.schemas.property_schema import FilterParams, PropertyFeed
    from app.services.listing import filtered_property

    feed_payload = {
        "data": [_property_payload()],
        "next_coursor": 2,
    }

    class FeedCache:
        async def get_property_feed(self, page=1, filters_hash=""):
            return feed_payload

        async def set_property_feed(self, *args, **kwargs):
            return True

    async def _fake_get_cache_service():
        return FeedCache()

    monkeypatch.setattr("app.services.cache.get_cache_service", _fake_get_cache_service)

    class FailingDB:
        async def execute(self, _query):
            raise AssertionError("DB should not be reached when cache hits")

    filter_query = FilterParams(cursor=1, limit=10)
    result = await filtered_property(filter_query, FailingDB())

    assert isinstance(result, PropertyFeed)
    assert len(result.data) == 1
    assert result.next_coursor == 2

