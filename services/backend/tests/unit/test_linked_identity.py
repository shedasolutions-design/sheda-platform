"""Reads span both of a person's profiles; writes stay bound to one.

A person owns two rows — a Client and an Agent sharing an email — and every
read scoped to `current_user.id` therefore showed one half of their data. That
is why a message sent to someone as a seller was invisible while they were
signed in as a buyer, and why a seller's transaction feed came back empty:
the wallet is registered against a single row, always the buyer one, so
resolving it from the active row found nothing at all.

These pin the resolution rules. The asymmetry is deliberate and load-bearing:
a read spanning both rows is just a fuller view of one's own data, whereas a
*write* performed as the wrong row is a genuine correctness bug — a reply
arriving from an account the counterparty has never dealt with.
"""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import WalletMapping
from app.schemas.user_schema import UserCreate
from app.services.auth import create_account, get_user
from app.services.identity import resolve_linked_identity
from app.services.wallets import get_wallet_for_user, get_wallet_ids_for_users
from app.utils.enums import AccountTypeEnum, ProfileEnum

PASSWORD = "correct horse battery staple"


async def _signup(db: AsyncSession, email="linked@example.com", username="linked"):
    """The real signup path, so both rows exist exactly as in production."""
    return await create_account(
        UserCreate(
            username=username,
            email=email,
            password=PASSWORD,
            near_account_id=f"{username}.testnet",
        ),
        db,
    )


async def _rows(db: AsyncSession, email="linked@example.com"):
    buyer = await get_user(email, db, AccountTypeEnum.client)
    seller = await get_user(email, db, AccountTypeEnum.agent)
    return buyer, seller


# ---- identity resolution ----------------------------------------------------


@pytest.mark.unit
async def test_resolves_both_rows_from_either_side(db: AsyncSession):
    await _signup(db)
    buyer, seller = await _rows(db)

    from_buyer = await resolve_linked_identity(buyer, db)
    from_seller = await resolve_linked_identity(seller, db)

    assert set(from_buyer.ids) == {buyer.id, seller.id}
    assert set(from_seller.ids) == {buyer.id, seller.id}


@pytest.mark.unit
async def test_active_row_is_first_and_correctly_labelled(db: AsyncSession):
    await _signup(db)
    buyer, seller = await _rows(db)

    identity = await resolve_linked_identity(seller, db)

    # Callers that only want "me" take ids[0], so this ordering is contractual.
    assert identity.ids[0] == seller.id
    assert identity.active_id == seller.id
    assert identity.active_profile is ProfileEnum.seller
    assert identity.profile_for(seller.id) is ProfileEnum.seller
    assert identity.profile_for(buyer.id) is ProfileEnum.buyer


@pytest.mark.unit
async def test_does_not_link_across_different_people(db: AsyncSession):
    await _signup(db, email="one@example.com", username="one")
    await _signup(db, email="two@example.com", username="two")

    one_buyer, _ = await _rows(db, "one@example.com")
    two_buyer, two_seller = await _rows(db, "two@example.com")

    identity = await resolve_linked_identity(one_buyer, db)

    assert two_buyer.id not in identity.ids
    assert two_seller.id not in identity.ids


@pytest.mark.unit
async def test_unknown_row_is_not_attributed_a_profile(db: AsyncSession):
    """profile_for must not claim a row that isn't this person's."""
    await _signup(db)
    buyer, _ = await _rows(db)

    identity = await resolve_linked_identity(buyer, db)

    assert identity.profile_for(999_999) is None
    assert identity.profile_for(None) is None


@pytest.mark.unit
async def test_has_linked_profile_is_false_for_a_lone_row(db: AsyncSession):
    """Accounts predating paired signup keep their old, unchanged behaviour.

    The UI hangs profile chips and split counters off this flag, so someone
    who cannot have cross-profile data sees no trace of the feature.
    """
    await _signup(db)
    buyer, seller = await _rows(db)
    await db.delete(seller)
    await db.commit()

    identity = await resolve_linked_identity(buyer, db)

    assert identity.ids == [buyer.id]
    assert identity.has_linked_profile is False


# ---- wallet resolution ------------------------------------------------------


@pytest.mark.unit
async def test_wallet_registered_to_the_buyer_row_is_found_from_the_seller_row(
    db: AsyncSession,
):
    """The empty-seller-feed bug, at its source.

    Wallets are mapped per row and registration always bound them to the buyer
    row, because login resolved buyer for everyone. Asking the seller row for
    "my wallet" therefore returned None, and the transaction feed bailed out
    and reported no transactions to a seller with live bids.
    """
    await _signup(db)
    buyer, seller = await _rows(db)
    db.add(WalletMapping(user_id=buyer.id, wallet_id="linked.testnet"))
    await db.commit()

    # The old single-row lookup: still nothing, which is the bug.
    assert await get_wallet_for_user(seller.id, db) is None

    identity = await resolve_linked_identity(seller, db)
    assert await get_wallet_ids_for_users(identity.ids, db) == ["linked.testnet"]


@pytest.mark.unit
async def test_a_wallet_cannot_be_registered_to_both_rows(db: AsyncSession):
    """wallet_id is UNIQUE, so a person's two rows can never share a mapping.

    This is why spanning both rows is the only available fix rather than a
    nicety: there is no way to also register the wallet against the seller row
    and have the single-row lookup start working. Exactly one row can ever
    hold it, and that row is the buyer.
    """
    await _signup(db)
    buyer, seller = await _rows(db)
    db.add(WalletMapping(user_id=buyer.id, wallet_id="linked.testnet"))
    await db.commit()

    db.add(WalletMapping(user_id=seller.id, wallet_id="linked.testnet"))
    with pytest.raises(IntegrityError):
        await db.commit()
    await db.rollback()


@pytest.mark.unit
async def test_distinct_wallets_are_both_returned(db: AsyncSession):
    await _signup(db)
    buyer, seller = await _rows(db)
    db.add(WalletMapping(user_id=buyer.id, wallet_id="buyer.testnet"))
    db.add(WalletMapping(user_id=seller.id, wallet_id="seller.testnet"))
    await db.commit()

    identity = await resolve_linked_identity(buyer, db)
    wallets = await get_wallet_ids_for_users(identity.ids, db)

    assert set(wallets) == {"buyer.testnet", "seller.testnet"}


@pytest.mark.unit
async def test_no_wallet_anywhere_returns_empty(db: AsyncSession):
    await _signup(db)
    buyer, _ = await _rows(db)

    identity = await resolve_linked_identity(buyer, db)

    assert await get_wallet_ids_for_users(identity.ids, db) == []


@pytest.mark.unit
async def test_no_user_ids_returns_empty_without_querying(db: AsyncSession):
    assert await get_wallet_ids_for_users([], db) == []
