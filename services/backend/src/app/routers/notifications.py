from fastapi import APIRouter, HTTPException, status

from app.schemas.notification_schema import (
    DeviceTokenRequest,
    DeviceTokenResponse,
    NotificationListResponse,
    TransactionNotificationRequest,
    TransactionNotificationResponse,
)
from app.services.notifications import (
    create_transaction_notification,
    list_notifications,
    mark_notification_read,
    register_device_token,
)
from app.services.identity import LinkedIdentityDep
from app.services.user_service import ActiveUser
from core.dependecies import DBSession


from app.services.wallets import get_wallet_ids_for_users

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.post(
    "/transaction-update",
    response_model=TransactionNotificationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def transaction_update(
    payload: TransactionNotificationRequest,
    current_user: ActiveUser,
    db: DBSession,
):
    # The sender's own wallets, so the deal record can name the buyer when
    # the event itself did not.
    sender_wallets = await get_wallet_ids_for_users([current_user.id], db)
    if current_user.near_account_id:
        sender_wallets.append(current_user.near_account_id)
    notification = await create_transaction_notification(payload, db, sender_wallets)
    return notification


@router.get(
    "",
    response_model=NotificationListResponse,
    status_code=status.HTTP_200_OK,
)
async def get_notifications(
    current_user: ActiveUser, identity: LinkedIdentityDep, db: DBSession
):
    # Spans both profiles. A bid on your listing notifies your *seller* row,
    # so scoping to the active row is why that notification never arrived
    # while you happened to be signed in as a buyer.
    notifications = await list_notifications(identity.ids, db)
    return NotificationListResponse(data=notifications)


@router.get("/preferences", response_model=dict)
async def get_preferences(current_user: ActiveUser):
    """This person's notification settings (server defaults where unset)."""
    from app.services.notification_prefs import effective, email_configured

    return {
        **effective(getattr(current_user, "notification_preferences", None)),
        "email_available": email_configured(),
        "sms_available": False,
    }


@router.put("/preferences", response_model=dict)
async def put_preferences(payload: dict, current_user: ActiveUser, db: DBSession):
    """Save notification settings for every row of this person."""
    from app.models.user import BaseUser
    from app.services.notification_prefs import email_configured, save_for_person

    user = await db.get(BaseUser, current_user.id)
    saved = await save_for_person(user, payload, db)
    return {**saved, "email_available": email_configured(), "sms_available": False}


@router.post(
    "/{notification_id}/read",
    response_model=TransactionNotificationResponse,
    status_code=status.HTTP_200_OK,
)
async def read_notification(
    notification_id: int,
    current_user: ActiveUser,
    db: DBSession,
):
    notification = await mark_notification_read(notification_id, current_user.id, db)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notification


@router.post(
    "/register-device",
    response_model=DeviceTokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_device(
    payload: DeviceTokenRequest,
    current_user: ActiveUser,
    db: DBSession,
):
    token = await register_device_token(payload, current_user.id, db)
    return token
