from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException

from ..contracts import Reservation
from ..settings import settings
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


def sanitize_items(items: list[str] | None) -> list[str] | None:
    if not items:
        return None
    cleaned = [item.strip() for item in items if isinstance(item, str) and item.strip()]
    return cleaned or None


def prep_policy(record: dict[str, Any]) -> str:
    restaurant = DB.get_restaurant(str(record.get("restaurant_id")))
    policy = None
    if restaurant:
        policy = restaurant.get("prep_policy") or restaurant.get("deposit_policy")
    resolved = (policy or settings.PREP_POLICY_TEXT or "").strip()
    return resolved or settings.PREP_POLICY_TEXT


def build_prep_plan(record: dict[str, Any], scope: str, minutes_away: int) -> tuple[int, str]:
    policy = prep_policy(record)
    recommended = max(5, min(int(minutes_away or 5), 90))
    if scope == "full":
        recommended = max(recommended, 10)
    return recommended, policy


def notify_restaurant(reservation: dict[str, Any], context: dict[str, Any]) -> None:
    from ..logging_config import get_logger

    logger = get_logger(__name__)
    logger.info(
        "Pre-arrival prep notify triggered",
        extra={
            "reservation_id": reservation.get("id"),
            "minutes_away": context.get("minutes_away"),
            "scope": context.get("scope"),
        },
    )


def rec_to_reservation(rec: dict[str, Any]) -> Reservation:
    raw_items = rec.get("prep_items")
    prep_items: list[str] | None = None
    if isinstance(raw_items, list):
        prep_items = [str(item) for item in raw_items if isinstance(item, str)] or None
    elif isinstance(raw_items, str):
        prep_items = [raw_items]
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
        prep_eta_minutes=rec.get("prep_eta_minutes"),
        prep_request_time=maybe_datetime(rec.get("prep_request_time")),
        prep_items=prep_items,
        prep_scope=rec.get("prep_scope"),
        prep_status=rec.get("prep_status"),
        prep_policy=rec.get("prep_policy"),
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
    if record.get("status") != "booked":
        raise HTTPException(409, "Reservation is not active")
    return record


def ensure_prep_feature_enabled() -> None:
    if not settings.PREP_NOTIFY_ENABLED:
        raise HTTPException(status_code=404, detail="Feature disabled")
