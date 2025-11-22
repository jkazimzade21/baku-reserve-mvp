"""Simple caching implementation for in-memory API responses."""

from __future__ import annotations

import hashlib
import logging
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from threading import Lock
from typing import Any, Generic, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


@dataclass
class CacheEntry(Generic[T]):
    """Single cache entry with value and expiry time."""

    value: T
    expires_at: float
    hits: int = 0
    created_at: float = field(default_factory=time.time)

    def is_expired(self) -> bool:
        """Check if this entry has expired."""
        return time.time() >= self.expires_at

    def increment_hits(self) -> None:
        """Increment hit counter for this entry."""
        self.hits += 1


class TTLCache(Generic[T]):
    """
    Thread-safe TTL (Time To Live) cache with LRU eviction.

    This cache stores values with an expiration time and automatically
    removes expired entries. It also implements LRU eviction when the
    cache reaches its maximum size.
    """

    def __init__(
        self,
        name: str,
        max_size: int = 1000,
        default_ttl: float = 900,  # 15 minutes default
        enabled: bool = True,
    ):
        """
        Initialize TTL cache.

        Args:
            name: Name of this cache instance
            max_size: Maximum number of entries
            default_ttl: Default time-to-live in seconds
            enabled: Whether caching is enabled
        """
        self.name = name
        self.max_size = max_size
        self.default_ttl = default_ttl
        self.enabled = enabled
        self._cache: dict[str, CacheEntry[T]] = {}
        self._access_order: OrderedDict[str, None] = OrderedDict()
        self._lock = Lock()
        self._stats = {
            "hits": 0,
            "misses": 0,
            "evictions": 0,
            "expirations": 0,
        }

    def get(self, key: str) -> T | None:
        """
        Get value from cache if it exists and hasn't expired.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found/expired
        """
        if not self.enabled:
            return None

        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                self._stats["misses"] += 1
                return None

            if entry.is_expired():
                self._stats["expirations"] += 1
                self._remove_entry(key)
                return None

            # Move to end for LRU
            self._access_order.move_to_end(key, last=True)

            entry.increment_hits()
            self._stats["hits"] += 1
            logger.debug("Cache hit for '%s' in '%s' (hits: %d)", key, self.name, entry.hits)
            return entry.value

    def set(
        self,
        key: str,
        value: T,
        ttl: float | None = None,
    ) -> None:
        """
        Store value in cache with expiration time.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Time-to-live in seconds (uses default if None)
        """
        if not self.enabled:
            return

        if ttl is None:
            ttl = self.default_ttl

        with self._lock:
            # Remove existing entry if present
            if key in self._cache:
                self._access_order.pop(key, None)

            # Check if we need to evict
            while len(self._cache) >= self.max_size:
                self._evict_lru()

            # Add new entry
            expires_at = time.time() + ttl
            self._cache[key] = CacheEntry(value, expires_at)
            self._access_order[key] = None

            logger.debug("Cached value for '%s' in '%s' (TTL: %.1fs)", key, self.name, ttl)

    def _remove_entry(self, key: str) -> None:
        """Remove entry from cache (internal, must be called with lock)."""
        if key in self._cache:
            del self._cache[key]
            self._access_order.pop(key, None)

    def _evict_lru(self) -> None:
        """Evict least recently used entry (internal, must be called with lock)."""
        if self._access_order:
            lru_key = next(iter(self._access_order))
            self._remove_entry(lru_key)
            self._stats["evictions"] += 1
            logger.debug("Evicted LRU entry '%s' from '%s'", lru_key, self.name)

    def clear(self) -> None:
        """Clear all entries from cache."""
        with self._lock:
            self._cache.clear()
            self._access_order.clear()
            logger.info("Cleared cache '%s'", self.name)

    def cleanup_expired(self) -> int:
        """
        Remove all expired entries from cache.

        Returns:
            Number of entries removed
        """
        with self._lock:
            expired_keys = [key for key, entry in self._cache.items() if entry.is_expired()]
            for key in expired_keys:
                self._remove_entry(key)
            if expired_keys:
                logger.debug(
                    "Cleaned up %d expired entries from '%s'", len(expired_keys), self.name
                )
            return len(expired_keys)

    def get_stats(self) -> dict[str, Any]:
        """Get cache statistics."""
        with self._lock:
            total_requests = self._stats["hits"] + self._stats["misses"]
            hit_rate = self._stats["hits"] / total_requests if total_requests > 0 else 0
            return {
                "name": self.name,
                "size": len(self._cache),
                "max_size": self.max_size,
                "hits": self._stats["hits"],
                "misses": self._stats["misses"],
                "hit_rate": round(hit_rate, 3),
                "evictions": self._stats["evictions"],
                "expirations": self._stats["expirations"],
                "enabled": self.enabled,
            }


