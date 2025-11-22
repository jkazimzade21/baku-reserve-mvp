"""Health check module with dependency verification."""

from __future__ import annotations

import time
from typing import Any

import httpx

from .settings import settings


def _is_configured(value: str | None) -> bool:
    """Return True when a config string is non-empty after trimming."""
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return bool(value)


class HealthChecker:
    """Health checker for monitoring service dependencies."""

    def __init__(self) -> None:
        self._check_cache: dict[str, tuple[dict[str, Any], float]] = {}
        self._cache_ttl = 30.0  # Cache health checks for 30 seconds

    async def check_all(self) -> dict[str, Any]:
        """
        Check health of all dependencies.

        Returns:
            Dict with overall status and individual component checks
        """
        sentry_configured = _is_configured(settings.SENTRY_DSN)
        auth0_configured = _is_configured(settings.AUTH0_DOMAIN)

        checks = {
            "database": await self._check_database(),
            "auth0": (
                await self._check_auth0()
                if auth0_configured and not settings.AUTH0_BYPASS
                else {"status": "bypassed"}
            ),
            "sentry": await self._check_sentry() if sentry_configured else {"status": "disabled"},
        }

        # Overall health is OK if all enabled checks pass
        all_ok = all(
            check.get("status") in {"ok", "disabled", "bypassed"} for check in checks.values()
        )

        return {
            "status": "healthy" if all_ok else "degraded",
            "timestamp": time.time(),
            "checks": checks,
        }

    async def _check_database(self) -> dict[str, Any]:
        """Check if database (JSON file storage) is accessible."""
        try:
            from .storage import DB

            # Try to read restaurants
            restaurants = DB.list_restaurants()
            restaurant_count = len(restaurants)

            # Try to read reservations
            reservations = await DB.list_reservations()
            reservation_count = len(reservations)

            return {
                "status": "ok",
                "restaurant_count": restaurant_count,
                "reservation_count": reservation_count,
                "storage_path": str(settings.data_dir),
            }
        except Exception as exc:
            return {
                "status": "error",
                "error": str(exc),
                "error_type": type(exc).__name__,
            }

    async def _check_auth0(self) -> dict[str, Any]:
        """Check if Auth0 JWKS endpoint is reachable."""
        cache_key = "auth0"
        cached = self._get_cached_check(cache_key)
        if cached is not None:
            return cached

        try:
            issuer = settings.auth0_issuer
            if not issuer:
                result = {"status": "disabled", "reason": "AUTH0_DOMAIN not configured"}
                self._cache_check(cache_key, result)
                return result

            url = issuer.rstrip("/") + "/.well-known/jwks.json"

            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                jwks = response.json()

                # Validate JWKS structure
                if not isinstance(jwks, dict) or "keys" not in jwks:
                    result = {
                        "status": "error",
                        "error": "Invalid JWKS response format",
                    }
                    self._cache_check(cache_key, result)
                    return result

                result = {
                    "status": "ok",
                    "endpoint": url,
                    "keys_count": len(jwks.get("keys", [])),
                }
                self._cache_check(cache_key, result)
                return result

        except httpx.TimeoutException:
            result = {
                "status": "error",
                "error": "Connection timeout",
                "error_type": "TimeoutException",
            }
            self._cache_check(cache_key, result)
            return result
        except httpx.HTTPStatusError as exc:
            result = {
                "status": "error",
                "error": f"HTTP {exc.response.status_code}",
                "error_type": "HTTPStatusError",
            }
            self._cache_check(cache_key, result)
            return result
        except Exception as exc:
            result = {
                "status": "error",
                "error": str(exc),
                "error_type": type(exc).__name__,
            }
            self._cache_check(cache_key, result)
            return result

    async def _check_sentry(self) -> dict[str, Any]:
        """Check if Sentry is configured (doesn't actually test connectivity)."""
        cache_key = "sentry"
        cached = self._get_cached_check(cache_key)
        if cached is not None:
            return cached

        try:
            if not _is_configured(settings.SENTRY_DSN):
                result = {"status": "disabled", "reason": "SENTRY_DSN not configured"}
                self._cache_check(cache_key, result)
                return result

            # Extract project ID from DSN for verification
            dsn = settings.SENTRY_DSN
            if "@" in dsn and "//" in dsn:
                result = {
                    "status": "ok",
                    "environment": settings.SENTRY_ENVIRONMENT,
                    "release": settings.SENTRY_RELEASE or "unset",
                }
            else:
                result = {
                    "status": "error",
                    "error": "Invalid SENTRY_DSN format",
                }

            self._cache_check(cache_key, result)
            return result

        except Exception as exc:
            result = {
                "status": "error",
                "error": str(exc),
                "error_type": type(exc).__name__,
            }
            self._cache_check(cache_key, result)
            return result

    def _get_cached_check(self, key: str) -> dict[str, Any] | None:
        """Get cached health check result if still valid."""
        if key not in self._check_cache:
            return None

        result, timestamp = self._check_cache[key]
        if time.time() - timestamp > self._cache_ttl:
            return None

        return result

    def _cache_check(self, key: str, result: dict[str, Any]) -> None:
        """Cache a health check result."""
        self._check_cache[key] = (result, time.time())

    def clear_cache(self) -> None:
        """Clear cached dependency checks (useful for tests)."""
        self._check_cache.clear()


# Global health checker instance
health_checker = HealthChecker()


__all__ = ["health_checker", "HealthChecker"]
