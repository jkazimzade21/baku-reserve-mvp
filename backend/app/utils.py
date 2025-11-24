from __future__ import annotations

import asyncio
import logging
import math
import time
from contextvars import ContextVar
from uuid import uuid4

from fastapi import Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .metrics import rate_limit_hits_total, rate_limit_requests_total
from .settings import settings

# Context variable for request ID (accessible throughout the request lifecycle)
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")


def add_cors(app):
    origins = settings.allow_origins
    if not origins:
        # Default is explicit opt-in; skip middleware when nothing configured
        return
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        response = await call_next(request)
        headers = {
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "X-XSS-Protection": "1; mode=block",
            "Referrer-Policy": "no-referrer",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        }
        if request.url.scheme in {"https", "wss"}:
            headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        for key, value in headers.items():
            response.headers.setdefault(key, value)
        return response


def add_security_headers(app):
    app.add_middleware(SecurityHeadersMiddleware)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add request ID tracing for distributed debugging.

    Features:
    - Generates UUID for each request or uses existing X-Request-ID header
    - Adds X-Request-ID to response headers
    - Sets request ID in context variable for access throughout request lifecycle
    - Integrates with logging for structured logs
    """

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        # Get or generate request ID
        request_id = request.headers.get("X-Request-ID")
        if not request_id:
            request_id = str(uuid4())

        # Set in context variable for access throughout request
        request_id_ctx.set(request_id)

        # Add to request state for easy access in route handlers
        request.state.request_id = request_id

        # Process request
        response = await call_next(request)

        # Add request ID to response headers
        response.headers["X-Request-ID"] = request_id

        return response


class RequestIDLogFilter(logging.Filter):
    """
    Logging filter that adds request ID to log records.

    Usage in logging configuration:
        formatter = logging.Formatter(
            '%(asctime)s [%(request_id)s] %(levelname)s %(name)s: %(message)s'
        )
    """

    def filter(self, record: logging.LogRecord) -> bool:
        # Add request ID to log record if available
        request_id = request_id_ctx.get("")
        record.request_id = request_id if request_id else "-"  # type: ignore[attr-defined]
        return True


def add_request_id_tracing(app):
    """Add request ID middleware and configure logging."""
    app.add_middleware(RequestIDMiddleware)

    # Add filter to root logger
    logging.getLogger().addFilter(RequestIDLogFilter())


def get_request_id() -> str:
    """Get the current request ID from context."""
    return request_id_ctx.get("")


class RateLimiter:
    def __init__(self, shards: int = 32) -> None:
        self._buckets: dict[str, dict[str, float]] = {}
        self._locks = [asyncio.Lock() for _ in range(max(1, shards))]
        self._last_cleanup = 0.0

    async def dispatch(self, request: Request, call_next):
        limit = settings.RATE_LIMIT_REQUESTS
        window = settings.RATE_LIMIT_WINDOW_SECONDS
        if not settings.RATE_LIMIT_ENABLED or limit <= 0 or window <= 0:
            return await call_next(request)

        identifier = self._identifier_for(request)
        now = time.monotonic()
        allowed, remaining, reset_in = await self._consume(
            identifier, limit, window, now
        )
        if not allowed:
            rate_limit_hits_total.inc()
            rate_limit_requests_total.labels(result="throttle").inc()
            retry_after = max(1, math.ceil(reset_in))
            headers = {
                "Retry-After": str(retry_after),
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(retry_after),
            }
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Too many requests"},
                headers=headers,
            )

        response = await call_next(request)
        rate_limit_requests_total.labels(result="allow").inc()
        response.headers.setdefault("X-RateLimit-Limit", str(limit))
        response.headers["X-RateLimit-Remaining"] = str(max(0, remaining))
        response.headers["X-RateLimit-Reset"] = str(max(0, math.ceil(reset_in)))
        return response

    async def _consume(self, identifier: str, limit: int, window: int, now: float):
        refill_rate = limit / window
        lock = self._locks[hash(identifier) % len(self._locks)]
        async with lock:
            bucket = self._buckets.get(identifier)
            if not bucket:
                self._buckets[identifier] = {"tokens": float(limit - 1), "last": now}
                self._maybe_cleanup(now, window)
                return True, limit - 1, 0

            tokens = bucket["tokens"]
            elapsed = max(0.0, now - bucket["last"])
            tokens = min(float(limit), tokens + elapsed * refill_rate)
            bucket["last"] = now

            if tokens >= 1:
                tokens -= 1
                bucket["tokens"] = tokens
                # Estimate time until bucket fully refilled
                reset_in = (limit - tokens) / refill_rate if tokens < limit else 0
                bucket["last"] = now
                self._maybe_cleanup(now, window)
                return True, int(tokens), reset_in

            bucket["tokens"] = tokens
            deficit = 1 - tokens
            reset_in = deficit / refill_rate if refill_rate else window
            bucket["last"] = now
            self._maybe_cleanup(now, window)
            return False, 0, reset_in

    def reset(self) -> None:
        self._buckets.clear()
        self._last_cleanup = 0.0

    def _maybe_cleanup(self, now: float, window: int) -> None:
        """Remove idle buckets periodically to bound memory."""
        if now - self._last_cleanup < window:
            return
        stale_cutoff = now - (window * 3)
        stale_keys = [
            key
            for key, meta in self._buckets.items()
            if meta.get("last", 0.0) < stale_cutoff
        ]
        for key in stale_keys:
            self._buckets.pop(key, None)
        self._last_cleanup = now

    def _identifier_for(self, request: Request) -> str:
        """
        Determine client identifier for rate limiting with secure proxy handling.

        Security considerations:
        - Only trusts X-Forwarded-For if request comes from a trusted proxy
        - Validates all IP addresses to prevent spoofing
        - Uses rightmost trusted IP from X-Forwarded-For chain
        - Falls back to direct client.host if X-Forwarded-For is untrusted

        Returns:
            Client IP address or "anonymous" if unavailable
        """
        # Get direct client IP (the immediate connection)
        direct_client_ip = request.client.host if request.client else None

        # Check if we should trust X-Forwarded-For from this client
        if not direct_client_ip or not self._is_trusted_proxy(direct_client_ip):
            # Direct connection or untrusted proxy - use direct IP
            return direct_client_ip or "anonymous"

        # Request came from trusted proxy - parse X-Forwarded-For
        forwarded = request.headers.get("x-forwarded-for")
        if not forwarded:
            # No X-Forwarded-For header - use direct IP
            return direct_client_ip

        # Parse X-Forwarded-For chain (format: client, proxy1, proxy2, ...)
        # The FIRST (leftmost) IP is the original client
        ips = [ip.strip() for ip in forwarded.split(",")]
        for ip in ips:
            # Validate IP address format
            if self._is_valid_ip(ip):
                # Found valid IP - this is the real client
                return ip

        # All IPs invalid or empty - fall back to direct IP
        return direct_client_ip

    def _is_trusted_proxy(self, ip: str) -> bool:
        """
        Check if an IP address is a trusted proxy.

        Args:
            ip: IP address to check

        Returns:
            True if IP is in trusted proxy list
        """
        from .settings import settings

        trusted = settings.TRUSTED_PROXIES.strip()

        # No trusted proxies configured - don't trust anyone
        if not trusted:
            return False

        # "*" means trust all (INSECURE - only for development)
        if trusted == "*":
            return True

        # Parse comma-separated list of trusted IPs/CIDRs
        import ipaddress

        try:
            ip_obj = ipaddress.ip_address(ip)
        except ValueError:
            # Invalid IP format
            return False

        # Check against each trusted network/IP
        for trusted_entry in trusted.split(","):
            trusted_entry = trusted_entry.strip()
            if not trusted_entry:
                continue

            try:
                # Try as network/CIDR first
                if "/" in trusted_entry:
                    network = ipaddress.ip_network(trusted_entry, strict=False)
                    if ip_obj in network:
                        return True
                else:
                    # Try as single IP
                    if ip_obj == ipaddress.ip_address(trusted_entry):
                        return True
            except ValueError:
                # Invalid trusted entry - skip it
                continue

        return False

    def _is_valid_ip(self, ip: str) -> bool:
        """
        Validate IP address format (IPv4 or IPv6).

        Args:
            ip: IP address string to validate

        Returns:
            True if valid IP address format
        """
        import ipaddress

        try:
            ipaddress.ip_address(ip)
            return True
        except ValueError:
            return False


def add_rate_limiting(app):
    limiter: RateLimiter = RateLimiter()
    app.state.rate_limiter = limiter

    @app.middleware("http")
    async def _rate_limit(request: Request, call_next):  # type: ignore[override]
        return await limiter.dispatch(request, call_next)
