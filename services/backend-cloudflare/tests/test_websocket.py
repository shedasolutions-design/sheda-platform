"""
Tests for the WebSocket service at /ws/{user_id}
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import WebSocket, status
from app.routers.websocket import (
    WebSocketConnectionManager,
    ws_manager,
)


class TestIsJwtLike:
    """Tests for the is_jwt_like helper function."""

    def test_valid_jwt_format(self):
        """Test that valid JWT format is recognized."""
        from app.services.user_service import is_jwt_like

        # Standard JWT format
        assert (
            is_jwt_like("eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxMjM0NTY3ODkw.signature")
            is True
        )
        assert is_jwt_like("header.payload.signature") is True
        assert is_jwt_like("abc123_-.xyz789_-.sig_-") is True
        assert is_jwt_like("a.b.c") is True

    def test_invalid_jwt_format(self):
        """Test that invalid JWT formats are rejected."""
        from app.services.user_service import is_jwt_like

        # Too many dots
        assert is_jwt_like("too.many.dots.here") is False
        # Too few dots
        assert is_jwt_like("onlyone.dot") is False
        assert is_jwt_like("nodots") is False
        # Empty string
        assert is_jwt_like("") is False
        # Invalid characters
        assert is_jwt_like("has spaces.in.it") is False
        assert is_jwt_like("has!special.chars.here") is False


class TestWebSocketConnectionManager:
    """Tests for the WebSocketConnectionManager class."""

    def setup_method(self):
        """Reset the connection manager before each test."""
        self.manager = WebSocketConnectionManager()

    def test_connect_stores_connection(self):
        """Test that connect properly stores the WebSocket connection."""
        mock_websocket = AsyncMock(spec=WebSocket)
        user_id = 1

        result = self.manager.connect(mock_websocket, user_id)

        assert result is True
        assert user_id in self.manager.active_connections
        assert self.manager.active_connections[user_id] == mock_websocket

    def test_disconnect_removes_connection(self):
        """Test that disconnect removes the user's connection."""
        mock_websocket = AsyncMock(spec=WebSocket)
        user_id = 1
        self.manager.active_connections[user_id] = mock_websocket

        self.manager.disconnect(user_id)

        assert user_id not in self.manager.active_connections

    def test_disconnect_nonexistent_user_no_error(self):
        """Test that disconnecting a non-existent user doesn't raise an error."""
        # Should not raise an exception
        self.manager.disconnect(999)

    def test_is_connected_returns_true_when_connected(self):
        """Test is_connected returns True for connected users."""
        mock_websocket = AsyncMock(spec=WebSocket)
        user_id = 1
        self.manager.active_connections[user_id] = mock_websocket

        assert self.manager.is_connected(user_id) is True

    def test_is_connected_returns_false_when_not_connected(self):
        """Test is_connected returns False for disconnected users."""
        assert self.manager.is_connected(999) is False

    @pytest.mark.asyncio
    async def test_send_personal_message_to_connected_user(self):
        """Test sending a message to a connected user."""
        mock_websocket = AsyncMock(spec=WebSocket)
        user_id = 1
        self.manager.active_connections[user_id] = mock_websocket
        message = {"type": "test", "content": "Hello"}

        result = await self.manager.send_personal_message(message, user_id)

        assert result is True
        mock_websocket.send_json.assert_called_once_with(message)

    @pytest.mark.asyncio
    async def test_send_personal_message_to_disconnected_user(self):
        """Test sending a message to a disconnected user returns False."""
        message = {"type": "test", "content": "Hello"}

        result = await self.manager.send_personal_message(message, 999)

        assert result is False

    @pytest.mark.asyncio
    async def test_send_personal_message_cleans_up_broken_connection(self):
        """Test that broken connections are cleaned up when sending fails."""
        mock_websocket = AsyncMock(spec=WebSocket)
        mock_websocket.send_json.side_effect = Exception("Connection broken")
        user_id = 1
        self.manager.active_connections[user_id] = mock_websocket

        result = await self.manager.send_personal_message({"test": "data"}, user_id)

        assert result is False
        assert user_id not in self.manager.active_connections

    def test_get_connected_users(self):
        """Test getting list of connected user IDs."""
        self.manager.active_connections[1] = AsyncMock()
        self.manager.active_connections[2] = AsyncMock()
        self.manager.active_connections[3] = AsyncMock()

        connected_users = self.manager.get_connected_users()

        assert sorted(connected_users) == [1, 2, 3]


