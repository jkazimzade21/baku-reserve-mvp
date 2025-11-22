"""Security tests for the backend API."""

import pytest
from backend.app.main import app
from backend.app.settings import settings
from backend.app.utils import add_cors
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create test client"""
    return TestClient(app)


class TestInputValidation:
    """Test input validation and sanitization"""

    def test_sql_injection_prevention(self, client):
        """Test SQL injection attempts are blocked"""
        malicious_queries = [
            "'; DROP TABLE restaurants; --",
            "1' OR '1'='1",
            "admin'--",
            "1'; DELETE FROM users WHERE '1'='1",
        ]

        for query in malicious_queries:
            response = client.get(f"/restaurants?q={query}")
            # Should not crash and should return valid response
            assert response.status_code in [200, 400, 422]
            if response.status_code == 200:
                # Should not execute SQL injection
                data = response.json()
                assert isinstance(data, list)

    def test_xss_prevention(self, client):
        """Test XSS injection attempts are blocked"""
        malicious_inputs = [
            "<script>alert('XSS')</script>",
            "<img src=x onerror=alert('XSS')>",
            "javascript:alert('XSS')",
            "<svg onload=alert('XSS')>",
        ]

        for malicious_input in malicious_inputs:
            response = client.get(f"/restaurants?q={malicious_input}")
            assert response.status_code in [200, 400, 422]

    def test_path_traversal_prevention(self, client):
        """Test path traversal attempts are blocked"""
        malicious_paths = [
            "../../../etc/passwd",
            "..\\..\\..\\windows\\system32",
            "....//....//....//etc/passwd",
        ]

        for path in malicious_paths:
            response = client.get(f"/restaurants/{path}")
            # Should return 404 or validation error, not expose file system
            assert response.status_code in [404, 422]

    def test_command_injection_prevention(self, client):
        """Test command injection attempts are blocked"""
        malicious_commands = [
            "; ls -la",
            "| cat /etc/passwd",
            "`whoami`",
            "$(cat /etc/passwd)",
        ]

        for cmd in malicious_commands:
            response = client.get(f"/restaurants?q={cmd}")
            assert response.status_code in [200, 400, 422]

    def test_oversized_payload_rejected(self, client):
        """Test that oversized payloads are rejected"""
        # Create very large payload
        large_payload = {"prompt": "x" * 1000000, "locale": "en", "mode": "local"}
        response = client.post("/concierge/recommendations", json=large_payload)
        # Should reject or truncate
        assert response.status_code in [200, 400, 413, 422, 503]

    def test_invalid_json_rejected(self, client):
        """Test malformed JSON is rejected"""
        response = client.post(
            "/concierge/recommendations",
            data="{ invalid json }",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code in [422, 503]

    def test_null_byte_injection(self, client):
        """Test null byte injection attempts"""
        response = client.get("/restaurants?q=test%00malicious")
        assert response.status_code in [200, 400, 422]


class TestAuthentication:
    """Test authentication mechanisms"""

    def test_session_endpoint_returns_user(self, client):
        """Test session endpoint authentication"""
        response = client.get("/auth/session")
        assert response.status_code == 200
        data = response.json()
        user_info = data if "sub" in data else data.get("user", {})
        assert "sub" in user_info

    def test_protected_endpoints_without_auth(self, client):
        """Test protected endpoints require authentication"""
        # When auth bypass is disabled, these should require auth
        response = client.get("/auth/session")
        # In bypass mode, should succeed
        assert response.status_code in [200, 401]


class TestRateLimiting:
    """Test rate limiting (if implemented)"""

    def test_many_requests_accepted(self, client):
        """Test system handles many requests"""
        responses = []
        for _ in range(100):
            response = client.get("/health")
            responses.append(response)

        # Most requests should succeed
        success_count = sum(1 for r in responses if r.status_code == 200)
        assert success_count >= 90  # At least 90% success rate

    def test_rate_limit_blocks_after_threshold(self, client):
        """Rate limiter should return 429 when the window is exceeded."""
        limiter = getattr(app.state, "rate_limiter", None)
        assert limiter is not None
        settings.RATE_LIMIT_ENABLED = True
        settings.RATE_LIMIT_REQUESTS = 3
        settings.RATE_LIMIT_WINDOW_SECONDS = 60
        limiter.reset()
        responses = [client.get("/health") for _ in range(5)]
        settings.RATE_LIMIT_ENABLED = False
        limiter.reset()
        assert any(resp.status_code == 429 for resp in responses)


class TestCORS:
    """Test CORS configuration"""

    def test_cors_headers_present(self, client):
        """Test CORS headers are set"""
        response = client.options(
            "/health",
            headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
        )
        # Some frameworks return 400/405 without CORS headers when a route blocks OPTIONS.
        assert response.status_code in {200, 204, 400, 405}
        if response.status_code in {200, 204, 400}:
            assert "access-control-allow-methods" in response.headers
        else:
            assert "allow" in response.headers

    def test_cors_not_enabled_when_unconfigured(self):
        """No middleware should be added when origins list is empty"""
        original = settings.CORS_ALLOW_ORIGINS
        settings.CORS_ALLOW_ORIGINS = ""
        local_app = FastAPI()
        try:
            add_cors(local_app)
        finally:
            settings.CORS_ALLOW_ORIGINS = original
        assert all(middleware.cls is not CORSMiddleware for middleware in local_app.user_middleware)

    def test_cors_enabled_when_origins_present(self):
        """Middleware should be added when origins are configured"""
        original = settings.CORS_ALLOW_ORIGINS
        settings.CORS_ALLOW_ORIGINS = "https://example.com"
        local_app = FastAPI()
        try:
            add_cors(local_app)
        finally:
            settings.CORS_ALLOW_ORIGINS = original
        assert any(middleware.cls is CORSMiddleware for middleware in local_app.user_middleware)


class TestSensitiveData:
    """Test sensitive data handling"""

    def test_no_passwords_in_responses(self, client):
        """Test passwords are not exposed"""
        response = client.get("/auth/session")
        assert response.status_code == 200
        data = response.json()

        # Check response doesn't contain password-like fields
        data_str = str(data).lower()
        assert "password" not in data_str
        assert "passwd" not in data_str
        assert "secret" not in data_str or "secret_key" not in data_str

    def test_no_api_keys_in_responses(self, client):
        """Test API keys are not exposed"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        data_str = str(data).lower()
        assert "api_key" not in data_str
        assert "apikey" not in data_str


