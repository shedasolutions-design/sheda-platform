from fastapi import (
    APIRouter,
    WebSocket,
    WebSocketDisconnect,
    status,
    Query,
    HTTPException,
)
from app.models.chat import ChatMessage
from app.models.user import BaseUser
from app.models.property import Property, PropertyImage
from app.schemas.chat import (
    ChatMessageSchema,
    ChatMessageDetailSchema,
    ConversationSchema,
    SendMessageRequest,
    SendMessageResponse,
    MarkReadResponse,
    UnreadCountResponse,
    UserInfoSchema,
    PropertyInfoSchema,
    ChatPaginationParams,
    ConversationPaginationParams,
    MessageHistoryParams,
)

from typing import Dict, List, Optional, Annotated, Any
from core.dependecies import DBSession
from app.services.user_service import ActiveUser
from sqlalchemy.future import select
from sqlalchemy.engine import Result
from sqlalchemy import or_, and_, func, desc
from core.logger import logger
from core.configs import settings
from datetime import datetime
import json

router = APIRouter(
    prefix="/chat",
    tags=["Chat"],
)






@router.get(
    "/chat-history",
    response_model=List[ChatMessageSchema],
    status_code=status.HTTP_200_OK,
)
async def chat_history(
    current_user: ActiveUser,
    db: DBSession,
    pagination: Annotated[ChatPaginationParams, Query()],
):
    query = (
        select(ChatMessage)
        .where(ChatMessage.sender_id == current_user.id)
        .order_by(ChatMessage.timestamp.desc())
        .offset(pagination.offset)
        .limit(pagination.limit)
    )
    result: Result = await db.execute(query)
    chats = result.scalars().all()
    return chats


# Helper functions for building user and property info
async def get_user_info(user_id: int, db: DBSession) -> Optional[UserInfoSchema]:
    """Fetch basic user info for chat context"""
    query = select(BaseUser).where(BaseUser.id == user_id)
    result = await db.execute(query)
    user = result.scalar_one_or_none()
    if user:
        return UserInfoSchema(
            id=user.id,
            username=user.username,
            avatar_url=user.avatar_url,
            fullname=user.fullname,
        )
    return None


async def get_property_info(
    property_id: int, db: DBSession
) -> Optional[PropertyInfoSchema]:
    """Fetch minimal property info for chat context"""
    query = select(Property).where(Property.id == property_id)
    result = await db.execute(query)
    property_obj = result.scalar_one_or_none()
    if property_obj:
        images = (
            [img.image_url for img in property_obj.images]
            if property_obj.images
            else []
        )
        return PropertyInfoSchema(
            id=property_obj.id,
            title=property_obj.title,
            address=property_obj.location,
            images=images,
        )
    return None


