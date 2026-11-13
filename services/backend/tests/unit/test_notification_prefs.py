"""Notification settings are the person's, and the email switch is obeyed."""

from sqlalchemy.ext.asyncio import AsyncSession

import app.services.notification_prefs as prefs
from app.models.user import Agent, Client
from app.utils.enums import AccountTypeEnum
from app.utils.utils import hash_password


async def _pair(db: AsyncSession):
    hashed = hash_password("whatever-password-1")
    buyer = Client(email="np@example.com", username="np_user", password=hashed, verified=True,
                   account_type=AccountTypeEnum.client, near_account_id="np.testnet")
    seller = Agent(email="np@example.com", username="np_user", password=hashed, verified=True,
                   account_type=AccountTypeEnum.agent, near_account_id="np.testnet")
    db.add_all([buyer, seller])
    await db.commit()
    await db.refresh(buyer)
    await db.refresh(seller)
    return buyer, seller


def test_defaults_and_unknown_keys():
    assert prefs.effective(None)["email_notifications"] is True
    assert prefs.effective({"email_notifications": False, "junk": True}) == {**prefs.DEFAULTS, "email_notifications": False}


async def test_saved_on_both_rows(db: AsyncSession):
    buyer, seller = await _pair(db)
    await prefs.save_for_person(buyer, {"email_notifications": False}, db)
    await db.refresh(seller)
    assert prefs.effective(seller.notification_preferences)["email_notifications"] is False


async def test_email_respects_switch_and_configuration(db: AsyncSession, monkeypatch):
    buyer, _ = await _pair(db)
    sent = []

    class FakeSender:
        async def send_email(self, text, to, subject, **_):
            sent.append((to, subject))
            return True

    import app.utils.email as email_mod

    monkeypatch.setattr(email_mod, "email_sender", FakeSender())

    monkeypatch.setattr(prefs, "email_configured", lambda: False)
    await prefs.email_deal_update(buyer.id, "bid_accepted", "Flat", db)
    assert sent == []

    monkeypatch.setattr(prefs, "email_configured", lambda: True)
    await prefs.email_deal_update(buyer.id, "bid_accepted", "Flat", db)
    assert sent == [("np@example.com", "Sheda: Offer accepted")]

    await prefs.save_for_person(buyer, {"email_notifications": False}, db)
    await prefs.email_deal_update(buyer.id, "bid_accepted", "Flat", db)
    assert len(sent) == 1
