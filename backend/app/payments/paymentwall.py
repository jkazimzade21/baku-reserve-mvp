from __future__ import annotations

from typing import Any

from .base import PaymentProvider, PaymentResult


class PaymentwallProvider(PaymentProvider):
    """Placeholder integration for Paymentwall (not yet implemented)."""

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
            "PaymentwallProvider is not available in this build. Set PAYMENTS_MODE=mock to use the mock gateway."
        )
