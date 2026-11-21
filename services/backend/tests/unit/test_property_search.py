"""Property search: every filter the app sends returns the right listings.

Found by testers: every search answered 500 because the search function used
`selectinload` without importing it, so every filter on the marketplace showed
"no results". Nothing exercised the search path, so nothing noticed.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.property import Property
from app.models.user import Agent
from app.services.listing import search_properties
from app.utils.enums import AccountTypeEnum, ListingTypeEnum, PropertyTypeEnum
from app.utils.utils import hash_password


async def _listings(db: AsyncSession):
    seller = Agent(email="ps@example.com", username="ps_seller", password=hash_password("whatever-password-1"),
                   verified=True, account_type=AccountTypeEnum.agent, near_account_id="ps.testnet")
    db.add(seller)
    await db.commit()
    await db.refresh(seller)
    db.add_all([
        Property(agent_id=seller.id, title="Lekki villa", description="pool", location="Lekki, Lagos",
                 price=300000.0, bathroom=6, bedroom=5, property_type=PropertyTypeEnum.luxury_villa,
                 listing_type=ListingTypeEnum.sale, is_negotiable=True, wifi=True),
        Property(agent_id=seller.id, title="Yaba flat", description="quiet", location="Yaba, Lagos",
                 price=1200.5, bathroom=1, bedroom=1, property_type=PropertyTypeEnum.apartment,
                 listing_type=ListingTypeEnum.rent, is_negotiable=False),
    ])
    await db.commit()


async def _titles(db, **filters):
    out = await search_properties(db, query="*", **filters)
    return sorted(p.title for p in out["data"])


async def test_search_with_no_filter_returns_every_listing(db: AsyncSession):
    await _listings(db)
    assert await _titles(db) == ["Lekki villa", "Yaba flat"]


async def test_each_filter_narrows_correctly(db: AsyncSession):
    await _listings(db)
    assert await _titles(db, location="Lekki") == ["Lekki villa"]
    assert await _titles(db, listing_type="rent") == ["Yaba flat"]
    assert await _titles(db, property_type="luxury_villa") == ["Lekki villa"]
    assert await _titles(db, min_bedroom=2) == ["Lekki villa"]
    assert await _titles(db, min_price=1000.25, max_price=1500.0) == ["Yaba flat"]
    assert await _titles(db, amenities=["wifi"]) == ["Lekki villa"]
    assert await _titles(db, negotiable=True) == ["Lekki villa"]


async def test_sort_by_price(db: AsyncSession):
    await _listings(db)
    out = await search_properties(db, query="*", sort="price_asc")
    assert [p.title for p in out["data"]] == ["Yaba flat", "Lekki villa"]
