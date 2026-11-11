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
from app.services.user_service import ActiveUser
from core.dependecies import DBSession


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
    notification = await create_transaction_notification(payload, db)
    return notification


@router.get(
    "",
    response_model=NotificationListResponse,
    status_code=status.HTTP_200_OK,
)
async def get_notifications(current_user: ActiveUser, db: DBSession):
    notifications = await list_notifications(current_user.id, db)
    return NotificationListResponse(data=notifications)


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