# Global cache instances
_route_cache: TTLCache[Any] = TTLCache(
    "routes",
    max_size=500,
    default_ttl=900,
)

_osrm_route_cache: TTLCache[Any] = TTLCache(
    "osrm_routes",
    max_size=500,
    default_ttl=300,
)

_geocode_cache: TTLCache[Any] = TTLCache(
    "geocoding",
    max_size=1000,
    default_ttl=1800,
)

_traffic_cache: TTLCache[Any] = TTLCache(
    "traffic",
    max_size=200,
    default_ttl=300,
)


def make_cache_key(*args: Any) -> str:
    """
    Create a cache key from arguments.

    Args:
        *args: Values to include in key

    Returns:
        SHA-256 hash of the arguments
    """
    # Convert all arguments to strings and join
    key_parts = [str(arg) for arg in args]
    key_string = "|".join(key_parts)

    # Use SHA-256 for consistent, collision-resistant keys
    return hashlib.sha256(key_string.encode()).hexdigest()[:16]


def cache_route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    result: Any,
) -> None:
    """Cache a route calculation result."""
    # Round coordinates to reduce key variations
    key = make_cache_key(
        "route",
        round(origin_lat, 5),
        round(origin_lon, 5),
        round(dest_lat, 5),
        round(dest_lon, 5),
    )
    _route_cache.set(key, result)


def get_cached_route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
) -> Any | None:
    """Get cached route calculation if available."""
    key = make_cache_key(
        "route",
        round(origin_lat, 5),
        round(origin_lon, 5),
        round(dest_lat, 5),
        round(dest_lon, 5),
    )
    return _route_cache.get(key)


def cache_osrm_route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    result: Any,
) -> None:
    key = make_cache_key(
        "osrm",
        round(origin_lat, 5),
        round(origin_lon, 5),
        round(dest_lat, 5),
        round(dest_lon, 5),
    )
    _osrm_route_cache.set(key, result)


def get_cached_osrm_route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
) -> Any | None:
    key = make_cache_key(
        "osrm",
        round(origin_lat, 5),
        round(origin_lon, 5),
        round(dest_lat, 5),
        round(dest_lon, 5),
    )
    return _osrm_route_cache.get(key)


def cache_geocode(query: str, results: list[Any]) -> None:
    """Cache geocoding results."""
    key = make_cache_key("geocode", query.lower().strip())
    _geocode_cache.set(key, results)


def get_cached_geocode(query: str) -> list[Any] | None:
    """Get cached geocoding results if available."""
    key = make_cache_key("geocode", query.lower().strip())
    return _geocode_cache.get(key)


def cache_traffic(lat: float, lon: float, radius_km: float, result: Any) -> None:
    """Cache traffic conditions."""
    key = make_cache_key(
        "traffic",
        round(lat, 4),  # Less precision for traffic areas
        round(lon, 4),
        round(radius_km, 1),
    )
    _traffic_cache.set(key, result)


def get_cached_traffic(lat: float, lon: float, radius_km: float) -> Any | None:
    """Get cached traffic conditions if available."""
    key = make_cache_key(
        "traffic",
        round(lat, 4),
        round(lon, 4),
        round(radius_km, 1),
    )
    return _traffic_cache.get(key)


def get_all_cache_stats() -> dict[str, Any]:
    """Get statistics for all cache instances."""
    return {
        "routes": _route_cache.get_stats(),
        "osrm_routes": _osrm_route_cache.get_stats(),
        "geocoding": _geocode_cache.get_stats(),
        "traffic": _traffic_cache.get_stats(),
    }


def clear_all_caches() -> None:
    """Clear all cache instances."""
    _route_cache.clear()
    _osrm_route_cache.clear()
    _geocode_cache.clear()
    _traffic_cache.clear()
    logger.info("Cleared all caches")


__all__ = [
    "TTLCache",
    "CacheEntry",
    "make_cache_key",
    "cache_route",
    "get_cached_route",
    "cache_osrm_route",
    "get_cached_osrm_route",
    "cache_geocode",
    "get_cached_geocode",
    "cache_traffic",
    "get_cached_traffic",
    "get_all_cache_stats",
    "clear_all_caches",
]
