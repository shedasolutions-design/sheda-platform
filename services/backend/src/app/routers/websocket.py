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
from typing import Dict, Optional, Annotated, Set
from core.dependecies import DBSession
from core.database import AsyncSessionLocal
from core.logger import logger
from app.models.chat import ChatMessage
from app.services.user_service import ActiveVerifiedWSUser
from app.models.user import BaseUser
from app.schemas.user_schema import UserShow
from app.schemas.chat import ChatMessageSchema


router = APIRouter(tags=["WebSocket"])


class WebSocketConnectionManager:
    """
    Live connections, by user.

    A user can hold several at once: two tabs, a phone and a laptop, and the
    chat and notification channels each open their own. The old version kept
    one socket per user, so whichever connected last silently replaced the
    others and chat messages went to the wrong one or nowhere.

    This lives in process memory, which is only correct while the API runs a
    single process (entrypoint.sh pins one gunicorn worker for exactly this
    reason). More processes would need a shared channel such as Redis pub/sub.
    """

    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    def connect(self, websocket: WebSocket, user_id: int) -> bool:
        """Track an already-accepted connection."""
        self.active_connections.setdefault(user_id, set()).add(websocket)
        logger.info(
            f"WebSocket connected: user_id={user_id} "
            f"({len(self.active_connections[user_id])} open)"
        )
        return True

    def disconnect(self, user_id: int, websocket: Optional[WebSocket] = None):
        """Forget one connection, or all of a user's when none is given."""
        conns = self.active_connections.get(user_id)
        if not conns:
            return
        if websocket is None:
            conns.clear()
        else:
            conns.discard(websocket)
        if not conns:
            del self.active_connections[user_id]
        logger.info(f"WebSocket disconnected: user_id={user_id}")

    def is_connected(self, user_id: int) -> bool:
        return bool(self.active_connections.get(user_id))

    async def send_personal_message(
        self, message: dict, user_id: int, exclude: Optional[WebSocket] = None
    ) -> bool:
        """
        Send to every open connection of a user. True if at least one got it.
        Connections that fail to send are dropped.
        """
        delivered = False
        for ws in list(self.active_connections.get(user_id, ())):
            if ws is exclude:
                continue
            try:
                await ws.send_json(message)
                delivered = True
            except Exception as e:
                logger.error(f"Error sending to user {user_id}: {e}")
                self.disconnect(user_id, ws)
        return delivered

    async def broadcast(self, message: dict, exclude_user_id: Optional[int] = None):
        """Send to every connected user, optionally skipping one."""
        for user_id in list(self.active_connections):
            if exclude_user_id and user_id == exclude_user_id:
                continue
            await self.send_personal_message(message, user_id)

    def get_connected_users(self) -> list[int]:
        return list(self.active_connections.keys())


# Global connection manager instance. Import this one; constructing another
# gives an empty manager that delivers to nobody.
ws_manager = WebSocketConnectionManager()


def message_payload(chat_message: ChatMessage, sender_info: dict) -> dict:
    """The shape the app receives for a chat message (live or HTTP-sent)."""
    return {
        "type": "message",
        "id": chat_message.id,
        "sender_info": sender_info,
        "receiver_id": chat_message.receiver_id,
        "message": chat_message.message,
        "created_at": (
            chat_message.timestamp.isoformat() if chat_message.timestamp else None
        ),
        "property_id": chat_message.property_id,
    }


async def notify_presence(user_id: int, online: bool):
    """Tell everyone connected that this user came online or went offline."""
    await ws_manager.broadcast(
        {"type": "presence", "user_id": user_id, "online": online},
        exclude_user_id=user_id,
    )


