from __future__ import annotations

import asyncio
from typing import Any

import httpx

from .settings import settings

_client: httpx.AsyncClient | None = None
_client_lock = asyncio.Lock()


class OpenAIUnavailable(RuntimeError):
    pass


def _headers() -> dict[str, str]:
    if not settings.OPENAI_API_KEY:
        raise OpenAIUnavailable("OPENAI_API_KEY not configured")
    return {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        async with _client_lock:
            if _client is None:
                timeout = httpx.Timeout(
                    settings.OPENAI_TIMEOUT_SECONDS,
                    connect=settings.OPENAI_CONNECT_TIMEOUT_SECONDS,
                )
                base_url = settings.OPENAI_API_BASE.rstrip("/") or "https://api.openai.com/v1"
                _client = httpx.AsyncClient(base_url=base_url, timeout=timeout)
    return _client


async def post_json(
    path: str, payload: dict[str, Any], *, timeout: float | None = None
) -> dict[str, Any]:
    client = await _get_client()
    headers = _headers()
    try:
        response = await client.post(path, json=payload, headers=headers, timeout=timeout)
    except httpx.HTTPError as exc:
        raise OpenAIUnavailable(f"Request failed: {exc}") from exc
    if response.status_code >= 400:
        raise OpenAIUnavailable(f"OpenAI error {response.status_code}: {response.text[:200]}")
    try:
        return response.json()
    except ValueError as exc:
        raise OpenAIUnavailable("Invalid JSON from OpenAI") from exc


async def close_async_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
