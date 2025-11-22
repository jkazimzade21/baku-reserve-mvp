from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from shutil import copy2
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from sqlalchemy import select

from .contracts import Reservation, ReservationCreate
from .db.core import ensure_db_initialized, get_session
from .db.models import ReservationRecord, RestaurantRecord
from .settings import settings

logger = logging.getLogger(__name__)

DATA_DIR = settings.data_dir
LEGACY_DATA_DIR = Path(__file__).resolve().parent / "data"
PREP_FIELDS = (
    "prep_eta_minutes",
    "prep_request_time",
    "prep_items",
    "prep_scope",
    "prep_status",
    "prep_policy",
)


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat()


def _parse_iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _ensure_datetime(value: datetime | str) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
    return _parse_iso(str(value))


def _bootstrap_file(filename: str, fallback: str | None = None) -> None:
    target = DATA_DIR / filename
    if target.exists():
        return
    legacy_file = LEGACY_DATA_DIR / filename
    if legacy_file.exists():
        copy2(legacy_file, target)
        return
    if fallback is not None:
        target.write_text(fallback, encoding="utf-8")
    else:
        target.touch()


_bootstrap_file("restaurants.json", "[]\n")
_bootstrap_file("restaurant_tags_enriched.json", "{}\n")


def _load_enriched_tags() -> dict[str, dict[str, Any]]:
    tag_path = DATA_DIR / "restaurant_tags_enriched.json"
    if not tag_path.exists():
        return {}
    try:
        payload = json.loads(tag_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        logger.warning("Invalid restaurant tag enrichment file: %s", tag_path)
        return {}
    enriched: dict[str, dict[str, Any]] = {}
    for key, value in payload.items():
        slug = str(key or "").strip().lower()
        if not slug:
            continue
        if isinstance(value, dict):
            enriched[slug] = value
    return enriched


def _record_to_public_dict(record: ReservationRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "restaurant_id": record.restaurant_id,
        "table_id": record.table_id,
        "party_size": record.party_size,
        "start": _iso(_ensure_datetime(record.start)),
        "end": _iso(_ensure_datetime(record.end)),
        "guest_name": record.guest_name,
        "guest_phone": record.guest_phone,
        "status": record.status,
        "owner_id": record.owner_id,
        "prep_eta_minutes": record.prep_eta_minutes,
        "prep_scope": record.prep_scope,
        "prep_request_time": (
            _iso(record.prep_request_time)
            if isinstance(record.prep_request_time, datetime)
            else record.prep_request_time
        ),
        "prep_items": record.prep_items,
        "prep_status": record.prep_status,
        "prep_policy": record.prep_policy,
    }


def _record_to_reservation(record: ReservationRecord) -> Reservation:
    return Reservation(
        id=record.id,
        restaurant_id=record.restaurant_id,
        table_id=record.table_id,
        party_size=record.party_size,
        start=_ensure_datetime(record.start),
        end=_ensure_datetime(record.end),
        guest_name=record.guest_name,
        guest_phone=record.guest_phone,
        status=record.status,
        prep_eta_minutes=record.prep_eta_minutes,
        prep_request_time=record.prep_request_time,
        prep_items=record.prep_items,
        prep_scope=record.prep_scope,
        prep_status=record.prep_status,
        prep_policy=record.prep_policy,
    )


class Database:
    """
    Restaurant metadata still comes from the JSON seed, but reservations persist in SQL via
    `backend/app/db` so multiple workers share a single source of truth.
    """

    def __init__(self) -> None:
        ensure_db_initialized()
        seed_path = DATA_DIR / "restaurants.json"
        try:
            raw = seed_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            seed_restaurants: list[dict[str, Any]] = []
        else:
            payload = raw.strip()
            if not payload:
                seed_restaurants = []
            else:
                try:
                    seed_restaurants = json.loads(payload)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(f"Invalid restaurant seed data: {seed_path}") from exc

        enriched_tags = _load_enriched_tags()
        normalised: list[dict[str, Any]] = []
        for item in seed_restaurants:
            if not isinstance(item, dict):
                continue
            entry = dict(item)
            entry_id = entry.get("id") or uuid4()
            entry["id"] = str(entry_id)
            slug = entry.get("slug")
            if slug:
                entry["slug"] = str(slug)
            elif entry.get("name"):
                entry["slug"] = str(entry["name"]).lower().replace(" ", "-")
            entry.setdefault("city", "Baku")
            entry.setdefault("timezone", "Asia/Baku")

            slug_key = str(entry.get("slug") or "").lower()
            enriched = enriched_tags.get(slug_key)
            if enriched:
                tag_groups = enriched.get("tag_groups") or {}
                if isinstance(tag_groups, dict):
                    entry["tag_groups"] = tag_groups
                flattened: set[str] = set(entry.get("tags") or [])
                for values in tag_groups.values() if isinstance(tag_groups, dict) else []:
                    if isinstance(values, list):
                        for tag in values:
                            if isinstance(tag, str):
                                flattened.add(tag)
                if flattened:
                    entry["tags"] = sorted(flattened)

            normalised.append(entry)

        try:
            # If already inside an event loop (e.g., uvicorn reload), schedule the sync task.
            loop = asyncio.get_running_loop()
            loop.create_task(self._sync_restaurants_to_db(normalised))
        except RuntimeError:
            # No running loop; safe to run synchronously during cold start or tests.
            try:
                synced = asyncio.run(self._sync_restaurants_to_db(normalised))
                if synced:
                    normalised = synced
            except Exception:
                logger.exception(
                    "Failed to sync restaurants into SQL store; continuing with JSON data"
                )
        except Exception:
            logger.exception("Failed to sync restaurants into SQL store; continuing with JSON data")

        self.restaurants: dict[str, dict[str, Any]] = {r["id"]: r for r in normalised}
        self._restaurants_by_slug: dict[str, dict[str, Any]] = {
            str(r.get("slug")).lower(): r for r in normalised if r.get("slug")
        }

        self._restaurant_summaries: list[dict[str, Any]] = []
        self._summary_index: list[tuple[dict[str, Any], str]] = []
        self._tables_cache: dict[str, list[tuple[dict[str, Any], int]]] = {}
        self._table_lookup_cache: dict[str, dict[str, dict[str, Any]]] = {}

        for r in normalised:
            rid = r["id"]
            cover = r.get("cover_photo") or (r["photos"][0] if r.get("photos") else "")
            summary = {
                "id": rid,
                "name": r["name"],
                "slug": r.get("slug"),
                "cuisine": r.get("cuisine", []),
                "city": r.get("city"),
                "timezone": r.get("timezone") or "Asia/Baku",
                "cover_photo": cover,
                "short_description": r.get("short_description"),
                "price_level": r.get("price_level"),
                "tags": r.get("tags", []),
                "average_spend": r.get("average_spend"),
            }
            self._restaurant_summaries.append(summary)
            search_text = " ".join(
                [
                    r.get("name", ""),
                    r.get("city", ""),
                    r.get("slug", ""),
                    " ".join(r.get("cuisine", []) or []),
                ]
            ).lower()
            self._summary_index.append((summary, search_text))

            table_entries: list[tuple[dict[str, Any], int]] = []
            for area in r.get("areas") or []:
                for t in area.get("tables") or []:
                    cap = int(t.get("capacity", 2) or 2)
                    table_entries.append((t, cap))
            table_entries.sort(key=lambda entry: entry[1])
            self._tables_cache[rid] = table_entries
            self._table_lookup_cache[rid] = {str(t.get("id")): t for t, _ in table_entries}

    async def _sync_restaurants_to_db(self, entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Persist restaurant metadata to SQL so reservations can join across workers."""
        if not entries:
            return []
        async with get_session() as session:
            for entry in entries:
                rid = entry.get("id")
                if not rid:
                    continue
                record = await session.get(RestaurantRecord, str(rid))
                payload = dict(entry)
                if record:
                    record.slug = payload.get("slug")
                    record.name = payload.get("name") or record.name
                    record.city = payload.get("city")
                    record.timezone = payload.get("timezone")
                    record.cuisine = payload.get("cuisine")
                    record.tags = payload.get("tags")
                    record.payload = payload
                else:
                    record = RestaurantRecord(
                        id=str(rid),
                        slug=payload.get("slug"),
                        name=payload.get("name") or "",
                        city=payload.get("city"),
                        timezone=payload.get("timezone"),
                        cuisine=payload.get("cuisine"),
                        tags=payload.get("tags"),
                        payload=payload,
                    )
                    session.add(record)
            await session.commit()
            result = await session.execute(select(RestaurantRecord))
            rows = result.scalars().all()
            return [row.payload for row in rows if row.payload]

    # -------- helpers --------
    def _tables_for_restaurant(self, rid: str) -> list[dict[str, Any]]:
        return [table for table, _ in self._tables_cache.get(rid, [])]

    def _table_lookup(self, rid: str) -> dict[str, dict[str, Any]]:
        return self._table_lookup_cache.get(rid, {})

    def eligible_tables(self, rid: str, party_size: int) -> list[dict[str, Any]]:
        return [table for table, cap in self._tables_cache.get(rid, []) if cap >= party_size]

    @staticmethod
    def _overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
        return not (a_end <= b_start or b_end <= a_start)

    async def _reservations_for_restaurant_day(
        self, rid: str, day: date, restaurant_tz: str
    ) -> list[ReservationRecord]:
        try:
            tzinfo = ZoneInfo(restaurant_tz or "Asia/Baku")
        except ZoneInfoNotFoundError:
            tzinfo = ZoneInfo("Asia/Baku")
        day_start_local = datetime.combine(day, time.min, tzinfo=tzinfo)
        day_end_local = day_start_local + timedelta(days=1)
        day_start = day_start_local.astimezone(UTC)
        day_end = day_end_local.astimezone(UTC)
        async with get_session() as session:
            stmt = (
                select(ReservationRecord)
                .where(ReservationRecord.restaurant_id == rid)
                .where(ReservationRecord.status == "booked")
                .where(ReservationRecord.end > day_start)
                .where(ReservationRecord.start < day_end)
            )
            result = await session.execute(stmt)
            return result.scalars().all()

    async def reservations_for_day(
        self, rid: str, day: date, restaurant_tz: str
    ) -> list[dict[str, Any]]:
        rows = await self._reservations_for_restaurant_day(rid, day, restaurant_tz)
        return [_record_to_public_dict(row) for row in rows]

    # -------- restaurants --------
    def list_restaurants(self, q: str | None = None) -> list[dict[str, Any]]:
        if not q:
            return [dict(summary) for summary in self._restaurant_summaries]
        qlow = q.lower().strip()
        if not qlow:
            return [dict(summary) for summary in self._restaurant_summaries]
        return [dict(summary) for summary, search in self._summary_index if qlow in search]

    def get_restaurant(self, rid: str) -> dict[str, Any] | None:
        rid_str = str(rid)
        if rid_str in self.restaurants:
            return self.restaurants[rid_str]
        return self._restaurants_by_slug.get(rid_str.lower())

    # -------- reservations --------
    async def list_reservations(self, owner_id: str | None = None) -> list[dict[str, Any]]:
        async with get_session() as session:
            stmt = select(ReservationRecord)
            if owner_id:
                stmt = stmt.where(ReservationRecord.owner_id == owner_id)
            rows = (await session.execute(stmt)).scalars().all()
            return [_record_to_public_dict(row) for row in rows]

    async def _conflicting_reservations(
        self, session, rid: str, start: datetime, end: datetime
    ) -> list[ReservationRecord]:
        stmt = (
            select(ReservationRecord)
            .where(ReservationRecord.restaurant_id == rid)
            .where(ReservationRecord.status == "booked")
            .where(ReservationRecord.end > start)
            .where(ReservationRecord.start < end)
        )
        if getattr(session.bind.dialect, "name", "") != "sqlite":
            stmt = stmt.with_for_update(of=ReservationRecord)
        result = await session.execute(stmt)
        return result.scalars().all()

    async def create_reservation(
        self, payload: ReservationCreate, owner_id: str | None = None
    ) -> Reservation:
        rid = str(payload.restaurant_id)
        if payload.party_size < 1:
            raise HTTPException(status_code=422, detail="party_size must be >= 1")
        start = _ensure_datetime(
            payload.start if isinstance(payload.start, datetime) else str(payload.start)
        )
        end = _ensure_datetime(
            payload.end if isinstance(payload.end, datetime) else str(payload.end)
        )
        if end <= start:
            raise HTTPException(status_code=422, detail="end must be after start")
        if rid not in self.restaurants:
            raise HTTPException(status_code=404, detail="Restaurant not found")

        tables_by_id = self._table_lookup(rid)
        if payload.table_id:
            table_id = str(payload.table_id)
            if table_id not in tables_by_id:
                raise HTTPException(
                    status_code=422, detail="table_id does not belong to restaurant"
                )
            if tables_by_id[table_id].get("capacity", 1) < payload.party_size:
                raise HTTPException(status_code=422, detail="party_size exceeds table capacity")
        else:
            table_id = None
            for table, cap in self._tables_cache.get(rid, []):
                if cap >= payload.party_size:
                    table_id = str(table.get("id"))
                    break
            if not table_id and self._tables_cache.get(rid):
                table_id = str(self._tables_cache[rid][-1][0].get("id"))

        async with get_session() as session:
            conflicts = await self._conflicting_reservations(session, rid, start, end)
            for existing in conflicts:
                existing_table = existing.table_id
                if table_id and existing_table and existing_table != table_id:
                    continue
                raise HTTPException(status_code=409, detail="Selected table/time is already booked")

            record = ReservationRecord(
                id=str(uuid4()),
                restaurant_id=rid,
                table_id=table_id,
                party_size=payload.party_size,
                start=start,
                end=end,
                guest_name=payload.guest_name,
                guest_phone=payload.guest_phone or "",
                status="booked",
                owner_id=owner_id,
            )
            for field in PREP_FIELDS:
                setattr(record, field, None)
            session.add(record)
            await session.commit()
            await session.refresh(record)
            return _record_to_reservation(record)

    def create_reservation_sync(
        self, payload: ReservationCreate, owner_id: str | None = None
    ) -> Reservation:
        """Synchronous helper for tests and scripts."""
        return asyncio.run(self.create_reservation(payload, owner_id))

    async def set_status(self, resid: str, status: str) -> dict[str, Any] | None:
        if status not in ("booked", "cancelled"):
            raise HTTPException(status_code=422, detail="invalid status")
        async with get_session() as session:
            record = await session.get(ReservationRecord, str(resid))
            if not record:
                return None
            record.status = status
            await session.commit()
            await session.refresh(record)
            return _record_to_public_dict(record)

    def set_status_sync(self, resid: str, status: str) -> dict[str, Any] | None:
        """Synchronous helper for status updates."""
        return asyncio.run(self.set_status(resid, status))

    async def cancel_reservation(self, resid: str) -> dict[str, Any] | None:
        async with get_session() as session:
            record = await session.get(ReservationRecord, str(resid))
            if not record:
                return None
            payload = _record_to_public_dict(record)
            await session.delete(record)
            await session.commit()
            return payload

    def cancel_reservation_sync(self, resid: str) -> dict[str, Any] | None:
        """Synchronous helper for cancellation."""
        return asyncio.run(self.cancel_reservation(resid))

    async def get_reservation(self, resid: str) -> dict[str, Any] | None:
        async with get_session() as session:
            record = await session.get(ReservationRecord, str(resid))
            if not record:
                return None
            return _record_to_public_dict(record)

    async def update_reservation(self, resid: str, **fields: Any) -> dict[str, Any] | None:
        async with get_session() as session:
            record = await session.get(ReservationRecord, str(resid))
            if not record:
                return None
            for key, value in fields.items():
                if key in {"start", "end", "prep_request_time"} and value is not None:
                    setattr(record, key, _ensure_datetime(value))
                else:
                    setattr(record, key, value)
            await session.commit()
            await session.refresh(record)
            return _record_to_public_dict(record)


DB = Database()
