from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

RES_DURATION = timedelta(minutes=90)
INTERVAL = timedelta(minutes=30)
OPEN = time(10, 0)
CLOSE = time(23, 0)
DEFAULT_TIMEZONE = "Asia/Baku"
DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _overlaps(
    a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime
) -> bool:
    return not (a_end <= b_start or a_start >= b_end)


def _iso_parse(s: str) -> datetime:
    return datetime.fromisoformat(s)


def _resolve_timezone(tz_name: str | None) -> ZoneInfo:
    name = tz_name or DEFAULT_TIMEZONE
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo(DEFAULT_TIMEZONE)


def _parse_time(value: str | None, default: time) -> time:
    if not value:
        return default
    parts = value.strip().split(":")
    if len(parts) < 2:
        return default
    try:
        hour = max(0, min(23, int(parts[0])))
        minute = max(0, min(59, int(parts[1])))
        return time(hour, minute)
    except ValueError:
        return default


def _hours_for_day(restaurant: Any, day: date) -> tuple[time, time]:
    hours = (
        restaurant.get("hours")
        if isinstance(restaurant, dict)
        else getattr(restaurant, "hours", None)
    )
    if isinstance(hours, dict):
        # Support global open/close as well as day-specific records
        weekday_key = DAY_KEYS[day.weekday()]
        day_hours = (
            hours.get(weekday_key) if isinstance(hours.get(weekday_key), dict) else None
        )
        open_str = day_hours.get("open") if day_hours else hours.get("open")
        close_str = day_hours.get("close") if day_hours else hours.get("close")
        open_time = _parse_time(open_str, OPEN)
        close_time = _parse_time(close_str, CLOSE)
        return open_time, close_time
    return OPEN, CLOSE


def _assign_shared_block(
    db,
    rid: str,
    tables: list[dict[str, Any]],
    block: tuple[datetime, datetime],
    party_size: int,
) -> str | None:
    candidates: list[dict[str, Any]] = []
    getter = getattr(db, "eligible_tables", None)
    if callable(getter):
        try:
            candidates = getter(rid, max(1, party_size)) or []
        except Exception:  # pragma: no cover
            candidates = []
    if not candidates:
        candidates = tables
    if not candidates:
        return None
    filtered = []
    for table in candidates:
        try:
            cap = int(table.get("capacity", 0) or 0)
        except Exception:
            cap = 0
        if cap >= max(1, party_size):
            filtered.append(table)
    if filtered:
        candidates = filtered
    if not candidates:
        return None
    return str(candidates[0].get("id")) if candidates[0].get("id") else None


def _normalize_timezone(dt: datetime, tz: ZoneInfo) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=tz)
    return dt.astimezone(tz)


async def availability_for_day(
    restaurant: Any, party_size: int, day: date, db
) -> dict[str, Any]:
    """
    Returns: {"slots":[{"start":iso,"end":iso,"available_table_ids":[...],"count":N}, ...]}
    Only considers reservations with status == "booked".
    """
    if isinstance(restaurant, dict):
        rid = str(restaurant.get("id"))
        restaurant_tz = restaurant.get("timezone") or DEFAULT_TIMEZONE
    else:
        rid = str(restaurant.id)
        restaurant_tz = (
            getattr(restaurant, "timezone", DEFAULT_TIMEZONE) or DEFAULT_TIMEZONE
        )
    tzinfo = _resolve_timezone(restaurant_tz)
    open_time, close_time = _hours_for_day(restaurant, day)

    # Tables that fit the party
    tables: list[dict[str, Any]] = db.eligible_tables(rid, party_size)

    # Existing booked reservations for that date, same restaurant
    todays: list[dict[str, Any]] = []
    for r in await db.reservations_for_day(rid, day, restaurant_tz):
        try:
            rs = _normalize_timezone(_iso_parse(str(r["start"])), tzinfo)
            re = _normalize_timezone(_iso_parse(str(r["end"])), tzinfo)
        except Exception:
            continue
        todays.append(
            {
                "table_id": str(r.get("table_id") or ""),
                "start": rs,
                "end": re,
                "party_size": int(r.get("party_size") or 0),
            }
        )

    bookings_by_table: dict[str, list[tuple[datetime, datetime]]] = {}
    for booking in todays:
        block = (booking["start"], booking["end"])
        tid = booking["table_id"]
        if tid:
            bookings_by_table.setdefault(tid, []).append(block)
        else:
            assigned = _assign_shared_block(
                db,
                rid,
                tables,
                block,
                booking.get("party_size") or party_size,
            )
            if assigned:
                bookings_by_table.setdefault(assigned, []).append(block)

    slots = []
    open_dt = datetime.combine(day, open_time, tzinfo=tzinfo)
    close_dt = datetime.combine(day, close_time, tzinfo=tzinfo)
    if close_dt <= open_dt:
        close_dt += timedelta(days=1)
    cur = open_dt
    last_start = close_dt - RES_DURATION

    while cur <= last_start:
        slot_end = cur + RES_DURATION
        free_ids: list[str] = []
        for t in tables:
            tid = str(t.get("id"))
            taken = False
            for rs, re in bookings_by_table.get(tid, ()):
                if _overlaps(cur, slot_end, rs, re):
                    taken = True
                    break
            if not taken:
                free_ids.append(tid)

        slots.append(
            {
                "start": cur.isoformat(timespec="seconds"),
                "end": slot_end.isoformat(timespec="seconds"),
                "available_table_ids": free_ids,
                "count": len(free_ids),
            }
        )
        cur += INTERVAL

    return {"slots": slots, "restaurant_timezone": restaurant_tz}
