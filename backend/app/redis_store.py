from __future__ import annotations

from redis.asyncio import Redis

from .settings import settings

_async_client: Redis | None = None


def get_async_redis() -> Redis | None:
    global _async_client
    if not settings.REDIS_ENABLED or not settings.REDIS_URL:
        return None
    if _async_client is None:
        _async_client = Redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return _async_client
