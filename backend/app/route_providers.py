from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class RouteResult:
    provider: str
    distance_km: float | None
    duration_seconds: int | None
    notice: str | None = None
    geometry: list[tuple[float, float]] | None = None
    traffic_condition: str | None = None
    raw: dict[str, object] | None = None


def compute_primary_route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    *,
    provider_override: str | None = None,
) -> RouteResult | None:
    """ETA/distance feature is disabled; placeholder for future provider."""

    logger.info(
        "Route computation skipped (disabled). origin=(%.4f,%.4f) dest=(%.4f,%.4f)",
        origin_lat,
        origin_lon,
        dest_lat,
        dest_lon,
    )
    return None


__all__ = ["RouteResult", "compute_primary_route"]
