from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ...concierge import ConciergeEngine
from ...concierge.normalize import pick_primary_location, summarize_price

router = APIRouter(tags=["concierge"])

# Initialize a singleton engine; builds a lightweight hash index on first import.
try:
    ENGINE = ConciergeEngine.default()
except Exception as exc:  # pragma: no cover - defensive path
    ENGINE = None  # type: ignore
    init_error = exc
else:
    init_error = None


class ConciergeRequest(BaseModel):
    query: str = Field(..., description="User free-text question or preference string")
    top_k: int = Field(3, ge=1, le=10, description="Number of venues to return")


class ConciergeResult(BaseModel):
    id: str
    name: str
    area: str | None = None
    address: str | None = None
    price_band: int | None = None
    price_label: str | None = None
    summary: str | None = None
    instagram: str | None = None
    website: str | None = None
    score: float
    tags: dict[str, list[str]] | None = None


class ConciergeResponse(BaseModel):
    intent: dict[str, Any]
    results: list[ConciergeResult]
    message: str


@router.post("/concierge", response_model=ConciergeResponse)
async def concierge(req: ConciergeRequest) -> ConciergeResponse:
    if ENGINE is None:
        raise HTTPException(status_code=503, detail=f"Concierge unavailable: {init_error}")
    intent, results, message = ENGINE.recommend(req.query, top_k=req.top_k)
    payload: list[ConciergeResult] = []
    for res in results:
        venue = res.venue
        area = pick_primary_location(venue.tags)
        payload.append(
            ConciergeResult(
                id=venue.id,
                name=venue.name,
                area=area,
                address=venue.address,
                price_band=venue.price_band,
                price_label=summarize_price(venue.price_band, venue.price_level),
                summary=venue.summary,
                instagram=venue.instagram,
                website=venue.website,
                score=round(res.score, 4),
                tags=venue.tags,
            )
        )
    return ConciergeResponse(intent=asdict(intent), results=payload, message=message)