@router.get(
    "/conversations",
    response_model=List[ConversationSchema],
    status_code=status.HTTP_200_OK,
    summary="Get all active conversations",
    description="Returns a list of all active conversations for the current user with the last message and unread count.",
)
async def get_conversations(
    current_user: ActiveUser,
    db: DBSession,
    pagination: Annotated[ConversationPaginationParams, Query()],
):
    """
    Get all active conversations for the current user.
    Returns conversation details including other user info, last message, and unread count.
    """
    user_id = current_user.id

    # Build a subquery to get all conversation partners with their latest message timestamp
    # This approach uses database-level sorting and pagination
    sent_subquery = (
        select(
            ChatMessage.receiver_id.label("other_user_id"),
            func.max(ChatMessage.timestamp).label("last_timestamp"),
        )
        .where(ChatMessage.sender_id == user_id)
        .group_by(ChatMessage.receiver_id)
    )

    received_subquery = (
        select(
            ChatMessage.sender_id.label("other_user_id"),
            func.max(ChatMessage.timestamp).label("last_timestamp"),
        )
        .where(ChatMessage.receiver_id == user_id)
        .group_by(ChatMessage.sender_id)
    )

    # Union all conversation partners with their latest message timestamps
    union_subquery = sent_subquery.union_all(received_subquery).subquery()

    # Get unique conversation partners with max timestamp, sorted and paginated at DB level
    partners_query = (
        select(
            union_subquery.c.other_user_id,
            func.max(union_subquery.c.last_timestamp).label("latest_timestamp"),
        )
        .group_by(union_subquery.c.other_user_id)
        .order_by(desc(func.max(union_subquery.c.last_timestamp)))
        .offset(pagination.offset)
        .limit(pagination.limit)
    )

    partners_result = await db.execute(partners_query)
    partners = partners_result.fetchall()

    conversations = []
    for partner_row in partners:
        other_user_id = partner_row[0]

        # Get the last message in this conversation
        last_message_query = (
            select(ChatMessage)
            .where(
                or_(
                    and_(
                        ChatMessage.sender_id == user_id,
                        ChatMessage.receiver_id == other_user_id,
                    ),
                    and_(
                        ChatMessage.sender_id == other_user_id,
                        ChatMessage.receiver_id == user_id,
                    ),
                )
            )
            .order_by(desc(ChatMessage.timestamp))
            .limit(1)
        )
        last_message_result = await db.execute(last_message_query)
        last_message = last_message_result.scalar_one_or_none()

        # Count unread messages from this user
        unread_query = select(func.count(ChatMessage.id)).where(
            and_(
                ChatMessage.sender_id == other_user_id,
                ChatMessage.receiver_id == user_id,
                ChatMessage.is_read
                == False,  # noqa: E712 - SQLAlchemy requires == for SQL generation
            )
        )
        unread_result = await db.execute(unread_query)
        unread_count = unread_result.scalar() or 0

        # Get other user info
        other_user_info = await get_user_info(other_user_id, db)

        # Get property info if the last message has a property_id
        property_title = None
        property_id = None
        if last_message and last_message.property_id:
            property_info = await get_property_info(last_message.property_id, db)
            if property_info:
                property_title = property_info.title
                property_id = property_info.id

        conversation = ConversationSchema(
            other_user_id=other_user_id,
            other_user_name=other_user_info.username if other_user_info else None,
            other_user_avatar_url=(
                other_user_info.avatar_url if other_user_info else None
            ),
            other_user_fullname=other_user_info.fullname if other_user_info else None,
            last_message=last_message.message if last_message else None,
            last_message_timestamp=last_message.timestamp if last_message else None,
            last_message_sender_id=last_message.sender_id if last_message else None,
            unread_count=unread_count,
            property_id=property_id,
            property_title=property_title,
        )
        conversations.append(conversation)

    return conversations


@router.get(
    "/history/{user_id}",
    response_model=List[ChatMessageDetailSchema],
    status_code=status.HTTP_200_OK,
    summary="Get message history with a user",
    description="Returns the message history between the current user and another user.",
)
async def get_message_history(
    user_id: int,
    current_user: ActiveUser,
    db: DBSession,
    pagination: Annotated[MessageHistoryParams, Query()],
):
    """
    Get the message history between the current user and another user.
    Messages are returned in descending order (newest first).
    """
    current_user_id = current_user.id

    # Verify the other user exists
    other_user = await get_user_info(user_id, db)
    if not other_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Build the query for messages between the two users
    conditions = or_(
        and_(
            ChatMessage.sender_id == current_user_id,
            ChatMessage.receiver_id == user_id,
        ),
        and_(
            ChatMessage.sender_id == user_id,
            ChatMessage.receiver_id == current_user_id,
        ),
    )

    # Add property filter if provided
    if pagination.property_id:
        conditions = and_(conditions, ChatMessage.property_id == pagination.property_id)

    query = (
        select(ChatMessage)
        .where(conditions)
        .order_by(desc(ChatMessage.timestamp))
        .offset(pagination.offset)
        .limit(pagination.limit)
    )
    result = await db.execute(query)
    messages = result.scalars().all()

    # Get current user info
    current_user_info = UserInfoSchema(
        id=current_user.id,
        username=current_user.username,
        avatar_url=current_user.avatar_url,
        fullname=current_user.fullname,
    )

    # Build detailed response
    detailed_messages = []
    for msg in messages:
        sender_info = (
            current_user_info if msg.sender_id == current_user_id else other_user
        )
        receiver_info = (
            other_user if msg.sender_id == current_user_id else current_user_info
        )

        property_info = None
        if msg.property_id:
            property_info = await get_property_info(msg.property_id, db)

        detailed_messages.append(
            ChatMessageDetailSchema(
                id=msg.id,
                sender_id=msg.sender_id,
                receiver_id=msg.receiver_id,
                message=msg.message,
                timestamp=msg.timestamp,
                property_id=msg.property_id,
                is_read=msg.is_read,
                sender_info=sender_info,
                receiver_info=receiver_info,
                property_info=property_info,
            )
        )

    return detailed_messages


