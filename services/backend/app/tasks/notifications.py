"""
Notification tasks for Celery.
Handles asynchronous sending of notifications (push, SMS, etc).
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

from core.celery_config import app
from core.logger import get_logger

logger = get_logger(__name__)


@app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
    time_limit=300,
)
def send_push_notification(
    self,
    user_id: int,
    title: str,
    body: str,
    notification_type: str = "general",
    data: Optional[Dict[str, Any]] = None,
):
    """
    Send push notification to user.

    Args:
        user_id: Target user ID
        title: Notification title
        body: Notification body
        notification_type: Type of notification
        data: Optional additional data
    """
    try:
        from app.services.push_notifications import get_notification_service

        service = await get_notification_service()
        result = await service.send_notification(
            user_id,
            title,
            body,
            notification_type,
            data,
        )

        logger.info(
            f"Push notification sent",
            task_id=self.request.id,
            user_id=user_id,
            result=result,
        )

        return result

    except Exception as e:
        logger.error(
            f"Failed to send push notification: {str(e)}", task_id=self.request.id
        )
        raise


@app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
    time_limit=300,
)
def send_appointment_reminders(self):
    """
    Send appointment reminders to users.
    Scheduled daily.
    """
    try:
        from app.services.push_notifications import (
            get_notification_service,
            NotificationTemplates,
        )
        from core.database import AsyncSessionLocal
        from app.models.property import Appointment
        from sqlalchemy import select
        from datetime import datetime, timedelta

        # Find appointments in next 2 hours
        service = await get_notification_service()
        session = AsyncSessionLocal()

        try:
            now = datetime.utcnow()
            future = now + timedelta(hours=2)

            # Query appointments
            query = select(Appointment).where(
                Appointment.scheduled_at >= now,
                Appointment.scheduled_at <= future,
            )
            result = await session.execute(query)
            appointments = result.scalars().all()

            sent_count = 0
            for appointment in appointments:
                # Get property info
                property_obj = appointment.property
                if not property_obj:
                    continue

                # Send reminder
                title, body = NotificationTemplates.appointment_reminder(
                    property_title=property_obj.title,
                    time=appointment.scheduled_at.strftime("%H:%M"),
                )

                await send_push_notification.delay(
                    user_id=appointment.client_id,
                    title=title,
                    body=body,
                    notification_type="appointment_reminder",
                )

                sent_count += 1

            logger.info(
                f"Appointment reminders sent",
                task_id=self.request.id,
                count=sent_count,
            )

            return {"status": "success", "reminders_sent": sent_count}

        finally:
            await session.close()

    except Exception as e:
        logger.error(
            f"Failed to send appointment reminders: {str(e)}", task_id=self.request.id
        )
        raise


@app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 2, "countdown": 120},
    time_limit=600,
)
def send_transaction_notification(
    self,
    user_id: int,
    transaction_type: str,  # bid_placed, bid_accepted, payment_received, contract_signed
    transaction_data: Dict[str, Any],
):
    """
    Send transaction-related notification.

    Args:
        user_id: Target user ID
        transaction_type: Type of transaction notification
        transaction_data: Transaction-related data
    """
    try:
        from app.services.push_notifications import (
            get_notification_service,
            NotificationTemplates,
        )

        service = await get_notification_service()

        # Select template based on type
        if transaction_type == "bid_placed":
            title, body = NotificationTemplates.bid_placed(
                property_title=transaction_data.get("property_title"),
                bid_amount=transaction_data.get("bid_amount"),
                bidder_name=transaction_data.get("bidder_name"),
            )
        elif transaction_type == "bid_accepted":
            title, body = NotificationTemplates.bid_accepted(
                property_title=transaction_data.get("property_title"),
            )
        elif transaction_type == "payment_received":
            title, body = NotificationTemplates.payment_received(
                amount=transaction_data.get("amount"),
                property_title=transaction_data.get("property_title"),
            )
        elif transaction_type == "contract_signed":
            title, body = NotificationTemplates.contract_signed(
                property_title=transaction_data.get("property_title"),
            )
        else:
            return {"status": "skipped", "reason": "Unknown transaction type"}

        result = await service.send_notification(
            user_id=user_id,
            title=title,
            body=body,
            notification_type=f"transaction_{transaction_type}",
            data=transaction_data,
        )

        logger.info(
            f"Transaction notification sent",
            task_id=self.request.id,
            user_id=user_id,
            type=transaction_type,
        )

        return result

    except Exception as e:
        logger.error(
            f"Failed to send transaction notification: {str(e)}",
            task_id=self.request.id,
        )
        raise


@app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
    time_limit=300,
)
def send_message_notification(
    self,
    user_id: int,
    sender_name: str,
    message_preview: Optional[str] = None,
):
    """
    Send message notification.

    Args:
        user_id: Target user ID
        sender_name: Name of message sender
        message_preview: Optional message preview
    """
    try:
        from app.services.push_notifications import (
            get_notification_service,
            NotificationTemplates,
        )

        service = await get_notification_service()
        title, body = NotificationTemplates.message_received(sender_name)

        result = await service.send_notification(
            user_id=user_id,
            title=title,
            body=body,
            notification_type="message",
            data={"sender_name": sender_name, "preview": message_preview},
        )

        logger.info(
            f"Message notification sent",
            task_id=self.request.id,
            user_id=user_id,
        )

        return result

    except Exception as e:
        logger.error(
            f"Failed to send message notification: {str(e)}", task_id=self.request.id
        )
        raise


@app.task(
    bind=True,
    time_limit=600,
)
def send_broadcast_notification(
    self,
    user_ids: List[int],
    title: str,
    body: str,
    notification_type: str = "broadcast",
    data: Optional[Dict[str, Any]] = None,
):
    """
    Send broadcast notification to multiple users.

    Args:
        user_ids: List of user IDs
        title: Notification title
        body: Notification body
        notification_type: Type of notification
        data: Optional additional data
    """
    try:
        from app.services.push_notifications import get_notification_service

        service = await get_notification_service()
        result = await service.send_to_multiple_users(
            user_ids,
            title,
            body,
            notification_type,
            data,
        )

        logger.info(
            f"Broadcast notification sent",
            task_id=self.request.id,
            result=result,
        )

        return result

    except Exception as e:
        logger.error(
            f"Failed to send broadcast notification: {str(e)}", task_id=self.request.id
        )
        raise
