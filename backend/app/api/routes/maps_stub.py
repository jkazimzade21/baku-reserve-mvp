from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(tags=["maps"])


@router.get("/v1/maps/geocode")
def geocode(query: str = Query(..., min_length=1), limit: int = 5, language: str | None = None):
    """Stub geocode endpoint (mapping providers removed)."""
    return []


@router.get("/v1/directions")
def directions(origin: str, destination: str):
    """Stub directions endpoint."""
    return {"routes": [], "origin": origin, "destination": destination}


def _parse_coords(raw: str) -> tuple[float, float]:
    try:
        lat_str, lon_str = raw.split(",", 1)
        lat = float(lat_str)
        lon = float(lon_str)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid coordinates") from exc
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(status_code=400, detail="Latitude/longitude out of range")
    return lat, lon


@router.get("/directions")
def legacy_directions(origin: str, destination: str):
    """Legacy stub directions endpoint with basic coordinate validation."""
    _parse_coords(origin)
    _parse_coords(destination)
    return {"routes": [], "origin": origin, "destination": destination}


__all__ = ["router"]
