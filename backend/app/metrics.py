"""Prometheus metrics for monitoring and observability."""

from __future__ import annotations

import time
from collections.abc import Callable
from functools import lru_cache

try:  # pragma: no cover - exercised indirectly via import side effects
    from prometheus_client import (
        CONTENT_TYPE_LATEST,
        Counter,
        Gauge,
        Histogram,
        Info,
        generate_latest,
    )
except ModuleNotFoundError:  # pragma: no cover - fallback when dependency missing
    CONTENT_TYPE_LATEST = "text/plain; version=0.0.4; charset=utf-8"

    def generate_latest(*_args, **_kwargs):  # type: ignore[no-redef]
        return b""

    class _NoopMetric:
        def __init__(self, *_args, **_kwargs):
            pass

        def labels(self, *_args, **_kwargs):
            return self

        def inc(self, *_args, **_kwargs):
            return self

        def observe(self, *_args, **_kwargs):
            return self

        def set(self, *_args, **_kwargs):
            return self

        def dec(self, *_args, **_kwargs):
            return self

        def info(self, *_args, **_kwargs):
            return self

    class Counter(_NoopMetric):  # type: ignore[no-redef]
        pass

    class Gauge(_NoopMetric):  # type: ignore[no-redef]
        pass

    class Histogram(_NoopMetric):  # type: ignore[no-redef]
        pass

    class Info(_NoopMetric):  # type: ignore[no-redef]
        pass


from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# ==============================================================================
# APPLICATION INFO
# ==============================================================================

app_info = Info("baku_reserve", "Baku Reserve API information")
app_info.info(
    {
        "version": "0.1.0",
        "service": "baku-reserve-api",
        "python_version": "3.11.14",
    }
)

# ==============================================================================
# HTTP METRICS
# ==============================================================================

http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

http_requests_in_progress = Gauge(
    "http_requests_in_progress",
    "HTTP requests currently in progress",
    ["method", "endpoint"],
)

http_request_size_bytes = Histogram(
    "http_request_size_bytes",
    "HTTP request size in bytes",
    ["method", "endpoint"],
    buckets=(100, 1000, 10000, 100000, 1000000, 10000000),
)

http_response_size_bytes = Histogram(
    "http_response_size_bytes",
    "HTTP response size in bytes",
    ["method", "endpoint"],
    buckets=(100, 1000, 10000, 100000, 1000000, 10000000),
)

# ==============================================================================
# CIRCUIT BREAKER METRICS
# ==============================================================================

circuit_breaker_state = Gauge(
    "circuit_breaker_state",
    "Circuit breaker state (0=closed, 1=open, 2=half_open)",
    ["circuit_name"],
)

circuit_breaker_failures_total = Counter(
    "circuit_breaker_failures_total",
    "Total circuit breaker failures",
    ["circuit_name"],
)

circuit_breaker_successes_total = Counter(
    "circuit_breaker_successes_total",
    "Total circuit breaker successes",
    ["circuit_name"],
)

circuit_breaker_rejected_total = Counter(
    "circuit_breaker_rejected_total",
    "Total circuit breaker rejected calls",
    ["circuit_name"],
)

circuit_breaker_opened_total = Counter(
    "circuit_breaker_opened_total",
    "Total times circuit breaker opened",
    ["circuit_name"],
)

# ==============================================================================
# CACHE METRICS
# ==============================================================================

cache_hits_total = Counter(
    "cache_hits_total",
    "Total cache hits",
    ["cache_name"],
)

cache_misses_total = Counter(
    "cache_misses_total",
    "Total cache misses",
    ["cache_name"],
)

cache_size = Gauge(
    "cache_size",
    "Current cache size (number of entries)",
    ["cache_name"],
)

cache_evictions_total = Counter(
    "cache_evictions_total",
    "Total cache evictions",
    ["cache_name"],
)

cache_expirations_total = Counter(
    "cache_expirations_total",
    "Total cache expirations",
    ["cache_name"],
)

# ==============================================================================
# RESERVATION METRICS
# ==============================================================================

reservations_total = Counter(
    "reservations_total",
    "Total reservations created",
    ["status"],
)

reservations_current = Gauge(
    "reservations_current",
    "Current active reservations",
    ["status"],
)

reservation_conflicts_total = Counter(
    "reservation_conflicts_total",
    "Total reservation conflicts (double bookings attempted)",
)

# ==============================================================================
# AUTH METRICS
# ==============================================================================

auth_requests_total = Counter(
    "auth_requests_total",
    "Total authentication requests",
    ["status"],
)

auth_token_validations_total = Counter(
    "auth_token_validations_total",
    "Total token validation attempts",
    ["result"],
)

auth_bypassed_total = Counter(
    "auth_bypassed_total",
    "Total requests with auth bypass enabled",
)

# ==============================================================================
# RATE LIMITER METRICS
# ==============================================================================

rate_limit_hits_total = Counter(
    "rate_limit_hits_total",
    "Total rate limit hits (requests blocked)",
)

