"""Profile edits: one person, both rows; agency name saved; no self-verifying."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import Agent, Client
from app.schemas.user_schema import UserUpdate
from app.services.profile import update_user
from app.utils.enums import AccountTypeEnum, KycStatusEnum
from app.utils.utils import hash_password


async def _pair(db: AsyncSession):
    hashed = hash_password("whatever-password-1")
    buyer = Client(email="pu@example.com", username="pu_user", password=hashed, verified=True,
                   account_type=AccountTypeEnum.client, near_account_id="pu.testnet")
    seller = Agent(email="pu@example.com", username="pu_user", password=hashed, verified=True,
                   account_type=AccountTypeEnum.agent, near_account_id="pu.testnet")
    db.add_all([buyer, seller])
    await db.commit()
    await db.refresh(buyer)
    await db.refresh(seller)
    return buyer, seller


async def test_personal_edit_from_buyer_reaches_seller(db: AsyncSession):
    buyer, seller = await _pair(db)
    await update_user(UserUpdate(account_type="client", fullname="Ada Obi", location="Yaba"), db, buyer)
    await db.refresh(seller)
    assert seller.fullname == "Ada Obi" and seller.location == "Yaba"


async def test_agency_name_is_saved_on_the_seller_row(db: AsyncSession):
    buyer, seller = await _pair(db)
    await update_user(UserUpdate(account_type="client", agency_name="  Obi Homes  "), db, buyer)
    await db.refresh(seller)
    assert seller.agency_name == "Obi Homes"


async def test_cannot_self_verify_or_self_rate(db: AsyncSession):
    _, seller = await _pair(db)
    await update_user(UserUpdate(account_type="agent", kyc_status=KycStatusEnum.verified, rating=5.0), db, seller)
    await db.refresh(seller)
    assert seller.kyc_status != KycStatusEnum.verified
    assert (seller.rating or 0) != 5.0
