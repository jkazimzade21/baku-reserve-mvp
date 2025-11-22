"""Structured logging configuration using structlog."""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog
from structlog.types import EventDict, Processor

from .settings import settings
from .utils import request_id_ctx


def add_request_id(logger: Any, method_name: str, event_dict: EventDict) -> EventDict:
    """
    Add request ID to log event if available.

    This processor extracts the request ID from context and adds it to every log entry.
    """
    request_id = request_id_ctx.get("")
    if request_id:
        event_dict["request_id"] = request_id
    return event_dict


def add_app_context(logger: Any, method_name: str, event_dict: EventDict) -> EventDict:
    """
    Add application context to log events.

    Adds service name, environment, and version to every log entry.
    """
    event_dict["service"] = "baku-reserve"
    event_dict["environment"] = settings.SENTRY_ENVIRONMENT
    event_dict["version"] = "0.1.0"
    return event_dict


def drop_color_message_key(logger: Any, method_name: str, event_dict: EventDict) -> EventDict:
    """
    Remove the 'color_message' key from the event dict.

    Structlog's ConsoleRenderer adds a 'color_message' key which is redundant in JSON output.
    """
    event_dict.pop("color_message", None)
    return event_dict


def configure_structlog(json_logs: bool = False) -> None:
    """
    Configure structlog for the application.

    Args:
        json_logs: If True, output JSON logs. If False, use human-readable console format.
                   Defaults to JSON in production (non-DEBUG mode).
    """
    # Determine log format based on environment
    if json_logs or not settings.DEBUG:
        # Production: JSON logs for aggregation (Datadog, CloudWatch, etc.)
        processors: list[Processor] = [
            structlog.contextvars.merge_contextvars,
            add_request_id,
            add_app_context,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            drop_color_message_key,
            structlog.processors.JSONRenderer(),
        ]
    else:
        # Development: Human-readable console logs
        processors = [
            structlog.contextvars.merge_contextvars,
            add_request_id,
            add_app_context,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.dev.ConsoleRenderer(),
        ]

    # Configure structlog
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Configure standard library logging to use structlog
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=logging.INFO,
    )

    # Set log levels for noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """
    Get a structured logger instance.

    Args:
        name: Logger name (typically __name__)

    Returns:
        Configured structlog logger

    Usage:
        logger = get_logger(__name__)
        logger.info("user_login", user_id=user_id, ip=request.client.host)
    """
    return structlog.get_logger(name)


__all__ = ["configure_structlog", "get_logger"]