rate_limit_requests_total = Counter(
    "rate_limit_requests_total",
    "Total requests checked by rate limiter",
    ["result"],
)

# ==============================================================================
# DATABASE METRICS
# ==============================================================================

db_operations_total = Counter(
    "db_operations_total",
    "Total database operations",
    ["operation", "status"],
)

db_operation_duration_seconds = Histogram(
    "db_operation_duration_seconds",
    "Database operation duration in seconds",
    ["operation"],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
)

# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================


def track_circuit_breaker_metrics(breaker_name: str, stats: dict) -> None:
    """Update circuit breaker metrics from stats dict."""
    previous = track_circuit_breaker_metrics._previous.setdefault(
        breaker_name,
        {
            "failed_calls": 0,
            "successful_calls": 0,
            "rejected_calls": 0,
            "circuit_opened_count": 0,
        },
    )
    fields = {
        "failed_calls": circuit_breaker_failures_total,
        "successful_calls": circuit_breaker_successes_total,
        "rejected_calls": circuit_breaker_rejected_total,
        "circuit_opened_count": circuit_breaker_opened_total,
    }
    for key, counter in fields.items():
        current = int(stats.get(key, 0) or 0)
        delta = max(0, current - previous[key])
        if delta:
            counter.labels(circuit_name=breaker_name).inc(delta)
        previous[key] = current


track_circuit_breaker_metrics._previous = {}  # type: ignore[attr-defined]


def track_cache_metrics(cache_name: str, stats: dict) -> None:
    """Update cache metrics from stats dict."""
    previous = track_cache_metrics._previous.setdefault(
        cache_name,
        {"hits": 0, "misses": 0, "evictions": 0, "expirations": 0},
    )
    cache_size.labels(cache_name=cache_name).set(stats.get("size", 0))
    for key, counter in (
        ("hits", cache_hits_total),
        ("misses", cache_misses_total),
        ("evictions", cache_evictions_total),
        ("expirations", cache_expirations_total),
    ):
        current = int(stats.get(key, 0) or 0)
        delta = max(0, current - previous[key])
        if delta:
            counter.labels(cache_name=cache_name).inc(delta)
        previous[key] = current


track_cache_metrics._previous = {}  # type: ignore[attr-defined]


@lru_cache(maxsize=2048)
def normalize_endpoint(path: str) -> str:
    """
    Normalize endpoint path to reduce cardinality.

    Examples:
        /restaurants/123 -> /restaurants/{id}
        /reservations/abc-def -> /reservations/{id}
    """
    import re

    # Replace UUIDs
    path = re.sub(
        r"/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        "/{id}",
        path,
        flags=re.IGNORECASE,
    )

    # Replace numeric IDs
    path = re.sub(r"/\d+", "/{id}", path)

    # Replace other IDs (alphanumeric strings that look like IDs)
    path = re.sub(r"/[a-zA-Z0-9_-]{20,}", "/{id}", path)

    return path


# ==============================================================================
# PROMETHEUS MIDDLEWARE
# ==============================================================================


class PrometheusMiddleware(BaseHTTPMiddleware):
    """Middleware to track HTTP request metrics."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip metrics endpoint itself
        if request.url.path == "/metrics":
            return await call_next(request)

        method = request.method
        endpoint = normalize_endpoint(request.url.path)

        # Track in-progress requests
        http_requests_in_progress.labels(method=method, endpoint=endpoint).inc()

        # Track request size
        request_size = int(request.headers.get("content-length", 0))
        if request_size > 0:
            http_request_size_bytes.labels(method=method, endpoint=endpoint).observe(request_size)

        # Time the request
        start_time = time.time()

        try:
            response = await call_next(request)
            status = response.status_code
        except Exception as exc:
            # Track errors
            http_requests_total.labels(method=method, endpoint=endpoint, status="500").inc()
            http_requests_in_progress.labels(method=method, endpoint=endpoint).dec()
            raise exc
        finally:
            duration = time.time() - start_time
            http_request_duration_seconds.labels(method=method, endpoint=endpoint).observe(duration)

        # Track completed request
        http_requests_total.labels(method=method, endpoint=endpoint, status=str(status)).inc()
        http_requests_in_progress.labels(method=method, endpoint=endpoint).dec()

        # Track response size
        response_size = int(response.headers.get("content-length", 0))
        if response_size > 0:
            http_response_size_bytes.labels(method=method, endpoint=endpoint).observe(response_size)

        return response


# ==============================================================================
# METRICS ENDPOINT
# ==============================================================================


def get_metrics() -> Response:
    """Generate Prometheus metrics response."""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


__all__ = [
    "PrometheusMiddleware",
    "get_metrics",
    "http_requests_total",
    "http_request_duration_seconds",
    "circuit_breaker_state",
    "cache_hits_total",
    "cache_misses_total",
    "reservations_total",
    "auth_requests_total",
    "track_circuit_breaker_metrics",
    "track_cache_metrics",
    "normalize_endpoint",
]
