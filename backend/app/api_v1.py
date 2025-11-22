"""API v1 router - Versioned API endpoints."""

from __future__ import annotations

from fastapi import APIRouter

# Create v1 API router
v1_router = APIRouter(prefix="/v1", tags=["v1"])

# Export for use in main.py
__all__ = ["v1_router"]
