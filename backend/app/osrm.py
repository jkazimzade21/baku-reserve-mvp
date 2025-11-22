from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx

from .cache import cache_osrm_route, get_cached_osrm_route
from .settings import settings

logger = logging.getLogger(__name__)


def _osrm_base() -> str:
    return settings.OSRM_BASE_URL.rstrip("/")


@dataclass(slots=True)
class OsrmRoute:
    distance_km: float
    duration_seconds: int
    geometry: list[tuple[float, float]] | None = None
    notice: str | None = None
    raw: dict[str, Any] | None = None


def _parse_geometry(coords: list[list[float]]) -> list[tuple[float, float]] | None:
    if not coords:
        return None
    return [(lat, lon) for lon, lat in coords]


def route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
) -> OsrmRoute | None:
    cache_hit = get_cached_osrm_route(origin_lat, origin_lon, dest_lat, dest_lon)
    if cache_hit and isinstance(cache_hit, OsrmRoute):
        logger.info(
            "OSRM route cache_hit origin=(%.4f,%.4f) dest=(%.4f,%.4f) distance=%.3fkm duration=%ss",
            origin_lat,
            origin_lon,
            dest_lat,
            dest_lon,
            cache_hit.distance_km,
            cache_hit.duration_seconds,
        )
        return cache_hit

    started = time.perf_counter()
    url = f"{_osrm_base()}/{origin_lon},{origin_lat};{dest_lon},{dest_lat}"
    params = {
        "alternatives": "false",
        "annotations": "false",
        "geometries": "geojson",
        "overview": "simplified",
        "steps": "false",
    }
    try:
        resp = httpx.get(url, params=params, timeout=6.0)
        resp.raise_for_status()
    except Exception as exc:
        logger.warning("OSRM route fetch failed: %s", exc)
        return None

    data = resp.json()
    routes = data.get("routes") or []
    if not routes:
        return None
    best = routes[0]
    distance = float(best.get("distance", 0.0)) / 1000.0
    duration = int(round(float(best.get("duration", 0.0))))
    geometry = _parse_geometry(best.get("geometry", {}).get("coordinates", []))

    notice = None
    if data.get("code") != "Ok":
        notice = data.get("message") or data.get("code")

    osrm_route = OsrmRoute(
        distance_km=round(distance, 3),
        duration_seconds=max(1, duration),
        geometry=geometry,
        notice=notice,
        raw=data,
    )
    cache_osrm_route(origin_lat, origin_lon, dest_lat, dest_lon, osrm_route)
    elapsed = (time.perf_counter() - started) * 1000
    logger.info(
        "OSRM route origin=(%.4f,%.4f) dest=(%.4f,%.4f) distance=%.3fkm duration=%ss latency=%.1fms",
        origin_lat,
        origin_lon,
        dest_lat,
        dest_lon,
        osrm_route.distance_km,
        osrm_route.duration_seconds,
        elapsed,
    )
    return osrm_route


__all__ = ["OsrmRoute", "route"]
