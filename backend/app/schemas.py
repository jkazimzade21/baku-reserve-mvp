from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .contracts import RestaurantListItem
from .validators import normalize_prep_items


class BudgetPreference(BaseModel):
    max_pp: float | None = Field(default=None, ge=0)


class ConciergeIntent(BaseModel):
    lang: Literal["en", "az", "ru"] = "en"
    vibe_tags: list[str] = Field(default_factory=list)
    cuisine_tags: list[str] = Field(default_factory=list)
    location_tags: list[str] = Field(default_factory=list)
    price_bucket: Literal["budget", "mid", "upper", "luxury"] = "mid"
    time_context: list[str] = Field(default_factory=list)
    amenities: list[str] = Field(default_factory=list)
    negatives: list[str] = Field(default_factory=list)
    budget_azn: BudgetPreference | None = None


class ConciergeRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=600)
    lang: Literal["en", "az", "ru"] | None = None
    limit: int | None = Field(default=4, ge=1, le=12)


class ConciergeResponse(BaseModel):
    results: list[RestaurantListItem]
    match_reason: dict[str, list[str]] = Field(default_factory=dict)
    explanations: dict[str, str] = Field(default_factory=dict)
    mode: Literal["local", "ai", "ab"] | None = None


class ConciergeHealthStatus(BaseModel):
    status: Literal["unknown", "healthy", "degraded"] = "unknown"
    updated_at: datetime | None = None
    detail: str | None = None


class ConciergeHealth(BaseModel):
    embeddings: ConciergeHealthStatus
    llm: ConciergeHealthStatus


class ConciergeQuery(BaseModel):
    """Legacy concierge payload used for the local fallback engine."""

    prompt: str = Field(min_length=3, max_length=500)
    limit: int = Field(default=4, ge=1, le=8)
    locale: str | None = Field(default=None, max_length=8)


class PreorderRequest(BaseModel):
    minutes_away: int = Field(ge=5, le=60)
    scope: Literal["starters", "full"] = "starters"
    items: list[str] | None = None

    @property
    def normalized_items(self) -> list[str] | None:
        return self.items

    @field_validator("items", mode="before")
    @classmethod
    def _items(cls, value):  # type: ignore[override]
        return normalize_prep_items(value)


class PreorderConfirmRequest(PreorderRequest):
    pass


class PreorderQuoteResponse(BaseModel):
    policy: str
    recommended_prep_minutes: int
