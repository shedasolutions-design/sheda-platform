from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.utils.enums import TransactionEventEnum


class TransactionNotificationRequest(BaseModel):
    transaction_id: str = Field(..., description="Bid or transaction identifier")
    event: TransactionEventEnum
    recipient_user_id: int
    property_id: int
    metadata: Optional[dict[str, Any]] = None


class TransactionNotificationResponse(BaseModel):
    id: int
    transaction_id: str
    event: TransactionEventEnum
    recipient_user_id: int
    property_id: int
    metadata: Optional[dict[str, Any]] = Field(default=None, alias="metadata_payload")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class NotificationItem(BaseModel):
    id: int
    transaction_id: str
    event: TransactionEventEnum
    recipient_user_id: int
    property_id: int
    metadata: Optional[dict[str, Any]] = Field(default=None, alias="metadata_payload")
    is_read: bool = False
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class NotificationListResponse(BaseModel):
    data: list[NotificationItem]


class DeviceTokenRequest(BaseModel):
    device_token: str
    platform: Optional[str] = None


class DeviceTokenResponse(BaseModel):
    id: int
    device_token: str
    platform: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
