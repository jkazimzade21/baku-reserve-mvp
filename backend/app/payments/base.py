from __future__ import annotations

from typing import Any, Protocol

from pydantic import BaseModel


class PaymentResult(BaseModel):
    success: bool
    id: str | None = None
    error: str | None = None
    raw: dict[str, Any] | None = None


class PaymentProvider(Protocol):
    def charge(
        self,
        *,
        amount_minor: int,
        currency: str,
        description: str,
        metadata: dict[str, Any] | None = None,
    ) -> PaymentResult: ...
