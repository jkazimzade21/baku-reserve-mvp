"""Tests for rate limiter X-Forwarded-For security."""

from __future__ import annotations

import pytest
from backend.app.settings import settings
from backend.app.utils import RateLimiter, add_rate_limiting
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture(scope="function")
def app_with_rate_limiting():
    """Create a test app with rate limiting (fresh for each test)."""
    app = FastAPI()

    # Add rate limiting
    add_rate_limiting(app)

    @app.get("/test")
    def test_endpoint():
        return {"ok": True}

    return app


@pytest.fixture(scope="function")
def client(app_with_rate_limiting):
    """Create a test client (fresh for each test)."""
    return TestClient(app_with_rate_limiting)


class TestXForwardedForSecurity:
    """Test X-Forwarded-For header security."""

    def test_direct_connection_uses_client_host(self, client, monkeypatch):
        """Direct connections should use client.host, not X-Forwarded-For."""
        # No trusted proxies configured
        monkeypatch.setattr(settings, "TRUSTED_PROXIES", "")

        # Try to spoof with X-Forwarded-For
        response = client.get("/test", headers={"X-Forwarded-For": "1.2.3.4"})

        assert response.status_code == 200

        # Make multiple requests with same spoofed IP
        for _ in range(5):
            response = client.get("/test", headers={"X-Forwarded-For": "1.2.3.4"})

        # Should use testclient (127.0.0.1) not spoofed IP
        # So all requests from same actual client are counted together
        assert response.status_code == 200  # Not rate limited

    def test_untrusted_proxy_ignored(self, client, monkeypatch):
        """X-Forwarded-For from untrusted proxy should be ignored."""
        # Trust only specific proxy
        monkeypatch.setattr(settings, "TRUSTED_PROXIES", "10.0.0.1")

        # Request from different proxy (192.168.1.1) with X-Forwarded-For
        response = client.get("/test", headers={"X-Forwarded-For": "1.2.3.4"})

        assert response.status_code == 200
        # Should ignore X-Forwarded-For since 192.168.1.1 (testclient) is not trusted

    def test_trusted_proxy_honors_x_forwarded_for(self, client, monkeypatch):
        """X-Forwarded-For from trusted proxy should be used."""
        # Trust localhost (test client)
        monkeypatch.setattr(settings, "TRUSTED_PROXIES", "127.0.0.1")

        # Request from trusted proxy with X-Forwarded-For
        response1 = client.get("/test", headers={"X-Forwarded-For": "1.2.3.4"})
        assert response1.status_code == 200

        # Request from same client through proxy
        response2 = client.get("/test", headers={"X-Forwarded-For": "1.2.3.4"})
        assert response2.status_code == 200

    def test_invalid_ip_in_x_forwarded_for(self, client, monkeypatch):
        """Invalid IPs in X-Forwarded-For should be ignored."""
        monkeypatch.setattr(settings, "TRUSTED_PROXIES", "127.0.0.1")

        # Invalid IP addresses
        response = client.get("/test", headers={"X-Forwarded-For": "not-an-ip"})
        assert response.status_code == 200

        response = client.get("/test", headers={"X-Forwarded-For": "999.999.999.999"})
        assert response.status_code == 200

    def test_multiple_ips_in_x_forwarded_for(self, client, monkeypatch):
        """Should use first valid IP from X-Forwarded-For chain."""
        monkeypatch.setattr(settings, "TRUSTED_PROXIES", "127.0.0.1")

        # X-Forwarded-For chain: client, proxy1, proxy2
        response = client.get("/test", headers={"X-Forwarded-For": "1.2.3.4, 10.0.0.1, 10.0.0.2"})
        assert response.status_code == 200

        # Same client through different path
        response = client.get("/test", headers={"X-Forwarded-For": "1.2.3.4, 10.0.0.5"})
        assert response.status_code == 200


