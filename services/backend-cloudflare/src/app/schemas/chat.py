from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Annotated


class ChatMessageSchema(BaseModel):
    sender_id: int
    receiver_id: int
    message: str
    timestamp: Optional[datetime] = None
    property_id: Optional[int] = None
    is_read: Optional[bool] = None

    class Config:
        from_attributes = True


# Pagination parameters for chat endpoints
class ChatPaginationParams(BaseModel):
    """Reusable pagination parameters for chat endpoints"""
    offset: Annotated[int, Field(ge=0, default=0, description="Number of items to skip")]
    limit: Annotated[int, Field(ge=1, le=200, default=50, description="Number of items to return")]


class ConversationPaginationParams(BaseModel):
    """Pagination parameters for conversations endpoint"""
    offset: Annotated[int, Field(ge=0, default=0, description="Number of conversations to skip")]
    limit: Annotated[int, Field(ge=1, le=100, default=50, description="Number of conversations to return")]


class MessageHistoryParams(BaseModel):
    """Parameters for message history endpoint"""
    offset: Annotated[int, Field(ge=0, default=0, description="Number of messages to skip")]
    limit: Annotated[int, Field(ge=1, le=200, default=100, description="Number of messages to return")]
    property_id: Optional[int] = Field(None, description="Filter by property ID")


class UserInfoSchema(BaseModel):
    """Basic user info for chat context"""
    id: int
    username: Optional[str] = None
    avatar_url: Optional[str] = None
    fullname: Optional[str] = None

    class Config:
        from_attributes = True


class PropertyInfoSchema(BaseModel):
    """Minimal property info for chat context"""
    id: int
    title: Optional[str] = None
    address: Optional[str] = None
    images: Optional[List[str]] = []

    class Config:
        from_attributes = True


class ChatMessageDetailSchema(BaseModel):
    """Detailed chat message with sender/receiver info"""
    id: int
    sender_id: int
    receiver_id: int
    message: str
    timestamp: Optional[datetime] = None
    property_id: Optional[int] = None
    is_read: bool = False
    sender_info: Optional[UserInfoSchema] = None
    receiver_info: Optional[UserInfoSchema] = None
    property_info: Optional[PropertyInfoSchema] = None

    class Config:
        from_attributes = True


class ConversationSchema(BaseModel):
    """Represents a conversation with another user"""
    other_user_id: int
    other_user_name: Optional[str] = None
    other_user_avatar_url: Optional[str] = None
    other_user_fullname: Optional[str] = None
    last_message: Optional[str] = None
    last_message_timestamp: Optional[datetime] = None
    last_message_sender_id: Optional[int] = None
    unread_count: int = 0
    property_id: Optional[int] = None
    property_title: Optional[str] = None

    class Config:
        from_attributes = True


class SendMessageRequest(BaseModel):
    """Request body for sending a message"""
    receiver_id: int = Field(..., description="The ID of the user to send the message to")
    message: str = Field(..., min_length=1, description="The message content")
    property_id: Optional[int] = Field(None, description="Optional property ID for property discussions")


class SendMessageResponse(BaseModel):
    """Response after sending a message"""
    id: int
    sender_id: int
    receiver_id: int
    message: str
    timestamp: datetime
    property_id: Optional[int] = None
    is_read: bool = False
    sender_info: Optional[UserInfoSchema] = None

    class Config:
        from_attributes = True


class MarkReadResponse(BaseModel):
    """Response after marking messages as read"""
    messages_marked: int
    success: bool = True


class UnreadCountResponse(BaseModel):
    """Total unread messages count for notifications"""
    total_unread: int
    conversations_with_unread: int = 0
