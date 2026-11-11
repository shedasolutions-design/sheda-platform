"""
Enhanced error handling middleware with structured error responses.
Provides centralized error handling with proper logging and error tracking.
"""

import traceback
import uuid
import logging
from typing import Callable, Optional, Dict, Any
from datetime import datetime

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.middleware.base import BaseHTTPMiddleware

from core.logger import get_logger, log_with_context
from core.exceptions import ShedaException

logger = get_logger(__name__)


class ErrorDetails:
    """Container for error response details."""

    def __init__(
        self,
        status_code: int,
        error_code: str,
        detail: str,
        error_id: str,
        request_id: str,
        data: Optional[Dict[str, Any]] = None,
    ):
        self.status_code = status_code
        self.error_code = error_code
        self.detail = detail
        self.error_id = error_id
        self.request_id = request_id
        self.data = data or {}
        self.timestamp = datetime.utcnow().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        """Convert error details to dictionary for JSON response."""
        return {
            "error_code": self.error_code,
            "detail": self.detail,
            "error_id": self.error_id,
            "request_id": self.request_id,
            "timestamp": self.timestamp,
            **({"data": self.data} if self.data else {}),
        }


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """Enhanced middleware for centralized error handling with structured responses."""

    def __init__(self, app):
        super().__init__(app)
        self.logger = logger

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Handle errors in request processing.

        Args:
            request: HTTP request
            call_next: Next middleware function

        Returns:
            Response: HTTP response or error response
        """
        # Generate request ID for tracking
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        request.state.start_time = datetime.utcnow()

        try:
            response = await call_next(request)

            # Add request ID to response headers
            response.headers["X-Request-ID"] = request_id

            return response

        except ShedaException as exc:
            # Handle custom application exceptions
            return self._handle_sheda_exception(exc, request_id, request)

        except RequestValidationError as exc:
            # Handle Pydantic validation errors
            return self._handle_validation_error(exc, request_id, request)

        except Exception as exc:
            # Handle unexpected errors
            return self._handle_unexpected_error(exc, request_id, request)

    def _handle_sheda_exception(
        self,
        exc: ShedaException,
        request_id: str,
        request: Request,
    ) -> JSONResponse:
        """
        Handle ShedaException with proper logging and response.

        Args:
            exc: ShedaException instance
            request_id: Request identifier
            request: HTTP request

        Returns:
            JSON error response
        """
        # Log the error
        log_with_context(
            self.logger,
            logging.WARNING,
            f"Application error: {exc.detail}",
            error_code=exc.error_code,
            error_id=exc.error_id,
            request_id=request_id,
            path=request.url.path,
            method=request.method,
        )

        # Build error details
        error_details = ErrorDetails(
            status_code=exc.status_code,
            error_code=exc.error_code,
            detail=exc.detail,
            error_id=exc.error_id,
            request_id=request_id,
            data=exc.data,
        )

        return JSONResponse(
            status_code=exc.status_code,
            content=error_details.to_dict(),
            headers={"X-Request-ID": request_id},
        )

    def _handle_validation_error(
        self,
        exc: RequestValidationError,
        request_id: str,
        request: Request,
    ) -> JSONResponse:
        """
        Handle Pydantic validation errors.

        Args:
            exc: RequestValidationError instance
            request_id: Request identifier
            request: HTTP request

        Returns:
            JSON error response
        """
        # Extract validation errors
        errors = []
        for error in exc.errors():
            errors.append(
                {
                    "field": ".".join(str(x) for x in error["loc"][1:]),
                    "type": error["type"],
                    "message": error["msg"],
                }
            )

        # Log the error
        log_with_context(
            self.logger,
            logging.WARNING,
            "Validation error",
            request_id=request_id,
            path=request.url.path,
            method=request.method,
            validation_errors=errors,
        )

        error_details = ErrorDetails(
            status_code=422,
            error_code="VALIDATION_ERROR",
            detail="Request validation failed",
            error_id=str(uuid.uuid4()),
            request_id=request_id,
            data={"errors": errors},
        )

        return JSONResponse(
            status_code=422,
            content=error_details.to_dict(),
            headers={"X-Request-ID": request_id},
        )

    def _handle_unexpected_error(
        self,
        exc: Exception,
        request_id: str,
        request: Request,
    ) -> JSONResponse:
        """
        Handle unexpected exceptions.

        Args:
            exc: Exception instance
            request_id: Request identifier
            request: HTTP request

        Returns:
            JSON error response
        """
        error_id = str(uuid.uuid4())

        # Log the error with full traceback
        log_with_context(
            self.logger,
            logging.ERROR,
            f"Unexpected error: {str(exc)}",
            error_id=error_id,
            request_id=request_id,
            path=request.url.path,
            method=request.method,
            exception_type=type(exc).__name__,
            traceback=traceback.format_exc(),
        )

        error_details = ErrorDetails(
            status_code=500,
            error_code="INTERNAL_SERVER_ERROR",
            detail="An unexpected error occurred. Please contact support.",
            error_id=error_id,
            request_id=request_id,
        )

        return JSONResponse(
            status_code=500,
            content=error_details.to_dict(),
            headers={"X-Request-ID": request_id},
        )


# Global exception handlers for FastAPI app
def setup_exception_handlers(app):
    """
    Setup global exception handlers for FastAPI app.

    Args:
        app: FastAPI application instance
    """
    import logging as logging_module

    @app.exception_handler(ShedaException)
    async def sheda_exception_handler(request: Request, exc: ShedaException):
        """Handle ShedaException globally."""
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))

        log_with_context(
            logger,
            logging_module.WARNING,
            f"Application error: {exc.detail}",
            error_code=exc.error_code,
            error_id=exc.error_id,
            request_id=request_id,
        )

        error_details = ErrorDetails(
            status_code=exc.status_code,
            error_code=exc.error_code,
            detail=exc.detail,
            error_id=exc.error_id,
            request_id=request_id,
            data=exc.data,
        )

        return JSONResponse(
            status_code=exc.status_code,
            content=error_details.to_dict(),
            headers={"X-Request-ID": request_id},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ):
        """Handle validation errors globally."""
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        error_id = str(uuid.uuid4())

        errors = []
        for error in exc.errors():
            errors.append(
                {
                    "field": ".".join(str(x) for x in error["loc"][1:]),
                    "type": error["type"],
                    "message": error["msg"],
                }
            )

        log_with_context(
            logger,
            logging_module.WARNING,
            "Validation error",
            request_id=request_id,
            validation_errors=errors,
        )

        error_details = ErrorDetails(
            status_code=422,
            error_code="VALIDATION_ERROR",
            detail="Request validation failed",
            error_id=error_id,
            request_id=request_id,
            data={"errors": errors},
        )

        return JSONResponse(
            status_code=422,
            content=error_details.to_dict(),
            headers={"X-Request-ID": request_id},
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        """Handle unexpected exceptions globally."""
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        error_id = str(uuid.uuid4())

        log_with_context(
            logger,
            logging_module.ERROR,
            f"Unexpected error: {str(exc)}",
            error_id=error_id,
            request_id=request_id,
            exception_type=type(exc).__name__,
            traceback=traceback.format_exc(),
        )

        error_details = ErrorDetails(
            status_code=500,
            error_code="INTERNAL_SERVER_ERROR",
            detail="An unexpected error occurred. Please contact support.",
            error_id=error_id,
            request_id=request_id,
        )

        return JSONResponse(
            status_code=500,
            content=error_details.to_dict(),
            headers={"X-Request-ID": request_id},
        )
