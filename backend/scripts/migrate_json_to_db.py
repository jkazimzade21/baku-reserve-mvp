#!/usr/bin/env python3
"""One-off helper to import legacy reservations.json records into SQLite."""

from __future__ import annotations

import json
from uuid import uuid4

from backend.app.db.core import get_session, init_db
from backend.app.db.models import ReservationRecord
from backend.app.settings import settings
from backend.app.storage import _ensure_datetime


def main() -> None:
    data_dir = settings.data_dir
    legacy_file = data_dir / "reservations.json"
    if not legacy_file.exists():
        print(f"No legacy reservations.json found under {legacy_file}")
        return

    payload = json.loads(legacy_file.read_text(encoding="utf-8") or "{}")
    records = payload.get("reservations", [])
    if not records:
        print("Legacy file contains no reservations")
        return

    init_db()
    inserted = 0
    with get_session() as session:
        for row in records:
            rid = str(row.get("id") or uuid4())
            if session.get(ReservationRecord, rid):
                continue
            try:
                start = _ensure_datetime(row["start"])
                end = _ensure_datetime(row["end"])
            except Exception as exc:  # pragma: no cover - invalid rows skipped
                print(f"Skipping malformed record {rid}: {exc}")
                continue
            record = ReservationRecord(
                id=rid,
                restaurant_id=str(row["restaurant_id"]),
                table_id=row.get("table_id"),
                party_size=int(row.get("party_size", 1)),
                start=start,
                end=end,
                guest_name=str(row.get("guest_name", "")),
                guest_phone=row.get("guest_phone"),
                status=row.get("status", "booked"),
                arrival_intent=row.get("arrival_intent") or {},
                owner_id=row.get("owner_id"),
                prep_eta_minutes=row.get("prep_eta_minutes"),
                prep_scope=row.get("prep_scope"),
                prep_request_time=row.get("prep_request_time"),
                prep_items=row.get("prep_items"),
                prep_status=row.get("prep_status"),
                prep_policy=row.get("prep_policy"),
            )
            session.add(record)
            inserted += 1
        session.commit()
    print(f"Imported {inserted} reservations into {settings.database_url}")


if __name__ == "__main__":
    main()
