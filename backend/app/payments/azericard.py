from __future__ import annotations

from typing import Any

from .base import PaymentProvider, PaymentResult


class AzericardProvider(PaymentProvider):
    """Placeholder for a future AzeriCard gateway integration."""

    def __init__(self, *, config: dict[str, Any] | None = None) -> None:
        self.config = config or {}

    def charge(
        self,
        *,
        amount_minor: int,
        currency: str,
        description: str,
        metadata: dict[str, Any] | None = None,
    ) -> PaymentResult:
        raise NotImplementedError(
            "AzeriCardProvider is not available in this build. Set PAYMENTS_MODE=mock to use the mock gateway."
        )
