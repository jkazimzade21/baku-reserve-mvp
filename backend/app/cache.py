"""
Lightweight cache utilities used by the /dev cache endpoints.

Currently only health checks maintain an in-memory cache; this module provides a
stable interface so the FastAPI app can import `clear_all_caches` and
`get_all_cache_stats` even if additional caches are added later.
"""

from __future__ import annotations

from .health import health_checker


def clear_all_caches() -> None:
    """Purge all in-process caches."""
    health_checker.clear_cache()


def get_all_cache_stats() -> dict[str, dict]:
    """Return cache diagnostics (best-effort; safe for dev use)."""
    return {
        "health": {
            "entries": len(health_checker._check_cache),  # type: ignore[attr-defined]
            "ttl_seconds": getattr(health_checker, "_cache_ttl", None),
        }
    }
