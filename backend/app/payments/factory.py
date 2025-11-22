from __future__ import annotations

from functools import lru_cache

from ..settings import settings
from .azericard import AzericardProvider
from .base import PaymentProvider
from .mock import MockPaymentProvider
from .paymentwall import PaymentwallProvider


@lru_cache(maxsize=1)
def get_payment_provider() -> PaymentProvider:
    mode = (settings.PAYMENTS_MODE or "mock").lower()
    provider_name = (settings.PAYMENT_PROVIDER or "mock").lower()

    if mode == "mock" or provider_name == "mock":
        return MockPaymentProvider()

    if provider_name == "paymentwall":
        return PaymentwallProvider()

    if provider_name == "azericard":
        return AzericardProvider()

    raise RuntimeError(
        f"Unsupported PAYMENT_PROVIDER '{settings.PAYMENT_PROVIDER}'. Set PAYMENTS_MODE=mock for the demo."
    )
