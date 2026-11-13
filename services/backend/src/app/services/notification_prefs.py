"""Notification preferences, kept per person on the server.

The settings page used to save its switches in the browser only, and three
of the four did nothing. They now live on the user rows (every row of the
person, since buyer and seller rows are one person), and the backend reads
them before emailing a deal update.
"""

from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import BaseUser
from app.utils.enums import AccountTypeEnum
from core.configs import settings
from core.logger import logger

DEFAULTS: dict[str, bool] = {
    "allow_messages": True,
    "push_notifications": True,
    "email_notifications": True,
    "sms_notifications": False,
    # News about buildings you invest in or follow (Invest).
    "invest_updates": True,
}


def effective(prefs: dict | None) -> dict[str, bool]:
    """Stored values over the defaults; unknown keys are dropped."""
    out = dict(DEFAULTS)
    for key, value in (prefs or {}).items():
        if key in DEFAULTS and isinstance(value, bool):
            out[key] = value
    return out


async def save_for_person(user: BaseUser, changes: dict[str, Any], db: AsyncSession) -> dict[str, bool]:
    merged = effective({**effective(user.notification_preferences), **changes})
    await db.execute(
        update(BaseUser)
        .where(BaseUser.email == user.email, BaseUser.account_type != AccountTypeEnum.admin)
        .values(notification_preferences=merged)
    )
    await db.commit()
    return merged


def email_configured() -> bool:
    return bool(settings.BREVO_API_KEY) or bool(settings.SMTP_USERNAME and settings.SMTP_PASSWORD)


def app_url() -> str:
    return "https://market.sheda.app" if settings.NEAR_NETWORK == "mainnet" else "https://testing.sheda.app"


EVENT_WORDS: dict[str, tuple[str, str]] = {
    "bid_placed": ("New offer", "You have a new offer on {p}."),
    "bid_accepted": ("Offer accepted", "Your offer on {p} was accepted. Book a viewing next."),
    "bid_rejected": ("Offer declined", "Your offer on {p} was declined. Your money has been returned."),
    "bid_cancelled": ("Offer withdrawn", "The offer on {p} was withdrawn."),
    "appointment_booked": ("Viewing requested", "A buyer booked a viewing of {p}. Accept or decline it."),
    "appointment_accepted": ("Viewing confirmed", "Your viewing of {p} is confirmed."),
    "appointment_rejected": ("Viewing declined", "The seller declined the viewing of {p}."),
    "docs_released": ("Agreement sent", "The agreement for {p} is ready for you to review."),
    "docs_confirmed": ("Agreement accepted", "The buyer accepted the agreement for {p}."),
    "payment_released": ("Payment released", "Payment for {p} has been released from escrow."),
    "transaction_completed": ("Deal complete", "The deal for {p} is complete."),
    "dispute_raised": ("Dispute raised", "A dispute was raised on the deal for {p}."),
}


async def email_deal_update(recipient_id: int, event: str, property_title: str | None, db: AsyncSession) -> None:
    """Email a deal update if the person allows it and email is set up.
    Never raises: a mail problem must not undo the deal step."""
    try:
        if not email_configured():
            return
        user = (await db.execute(select(BaseUser).where(BaseUser.id == recipient_id))).scalar_one_or_none()
        if user is None or not user.email or not effective(user.notification_preferences)["email_notifications"]:
            return
        title, body = EVENT_WORDS.get(event, ("Deal update", "There is an update on the deal for {p}."))
        name = f'"{property_title}"' if property_title else "your property"
        from app.utils.email import email_sender

        text = (
            f"{body.format(p=name)}\n\n"
            f"Open Sheda to see the details: {app_url()}/history\n\n"
            "You get these emails because email notifications are on. "
            f"Turn them off in Settings > Notifications: {app_url()}/notification-setting"
        )
        await email_sender.send_email(text, user.email, f"Sheda: {title}")
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"Deal update email to user {recipient_id} not sent: {exc}")
