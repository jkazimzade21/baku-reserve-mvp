"""Test caching implementation."""

import time

from backend.app.cache import (
    CacheEntry,
    TTLCache,
    cache_geocode,
    cache_route,
    cache_traffic,
    clear_all_caches,
    get_cached_geocode,
    get_cached_route,
    get_cached_traffic,
    make_cache_key,
)


class TestCacheEntry:
    """Test cache entry functionality."""

    def test_entry_creation(self):
        """Cache entry should store value and expiry time."""
        entry = CacheEntry("test_value", time.time() + 10)
        assert entry.value == "test_value"
        assert not entry.is_expired()
        assert entry.hits == 0

    def test_entry_expiration(self):
        """Cache entry should detect expiration."""
        # Already expired
        entry = CacheEntry("value", time.time() - 1)
        assert entry.is_expired()

        # Not yet expired
        entry = CacheEntry("value", time.time() + 10)
        assert not entry.is_expired()

    def test_entry_hit_tracking(self):
        """Cache entry should track hits."""
        entry = CacheEntry("value", time.time() + 10)
        assert entry.hits == 0

        entry.increment_hits()
        entry.increment_hits()
        assert entry.hits == 2


class TestTTLCache:
    """Test TTL cache functionality."""

    def test_cache_initialization(self):
        """Cache should initialize with correct parameters."""
        cache = TTLCache("test", max_size=100, default_ttl=60)
        assert cache.name == "test"
        assert cache.max_size == 100
        assert cache.default_ttl == 60
        assert cache.enabled is True

    def test_cache_get_set(self):
        """Cache should store and retrieve values."""
        cache = TTLCache("test", default_ttl=10)

        # Set a value
        cache.set("key1", "value1")

        # Get the value
        result = cache.get("key1")
        assert result == "value1"

        # Non-existent key
        result = cache.get("non_existent")
        assert result is None

    def test_cache_expiration(self):
        """Cache should expire entries after TTL."""
        cache = TTLCache("test", default_ttl=0.1)

        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"

        # Wait for expiration
        time.sleep(0.15)
        assert cache.get("key1") is None

    def test_cache_custom_ttl(self):
        """Cache should respect custom TTL per entry."""
        cache = TTLCache("test", default_ttl=10)

        # Set with custom short TTL
        cache.set("short", "value", ttl=0.1)
        # Set with default TTL
        cache.set("long", "value")

        assert cache.get("short") == "value"
        assert cache.get("long") == "value"

        # Wait for short TTL to expire
        time.sleep(0.15)
        assert cache.get("short") is None
        assert cache.get("long") == "value"

    def test_cache_lru_eviction(self):
        """Cache should evict LRU entry when full."""
        cache = TTLCache("test", max_size=3, default_ttl=10)

        # Fill the cache
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")

        # Access key1 and key2 to make them more recently used
        cache.get("key1")
        cache.get("key2")

        # Add a new entry - should evict key3 (LRU)
        cache.set("key4", "value4")

        assert cache.get("key1") == "value1"
        assert cache.get("key2") == "value2"
        assert cache.get("key3") is None  # Evicted
        assert cache.get("key4") == "value4"

    def test_cache_disabled(self):
        """Disabled cache should not store anything."""
        cache = TTLCache("test", enabled=False)

        cache.set("key1", "value1")
        result = cache.get("key1")
        assert result is None

    def test_cache_clear(self):
        """Cache clear should remove all entries."""
        cache = TTLCache("test")

        cache.set("key1", "value1")
        cache.set("key2", "value2")
        assert cache.get("key1") == "value1"

        cache.clear()
        assert cache.get("key1") is None
        assert cache.get("key2") is None

    def test_cache_cleanup_expired(self):
        """Cache cleanup should remove only expired entries."""
        cache = TTLCache("test", default_ttl=10)

        # Set entries with different TTLs
        cache.set("expire1", "value", ttl=0.1)
        cache.set("expire2", "value", ttl=0.1)
        cache.set("keep", "value", ttl=10)

        time.sleep(0.15)

        # Cleanup expired
        removed = cache.cleanup_expired()
        assert removed == 2
        assert cache.get("keep") == "value"
        assert cache.get("expire1") is None
        assert cache.get("expire2") is None

    def test_cache_stats(self):
        """Cache should track statistics correctly."""
        cache = TTLCache("test", max_size=10)

        # Generate some hits and misses
        cache.set("key1", "value1")
        cache.get("key1")  # Hit
        cache.get("key1")  # Hit
        cache.get("missing")  # Miss
        cache.get("missing")  # Miss

        stats = cache.get_stats()
        assert stats["name"] == "test"
        assert stats["size"] == 1
        assert stats["hits"] == 2
        assert stats["misses"] == 2
        assert stats["hit_rate"] == 0.5