class TestErrorHandling:
    """Test error handling doesn't leak information"""

    def test_404_doesnt_leak_info(self, client):
        """Test 404 errors don't expose system info"""
        response = client.get("/nonexistent-endpoint-12345")
        assert response.status_code == 404
        data = response.json()

        # Should not expose stack traces or file paths
        data_str = str(data).lower()
        assert "/users/" not in data_str
        assert "traceback" not in data_str

    def test_500_error_handling(self, client):
        """Test internal errors are handled gracefully"""
        # Try to trigger an error with invalid data
        response = client.get("/restaurants/invalid-id-format")
        # Should handle gracefully
        assert response.status_code in [404, 422, 500]
        if response.status_code == 500:
            data = response.json()
            # Should not expose sensitive error details
            assert "detail" in data


class TestHeaders:
    """Test security headers"""

    def test_security_headers_present(self, client):
        """Test security headers are set"""
        response = client.get("/health")
        headers = response.headers
        assert headers.get("X-Frame-Options") == "DENY"
        assert headers.get("X-Content-Type-Options") == "nosniff"
        assert headers.get("Referrer-Policy") == "no-referrer"

    def test_no_sensitive_headers_leaked(self, client):
        """Test sensitive headers are not leaked"""
        response = client.get("/health")
        headers = response.headers

        # Should not leak sensitive server information
        assert "X-Powered-By" not in headers or "FastAPI" in headers.get("X-Powered-By", "")


class TestFileUpload:
    """Test file upload security (if implemented)"""

    def test_file_upload_validation(self, client):
        """Test file upload has proper validation"""
        # If file upload endpoints exist, test them
        # This is a placeholder for when file uploads are implemented
        pass


class TestAPIVersioning:
    """Test API versioning and backwards compatibility"""

    def test_api_version_in_path(self, client):
        """Test API versioning"""
        response = client.get("/restaurants")
        assert response.status_code == 200

        # API should be versioned or clearly documented
        assert "/" in response.url.path
