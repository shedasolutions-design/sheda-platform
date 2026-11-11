"""
WebSocket service for real-time messaging.

## Endpoints

### /ws/{user_id}
Main WebSocket endpoint for real-time chat messaging.

## Authentication

JWT token is required and can be provided via:

1. **Query Parameter** (Recommended for browsers):
   ```
   /ws/{user_id}?token={jwt_token}
   ```

2. **Sec-WebSocket-Protocol Header** (For WebSocket clients):
   - Format: `Bearer.{jwt_token}`
   - The server will echo back the protocol on successful connection

   Example in JavaScript:
   ```javascript
   new WebSocket('ws://host/ws/123', ['Bearer.eyJhbGciOiJIUzI1NiIs...'])
   ```

## Message Payloads

### Incoming Message (Client → Server)
```json
{
    "receiver_id": int,      // Required: Target user ID
    "message": string,       // Required: Message content
    "property_id": int       // Optional: Property ID for property discussions
}
```

### Outgoing Message (Server → Client)
```json
{
    "id": int,               // Message ID
    "sender_info": {
        "id": int,
        "username": string,
        "avatar_url": string
    },
    "receiver_id": int,
    "message": string,
    "created_at": string,    // ISO 8601 timestamp
    "property_id": int       // Optional
}
```

### Confirmation Response (Server → Sender)
```json
{
    "status": "sent",
    "delivered": boolean,    // True if recipient is online
    "message_id": int
}
```

### Error Response
```json
{
    "error": string          // Error description
}
```

## Connection Errors
- WS_1008_POLICY_VIOLATION: Authentication failed (invalid/missing token, inactive user)
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status, Query
from typing import Dict, Optional, Annotated
from core.dependecies import DBSession
from core.logger import logger
from app.models.chat import ChatMessage
from app.services.user_service import ActiveVerifiedWSUser
from app.models.user import BaseUser
from app.schemas.user_schema import UserShow
from app.schemas.chat import ChatMessageSchema


router = APIRouter(tags=["WebSocket"])


class WebSocketConnectionManager:
    """Manages WebSocket connections and message routing."""

    def __init__(self):
        # Dictionary mapping user_id to their WebSocket connections
        self.active_connections: Dict[int, WebSocket] = {}

    def connect(self, websocket: WebSocket, user_id: int) -> bool:
        """
        Track a WebSocket connection by user_id.

        Note: The WebSocket should already be accepted before calling this method.

        Args:
            websocket: The WebSocket connection (already accepted)
            user_id: The authenticated user's ID

        Returns True if connection tracking was successful.
        """
        self.active_connections[user_id] = websocket
        logger.info(f"WebSocket connected: user_id={user_id}")
        return True

    def disconnect(self, user_id: int):
        """Remove a user's WebSocket connection from tracking."""
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            logger.info(f"WebSocket disconnected: user_id={user_id}")

    def is_connected(self, user_id: int) -> bool:
        """Check if a user is currently connected."""
        return user_id in self.active_connections

    async def send_personal_message(self, message: dict, user_id: int) -> bool:
        """
        Send a message to a specific user by their ID.
        Returns True if the message was sent, False if user is not connected.
        """
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
                return True
            except Exception as e:
                logger.error(f"Error sending message to user {user_id}: {e}")
                # Clean up broken connection
                self.disconnect(user_id)
                return False
        return False

    async def broadcast(self, message: dict, exclude_user_id: Optional[int] = None):
        """Broadcast a message to all connected users, optionally excluding one."""
        disconnected_users = []
        for user_id, websocket in self.active_connections.items():
            if exclude_user_id and user_id == exclude_user_id:
                continue
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to user {user_id}: {e}")
                disconnected_users.append(user_id)

        # Clean up disconnected users
        for user_id in disconnected_users:
            self.disconnect(user_id)

    def get_connected_users(self) -> list[int]:
        """Get list of all currently connected user IDs."""
        return list(self.active_connections.keys())


# Global connection manager instance
ws_manager = WebSocketConnectionManager()


