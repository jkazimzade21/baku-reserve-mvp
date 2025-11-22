"""API versioning middleware and utilities."""

from __future__ import annotations

import re
from collections.abc import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class APIVersionMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add API versioning headers and deprecation warnings.

    Features:
    - Adds X-API-Version header to all responses
    - Adds deprecation warning to unversioned endpoints
    - Tracks API version usage for metrics
    """

    # Endpoints that should not have deprecation warnings
    EXEMPT_PATHS = {
        "/health",
        "/metrics",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/",  # Root redirect
    }

    # Static file patterns (should not have deprecation warnings)
    STATIC_PATTERNS = [
        r"^/assets/.*",
        r"^/static/.*",
        r"^/favicon\.ico$",
    ]

    def __init__(self, app, current_version: str = "1.0", latest_version: str = "1.0"):
        super().__init__(app)
        self.current_version = current_version
        self.latest_version = latest_version

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path

        # Determine if this is a versioned endpoint
        is_versioned = path.startswith("/v1/") or path.startswith("/v2/")

        # Determine API version being used
        if path.startswith("/v1/"):
            api_version = "1.0"
        elif path.startswith("/v2/"):
            api_version = "2.0"
        else:
            # Unversioned endpoint - treat as v1 for backward compatibility
            api_version = self.current_version

        # Process request
        response = await call_next(request)

        # Add version headers
        response.headers["X-API-Version"] = api_version
        response.headers["X-API-Latest-Version"] = self.latest_version

        # Add deprecation warning for unversioned endpoints
        if not is_versioned and not self._is_exempt(path):
            response.headers["Deprecation"] = "true"
            response.headers["Sunset"] = "2026-12-31"  # Sunset date for unversioned API
            response.headers["Link"] = f'</v1{path}>; rel="successor-version"'
            response.headers["Warning"] = (
                '299 - "Unversioned API endpoints are deprecated. Use /v1/* instead."'
            )

        return response

    def _is_exempt(self, path: str) -> bool:
        """Check if path is exempt from deprecation warnings."""
        # Check exact matches
        if path in self.EXEMPT_PATHS:
            return True

        # Check pattern matches
        for pattern in self.STATIC_PATTERNS:
            if re.match(pattern, path):
                return True

        return False


__all__ = ["APIVersionMiddleware"]
