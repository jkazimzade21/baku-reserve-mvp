"""Payment provider abstraction for deposits/prep flows."""

from .base import PaymentProvider, PaymentResult
from .factory import get_payment_provider

__all__ = ["get_payment_provider", "PaymentProvider", "PaymentResult"]
