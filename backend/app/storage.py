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
from sqlalchemy import func, select

from .contracts import Reservation, ReservationCreate
from .db.core import ensure_db_initialized, get_session
from .db.models import ReservationRecord, RestaurantRecord, ReviewRecord
from .settings import settings

logger = logging.getLogger(__name__)

DATA_DIR = settings.data_dir
LEGACY_DATA_DIR = Path(__file__).resolve().parent / "data"


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
        "created_at": (_iso(record.created_at) if getattr(record, "created_at", None) else None),
        "updated_at": (_iso(record.updated_at) if getattr(record, "updated_at", None) else None),
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
    )


def _review_to_public(record: ReviewRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "reservation_id": record.reservation_id,
        "restaurant_id": record.restaurant_id,
        "owner_id": record.owner_id,
        "guest_name": record.guest_name,
        "rating": record.rating,
        "comment": record.comment,
        "created_at": (_iso(record.created_at) if getattr(record, "created_at", None) else None),
    }


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
            entry.setdefault("rating", 0.0)
            entry.setdefault("reviews_count", 0)

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
                "rating": float(r.get("rating") or 0.0),
                "reviews_count": int(r.get("reviews_count") or 0),
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

        try:
            # hydrate review aggregates on startup
            stats = asyncio.run(self._load_review_stats())
            for rid, payload in stats.items():
                if rid in self.restaurants:
                    self.restaurants[rid]["rating"] = payload["average_rating"]
                    self.restaurants[rid]["reviews_count"] = payload["count"]
                for summary in self._restaurant_summaries:
                    if summary["id"] == rid:
                        summary["rating"] = payload["average_rating"]
                        summary["reviews_count"] = payload["count"]
        except Exception:
            logger.exception("Failed to hydrate review aggregates; continuing without stats")

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

    async def _load_review_stats(self) -> dict[str, dict[str, Any]]:
        async with get_session() as session:
            stmt = select(
                ReviewRecord.restaurant_id,
                func.count(ReviewRecord.id),
                func.avg(ReviewRecord.rating),
            ).group_by(ReviewRecord.restaurant_id)
            result = await session.execute(stmt)
            stats: dict[str, dict[str, Any]] = {}
            for restaurant_id, count, average in result.all():
                stats[str(restaurant_id)] = {
                    "count": int(count or 0),
                    "average_rating": float(average or 0.0),
                }
            return stats

    async def _refresh_review_stats_for_restaurant(self, rid: str) -> dict[str, Any]:
        async with get_session() as session:
            stmt = select(func.count(ReviewRecord.id), func.avg(ReviewRecord.rating)).where(
                ReviewRecord.restaurant_id == rid
            )
            result = await session.execute(stmt)
            count, average = result.one_or_none() or (0, 0.0)
            stats = {"count": int(count or 0), "average_rating": float(average or 0.0)}
            if rid in self.restaurants:
                self.restaurants[rid]["rating"] = stats["average_rating"]
                self.restaurants[rid]["reviews_count"] = stats["count"]
            for summary in self._restaurant_summaries:
                if summary["id"] == rid:
                    summary["rating"] = stats["average_rating"]
                    summary["reviews_count"] = stats["count"]
            return stats

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
        blocking_statuses = ("booked", "pending", "arrived")
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
                .where(ReservationRecord.status.in_(blocking_statuses))
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
        blocking_statuses = ("booked", "pending", "arrived")
        stmt = (
            select(ReservationRecord)
            .where(ReservationRecord.restaurant_id == rid)
            .where(ReservationRecord.status.in_(blocking_statuses))
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
        restaurant = self.restaurants[rid]
        confirmation_mode = str(restaurant.get("confirmation_mode") or "auto").lower()
        initial_status = "pending" if confirmation_mode == "manual" else "booked"

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
                status=initial_status,
                owner_id=owner_id,
            )
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
        allowed = {"pending", "booked", "cancelled", "arrived", "no_show"}
        if status not in allowed:
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
                if key in {"start", "end"} and value is not None:
                    setattr(record, key, _ensure_datetime(value))
                else:
                    setattr(record, key, value)
            await session.commit()
            await session.refresh(record)
            return _record_to_public_dict(record)

    async def get_review_for_reservation(self, resid: str) -> dict[str, Any] | None:
        async with get_session() as session:
            stmt = select(ReviewRecord).where(ReviewRecord.reservation_id == resid)
            result = await session.execute(stmt)
            review = result.scalar_one_or_none()
            return _review_to_public(review) if review else None

    async def create_review(
        self, resid: str, owner_id: str | None, rating: int, comment: str | None = None
    ) -> dict[str, Any]:
        if rating < 1 or rating > 5:
            raise HTTPException(status_code=422, detail="rating must be between 1 and 5")
        async with get_session() as session:
            reservation = await session.get(ReservationRecord, str(resid))
            if not reservation:
                raise HTTPException(status_code=404, detail="Reservation not found")
            if reservation.status != "arrived":
                raise HTTPException(status_code=409, detail="Reviews are available after arrival")
            if owner_id and reservation.owner_id and reservation.owner_id != owner_id:
                raise HTTPException(status_code=403, detail="You cannot review this reservation")
            existing = await session.execute(
                select(ReviewRecord).where(ReviewRecord.reservation_id == str(resid))
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Review already submitted")
            review = ReviewRecord(
                reservation_id=str(resid),
                restaurant_id=reservation.restaurant_id,
                owner_id=owner_id,
                guest_name=reservation.guest_name,
                rating=int(rating),
                comment=comment.strip() if comment else None,
            )
            session.add(review)
            await session.commit()
            await session.refresh(review)
            # refresh aggregates
            await self._refresh_review_stats_for_restaurant(reservation.restaurant_id)
            return _review_to_public(review)

    async def list_reviews(
        self, restaurant_id: str, limit: int = 50, offset: int = 0
    ) -> list[dict[str, Any]]:
        async with get_session() as session:
            stmt = (
                select(ReviewRecord)
                .where(ReviewRecord.restaurant_id == restaurant_id)
                .order_by(ReviewRecord.created_at.desc())
                .limit(max(1, min(limit, 100)))
                .offset(max(0, offset))
            )
            result = await session.execute(stmt)
            return [_review_to_public(r) for r in result.scalars().all()]


DB = Database()
