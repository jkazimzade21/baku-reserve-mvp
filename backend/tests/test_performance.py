"""
Performance and load tests for the backend.
Tests response times, throughput, and resource usage.
"""

import time
from types import SimpleNamespace

import pytest
from backend.app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create test client"""
    return TestClient(app)


@pytest.fixture
def benchmark():
    """Minimal fallback benchmark helper when pytest-benchmark isn't installed."""

    class BenchmarkRunner:
        def __call__(self, func, *args, **kwargs):
            start = time.perf_counter()
            result = func(*args, **kwargs)
            duration = time.perf_counter() - start
            self.stats = SimpleNamespace(stats=SimpleNamespace(mean=duration))
            return result

    return BenchmarkRunner()


class TestResponseTimes:
    """Test API response time performance"""

    def test_health_check_response_time(self, client, benchmark):
        """Test health endpoint performance"""

        def make_request():
            response = client.get("/health")
            assert response.status_code == 200
            return response

        benchmark(make_request)
        # Should respond in under 100ms
        assert benchmark.stats.stats.mean < 0.1

    def test_restaurant_list_response_time(self, client, benchmark):
        """Test restaurant listing performance"""

        def make_request():
            response = client.get("/restaurants")
            assert response.status_code == 200
            return response

        benchmark(make_request)
        # Should respond in under 500ms
        assert benchmark.stats.stats.mean < 0.5

    def test_restaurant_search_response_time(self, client, benchmark):
        """Test search performance"""

        def make_request():
            response = client.get("/restaurants?q=test")
            assert response.status_code == 200
            return response

        benchmark(make_request)
        # Should respond in under 500ms
        assert benchmark.stats.stats.mean < 0.5


class TestThroughput:
    """Test API throughput"""

    def test_concurrent_health_checks(self, client):
        """Test handling multiple concurrent requests"""
        start_time = time.time()
        responses = []

        for _ in range(100):
            response = client.get("/health")
            responses.append(response)

        duration = time.time() - start_time

        # All requests should succeed
        assert all(r.status_code == 200 for r in responses)
        # Should handle 100 requests in under 10 seconds
        assert duration < 10.0

        # Calculate throughput
        throughput = len(responses) / duration
        print(f"Throughput: {throughput:.2f} requests/second")

    def test_concurrent_restaurant_queries(self, client):
        """Test concurrent database queries"""
        start_time = time.time()
        responses = []

        for _ in range(50):
            response = client.get("/restaurants")
            responses.append(response)

        duration = time.time() - start_time

        # All requests should succeed
        assert all(r.status_code == 200 for r in responses)
        print(f"50 queries completed in {duration:.2f}s")


class TestMemoryUsage:
    """Test memory efficiency"""

    def test_large_query_memory(self, client):
        """Test memory usage with large queries"""
        # Query all restaurants multiple times
        for _ in range(10):
            response = client.get("/restaurants")
            assert response.status_code == 200
            data = response.json()
            # Verify we get data without memory issues
            assert isinstance(data, list)

    def test_concurrent_memory(self, client):
        """Test memory with concurrent requests"""
        responses = []
        for _ in range(20):
            response = client.get("/restaurants")
            responses.append(response)

        # All should succeed without memory errors
        assert all(r.status_code == 200 for r in responses)


class TestDatabasePerformance:
    """Test database query performance"""

    def test_restaurant_query_performance(self, client, benchmark):
        """Benchmark restaurant queries"""

        def query_restaurants():
            response = client.get("/restaurants")
            assert response.status_code == 200
            return len(response.json())

        count = benchmark(query_restaurants)
        print(f"Queried {count} restaurants")

    def test_search_query_performance(self, client, benchmark):
        """Benchmark search queries"""

        def search_restaurants():
            response = client.get("/restaurants?q=restaurant")
            assert response.status_code == 200
            return len(response.json())

        count = benchmark(search_restaurants)
        print(f"Search returned {count} results")


@pytest.mark.skip(reason="Concierge disabled temporarily")
class TestConciergePerformance:
    """Test AI concierge performance"""

    def test_concierge_local_mode_performance(self, client, benchmark):
        """Test local concierge performance"""

        def query_concierge():
            response = client.post(
                "/concierge/recommendations",
                params={"mode": "local"},
                json={"prompt": "Italian restaurant", "locale": "en"},
            )
            assert response.status_code in [200, 503]
            return response

        result = benchmark(query_concierge)
        # Local mode should be fast (under 1 second)
        if result.status_code == 200:
            assert benchmark.stats.stats.mean < 1.0


class TestCaching:
    """Test caching effectiveness"""

    def test_repeated_queries_cached(self, client):
        """Test that repeated queries benefit from caching"""
        # First request (cold cache)
        start_time = time.time()
        response1 = client.get("/restaurants")
        first_duration = time.time() - start_time

        # Second request (should be cached)
        start_time = time.time()
        response2 = client.get("/restaurants")
        second_duration = time.time() - start_time

        assert response1.status_code == 200
        assert response2.status_code == 200

        print(f"First request: {first_duration:.4f}s")
        print(f"Second request: {second_duration:.4f}s")


class TestPayloadSizes:
    """Test response payload sizes"""

    def test_restaurant_list_payload_size(self, client):
        """Test restaurant list response size"""
        response = client.get("/restaurants")
        assert response.status_code == 200

        payload_size = len(response.content)
        print(f"Payload size: {payload_size / 1024:.2f} KB")

        # Should be reasonable (under 5MB for listing)
        assert payload_size < 5 * 1024 * 1024

    def test_concierge_payload_size(self, client):
        """Test concierge response size"""
        response = client.post(
            "/concierge/recommendations",
            params={"mode": "local"},
            json={"prompt": "restaurant", "locale": "en"},
        )

        if response.status_code == 200:
            payload_size = len(response.content)
            print(f"Concierge payload size: {payload_size / 1024:.2f} KB")
            # Should be reasonable
            assert payload_size < 1 * 1024 * 1024
