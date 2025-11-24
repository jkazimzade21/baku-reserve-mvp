from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException

from ..contracts import Reservation
from ..storage import DB


def parse_coordinate_string(raw: str) -> tuple[float, float]:
    payload = (raw or "").strip()
    parts = [p.strip() for p in payload.split(",", 1)]
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError("Invalid coordinate format. Use 'lat,lon'.")
    try:
        lat = float(parts[0])
        lon = float(parts[1])
    except ValueError as exc:  # pragma: no cover
        raise ValueError("Invalid coordinate format. Use 'lat,lon'.") from exc

    from ..input_validation import validate_coords

    validated_lat, validated_lon = validate_coords(
        lat,
        lon,
        allow_outside_baku=True,
        context="coordinate string",
    )
    return validated_lat, validated_lon


def maybe_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def rec_to_reservation(rec: dict[str, Any]) -> Reservation:
    return Reservation(
        id=str(rec["id"]),
        restaurant_id=str(rec["restaurant_id"]),
        table_id=str(rec.get("table_id")) if rec.get("table_id") else None,
        party_size=int(rec["party_size"]),
        start=_ensure_datetime(rec["start"]),
        end=_ensure_datetime(rec["end"]),
        guest_name=str(rec.get("guest_name", "")),
        guest_phone=str(rec.get("guest_phone", "")) if rec.get("guest_phone") else None,
        status=str(rec.get("status", "booked")),
    )


def _ensure_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value)
    raise ValueError("Unsupported datetime value")


def ensure_reservation_owner(
    record: dict[str, Any] | None, owner_id: str | None, allow_admin: bool = False
) -> dict[str, Any]:
    if not record:
        raise HTTPException(404, "Reservation not found")
    if allow_admin:
        return record
    if not owner_id or record.get("owner_id") != owner_id:
        raise HTTPException(404, "Reservation not found")
    return record


async def require_active_reservation(
    res_id: str, owner_id: str | None = None, allow_admin: bool = False
) -> dict[str, Any]:
    record = ensure_reservation_owner(await DB.get_reservation(res_id), owner_id, allow_admin)
    if record.get("status") not in {"booked", "pending", "arrived"}:
        raise HTTPException(409, "Reservation is not active")
    return record
