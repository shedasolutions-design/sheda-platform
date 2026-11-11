"""
Enhanced logging configuration with structured logging support.
Integrates Structlog for production-grade JSON logging with context preservation.
"""

import logging
import logging.handlers
import json
import sys
from typing import Optional, Dict, Any
from datetime import datetime
from pathlib import Path

try:
    import structlog

    HAS_STRUCTLOG = True
except ImportError:
    HAS_STRUCTLOG = False

from core.configs import settings


class ColoredFormatter(logging.Formatter):
    """Colored log formatter for console output."""

    COLORS = {
        "DEBUG": "\033[94m",  # Blue
        "INFO": "\033[92m",  # Green
        "WARNING": "\033[93m",  # Yellow
        "ERROR": "\033[91m",  # Red
        "CRITICAL": "\033[1;91m",  # Bold Red
    }
    RESET = "\033[0m"

    def format(self, record):
        log_color = self.COLORS.get(record.levelname, self.RESET)
        record.levelname = f"{log_color}{record.levelname}{self.RESET}"
        return super().format(record)


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging in production."""

    def format(self, record):
        """Format log record as JSON."""
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add extra fields from record
        if hasattr(record, "extra_fields"):
            log_data.update(record.extra_fields)

        return json.dumps(log_data)


def setup_logger(
    name: str,
    level: Optional[int] = None,
    log_file: Optional[str] = None,
) -> logging.Logger:
    """
    Setup and configure a logger instance.

    Args:
        name: Logger name
        level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_file: Optional log file path

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)

    # Set level
    if level is None:
        level = logging.DEBUG if settings.DEBUG_MODE else logging.INFO
    logger.setLevel(level)

    # Remove existing handlers
    logger.handlers.clear()

    # Console handler with colors (dev mode) or JSON (prod)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)

    if settings.DEBUG_MODE:
        formatter = ColoredFormatter(
            "%(levelname)s:%(name)s:%(funcName)s:Line-%(lineno)d: %(message)s"
        )
    else:
        formatter = JSONFormatter()

    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # File handler (production only)
    if log_file and not settings.DEBUG_MODE:
        log_dir = Path(log_file).parent
        log_dir.mkdir(parents=True, exist_ok=True)

        file_handler = logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5,
        )
        file_handler.setLevel(logging.INFO)
        file_handler.setFormatter(JSONFormatter())
        logger.addHandler(file_handler)

    # Prevent propagation to root logger
    logger.propagate = False

    return logger


# Global logger instance
logger = setup_logger("sheda", log_file="/var/log/sheda/app.log")


def get_logger(name: str) -> logging.Logger:
    """
    Get or create logger for module.

    Args:
        name: Logger name (typically __name__)

    Returns:
        Logger instance
    """
    return logging.getLogger(name)


def log_with_context(
    logger_instance: logging.Logger,
    level: int,
    message: str,
    **context: Any,
) -> None:
    """
    Log message with additional context.

    Args:
        logger_instance: Logger to use
        level: Log level
        message: Log message
        **context: Additional context fields
    """
    if context:
        # Create a LogRecord with extra fields
        record = logger_instance.makeRecord(
            logger_instance.name,
            level,
            "(unknown file)",
            0,
            message,
            (),
            None,
        )
        record.extra_fields = context
        logger_instance.handle(record)
    else:
        logger_instance.log(level, message)


def debug(message: str, **context: Any) -> None:
    """Log debug message with context."""
    log_with_context(logger, logging.DEBUG, message, **context)


def info(message: str, **context: Any) -> None:
    """Log info message with context."""
    log_with_context(logger, logging.INFO, message, **context)


def warning(message: str, **context: Any) -> None:
    """Log warning message with context."""
    log_with_context(logger, logging.WARNING, message, **context)


def error(message: str, **context: Any) -> None:
    """Log error message with context."""
    log_with_context(logger, logging.ERROR, message, **context)


def critical(message: str, **context: Any) -> None:
    """Log critical message with context."""
    log_with_context(logger, logging.CRITICAL, message, **context)


# Structlog configuration (if available)
if HAS_STRUCTLOG:
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer(),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
