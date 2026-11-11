"""
Custom exception classes for standardized error handling.
Provides domain-specific exceptions with structured responses.
"""

from fastapi import HTTPException, status
from typing import Optional, Any, Dict
import uuid


class ShedaException(HTTPException):
    """Base exception class for all Sheda application exceptions."""

    def __init__(
        self,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail: str = "Internal server error",
        error_code: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
        data: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize ShedaException.

        Args:
            status_code: HTTP status code
            detail: Error message
            error_code: Machine-readable error code
            headers: Optional headers to include in response
            data: Optional additional error context data
        """
        self.error_id = str(uuid.uuid4())
        self.error_code = error_code or self.__class__.__name__
        self.data = data or {}

        # Build detail with error code and ID for traceability
        detail_with_code = f"[{self.error_code} | {self.error_id}] {detail}"

        super().__init__(
            status_code=status_code, detail=detail_with_code, headers=headers
        )


# Authentication Errors (401)


class AuthenticationError(ShedaException):
    """Raised when authentication fails."""

    def __init__(self, detail: str = "Authentication failed"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            error_code="AUTH_001",
        )


class InvalidCredentialsError(ShedaException):
    """Raised when provided credentials are invalid."""

    def __init__(self, detail: str = "Invalid username or password"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            error_code="AUTH_002",
        )


class TokenExpiredError(ShedaException):
    """Raised when JWT token has expired."""

    def __init__(self, detail: str = "Token has expired"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            error_code="AUTH_003",
        )


class InvalidTokenError(ShedaException):
    """Raised when JWT token is invalid."""

    def __init__(self, detail: str = "Invalid token"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            error_code="AUTH_004",
        )


# Authorization Errors (403)


class PermissionDeniedError(ShedaException):
    """Raised when user lacks required permissions."""

    def __init__(self, detail: str = "Permission denied"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
            error_code="AUTHZ_001",
        )


class InsufficientPrivilegesError(ShedaException):
    """Raised when user has insufficient privileges for operation."""

    def __init__(self, detail: str = "Insufficient privileges"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
            error_code="AUTHZ_002",
        )


# Validation Errors (422)


class ValidationError(ShedaException):
    """Raised when request validation fails."""

    def __init__(
        self, detail: str = "Validation failed", data: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=detail,
            error_code="VAL_001",
            data=data,
        )


class InvalidInputError(ShedaException):
    """Raised when input is invalid."""

    def __init__(self, field: str, detail: str = "Invalid input"):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{detail} for field '{field}'",
            error_code="VAL_002",
            data={"field": field},
        )


class BusinessLogicError(ShedaException):
    """Raised when business logic validation fails."""

    def __init__(self, detail: str = "Business logic validation failed"):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=detail,
            error_code="VAL_003",
        )


# Resource Errors (404)


class ResourceNotFoundError(ShedaException):
    """Raised when requested resource is not found."""

    def __init__(self, resource: str = "Resource", resource_id: Optional[Any] = None):
        detail = f"{resource} not found"
        if resource_id:
            detail += f" (ID: {resource_id})"

        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail,
            error_code="NOT_FOUND_001",
            data={"resource": resource, "resource_id": resource_id},
        )


class PropertyNotFoundError(ShedaException):
    """Raised when property is not found."""

    def __init__(self, property_id: int):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Property not found (ID: {property_id})",
            error_code="PROPERTY_001",
            data={"resource": "Property", "resource_id": property_id},
        )


class UserNotFoundError(ShedaException):
    """Raised when user is not found."""

    def __init__(self, user_id: Optional[int] = None, email: Optional[str] = None):
        detail = "User not found"
        data = {}

        if user_id:
            detail += f" (ID: {user_id})"
            data["resource_id"] = user_id

        if email:
            detail += f" (Email: {email})"
            data["email"] = email

        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail,
            error_code="USER_001",
            data=data,
        )


class ContractNotFoundError(ShedaException):
    """Raised when contract is not found."""

    def __init__(self, contract_id: int):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Contract not found (ID: {contract_id})",
            error_code="CONTRACT_001",
            data={"resource": "Contract", "resource_id": contract_id},
        )


# Conflict Errors (409)


class ConflictError(ShedaException):
    """Raised when request conflicts with current state."""

    def __init__(self, detail: str = "Conflict"):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
            error_code="CONFLICT_001",
        )


class DuplicateResourceError(ShedaException):
    """Raised when attempting to create duplicate resource."""

    def __init__(
        self,
        resource: str = "Resource",
        field: Optional[str] = None,
        value: Optional[Any] = None,
    ):
        detail = f"{resource} already exists"
        data = {"resource": resource}

        if field:
            detail += f" with {field}: {value}"
            data["field"] = field
            data["value"] = value

        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
            error_code="DUPLICATE_001",
            data=data,
        )


class DuplicateEmailError(ShedaException):
    """Raised when email already exists."""

    def __init__(self, email: str):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Email already registered: {email}",
            error_code="USER_002",
            data={"field": "email", "value": email},
        )


class IdempotencyError(ShedaException):
    """Raised when idempotent operation is violated."""

    def __init__(self, detail: str = "Duplicate request with different data"):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
            error_code="IDEMPOTENT_001",
        )


# Rate Limiting Errors (429)


class RateLimitExceededError(ShedaException):
    """Raised when rate limit is exceeded."""

    def __init__(self, detail: str = "Rate limit exceeded"):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            error_code="RATE_LIMIT_001",
        )


# Server Errors (500+)


class InternalServerError(ShedaException):
    """Raised for unexpected server errors."""

    def __init__(self, detail: str = "Internal server error"):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail,
            error_code="SERVER_001",
        )


class DatabaseError(ShedaException):
    """Raised when database operation fails."""

    def __init__(self, detail: str = "Database operation failed"):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail,
            error_code="DB_001",
        )


class ExternalServiceError(ShedaException):
    """Raised when external service integration fails."""

    def __init__(self, service: str, detail: str = "External service error"):
        full_detail = f"{service}: {detail}"
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=full_detail,
            error_code="EXT_SERVICE_001",
            data={"service": service},
        )


# Business Logic Errors


class PaymentError(ShedaException):
    """Raised when payment operation fails."""

    def __init__(self, detail: str = "Payment operation failed"):
        super().__init__(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=detail,
            error_code="PAYMENT_001",
        )


class DuplicatePaymentError(ShedaException):
    """Raised when attempting to process duplicate payment."""

    def __init__(self, detail: str = "Duplicate payment detected"):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
            error_code="PAYMENT_002",
        )


class TransactionError(ShedaException):
    """Raised when transaction operation fails."""

    def __init__(self, detail: str = "Transaction operation failed"):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail,
            error_code="TXN_001",
        )


class BlockchainError(ShedaException):
    """Raised when blockchain operation fails."""

    def __init__(self, detail: str = "Blockchain operation failed"):
        super().__init__(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
            error_code="BLOCKCHAIN_001",
        )


class ContractError(ShedaException):
    """Raised when contract operation fails."""

    def __init__(self, detail: str = "Contract operation failed"):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
            error_code="CONTRACT_002",
        )


class NotificationError(ShedaException):
    """Raised when notification operation fails."""

    def __init__(self, detail: str = "Notification operation failed"):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail,
            error_code="NOTIF_001",
        )


class WebSocketError(ShedaException):
    """Raised when WebSocket operation fails."""

    def __init__(self, detail: str = "WebSocket operation failed"):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail,
            error_code="WS_001",
        )