@router.post(
    "/send-message",
    response_model=SendMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send a message",
    description="Send a message to another user. Optionally include a property ID for property discussions.",
)
async def send_message(
    message_data: SendMessageRequest,
    current_user: ActiveUser,
    db: DBSession,
):
    """
    Send a message to another user.
    If property_id is provided, the message is associated with that property.
    """
    sender_id = current_user.id
    receiver_id = message_data.receiver_id

    # Check if receiver exists
    receiver_info = await get_user_info(receiver_id, db)
    if not receiver_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Receiver not found",
        )

    # Check if property exists if property_id is provided
    if message_data.property_id:
        property_info = await get_property_info(message_data.property_id, db)
        if not property_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Property not found",
            )

    # Create the message
    new_message = ChatMessage(
        sender_id=sender_id,
        receiver_id=receiver_id,
        message=message_data.message,
        property_id=message_data.property_id,
        is_read=False,
    )
    db.add(new_message)
    await db.commit()
    await db.refresh(new_message)

    # Build sender info
    sender_info = UserInfoSchema(
        id=current_user.id,
        username=current_user.username,
        avatar_url=current_user.avatar_url,
        fullname=current_user.fullname,
    )

    # Send via WebSocket if receiver is connected
    payload = {
        "id": new_message.id,
        "sender_info": {
            "id": sender_id,
            "username": current_user.username,
            "avatar_url": current_user.avatar_url,
        },
        "receiver_id": new_message.receiver_id,
        "message": new_message.message,
        "created_at": (
            new_message.timestamp.isoformat() if new_message.timestamp else None
        ),
        "property_id": new_message.property_id,
    }
    from .websocket import WebSocketConnectionManager
    manager = WebSocketConnectionManager()
    await manager.send_personal_message(payload, receiver_id)

    return SendMessageResponse(
        id=new_message.id,
        sender_id=new_message.sender_id,
        receiver_id=new_message.receiver_id,
        message=new_message.message,
        timestamp=new_message.timestamp,
        property_id=new_message.property_id,
        is_read=new_message.is_read,
        sender_info=sender_info,
    )


@router.post(
    "/mark-read/{sender_id}",
    response_model=MarkReadResponse,
    status_code=status.HTTP_200_OK,
    summary="Mark messages as read",
    description="Mark all messages from a specific user as read.",
)
async def mark_messages_read(
    sender_id: int,
    current_user: ActiveUser,
    db: DBSession,
):
    """
    Mark all unread messages from a specific sender as read.
    """
    current_user_id = current_user.id

    # Verify the sender exists
    sender_info = await get_user_info(sender_id, db)
    if not sender_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sender not found",
        )

    # Get all unread messages from this sender to the current user
    query = select(ChatMessage).where(
        and_(
            ChatMessage.sender_id == sender_id,
            ChatMessage.receiver_id == current_user_id,
            ChatMessage.is_read
            == False,  # noqa: E712 - SQLAlchemy requires == for SQL generation
        )
    )
    result = await db.execute(query)
    messages = result.scalars().all()

    # Mark them as read
    messages_marked = 0
    for msg in messages:
        msg.is_read = True
        db.add(msg)
        messages_marked += 1

    await db.commit()

    return MarkReadResponse(messages_marked=messages_marked, success=True)


@router.get(
    "/unread-count",
    response_model=UnreadCountResponse,
    status_code=status.HTTP_200_OK,
    summary="Get unread message count",
    description="Get the total number of unread messages for notification badges.",
)
async def get_unread_count(
    current_user: ActiveUser,
    db: DBSession,
):
    """
    Get the total number of unread messages for the current user.
    Also returns the number of conversations with unread messages.
    """
    current_user_id = current_user.id

    # Count total unread messages
    total_unread_query = select(func.count(ChatMessage.id)).where(
        and_(
            ChatMessage.receiver_id == current_user_id,
            ChatMessage.is_read
            == False,  # noqa: E712 - SQLAlchemy requires == for SQL generation
        )
    )
    total_unread_result = await db.execute(total_unread_query)
    total_unread = total_unread_result.scalar() or 0

    # Count distinct senders with unread messages (conversations with unread)
    conversations_query = select(
        func.count(func.distinct(ChatMessage.sender_id))
    ).where(
        and_(
            ChatMessage.receiver_id == current_user_id,
            ChatMessage.is_read
            == False,  # noqa: E712 - SQLAlchemy requires == for SQL generation
        )
    )
    conversations_result = await db.execute(conversations_query)
    conversations_with_unread = conversations_result.scalar() or 0

    return UnreadCountResponse(
        total_unread=total_unread,
        conversations_with_unread=conversations_with_unread,
    )