class TestCacheHelpers:
    """Test cache helper functions."""

    def test_make_cache_key(self):
        """Cache key generation should be consistent."""
        # Same arguments should produce same key
        key1 = make_cache_key("route", 40.1, 49.2, 40.3, 49.4)
        key2 = make_cache_key("route", 40.1, 49.2, 40.3, 49.4)
        assert key1 == key2

        # Different arguments should produce different keys
        key3 = make_cache_key("route", 40.2, 49.2, 40.3, 49.4)
        assert key1 != key3

        # Different types should be handled
        key4 = make_cache_key("test", 123, "string", None, True)
        assert len(key4) == 16  # Truncated hash

    def test_route_caching(self):
        """Route caching helpers should work correctly."""
        clear_all_caches()

        route_data = {"distance": 10, "duration": 600}

        # Cache a route
        cache_route(40.1, 49.2, 40.3, 49.4, route_data)

        # Retrieve cached route
        cached = get_cached_route(40.1, 49.2, 40.3, 49.4)
        assert cached == route_data

        # Different coordinates should not match
        cached = get_cached_route(40.2, 49.2, 40.3, 49.4)
        assert cached is None

    def test_geocode_caching(self):
        """Geocode caching helpers should work correctly."""
        clear_all_caches()

        results = [{"name": "Place 1"}, {"name": "Place 2"}]

        # Cache geocoding results
        cache_geocode("Sahil", results)

        # Retrieve cached results
        cached = get_cached_geocode("Sahil")
        assert cached == results

        # Case sensitivity in query
        cached = get_cached_geocode("sahil")  # Lowercase
        assert cached == results  # Should match due to normalization

    def test_traffic_caching(self):
        """Traffic caching helpers should work correctly."""
        clear_all_caches()

        traffic_data = {"severity": 2, "speed": 30}

        # Cache traffic conditions
        cache_traffic(40.1, 49.2, 2.0, traffic_data)

        # Retrieve cached traffic
        cached = get_cached_traffic(40.1, 49.2, 2.0)
        assert cached == traffic_data

        # Different radius should not match
        cached = get_cached_traffic(40.1, 49.2, 3.0)
        assert cached is None

    def test_clear_all_caches(self):
        """Clear all caches should remove all cached data."""
        # Add data to different caches
        cache_route(40.1, 49.2, 40.3, 49.4, {"data": "route"})
        cache_geocode("test", [{"data": "geocode"}])
        cache_traffic(40.1, 49.2, 2.0, {"data": "traffic"})

        # Verify data is cached
        assert get_cached_route(40.1, 49.2, 40.3, 49.4) is not None
        assert get_cached_geocode("test") is not None
        assert get_cached_traffic(40.1, 49.2, 2.0) is not None

        # Clear all caches
        clear_all_caches()

        # Verify all caches are empty
        assert get_cached_route(40.1, 49.2, 40.3, 49.4) is None
        assert get_cached_geocode("test") is None
        assert get_cached_traffic(40.1, 49.2, 2.0) is None
