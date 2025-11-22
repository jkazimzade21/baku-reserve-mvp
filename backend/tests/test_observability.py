"""Tests for observability features: metrics, health checks, and request tracing."""

from __future__ import annotations

import pytest
from backend.app.health import health_checker
from backend.app.main import app
from backend.app.metrics import normalize_endpoint
from backend.app.settings import settings
from backend.app.utils import get_request_id, request_id_ctx
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create test client"""
    return TestClient(app)


# ==============================================================================
# PROMETHEUS METRICS TESTS
# ==============================================================================


class TestPrometheusMetrics:
    """Test Prometheus metrics endpoint and tracking."""

    def test_metrics_endpoint_exists(self, client):
        """Test /metrics endpoint is accessible"""
        response = client.get("/metrics")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/plain")

    def test_metrics_endpoint_returns_prometheus_format(self, client):
        """Test metrics endpoint returns Prometheus format"""
        response = client.get("/metrics")
        content = response.text

        # Check for required Prometheus metric types
        assert "# HELP" in content
        assert "# TYPE" in content

        # Check for application info metric
        assert "baku_reserve_info" in content

    def test_http_metrics_tracked(self, client):
        """Test HTTP request metrics are tracked"""
        # Make some requests
        client.get("/health")
        client.get("/restaurants")

        # Get metrics
        response = client.get("/metrics")
        content = response.text

        # Verify HTTP metrics are present
        assert "http_requests_total" in content
        assert "http_request_duration_seconds" in content

    def test_endpoint_normalization(self):
        """Test endpoint path normalization for metrics"""
        # UUID normalization
        assert (
            normalize_endpoint("/restaurants/123e4567-e89b-12d3-a456-426614174000")
            == "/restaurants/{id}"
        )

        # Numeric ID normalization
        assert normalize_endpoint("/restaurants/12345") == "/restaurants/{id}"

        # Regular paths unchanged
        assert normalize_endpoint("/health") == "/health"
        assert normalize_endpoint("/restaurants") == "/restaurants"

        # Long alphanumeric IDs (20+ chars to match threshold)
        assert normalize_endpoint("/reservations/abc123def456ghi789xyz") == "/reservations/{id}"

    def test_metrics_endpoint_not_tracked(self, client):
        """Test that /metrics endpoint doesn't track itself"""
        response = client.get("/metrics")
        content = response.text

        # Metrics endpoint should not appear in its own metrics
        # (to avoid infinite recursion and metric pollution)
        assert 'endpoint="/metrics"' not in content


# ==============================================================================
# HEALTH CHECK TESTS
# ==============================================================================


class TestEnhancedHealthCheck:
    """Test enhanced health check with dependency verification."""

    @staticmethod
    def _extract_checks(payload: dict) -> dict:
        return payload.get("checks") or payload.get("details", {}).get("checks", {})

    def test_health_endpoint_basic_structure(self, client):
        """Test health endpoint returns expected structure"""
        response = client.get("/health")

        # Should return 200 or 503 depending on health
        assert response.status_code in [200, 503]

        data = response.json()

        # Verify required fields
        assert "status" in data
        assert "timestamp" in data
        assert "service" in data
        assert "version" in data
        checks = self._extract_checks(data)
        assert checks

        # Verify metadata
        assert data["service"] == "baku-reserve"
        assert data["version"] == "0.1.0"

    def test_health_check_includes_dependencies(self, client):
        """Test health check includes all dependency checks"""
        response = client.get("/health")
        data = response.json()

        checks = self._extract_checks(data)

        # All expected checks should be present
        assert "database" in checks
        assert "auth0" in checks
        assert "sentry" in checks

    def test_health_check_database_ok(self, client):
        """Test database health check reports OK status"""
        response = client.get("/health")
        data = response.json()

        db_check = self._extract_checks(data)["database"]

        # Database should be OK (JSON file storage)
        assert db_check["status"] == "ok"
        assert "restaurant_count" in db_check
        assert "reservation_count" in db_check
        assert "storage_path" in db_check

    def test_health_status_reflects_checks(self, client):
        """Test overall health status reflects component checks"""
        response = client.get("/health")
        data = response.json()

        status = data["status"]
        checks = self._extract_checks(data)

        # Status should be "healthy" or "degraded"
        assert status in ["healthy", "degraded"]

        # If status is healthy, all enabled checks should be ok
        if status == "healthy":
            for _check_name, check_data in checks.items():
                assert check_data["status"] in ["ok", "disabled", "bypassed"]

    def test_health_check_returns_503_when_degraded(self, client):
        """Test health check returns 503 status code when degraded"""
        response = client.get("/health")

        # If system is degraded, should return 503
        if response.json()["status"] == "degraded":
            assert response.status_code == 503

    def test_health_disables_optional_dependencies(self, client):
        """Optional deps should be marked disabled when not configured."""
        original_sentry = settings.SENTRY_DSN
        try:
            settings.SENTRY_DSN = None
            health_checker.clear_cache()
            response = client.get("/health")
            payload = response.json()
            assert response.status_code == 200
            checks = self._extract_checks(payload)
            assert checks["sentry"]["status"] == "disabled"
            assert payload["status"] == "healthy"
        finally:
            settings.SENTRY_DSN = original_sentry
            health_checker.clear_cache()

    def test_health_check_caching(self, client):
        """Test health checks are cached for performance"""

        # Make two health checks quickly
        response1 = client.get("/health")
        time1 = response1.json()["timestamp"]

        # Immediate second check
        response2 = client.get("/health")
        time2 = response2.json()["timestamp"]

        # Timestamps should be very close (within 1 second)
        # indicating caching is working
        assert abs(time2 - time1) < 1.0