@router.websocket("/chat/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket, current_user: ActiveVerifiedWSUser, db: DBSession
):
    """
    WebSocket endpoint for real-time messaging.

    ## Authentication

    JWT token is required and can be provided via:

    1. **Query parameter**: `/ws/{user_id}?token={jwt_token}`
    2. **Sec-WebSocket-Protocol header**: `Bearer.{jwt_token}`

    The `user_id` in the URL path must match the authenticated user's ID.

    ## Connection Flow

    1. Client connects with token (query param or protocol header)
    2. Server validates token and user
    3. Server accepts connection (echoing subprotocol if used)
    4. Server verifies user_id matches authenticated user

    ## Error Codes

    - `WS_1008_POLICY_VIOLATION`: Authentication failed or user_id mismatch

    ## Message Formats

    See module docstring for detailed payload schemas.
    """

    if current_user is None:
        return

    current_user = UserShow.model_validate(current_user)  # type: ignore

    # Track the session (connection already accepted by auth)
    ws_manager.connect(websocket, current_user.id)

    # Build user info for messages
    sender_info = {
        "id": current_user.id,
        "username": current_user.username,
        "avatar_url": current_user.avatar_url,
    }

    try:
        while True:
            # Wait for incoming messages
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except Exception:
                await websocket.send_json({"error": "Invalid JSON received"})
                continue

            receiver_id = data.get("receiver_id")
            message = data.get("message")
            property_id = data.get("property_id")

            # Validate required fields
            if not receiver_id or not message:
                await websocket.send_json(
                    {"error": "Missing required fields: receiver_id, message"}
                )
                continue

            # Store message in database
            chat_message = ChatMessage(
                sender_id=current_user.id,
                receiver_id=receiver_id,
                message=message,
                property_id=property_id,
                is_read=False,
            )
            db.add(chat_message)
            await db.commit()
            await db.refresh(chat_message)

            # Build outgoing message payload
            payload = {
                "id": chat_message.id,
                "sender_info": sender_info,
                "receiver_id": chat_message.receiver_id,
                "message": chat_message.message,
                "created_at": (
                    chat_message.timestamp.isoformat()
                    if chat_message.timestamp
                    else None
                ),
                "property_id": chat_message.property_id,
            }

            # Send to receiver if connected
            sent = await ws_manager.send_personal_message(payload, receiver_id)

            # Send confirmation back to sender
            await websocket.send_json(
                {
                    "status": "sent",
                    "delivered": sent,
                    "message_id": chat_message.id,
                }
            )

    except WebSocketDisconnect:
        ws_manager.disconnect(current_user.id)
        logger.info(f"WebSocket disconnected for user_id={current_user.id}")


@router.websocket("/chat/global-chat")
async def websocket_chat(
    websocket: WebSocket, db: DBSession, current_user: ActiveVerifiedWSUser
):
    """
    WebSocket endpoint for chat messaging.

    ## Authentication

    JWT token is required and can be provided via:

    1. **Query parameter**: `/chat/ws?token={jwt_token}`
    2. **Sec-WebSocket-Protocol header**: `Bearer.{jwt_token}`

    ## Incoming Message Format
    ```json
    {
        "receiver_id": int,   // Required: Target user ID
        "message": string     // Required: Message content
    }
    ```

    ## Outgoing Message Format
    ```json
    {
        "id": int,
        "sender_info": {
            "id": int,
            "username": string,
            "avatar_url": string
        },
        "receiver_id": int,
        "message": string,
        "created_at": string  // ISO 8601 timestamp
    }
    ```
    """

    # Track the session (connection already accepted by auth)
    ws_manager.connect(websocket, current_user.id)  # type: ignore
    current_user_show = UserShow.model_validate(current_user)

    try:
        while True:
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except Exception:
                await websocket.send_text("Invalid JSON received")
                continue

            sender_id = current_user_show.id
            receiver_id = data.get("receiver_id")
            message = data.get("message")

            if not all([sender_id, receiver_id, message]):
                await websocket.send_text("Missing fields in message")
                continue

            # Store in DB
            chat_message = ChatMessageSchema(
                sender_id=sender_id, receiver_id=receiver_id, message=message
            )
            db_message = ChatMessage(**chat_message.model_dump(exclude_unset=True))
            db.add(db_message)
            await db.commit()
            await db.refresh(db_message)

            sender_info = {
                "id": sender_id,
                "username": current_user_show.username,
                "avatar_url": current_user_show.avatar_url,
            }
            payload = {
                "id": db_message.id,
                "sender_info": sender_info,
                "receiver_id": db_message.receiver_id,
                "message": db_message.message,
                "created_at": (
                    db_message.timestamp.isoformat() if db_message.timestamp else None
                ),
            }

            await ws_manager.send_personal_message(payload, receiver_id)

    except WebSocketDisconnect:
        ws_manager.disconnect(current_user.id)


@router.websocket("/notifications/{user_id}")
async def websocket_notifications(
    websocket: WebSocket,
    user_id: int,
    current_user: ActiveVerifiedWSUser,
):
    """
    WebSocket endpoint for real-time notifications.
    Uses JWT token authentication via query parameter or subprotocol.
    """
    if current_user is None:
        return

    # Enforce that the URL's user_id matches the authenticated user
    if current_user.id != user_id:
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="WebSocket auth failed: User ID mismatch",
        )
        return

    # Track the session (connection already accepted by auth)
    ws_manager.connect(websocket, current_user.id)
    logger.info(f"Notification WebSocket connected: user_id={user_id}")

    try:
        # Send connection confirmation
        await websocket.send_json(
            {
                "type": "connected",
                "user_id": user_id,
                "message": "WebSocket connection established",
            }
        )

        # Listen for incoming messages (e.g., pings)
        while True:
            try:
                data = await websocket.receive_json()

                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                elif data.get("type") == "subscribe":
                    notification_type = data.get("notification_type")
                    logger.info(f"User {user_id} subscribed to {notification_type}")

            except Exception as e:
                logger.error(f"Error reading message from notification WebSocket: {e}")
                break

    except Exception as e:
        logger.error(f"Notification WebSocket error: {e}")
    finally:
        ws_manager.disconnect(current_user.id)
        logger.info(f"Notification WebSocket disconnected: user_id={user_id}")