@router.websocket("/chat/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket, user_id: str, current_user: ActiveVerifiedWSUser
):
    """
    Real-time chat.

    ## Authentication
    JWT via `?token=` or the `Sec-WebSocket-Protocol` header (`Bearer.{jwt}`).
    A refused login closes with code 1008 and a reason; the client should
    not keep retrying the same token.

    ## Client -> server
    - `{"type": "ping"}` -> `{"type": "pong"}`. Send every ~25s; if no pong
      comes back the connection is dead and the client should reconnect.
    - `{"receiver_id", "message", "property_id"?, "client_id"?}` -> stored,
      pushed to the receiver and to the sender's other tabs, and acknowledged
      with `{"type": "ack", "status": "sent", "delivered", "message_id",
      "client_id"}`.
    - `{"type": "typing", "receiver_id"}` -> relayed as
      `{"type": "typing", "user_id"}`.
    - `{"type": "presence", "user_ids": [..]}` -> `{"type": "presence_state",
      "online": [..]}`.

    ## Server -> client
    `{"type": "message", ...}`, `ack`, `pong`, `typing`, `presence`
    (`{"user_id", "online"}` when someone connects or leaves) and `error`.
    """
    if current_user is None:
        return

    # The path names whose chat this is; it must be the signed-in user.
    if str(user_id) != str(current_user.id):
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION, reason="User ID mismatch"
        )
        return

    me = UserShow.model_validate(current_user)  # type: ignore
    sender_info = {
        "id": me.id,
        "username": me.username,
        "avatar_url": me.avatar_url,
    }

    first_connection = not ws_manager.is_connected(me.id)
    ws_manager.connect(websocket, me.id)
    if first_connection:
        await notify_presence(me.id, True)

    try:
        while True:
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except Exception:
                await websocket.send_json({"type": "error", "error": "Invalid JSON received"})
                continue
            if not isinstance(data, dict):
                await websocket.send_json({"type": "error", "error": "Expected a JSON object"})
                continue

            kind = data.get("type")
            if kind == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            if kind == "typing":
                rid = data.get("receiver_id")
                if str(rid).isdigit():
                    await ws_manager.send_personal_message(
                        {"type": "typing", "user_id": me.id}, int(rid)
                    )
                continue
            if kind == "presence":
                ids = [int(i) for i in (data.get("user_ids") or []) if str(i).isdigit()][:200]
                await websocket.send_json(
                    {"type": "presence_state", "asked": ids, "online": [i for i in ids if ws_manager.is_connected(i)]}
                )
                continue

            receiver_id = data.get("receiver_id")
            raw = data.get("message")
            message = raw.strip() if isinstance(raw, str) else ""
            if not str(receiver_id).isdigit() or not message:
                await websocket.send_json(
                    {"type": "error", "error": "Missing required fields: receiver_id, message"}
                )
                continue

            # A short-lived session per message, so an open chat does not
            # hold a database connection for as long as the tab is open.
            db = AsyncSessionLocal()
            try:
                chat_message = ChatMessage(
                    sender_id=me.id,
                    receiver_id=int(receiver_id),
                    message=message,
                    property_id=data.get("property_id"),
                    is_read=False,
                )
                db.add(chat_message)
                await db.commit()
                await db.refresh(chat_message)
            except Exception:
                await db.rollback()
                await websocket.send_json(
                    {"type": "error", "error": "Message could not be saved", "client_id": data.get("client_id")}
                )
                continue
            finally:
                await db.close()

            payload = message_payload(chat_message, sender_info)
            delivered = await ws_manager.send_personal_message(payload, int(receiver_id))
            # The sender's other tabs and devices see it too.
            await ws_manager.send_personal_message(payload, me.id, exclude=websocket)
            await websocket.send_json(
                {
                    "type": "ack",
                    "status": "sent",
                    "delivered": delivered,
                    "message_id": chat_message.id,
                    "client_id": data.get("client_id"),
                    "created_at": payload["created_at"],
                }
            )

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Chat WebSocket error for user_id={me.id}: {e}")
    finally:
        ws_manager.disconnect(me.id, websocket)
        if not ws_manager.is_connected(me.id):
            await notify_presence(me.id, False)


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
        ws_manager.disconnect(current_user.id, websocket)


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
        ws_manager.disconnect(current_user.id, websocket)
        logger.info(f"Notification WebSocket disconnected: user_id={user_id}")