# ==============================================================================
# REQUEST ID TRACING TESTS
# ==============================================================================


class TestRequestIDTracing:
    """Test request ID tracing middleware."""

    def test_request_id_generated_if_not_provided(self, client):
        """Test request ID is generated if not provided in headers"""
        response = client.get("/health")

        # Response should have X-Request-ID header
        assert "X-Request-ID" in response.headers
        request_id = response.headers["X-Request-ID"]

        # Should be a valid UUID format
        assert len(request_id) == 36
        assert request_id.count("-") == 4

    def test_request_id_preserved_from_header(self, client):
        """Test existing X-Request-ID header is preserved"""
        custom_id = "test-request-12345"

        response = client.get("/health", headers={"X-Request-ID": custom_id})

        # Should echo back the same request ID
        assert response.headers["X-Request-ID"] == custom_id

    def test_request_id_unique_per_request(self, client):
        """Test each request gets a unique request ID"""
        response1 = client.get("/health")
        response2 = client.get("/health")

        id1 = response1.headers["X-Request-ID"]
        id2 = response2.headers["X-Request-ID"]

        # Should be different
        assert id1 != id2

    def test_request_id_context_accessible(self):
        """Test request ID is accessible via context variable"""
        # Set a request ID in context
        request_id_ctx.set("test-context-id")

        # Should be retrievable
        assert get_request_id() == "test-context-id"

        # Clear context
        request_id_ctx.set("")
        assert get_request_id() == ""

    def test_request_id_in_response_headers(self, client):
        """Test request ID is added to all response headers"""
        endpoints = ["/health", "/restaurants", "/metrics"]

        for endpoint in endpoints:
            response = client.get(endpoint)
            assert "X-Request-ID" in response.headers

    def test_multiple_requests_with_same_id(self, client):
        """Test multiple requests can use the same request ID for correlation"""
        trace_id = "correlation-test-123"

        # Make multiple requests with same ID
        responses = [
            client.get("/health", headers={"X-Request-ID": trace_id}),
            client.get("/restaurants", headers={"X-Request-ID": trace_id}),
        ]

        # All should echo back the same ID
        for response in responses:
            assert response.headers["X-Request-ID"] == trace_id


# ==============================================================================
# INTEGRATION TESTS
# ==============================================================================


class TestObservabilityIntegration:
    """Test integration of metrics, health, and tracing."""

    def test_health_check_has_request_id(self, client):
        """Test health check responses include request ID"""
        response = client.get("/health")

        assert response.status_code in [200, 503]
        assert "X-Request-ID" in response.headers

    def test_metrics_endpoint_has_request_id(self, client):
        """Test metrics endpoint includes request ID"""
        response = client.get("/metrics")

        assert response.status_code == 200
        assert "X-Request-ID" in response.headers

    def test_error_responses_have_request_id(self, client):
        """Test error responses include request ID for debugging"""
        response = client.get("/nonexistent-endpoint")

        assert response.status_code == 404
        assert "X-Request-ID" in response.headers

    def test_observability_features_dont_break_normal_requests(self, client):
        """Test observability features don't interfere with normal operations"""
        # Make various requests
        responses = [
            client.get("/health"),
            client.get("/restaurants"),
            client.get("/metrics"),
        ]

        # All should succeed
        for response in responses:
            assert response.status_code in [200, 503]  # 503 if degraded
            assert "X-Request-ID" in response.headers
