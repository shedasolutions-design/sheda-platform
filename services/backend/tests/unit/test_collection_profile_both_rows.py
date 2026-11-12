"""A Collections profile belongs to the person, not to one of their rows.

Found in the two-account test: the demo manager's profile sat on her seller
row, she signed in as a buyer, and the sign-offs page said "You do not have
a Collections profile". Builder and manager actions had the same blind spot.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.collection import CollectionProfile
from app.models.user import Agent, Client
from app.routers.collections import _my_profile
from app.utils.enums import AccountTypeEnum
from app.utils.utils import hash_password


async def test_profile_on_seller_row_is_found_from_buyer_row(db: AsyncSession):
    hashed = hash_password("whatever-password-1")
    buyer = Client(email="mp@example.com", username="mp_user", password=hashed, verified=True,
                   account_type=AccountTypeEnum.client, near_account_id="mp.testnet")
    seller = Agent(email="mp@example.com", username="mp_user", password=hashed, verified=True,
                   account_type=AccountTypeEnum.agent, near_account_id="mp.testnet")
    db.add_all([buyer, seller])
    await db.commit()
    await db.refresh(buyer)
    await db.refresh(seller)
    db.add(CollectionProfile(user_id=seller.id, role="manager", display_name="Eze PM", near_account_id="mp.testnet"))
    await db.commit()

    profile = await _my_profile(db, buyer, "manager")

    assert profile.display_name == "Eze PM"
