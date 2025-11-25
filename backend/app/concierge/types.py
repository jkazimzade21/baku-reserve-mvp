from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Venue:
    id: str
    name: str
    slug: str | None = None
    name_az: str | None = None
    address: str | None = None
    phones: list[str] = field(default_factory=list)
    instagram: str | None = None
    website: str | None = None
    links: dict[str, str] | None = None
    tags: dict[str, list[str]] = field(default_factory=dict)
    price_level: str | None = None
    price_band: int | None = None
    summary: str | None = None
    raw: dict[str, Any] | None = None


@dataclass
class Intent:
    query: str
    cuisines: list[str] = field(default_factory=list)
    locations: list[str] = field(default_factory=list)
    vibe: list[str] = field(default_factory=list)
    amenities: list[str] = field(default_factory=list)
    occasions: list[str] = field(default_factory=list)
    dietary: list[str] = field(default_factory=list)
    price_min: int | None = None
    price_max: int | None = None
    party_size: int | None = None
    time_of_day: str | None = None
    
    # New accuracy-focused fields
    price_range_label: str | None = None  # 'budget', 'mid', 'high'
    hard_constraints: list[str] = field(default_factory=list)
    soft_constraints: list[str] = field(default_factory=list)


@dataclass
class SearchResult:
    venue: Venue
    score: float
    matched: list[str] = field(default_factory=list)
    debug_scores: dict[str, float] = field(default_factory=dict)