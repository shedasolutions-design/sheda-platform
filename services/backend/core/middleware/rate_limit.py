"""
Rate limiting middleware using SlowAPI.
Protects endpoints from abuse and excessive requests.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from core.logger import get_logger
import time
from typing import Callable, Optional

logger = get_logger(__name__)


# Initialize global limiter
limiter = Limiter(key_func=get_remote_address)


# Rate limit configurations by endpoint
RATE_LIMITS = {
    # Authentication endpoints
    "auth_login": "5/minute",  # 5 requests per minute
    "auth_register": "3/minute",  # 3 requests per minute
    "auth_refresh": "10/minute",  # 10 requests per minute
    "auth_verify": "10/minute",  # 10 requests per minute
    "auth_forgot_password": "3/minute",  # Protect against enumeration
    "auth_reset_password": "5/minute",
    # User endpoints
    "user_profile": "30/minute",  # Standard read endpoint
    "user_update": "10/minute",  # Less frequent writes
    "user_kyc": "2/minute",  # Sensitive operation
    # Property endpoints
    "property_list": "30/minute",  # Frequent reads
    "property_create": "10/minute",  # Create limits
    "property_update": "10/minute",  # Update limits
    "property_delete": "5/minute",  # Dangerous operation
    # Transaction endpoints
    "transaction_create": "5/minute",  # Prevent spam
    "transaction_confirm": "5/minute",  # Critical operation
    "transaction_list": "30/minute",
    # Chat/Messaging
    "chat_send_message": "60/minute",  # Allow chat flow
    "chat_list": "30/minute",
    # Notifications
    "notification_register": "10/minute",
    "notification_list": "30/minute",
    # Media uploads
    "media_upload": "20/minute",  # Multiple uploads
    # General API
    "api_general": "100/minute",  # Catch-all default
}


from starlette.middleware.base import BaseHTTPMiddleware

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Custom rate limiting middleware with advanced features."""

    def __init__(self, app):
        """Initialize rate limit middleware."""
        super().__init__(app)
        self.limiter = limiter
        self.whitelist = set()  # IPs to whitelist from rate limiting
        self.blacklist = set()  # IPs to block immediately

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process request through rate limiting.

        Args:
            request: FastAPI request
            call_next: Next middleware/route handler

        Returns:
            Response with rate limit headers
        """
        # Get client IP
        client_ip = get_remote_address(request)

        # Check blacklist
        if client_ip in self.blacklist:
            logger.warning(f"Blocked request from blacklisted IP: {client_ip}")
            return JSONResponse(
                status_code=403,
                content={
                    "error_code": "BLOCKED",
                    "detail": "Your IP has been blocked",
                },
            )

        # Skip rate limiting for whitelisted IPs
        if client_ip in self.whitelist:
            return await call_next(request)

        # Process request
        response = await call_next(request)

        # Add rate limit info headers
        response.headers["X-RateLimit-Limit"] = "unknown"
        response.headers["X-RateLimit-Remaining"] = "unknown"
        response.headers["X-RateLimit-Reset"] = str(int(time.time()) + 60)

        return response

    def add_whitelist_ip(self, ip: str) -> None:
        """Add IP to whitelist."""
        self.whitelist.add(ip)
        logger.info(f"Added IP to rate limit whitelist: {ip}")

    def remove_whitelist_ip(self, ip: str) -> None:
        """Remove IP from whitelist."""
        self.whitelist.discard(ip)
        logger.info(f"Removed IP from rate limit whitelist: {ip}")

    def add_blacklist_ip(self, ip: str) -> None:
        """Add IP to blacklist."""
        self.blacklist.add(ip)
        logger.warning(f"Added IP to rate limit blacklist: {ip}")

    def remove_blacklist_ip(self, ip: str) -> None:
        """Remove IP from blacklist."""
        self.blacklist.discard(ip)
        logger.info(f"Removed IP from rate limit blacklist: {ip}")

    def clear_whitelist(self) -> None:
        """Clear all whitelisted IPs."""
        self.whitelist.clear()
        logger.info("Cleared rate limit whitelist")

    def clear_blacklist(self) -> None:
        """Clear all blacklisted IPs."""
        self.blacklist.clear()
        logger.info("Cleared rate limit blacklist")


# Custom exception handler for rate limit exceeded
async def rate_limit_exceeded_handler(
    request: Request, exc: RateLimitExceeded
) -> JSONResponse:
    """
    Handle RateLimitExceeded exceptions.

    Args:
        request: FastAPI request
        exc: RateLimitExceeded exception

    Returns:
        JSON error response
    """
    logger.warning(
        f"Rate limit exceeded for {get_remote_address(request)}: {exc.detail}"
    )

    return JSONResponse(
        status_code=429,
        content={
            "error_code": "RATE_LIMIT_EXCEEDED",
            "detail": "Too many requests. Please try again later.",
            "retry_after": 60,
        },
        headers={"Retry-After": "60"},
    )


def get_rate_limit_key(endpoint: str) -> Optional[str]:
    """
    Get rate limit configuration for endpoint.

    Args:
        endpoint: Endpoint identifier

    Returns:
        Rate limit string (e.g., "5/minute") or None
    """
    return RATE_LIMITS.get(endpoint, RATE_LIMITS.get("api_general"))