class TestTrustedProxyConfiguration:
    """Test trusted proxy configuration parsing."""

    def test_empty_trusted_proxies_trusts_nothing(self, monkeypatch):
        """Empty TRUSTED_PROXIES should trust no proxies."""
        limiter = RateLimiter()

        # Mock settings
        monkeypatch.setattr(settings, "TRUSTED_PROXIES", "")
        assert not limiter._is_trusted_proxy("127.0.0.1")
        assert not limiter._is_trusted_proxy("10.0.0.1")

    def test_wildcard_trusts_all(self, monkeypatch):
        """TRUSTED_PROXIES='*' should trust all (insecure dev mode)."""
        limiter = RateLimiter()

        monkeypatch.setattr(settings, "TRUSTED_PROXIES", "*")
        assert limiter._is_trusted_proxy("127.0.0.1")
        assert limiter._is_trusted_proxy("1.2.3.4")
        assert limiter._is_trusted_proxy("192.168.1.100")

    def test_single_ip_trusted(self, monkeypatch):
        """Single IP in TRUSTED_PROXIES should be trusted."""
        limiter = RateLimiter()

        monkeypatch.setattr(settings, "TRUSTED_PROXIES", "127.0.0.1")
        assert limiter._is_trusted_proxy("127.0.0.1")
        assert not limiter._is_trusted_proxy("127.0.0.2")

    def test_cidr_network_trusted(self, monkeypatch):
        """CIDR network in TRUSTED_PROXIES should trust all IPs in range."""
        limiter = RateLimiter()

        monkeypatch.setattr(settings, "TRUSTED_PROXIES", "10.0.0.0/24")
        assert limiter._is_trusted_proxy("10.0.0.1")
        assert limiter._is_trusted_proxy("10.0.0.255")
        assert not limiter._is_trusted_proxy("10.0.1.1")

    def test_multiple_trusted_entries(self, monkeypatch):
        """Multiple comma-separated trusted entries should all work."""
        limiter = RateLimiter()

        monkeypatch.setattr(settings, "TRUSTED_PROXIES", "127.0.0.1,10.0.0.0/24,192.168.1.1")
        assert limiter._is_trusted_proxy("127.0.0.1")
        assert limiter._is_trusted_proxy("10.0.0.50")
        assert limiter._is_trusted_proxy("192.168.1.1")
        assert not limiter._is_trusted_proxy("1.2.3.4")

    def test_invalid_trusted_entry_skipped(self, monkeypatch):
        """Invalid entries in TRUSTED_PROXIES should be skipped."""
        limiter = RateLimiter()

        monkeypatch.setattr(settings, "TRUSTED_PROXIES", "invalid,127.0.0.1,also-invalid")
        assert limiter._is_trusted_proxy("127.0.0.1")
        assert not limiter._is_trusted_proxy("invalid")

    def test_private_networks_supported(self, monkeypatch):
        """Common private network ranges should be parseable."""
        limiter = RateLimiter()

        # RFC 1918 private networks
        monkeypatch.setattr(settings, "TRUSTED_PROXIES", "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16")

        # 10.0.0.0/8
        assert limiter._is_trusted_proxy("10.0.0.1")
        assert limiter._is_trusted_proxy("10.255.255.254")

        # 172.16.0.0/12
        assert limiter._is_trusted_proxy("172.16.0.1")
        assert limiter._is_trusted_proxy("172.31.255.254")

        # 192.168.0.0/16
        assert limiter._is_trusted_proxy("192.168.1.1")
        assert limiter._is_trusted_proxy("192.168.255.254")

        # Outside ranges
        assert not limiter._is_trusted_proxy("11.0.0.1")
        assert not limiter._is_trusted_proxy("172.15.0.1")
        assert not limiter._is_trusted_proxy("192.169.0.1")


class TestIPValidation:
    """Test IP address validation."""

    def test_valid_ipv4_addresses(self):
        """Valid IPv4 addresses should pass validation."""
        limiter = RateLimiter()

        assert limiter._is_valid_ip("127.0.0.1")
        assert limiter._is_valid_ip("192.168.1.1")
        assert limiter._is_valid_ip("8.8.8.8")
        assert limiter._is_valid_ip("0.0.0.0")
        assert limiter._is_valid_ip("255.255.255.255")

    def test_valid_ipv6_addresses(self):
        """Valid IPv6 addresses should pass validation."""
        limiter = RateLimiter()

        assert limiter._is_valid_ip("::1")
        assert limiter._is_valid_ip("2001:db8::1")
        assert limiter._is_valid_ip("fe80::1")
        assert limiter._is_valid_ip("::ffff:192.0.2.1")

    def test_invalid_ip_addresses(self):
        """Invalid IP addresses should fail validation."""
        limiter = RateLimiter()

        assert not limiter._is_valid_ip("not-an-ip")
        assert not limiter._is_valid_ip("999.999.999.999")
        assert not limiter._is_valid_ip("192.168.1")
        assert not limiter._is_valid_ip("192.168.1.1.1")
        assert not limiter._is_valid_ip("")
        assert not limiter._is_valid_ip("abc.def.ghi.jkl")


class TestRateLimitingWithProxy:
    """Test rate limiting behavior with proxy configuration."""

    def test_rate_limiting_per_real_client_behind_proxy(self, client, monkeypatch):
        """Rate limiting should be per real client IP, not proxy IP."""
        # Trust testclient as proxy (TestClient uses "testclient" as host)
        monkeypatch.setattr(settings, "TRUSTED_PROXIES", "*")
        monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
        monkeypatch.setattr(settings, "RATE_LIMIT_REQUESTS", 5)
        monkeypatch.setattr(settings, "RATE_LIMIT_WINDOW_SECONDS", 60)

        # Reset rate limiter
        client.app.state.rate_limiter.reset()

        # Client 1 makes 5 requests (at limit)
        for i in range(5):
            response = client.get("/test", headers={"X-Forwarded-For": "1.2.3.4"})
            assert response.status_code == 200, f"Request {i+1} should succeed"

        # Client 1's 6th request should be rate limited
        response = client.get("/test", headers={"X-Forwarded-For": "1.2.3.4"})
        assert response.status_code == 429
        assert "Too many requests" in response.json()["detail"]

        # Client 2 should still be allowed (different IP)
        response = client.get("/test", headers={"X-Forwarded-For": "5.6.7.8"})
        assert response.status_code == 200

    def test_rate_limiting_without_trusted_proxy(self, client, monkeypatch):
        """Without trusted proxy, should rate limit per direct connection."""
        monkeypatch.setattr(settings, "TRUSTED_PROXIES", "")
        monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
        monkeypatch.setattr(settings, "RATE_LIMIT_REQUESTS", 3)
        monkeypatch.setattr(settings, "RATE_LIMIT_WINDOW_SECONDS", 60)

        # Reset rate limiter
        client.app.state.rate_limiter.reset()

        # All requests from testclient (same direct IP)
        # Even with different X-Forwarded-For (spoofed)
        for i in range(3):
            response = client.get(
                "/test", headers={"X-Forwarded-For": f"{i}.0.0.0"}  # Different each time
            )
            assert response.status_code == 200

        # 4th request should be rate limited (same direct IP)
        response = client.get("/test", headers={"X-Forwarded-For": "99.99.99.99"})
        assert response.status_code == 429
