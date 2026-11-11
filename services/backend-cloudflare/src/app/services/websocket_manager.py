"""
WebSocket connection manager for broadcasting real-time notifications and messages.
Provides centralized management of active WebSocket connections and message routing.
"""

from typing import Dict, Set, Callable, Any, Optional
from fastapi import WebSocket, WebSocketDisconnect, status
import asyncio
import json
from datetime import datetime
import uuid

from core.logger import get_logger

logger = get_logger(__name__)


class ConnectionManager:
    """Manages WebSocket connections and message broadcasting."""

    def __init__(self):
        """Initialize connection manager."""
        # Store active connections: {user_id: set of websocket connections}
        self.active_connections: Dict[int, Set[WebSocket]] = {}

        # Store room connections for group messaging
        self.room_connections: Dict[str, Set[WebSocket]] = {}

        # Connection metadata
        self.connection_metadata: Dict[WebSocket, Dict[str, Any]] = {}

    async def connect(
        self,
        websocket: WebSocket,
        user_id: int,
        room_id: Optional[str] = None,
    ) -> None:
        """
        Register a new WebSocket connection.

        Args:
            websocket: WebSocket connection
            user_id: User ID
            room_id: Optional room/channel ID for group messaging
        """
        await websocket.accept()

        # Add to user connections
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)

        # Add to room if specified
        if room_id:
            if room_id not in self.room_connections:
                self.room_connections[room_id] = set()
            self.room_connections[room_id].add(websocket)

        # Store metadata
        self.connection_metadata[websocket] = {
            "user_id": user_id,
            "room_id": room_id,
            "connected_at": datetime.utcnow().isoformat(),
            "connection_id": str(uuid.uuid4()),
        }

        logger.info(
            f"WebSocket connected",
            user_id=user_id,
            room_id=room_id,
            connection_id=self.connection_metadata[websocket]["connection_id"],
        )

    async def disconnect(self, websocket: WebSocket) -> None:
        """
        Remove a WebSocket connection.

        Args:
            websocket: WebSocket connection to disconnect
        """
        metadata = self.connection_metadata.get(websocket, {})
        user_id = metadata.get("user_id")
        room_id = metadata.get("room_id")

        # Remove from user connections
        if user_id and user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

        # Remove from room connections
        if room_id and room_id in self.room_connections:
            self.room_connections[room_id].discard(websocket)
            if not self.room_connections[room_id]:
                del self.room_connections[room_id]

        # Remove metadata
        del self.connection_metadata[websocket]

        logger.info(
            f"WebSocket disconnected",
            user_id=user_id,
            room_id=room_id,
            connection_id=metadata.get("connection_id"),
        )

    async def send_personal_message(
        self,
        message: Dict[str, Any],
        user_id: int,
        exclude_connection_id: Optional[str] = None,
    ) -> None:
        """
        Send message to specific user (all connections).

        Args:
            message: Message payload
            user_id: Target user ID
            exclude_connection_id: Optional connection ID to exclude
        """
        if user_id not in self.active_connections:
            logger.debug(f"User {user_id} has no active connections")
            return

        message_with_meta = self._add_message_metadata(message)

        for websocket in self.active_connections[user_id]:
            connection_id = self.connection_metadata.get(websocket, {}).get(
                "connection_id"
            )

            # Skip if should be excluded
            if exclude_connection_id and connection_id == exclude_connection_id:
                continue

            try:
                await websocket.send_json(message_with_meta)
            except Exception as e:
                logger.error(
                    f"Error sending personal message",
                    user_id=user_id,
                    error=str(e),
                )

    async def send_room_message(
        self,
        message: Dict[str, Any],
        room_id: str,
        exclude_user_id: Optional[int] = None,
    ) -> None:
        """
        Send message to all users in a room.

        Args:
            message: Message payload
            room_id: Target room ID
            exclude_user_id: Optional user to exclude
        """
        if room_id not in self.room_connections:
            logger.debug(f"Room {room_id} has no active connections")
            return

        message_with_meta = self._add_message_metadata(message)

        for websocket in self.room_connections[room_id]:
            user_id = self.connection_metadata.get(websocket, {}).get("user_id")

            # Skip if should be excluded
            if exclude_user_id and user_id == exclude_user_id:
                continue

            try:
                await websocket.send_json(message_with_meta)
            except Exception as e:
                logger.error(
                    f"Error sending room message",
                    room_id=room_id,
                    user_id=user_id,
                    error=str(e),
                )

    async def broadcast_message(
        self,
        message: Dict[str, Any],
        exclude_user_id: Optional[int] = None,
    ) -> None:
        """
        Broadcast message to all connected users.

        Args:
            message: Message payload
            exclude_user_id: Optional user to exclude
        """
        message_with_meta = self._add_message_metadata(message)

        for user_id, connections in self.active_connections.items():
            if exclude_user_id and user_id == exclude_user_id:
                continue

            for websocket in connections:
                try:
                    await websocket.send_json(message_with_meta)
                except Exception as e:
                    logger.error(
                        f"Error broadcasting message",
                        user_id=user_id,
                        error=str(e),
                    )

    def get_active_users(self) -> list[int]:
        """
        Get list of users with active connections.

        Returns:
            List of user IDs
        """
        return list(self.active_connections.keys())

    def get_user_connection_count(self, user_id: int) -> int:
        """
        Get number of active connections for user.

        Args:
            user_id: User ID

        Returns:
            Number of connections
        """
        return len(self.active_connections.get(user_id, set()))

    def get_room_connection_count(self, room_id: str) -> int:
        """
        Get number of active connections in room.

        Args:
            room_id: Room ID

        Returns:
            Number of connections
        """
        return len(self.room_connections.get(room_id, set()))

    def get_total_connections(self) -> int:
        """
        Get total number of active connections.

        Returns:
            Total connection count
        """
        total = 0
        for connections in self.active_connections.values():
            total += len(connections)
        return total

    def _add_message_metadata(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """
        Add metadata to message (timestamp, etc).

        Args:
            message: Original message

        Returns:
            Enhanced message with metadata
        """
        return {
            **message,
            "timestamp": datetime.utcnow().isoformat(),
            "message_id": str(uuid.uuid4()),
        }


# Global manager instance
_manager: Optional[ConnectionManager] = None


def get_connection_manager() -> ConnectionManager:
    """
    Get or create global connection manager.

    Returns:
        ConnectionManager instance
    """
    global _manager
    if _manager is None:
        _manager = ConnectionManager()
    return _manager


class WebSocketHandler:
    """High-level handler for WebSocket operations."""

    def __init__(self, manager: ConnectionManager):
        """
        Initialize handler.

        Args:
            manager: ConnectionManager instance
        """
        self.manager = manager

    async def handle_connection(
        self,
        websocket: WebSocket,
        user_id: int,
        room_id: Optional[str] = None,
        on_message_callback: Optional[Callable[[Dict[str, Any]], Any]] = None,
    ) -> None:
        """
        Handle WebSocket connection lifecycle.

        Args:
            websocket: WebSocket connection
            user_id: User ID
            room_id: Optional room ID
            on_message_callback: Optional callback for incoming messages
        """
        await self.manager.connect(websocket, user_id, room_id)

        try:
            while True:
                # Receive message from client
                data = await websocket.receive_json()

                logger.debug(
                    f"WebSocket message received",
                    user_id=user_id,
                    room_id=room_id,
                    message_type=data.get("type"),
                )

                # Call callback if provided
                if on_message_callback:
                    try:
                        await on_message_callback(data)
                    except Exception as e:
                        logger.error(
                            f"Error in message callback",
                            user_id=user_id,
                            error=str(e),
                        )
                        # Send error response to client
                        await websocket.send_json(
                            {
                                "type": "error",
                                "message": "Failed to process message",
                                "error_id": str(uuid.uuid4()),
                            }
                        )

        except WebSocketDisconnect:
            await self.manager.disconnect(websocket)
        except Exception as e:
            logger.error(
                f"WebSocket error",
                user_id=user_id,
                error=str(e),
            )
            await self.manager.disconnect(websocket)


# Message schemas
class WebSocketMessage:
    """Base WebSocket message."""

    @staticmethod
    def notification(
        title: str,
        message: str,
        notification_type: str = "info",
        data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create notification message.

        Args:
            title: Notification title
            message: Notification body
            notification_type: Type of notification (info, warning, error, success)
            data: Optional additional data

        Returns:
            Message dict
        """
        return {
            "type": "notification",
            "notification_type": notification_type,
            "title": title,
            "message": message,
            **({"data": data} if data else {}),
        }

    @staticmethod
    def chat_message(
        chat_id: int,
        sender_id: int,
        sender_name: str,
        content: str,
        message_type: str = "text",
    ) -> Dict[str, Any]:
        """
        Create chat message.

        Args:
            chat_id: Chat/conversation ID
            sender_id: Sender user ID
            sender_name: Sender display name
            content: Message content
            message_type: Type of message (text, image, etc)

        Returns:
            Message dict
        """
        return {
            "type": "chat_message",
            "chat_id": chat_id,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "content": content,
            "message_type": message_type,
        }

    @staticmethod
    def status_update(
        entity_type: str,
        entity_id: int,
        status: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create status update message.

        Args:
            entity_type: Type of entity (contract, payment, property, etc)
            entity_id: Entity ID
            status: New status
            data: Optional additional data

        Returns:
            Message dict
        """
        return {
            "type": "status_update",
            "entity_type": entity_type,
            "entity_id": entity_id,
            "status": status,
            **({"data": data} if data else {}),
        }

    @staticmethod
    def error(
        message: str,
        error_code: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create error message.

        Args:
            message: Error message
            error_code: Error code
            details: Optional error details

        Returns:
            Message dict
        """
        return {
            "type": "error",
            "message": message,
            "error_code": error_code,
            **({"details": details} if details else {}),
        }


# Global handler instance
_handler: Optional[WebSocketHandler] = None


def get_websocket_handler() -> WebSocketHandler:
    """
    Get or create global WebSocket handler.

    Returns:
        WebSocketHandler instance
    """
    global _handler
    if _handler is None:
        manager = get_connection_manager()
        _handler = WebSocketHandler(manager)
    return _handler
