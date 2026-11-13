"""A flat's expected rent: the builder's figure, frozen once relied on."""

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.collection import CollectionProfile, CollectionProject, CollectionUnit, RaiseStatusEnum
from app.models.user import Agent
from app.routers.collections import set_unit_rent
from app.schemas.collection_schema import UnitRent
from app.utils.enums import AccountTypeEnum
from app.utils.utils import hash_password


async def _raise(db: AsyncSession, status: RaiseStatusEnum, rent: tuple[str, str] | None = None):
    builder = Agent(email="ur@example.com", username="ur_user", password=hash_password("whatever-password-1"),
                    verified=True, account_type=AccountTypeEnum.agent, near_account_id="ur.testnet")
    db.add(builder)
    await db.commit()
    await db.refresh(builder)
    profile = CollectionProfile(user_id=builder.id, role="builder", display_name="UR Homes", near_account_id="ur.testnet")
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    project = CollectionProject(slug="ur-flats", builder_id=profile.id, name="UR Flats", location="Yaba",
                                units=1, status=status)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    db.add(CollectionUnit(project_id=project.id, code="1a", label="Flat 1A", bedrooms=2,
                          price_atomic="40000000000", total_shares="10000",
                          rent_min_atomic=rent[0] if rent else None, rent_max_atomic=rent[1] if rent else None))
    await db.commit()
    return builder


async def test_builder_sets_rent_on_a_draft(db: AsyncSession):
    builder = await _raise(db, RaiseStatusEnum.draft, ("1000000000", "2000000000"))
    out = await set_unit_rent("ur-flats", "1a", UnitRent(rent_min_atomic="3000000000", rent_max_atomic="3600000000"), builder, db)
    assert (out.rent_min_atomic, out.rent_max_atomic) == ("3000000000", "3600000000")


async def test_open_raise_may_add_a_missing_rent_once(db: AsyncSession):
    builder = await _raise(db, RaiseStatusEnum.open)
    out = await set_unit_rent("ur-flats", "1a", UnitRent(rent_min_atomic="3000000000", rent_max_atomic="3600000000"), builder, db)
    assert out.rent_min_atomic == "3000000000"
    with pytest.raises(HTTPException) as e:
        await set_unit_rent("ur-flats", "1a", UnitRent(rent_min_atomic="9000000000", rent_max_atomic="9900000000"), builder, db)
    assert e.value.status_code == 409


def test_low_cannot_exceed_high_and_both_are_needed():
    with pytest.raises(ValidationError):
        UnitRent(rent_min_atomic="5", rent_max_atomic="4")
    with pytest.raises(ValidationError):
        UnitRent(rent_min_atomic="5")
