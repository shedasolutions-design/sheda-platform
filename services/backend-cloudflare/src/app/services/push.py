from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from core.logger import logger


async def send_push_notification(
    user_id: int,
    title: str,
    body: str,
    data: dict[str, Any] | None,
    db: AsyncSession,
) -> None:
    from app.services.push_notifications import get_notification_service
    
    try:
        service = await get_notification_service()
        await service.send_notification(
            user_id=user_id,
            title=title,
            body=body,
            data=data,
        )
    except Exception as e:
        logger.error(f"Error sending push notification via service: {e}")
