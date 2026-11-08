"""Signing in as a chosen profile resolves the matching row.

A person owns two rows — a Client and an Agent sharing an email — so the
profile someone picks at sign-in is not a label on the session, it decides
which identity the token belongs to. These tests pin the three things that
must hold for that to be safe:

  * omitting `profile` still resolves the client row, so existing clients are
    unaffected;
  * a requested profile resolves that row and nothing else;
  * `active_profile` is always derived from the resolved row, never from what
    the caller asked for, so a token can never assert one profile while `sub`
    points at the other.
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import Agent, Client
from app.schemas.auth_schema import LoginData, TokenData
from app.services.auth import authenticate_user, create_account, requested_account_type
from app.schemas.user_schema import UserCreate
from app.utils.enums import (
    AccountTypeEnum,
    ProfileEnum,
    account_type_to_profile,
    profile_to_account_type,
)
from core.configs import settings

PASSWORD = "correct horse battery staple"


@pytest.fixture
def chooser_enabled(monkeypatch):
    monkeypatch.setattr(settings, "NEW_SIGNIN_CHOOSER", True)


@pytest.fixture
def chooser_disabled(monkeypatch):
    monkeypatch.setattr(settings, "NEW_SIGNIN_CHOOSER", False)


async def _signup(db: AsyncSession, profile=None, email="chooser@example.com"):
    """Run the real signup path so both rows exist exactly as in production."""
    return await create_account(
        UserCreate(
            username="chooser",
            email=email,
            password=PASSWORD,
            near_account_id="chooser.testnet",
            profile=profile,
        ),
        db,
    )


# ---- mapping ----------------------------------------------------------------


@pytest.mark.unit
def test_profile_maps_to_account_type():
    assert profile_to_account_type(ProfileEnum.buyer) is AccountTypeEnum.client
    assert profile_to_account_type(ProfileEnum.seller) is AccountTypeEnum.agent
    # The default that keeps existing clients working.
    assert profile_to_account_type(None) is AccountTypeEnum.client


@pytest.mark.unit
def test_admin_is_not_a_profile():
    """admin must be unreachable by asking for a profile, in either direction."""
    assert account_type_to_profile(AccountTypeEnum.admin) is None
    assert AccountTypeEnum.admin not in {
        profile_to_account_type(p) for p in ProfileEnum
    }


@pytest.mark.unit
def test_only_two_profile_values_exist():
    assert {p.value for p in ProfileEnum} == {"buyer", "seller"}


# ---- signup -----------------------------------------------------------------


@pytest.mark.unit
async def test_signup_creates_both_rows_whichever_profile_is_chosen(
    db: AsyncSession, chooser_enabled
):
    seller = await _signup(db, ProfileEnum.seller)

    # The chosen profile decides which row is returned...
    assert seller.account_type is AccountTypeEnum.agent
    # ...but the twin is created regardless, so the other profile is always
    # available later without a second signup.
    from sqlalchemy import select
    from app.models.user import BaseUser

    rows = (
        (
            await db.execute(
                select(BaseUser).where(BaseUser.email == "chooser@example.com")
            )
        )
        .scalars()
        .all()
    )
    assert {row.account_type for row in rows} == {
        AccountTypeEnum.client,
        AccountTypeEnum.agent,
    }


@pytest.mark.unit
async def test_signup_without_profile_returns_the_client_row(
    db: AsyncSession, chooser_enabled
):
    user = await _signup(db)
    assert user.account_type is AccountTypeEnum.client


# ---- login ------------------------------------------------------------------


@pytest.mark.unit
async def test_login_as_seller_resolves_the_agent_row(
    db: AsyncSession, chooser_enabled
):
    buyer_row = await _signup(db)

    user = await authenticate_user(
        LoginData(
            username="chooser@example.com",
            password=PASSWORD,
            profile=ProfileEnum.seller,
        ),
        db,
    )

    assert user.account_type is AccountTypeEnum.agent
    # Different identity, not a relabelled one — this is the whole reason
    # active_profile cannot be an independent claim.
    assert user.id != buyer_row.id


@pytest.mark.unit
async def test_login_without_profile_is_unchanged(db: AsyncSession, chooser_enabled):
    """The backwards-compatibility guarantee for clients that send nothing."""
    await _signup(db)

    user = await authenticate_user(
        LoginData(username="chooser@example.com", password=PASSWORD), db
    )

    assert user.account_type is AccountTypeEnum.client


@pytest.mark.unit
async def test_active_profile_follows_the_resolved_row(
    db: AsyncSession, chooser_enabled
):
    await _signup(db)

    seller = await authenticate_user(
        LoginData(
            username="chooser@example.com",
            password=PASSWORD,
            profile=ProfileEnum.seller,
        ),
        db,
    )
    buyer = await authenticate_user(
        LoginData(
            username="chooser@example.com",
            password=PASSWORD,
            profile=ProfileEnum.buyer,
        ),
        db,
    )

    assert account_type_to_profile(seller.account_type) is ProfileEnum.seller
    assert account_type_to_profile(buyer.account_type) is ProfileEnum.buyer


@pytest.mark.unit
async def test_wrong_password_still_rejected_for_a_chosen_profile(
    db: AsyncSession, chooser_enabled
):
    from fastapi import HTTPException

    await _signup(db)

    with pytest.raises(HTTPException) as exc:
        await authenticate_user(
            LoginData(
                username="chooser@example.com",
                password="not-the-password",
                profile=ProfileEnum.seller,
            ),
            db,
        )
    assert exc.value.status_code == 401


# ---- validation -------------------------------------------------------------


@pytest.mark.unit
def test_unknown_profile_is_rejected_not_defaulted():
    """An unrecognised value must fail loudly.

    Quietly falling back to buyer would sign someone into the wrong profile
    on a typo, which looks like missing data rather than a bad request.
    """
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        LoginData(username="a@b.com", password=PASSWORD, profile="landlord")


# ---- kill switch ------------------------------------------------------------


@pytest.mark.unit
async def test_flag_off_ignores_a_requested_profile(
    db: AsyncSession, chooser_disabled
):
    """NEW_SIGNIN_CHOOSER=false reverts every path to pre-feature behaviour.

    This is what makes the rollback real: clients already sending
    profile=seller must fall back to the client row rather than keep working.
    """
    await _signup(db)

    user = await authenticate_user(
        LoginData(
            username="chooser@example.com",
            password=PASSWORD,
            profile=ProfileEnum.seller,
        ),
        db,
    )

    assert user.account_type is AccountTypeEnum.client
    assert requested_account_type(ProfileEnum.seller) is AccountTypeEnum.client


@pytest.mark.unit
def test_flag_on_honours_a_requested_profile(chooser_enabled):
    assert requested_account_type(ProfileEnum.seller) is AccountTypeEnum.agent


# ---- token shape ------------------------------------------------------------


@pytest.mark.unit
def test_token_data_carries_active_profile():
    """The claim rides along for client-side routing without a round trip."""
    data = TokenData(sub=1, scopes=["agent"], active_profile=ProfileEnum.seller)
    assert data.model_dump()["active_profile"] is ProfileEnum.seller


@pytest.mark.unit
def test_token_data_active_profile_is_optional():
    """Tokens minted before this shipped decode without it."""
    assert TokenData(sub=1, scopes=["client"]).active_profile is None