class TestGetWebSocketUser:
    """Tests for WebSocket authentication via get_websocket_user."""

    @pytest.mark.asyncio
    async def test_auth_fails_without_token(self):
        """Test that authentication fails and connection is closed when no token is provided."""
        from app.services.user_service import get_websocket_user

        mock_websocket = MagicMock(spec=WebSocket)
        mock_websocket.headers = {}
        mock_websocket.close = AsyncMock()
        mock_db = AsyncMock()

        result = await get_websocket_user(
            websocket=mock_websocket, db=mock_db, token=None
        )

        assert result is None
        mock_websocket.close.assert_called_once()
        assert (
            mock_websocket.close.call_args.kwargs.get("code")
            == status.WS_1008_POLICY_VIOLATION
        )

    @pytest.mark.asyncio
    async def test_auth_extracts_token_from_bearer_protocol(self):
        """Test token extraction from Sec-WebSocket-Protocol header with Bearer prefix."""
        from app.services.user_service import get_websocket_user

        mock_websocket = MagicMock(spec=WebSocket)
        mock_websocket.headers = {"sec-websocket-protocol": "Bearer.test_token_value"}
        mock_websocket.accept = AsyncMock()
        mock_db = AsyncMock()

        with patch("app.services.user_service.jwt.decode") as mock_jwt:
            mock_jwt.return_value = {"sub": "1", "scopes": ["client"]}

            with patch("app.services.user_service.get_user") as mock_get_user:
                mock_user = MagicMock()
                mock_user.id = 1
                mock_user.is_active = True
                mock_user.verified = True
                mock_user.email = "test@example.com"
                mock_get_user.return_value = mock_user

                result = await get_websocket_user(
                    websocket=mock_websocket, db=mock_db, token=None
                )

                assert result is not None
                assert result.id == 1
                mock_websocket.accept.assert_called_once_with(
                    subprotocol="Bearer.test_token_value"
                )

    @pytest.mark.asyncio
    async def test_auth_with_query_token(self):
        """Test authentication with token provided via query parameter."""
        from app.services.user_service import get_websocket_user

        mock_websocket = MagicMock(spec=WebSocket)
        mock_websocket.headers = {}
        mock_websocket.accept = AsyncMock()
        mock_db = AsyncMock()

        with patch("app.services.user_service.jwt.decode") as mock_jwt:
            mock_jwt.return_value = {"sub": "1", "scopes": ["client"]}

            with patch("app.services.user_service.get_user") as mock_get_user:
                mock_user = MagicMock()
                mock_user.id = 1
                mock_user.is_active = True
                mock_user.verified = True
                mock_user.email = "test@example.com"
                mock_get_user.return_value = mock_user

                result = await get_websocket_user(
                    websocket=mock_websocket, db=mock_db, token="query_token"
                )

                assert result is not None
                assert result.id == 1
                mock_websocket.accept.assert_called_once_with()

    @pytest.mark.asyncio
    async def test_auth_fails_for_inactive_user(self):
        """Test that authentication fails and connection is closed for inactive users."""
        from app.services.user_service import get_websocket_user

        mock_websocket = MagicMock(spec=WebSocket)
        mock_websocket.headers = {}
        mock_websocket.close = AsyncMock()
        mock_db = AsyncMock()

        with patch("app.services.user_service.jwt.decode") as mock_jwt:
            mock_jwt.return_value = {"sub": "1", "scopes": ["client"]}

            with patch("app.services.user_service.get_user") as mock_get_user:
                mock_user = MagicMock()
                mock_user.id = 1
                mock_user.is_active = False  # Inactive user
                mock_user.verified = True
                mock_get_user.return_value = mock_user

                result = await get_websocket_user(
                    websocket=mock_websocket, db=mock_db, token="valid_token"
                )

                assert result is None
                mock_websocket.close.assert_called_once()
                assert (
                    mock_websocket.close.call_args.kwargs.get("code")
                    == status.WS_1008_POLICY_VIOLATION
                )

    @pytest.mark.asyncio
    async def test_auth_fails_for_unverified_user(self):
        """Test that authentication fails and connection is closed for unverified users."""
        from app.services.user_service import get_websocket_user

        mock_websocket = MagicMock(spec=WebSocket)
        mock_websocket.headers = {}
        mock_websocket.close = AsyncMock()
        mock_db = AsyncMock()

        with patch("app.services.user_service.jwt.decode") as mock_jwt:
            mock_jwt.return_value = {"sub": "1", "scopes": ["client"]}

            with patch("app.services.user_service.get_user") as mock_get_user:
                mock_user = MagicMock()
                mock_user.id = 1
                mock_user.is_active = True
                mock_user.verified = False  # Unverified user
                mock_get_user.return_value = mock_user

                result = await get_websocket_user(
                    websocket=mock_websocket, db=mock_db, token="valid_token"
                )

                assert result is None
                mock_websocket.close.assert_called_once()
                assert (
                    mock_websocket.close.call_args.kwargs.get("code")
                    == status.WS_1008_POLICY_VIOLATION
                )

    @pytest.mark.asyncio
    async def test_auth_with_access_token_subprotocol_format(self):
        """Test token extraction from access_token subprotocol format."""
        from app.services.user_service import get_websocket_user

        mock_websocket = MagicMock(spec=WebSocket)
        mock_websocket.headers = {
            "sec-websocket-protocol": "access_token, my_jwt_token"
        }
        mock_websocket.accept = AsyncMock()
        mock_db = AsyncMock()

        with patch("app.services.user_service.jwt.decode") as mock_jwt:
            mock_jwt.return_value = {"sub": "1", "scopes": ["client"]}

            with patch("app.services.user_service.get_user") as mock_get_user:
                mock_user = MagicMock()
                mock_user.id = 1
                mock_user.is_active = True
                mock_user.verified = True
                mock_user.email = "test@example.com"
                mock_get_user.return_value = mock_user

                result = await get_websocket_user(
                    websocket=mock_websocket, db=mock_db, token=None
                )

                assert result is not None
                mock_websocket.accept.assert_called_once_with(
                    subprotocol="access_token"
                )

    @pytest.mark.asyncio
    async def test_auth_with_raw_jwt_in_protocol(self):
        """Test token extraction when raw JWT is in protocol header."""
        from app.services.user_service import get_websocket_user

        mock_websocket = MagicMock(spec=WebSocket)
        # JWT tokens have dots in them
        mock_websocket.headers = {
            "sec-websocket-protocol": "eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxMjM0NTY3ODkw.signature"
        }
        mock_websocket.accept = AsyncMock()
        mock_db = AsyncMock()

        with patch("app.services.user_service.jwt.decode") as mock_jwt:
            mock_jwt.return_value = {"sub": "1", "scopes": ["client"]}

            with patch("app.services.user_service.get_user") as mock_get_user:
                mock_user = MagicMock()
                mock_user.id = 1
                mock_user.is_active = True
                mock_user.verified = True
                mock_user.email = "test@example.com"
                mock_get_user.return_value = mock_user

                result = await get_websocket_user(
                    websocket=mock_websocket, db=mock_db, token=None
                )

                assert result is not None
                mock_websocket.accept.assert_called_once()


class TestGlobalConnectionManager:
    """Tests to verify the global connection manager is properly initialized."""

    def test_ws_manager_is_initialized(self):
        """Test that the global ws_manager is properly initialized."""
        assert ws_manager is not None
        assert isinstance(ws_manager, WebSocketConnectionManager)
        assert isinstance(ws_manager.active_connections, dict)
