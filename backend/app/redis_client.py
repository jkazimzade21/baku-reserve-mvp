"""Redis client for caching and state persistence."""

from __future__ import annotations

import logging
from typing import Any

from .settings import settings

logger = logging.getLogger(__name__)

# Global Redis client (None if Redis is not enabled/available)
_redis_client: Any | None = None


def get_redis_client() -> Any | None:
    """
    Get Redis client instance (if Redis is enabled and available).

    Returns:
        Redis client or None if not available
    """
    global _redis_client

    if not settings.REDIS_ENABLED or not settings.REDIS_URL:
        return None

    if _redis_client is not None:
        return _redis_client

    try:
        import redis

        _redis_client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=2.0,
            socket_connect_timeout=2.0,
        )

        # Test connection
        _redis_client.ping()
        logger.info("Redis client initialized", url=settings.REDIS_URL)
        return _redis_client

    except ImportError:
        logger.warning("Redis library not installed. Circuit breaker state will not persist.")
        return None
    except Exception as exc:
        logger.warning(
            "Failed to connect to Redis. Circuit breaker state will not persist.",
            error=str(exc),
        )
        return None


def is_redis_available() -> bool:
    """Check if Redis is available and connected."""
    client = get_redis_client()
    if not client:
        return False

    try:
        client.ping()
        return True
    except Exception:
        return False


__all__ = ["get_redis_client", "is_redis_available"]
