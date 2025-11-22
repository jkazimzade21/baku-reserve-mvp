from __future__ import annotations

from fastapi import APIRouter, Query, Request

# Use the new V2 service
from ...concierge_v2_service import concierge_v2_service as concierge_service
from ...schemas import ConciergeHealth, ConciergeRequest, ConciergeResponse

router = APIRouter(tags=["concierge"])


@router.post("/concierge/recommendations", response_model=ConciergeResponse)
async def concierge_recommendations(
    payload: ConciergeRequest,
    request: Request,
    mode: str | None = Query(None, description="Force concierge mode (ai|local|ab)"),
):
    # Mode override is ignored in V2 as it's fully AI-driven (or fallback to hybrid)
    return await concierge_service.recommend(payload, request, mode_override=mode)


@router.get("/concierge/health", response_model=ConciergeHealth)
async def concierge_health() -> ConciergeHealth:
    return ConciergeHealth(**concierge_service.health_snapshot)
