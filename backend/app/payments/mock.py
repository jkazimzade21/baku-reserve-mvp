from __future__ import annotations

from typing import Any
from uuid import uuid4

from .base import PaymentProvider, PaymentResult


class MockPaymentProvider(PaymentProvider):
    """Toy provider that always authorizes successfully."""

    def charge(
        self,
        *,
        amount_minor: int,
        currency: str,
        description: str,
        metadata: dict[str, Any] | None = None,
    ) -> PaymentResult:
        txn_id = f"mock_{uuid4().hex}"
        payload: dict[str, Any] = {
            "amount_minor": amount_minor,
            "currency": currency,
            "description": description,
            "metadata": metadata or {},
        }
        return PaymentResult(success=True, id=txn_id, raw=payload)
