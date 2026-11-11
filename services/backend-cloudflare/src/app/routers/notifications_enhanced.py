"""
Notifications endpoints for push notifications and device management.

## Endpoints

### POST /notifications/register-device
Register a device token for push notifications.

```json
{
    "device_token": "firebase_token_here",
    "device_type": "mobile",  // mobile, web, desktop
    "device_name": "iPhone 14"  // optional
}
```

### POST /notifications/send
Send a push notification to users.

```json
{
    "user_ids": [123, 456],
    "title": "New Bid",
    "body": "You received a bid",
    "notification_type": "bid",
    "data": {"property_id": 789}
}
```

### GET /notifications/status/{user_id}
Get notification delivery status.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional, List
from core.logger import logger
from core.dependecies import DBSession
from app.services.user_service import get_current_user
from app.models.user import BaseUser
from app.utils.enums import AccountTypeEnum

try:
    from app.services.push_notifications import get_notification_service

    NOTIFICATIONS_AVAILABLE = True
except ImportError:
    NOTIFICATIONS_AVAILABLE = False
    logger.warning("Push notification service not available")

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# Response schemas
class DeviceTokenRequest:
    """Device token registration request."""

    device_token: str
    device_type: str = "mobile"
    device_name: Optional[str] = None


class PushNotificationRequest:
    """Push notification send request."""

    user_ids: List[int]
    title: str
    body: str
    notification_type: str
    data: Optional[dict] = None


def require_admin(current_user: BaseUser) -> None:
    """Refuse anyone who is not an admin.

    Every endpoint below chooses both who receives a notification and what it
    says. Behind only `get_current_user` that is open to any signed-up
    account, which makes the platform's own push channel usable against its
    users: a convincing "your payment failed" to every id in turn, from us,
    on the lock screen. The gate was written as a commented-out TODO under a
    docstring that already claimed admin was required.
    """
    if current_user.account_type != AccountTypeEnum.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )


# Device token registration endpoints are unified in notifications.py


@router.post("/send")
async def send_notification(
    user_ids: List[int],
    title: str,
    body: str,
    notification_type: str = "system",
    data: Optional[dict] = None,
    current_user: BaseUser = Depends(get_current_user),
):
    """
    Send push notifications to multiple users.

    This endpoint requires admin privileges.

    Args:
        user_ids: List of user IDs to send to
        title: Notification title
        body: Notification body
        notification_type: Type of notification (bid, payment, kyc, system, etc.)
        data: Optional additional data
        current_user: Authenticated user (must be admin)

    Returns:
        {"status": "sent", "total": 3, "sent": 2, "failed": 1}
    """
    if not NOTIFICATIONS_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Push notification service not available",
        )

    require_admin(current_user)

    try:
        service = await get_notification_service()

        result = await service.send_to_multiple_users(
            user_ids=user_ids,
            title=title,
            body=body,
            notification_type=notification_type,
            data=data or {},
        )

        logger.info(
            f"Notifications sent",
            extra={
                "total_users": len(user_ids),
                "sent": result.get("total_sent", 0),
                "failed": result.get("total_failed", 0),
            },
        )

        return {
            "status": "sent",
            "total": len(user_ids),
            "sent": result.get("total_sent", 0),
            "failed": result.get("total_failed", 0),
        }

    except Exception as e:
        logger.error(f"Error sending notifications: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send notifications",
        )


@router.post("/send-bid-notification")
async def send_bid_notification(
    property_id: int,
    bid_amount: float,
    bidder_name: str,
    receiver_id: int,
    current_user: BaseUser = Depends(get_current_user),
):
    """
    Send a bid placed notification.

    Args:
        property_id: ID of property
        bid_amount: Bid amount
        bidder_name: Name of person who bid
        receiver_id: User to notify
        current_user: Authenticated user

    Returns:
        {"status": "sent", "sent": bool}
    """
    if not NOTIFICATIONS_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Push notification service not available",
        )

    require_admin(current_user)

    try:
        service = await get_notification_service()
        from app.services.push_notifications import NotificationTemplates

        title, body = NotificationTemplates.bid_placed(
            property_title=f"Property #{property_id}",
            bid_amount=bid_amount,
            bidder_name=bidder_name,
        )

        result = await service.send_notification(
            user_id=receiver_id,
            title=title,
            body=body,
            notification_type="bid",
            data={"property_id": property_id, "bid_amount": bid_amount},
        )

        logger.info(
            f"Bid notification sent",
            extra={"receiver_id": receiver_id, "property_id": property_id},
        )

        return {
            "status": "sent",
            "sent": result.get("sent", 0) > 0,
        }

    except Exception as e:
        logger.error(f"Error sending bid notification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send notification",
        )


@router.post("/send-payment-notification")
async def send_payment_notification(
    contract_id: int,
    amount: float,
    property_id: int,
    receiver_id: int,
    current_user: BaseUser = Depends(get_current_user),
):
    """
    Send a payment received notification.

    Args:
        contract_id: ID of contract
        amount: Payment amount
        property_id: ID of property
        receiver_id: User to notify
        current_user: Authenticated user

    Returns:
        {"status": "sent", "sent": bool}
    """
    if not NOTIFICATIONS_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Push notification service not available",
        )

    require_admin(current_user)

    try:
        service = await get_notification_service()
        from app.services.push_notifications import NotificationTemplates

        title, body = NotificationTemplates.payment_received(
            amount=amount,
            property_title=f"Property #{property_id}",
        )

        result = await service.send_notification(
            user_id=receiver_id,
            title=title,
            body=body,
            notification_type="payment",
            data={
                "contract_id": contract_id,
                "property_id": property_id,
                "amount": amount,
            },
        )

        logger.info(
            f"Payment notification sent",
            extra={"receiver_id": receiver_id, "contract_id": contract_id},
        )

        return {
            "status": "sent",
            "sent": result.get("sent", 0) > 0,
        }

    except Exception as e:
        logger.error(f"Error sending payment notification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send notification",
        )
