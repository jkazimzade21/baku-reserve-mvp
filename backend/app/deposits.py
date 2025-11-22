from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass
class DepositQuote:
    amount_minor: int
    currency: str
    scope: Literal["starters", "mains", "full"]
    party_size: int
    description: str


class MockDepositGateway:
    RATES_AZN = {
        "starters": 800,  # AZN 8 / guest
        "mains": 1200,  # AZN 12 / guest
        "full": 1800,  # AZN 18 / guest
    }

    def quote(self, *, scope: str, party_size: int, currency: str = "AZN") -> DepositQuote:
        rate = self.RATES_AZN.get(scope, self.RATES_AZN["full"])
        amount = rate * max(1, party_size)
        return DepositQuote(
            amount_minor=amount,
            currency=currency,
            scope=scope,
            party_size=party_size,
            description=f"Advance prep hold for {scope}",
        )

    def authorize(self, quote: DepositQuote) -> dict[str, str | int]:
        return {
            "provider": "mock",
            "token": f"mock-auth-{quote.scope}-{quote.amount_minor}",
            "amount_minor": quote.amount_minor,
            "currency": quote.currency,
            "status": "authorized",
        }


DEPOSIT_GATEWAY = MockDepositGateway()
