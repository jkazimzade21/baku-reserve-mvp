from __future__ import annotations

import asyncio
import datetime as dt
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import pytest
from backend.app.availability import availability_for_day
from backend.app.contracts import ReservationCreate
from backend.app.serializers import absolute_media_list, absolute_media_url
from backend.app.settings import settings
from backend.app.storage import DB
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

RID = "fc34a984-0b39-4f0a-afa2-5b677c61f044"  # Sahil Bar & Restaurant


def _assert_testserver_asset(url: str) -> None:
    """Ensure we only reference bundled testserver assets."""
    parsed = urlparse(url)
    assert parsed.scheme == "http"
    assert parsed.netloc == "api.testserver"


def _viable_slot(client: TestClient, day: str, party_size: int = 2) -> dict[str, Any]:
    response = client.get(
        f"/restaurants/{RID}/availability",
        params={"date": day, "party_size": party_size},
    )
    assert response.status_code == 200
    for slot in response.json()["slots"]:
        if slot["available_table_ids"]:
            return slot
    raise AssertionError("Expected at least one available slot for the seeded data")


def _iso_today() -> str:
    return dt.date.today().isoformat()


def test_health_and_documentation_endpoints_present(client: TestClient) -> None:
    response = client.get("/health")
    payload = response.json()

    # Verify enhanced health check structure
    assert "status" in payload
    assert "service" in payload
    assert "version" in payload
    if settings.DEBUG:
        assert "details" in payload and "checks" in payload["details"]
    assert payload["service"] == "baku-reserve"
    assert payload["version"] == "0.1.0"
    assert response.status_code in [200, 503]  # 200 if healthy, 503 if degraded

    for path in ("/docs", "/openapi.json"):
        resp = client.get(path)
        assert resp.status_code == 200


def test_root_redirects_to_booking_console(client: TestClient) -> None:
    resp = client.get("/", follow_redirects=False)
    assert resp.status_code in (307, 308)
    assert resp.headers["location"].startswith("/book")


def test_restaurant_catalog_search_and_detail_media(client: TestClient) -> None:
    listing = client.get("/restaurants")
    assert listing.status_code == 200
    restaurants = listing.json()
    assert any(r["id"] == RID for r in restaurants)
    assert all("slug" in r for r in restaurants)
    sahil_summary = next(r for r in restaurants if r["id"] == RID)
    assert sahil_summary["slug"] == "sahil"

    filtered = client.get("/restaurants", params={"q": "Seafood"})
    assert filtered.status_code == 200
    assert all("Seafood" in " ".join(rest.get("cuisine", [])) for rest in filtered.json())

    detail = client.get(f"/restaurants/{RID}").json()
    assert detail["id"] == RID
    assert detail["slug"] == "sahil"
    assert detail["areas"], "Expected fully hydrated area/layout payload"
    _assert_testserver_asset(detail["cover_photo"])
    for photo in detail["photos"]:
        _assert_testserver_asset(photo)


def test_floorplan_payload_contains_geometry(client: TestClient) -> None:
    resp = client.get(f"/restaurants/{RID}/floorplan")
    assert resp.status_code == 200
    data = resp.json()
    assert data["canvas"] == {"width": 1000, "height": 1000}
    assert data["areas"], "Expected at least one seating area"
    first = data["areas"][0]
    assert first["tables"], "Expected tables in seating area"
    assert {"id", "position", "capacity"}.issubset(first["tables"][0].keys())


def test_photo_assets_are_served_via_static_mount(client: TestClient) -> None:
    resp = client.get("/assets/restaurants/sahil/1.jpg")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/")


def test_availability_reflects_reservation_lifecycle(client: TestClient) -> None:
    day = _iso_today()
    slot_before = _viable_slot(client, day)
    table_id = slot_before["available_table_ids"][0]

    payload = {
        "restaurant_id": RID,
        "party_size": 2,
        "start": slot_before["start"],
        "end": slot_before["end"],
        "guest_name": "Availability Guard",
        "table_id": table_id,
    }
    created = client.post("/reservations", json=payload)
    assert created.status_code == 201
    resid = created.json()["id"]

    during = client.get(
        f"/restaurants/{RID}/availability",
        params={"date": day, "party_size": 2},
    )
    slot_during = next(s for s in during.json()["slots"] if s["start"] == slot_before["start"])
    assert slot_during["count"] == slot_before["count"] - 1
    assert table_id not in slot_during["available_table_ids"]

    delete = client.delete(f"/reservations/{resid}")
    assert delete.status_code == 200

    after = client.get(
        f"/restaurants/{RID}/availability",
        params={"date": day, "party_size": 2},
    )
    slot_after = next(s for s in after.json()["slots"] if s["start"] == slot_before["start"])
    assert slot_after["count"] == slot_before["count"]
    assert table_id in slot_after["available_table_ids"]


def test_availability_slots_include_timezone_offsets(client: TestClient) -> None:
    day = _iso_today()
    response = client.get(
        f"/restaurants/{RID}/availability",
        params={"date": day, "party_size": 2},
    )
    assert response.status_code == 200
    slots = response.json()["slots"]
    assert slots, "Expected availability data"
    sample = slots[0]
    start = sample["start"]
    parsed = dt.datetime.fromisoformat(start)
    assert parsed.tzinfo is not None, "Expected timezone-aware start timestamp"


def test_reservation_lifecycle_and_conflict_detection(client: TestClient) -> None:
    day = _iso_today()
    slot = _viable_slot(client, day)
    table_id = slot["available_table_ids"][0]

    payload = {
        "restaurant_id": RID,
        "party_size": 2,
        "start": slot["start"],
        "end": slot["end"],
        "guest_name": "Lifecycle",
        "table_id": table_id,
    }
    created = client.post("/reservations", json=payload)
    assert created.status_code == 201
    reservation = created.json()

    listed = client.get("/reservations").json()
    assert any(item["id"] == reservation["id"] for item in listed)

    conflict = client.post("/reservations", json=payload)
    assert conflict.status_code == 409

    confirm = client.post(f"/reservations/{reservation['id']}/confirm")
    assert confirm.status_code == 200
    cancel = client.post(f"/reservations/{reservation['id']}/cancel")
    assert cancel.status_code == 200
    cancel_again = client.post(f"/reservations/{reservation['id']}/cancel")
    assert cancel_again.status_code == 200

    delete = client.delete(f"/reservations/{reservation['id']}")
    assert delete.status_code == 200
    missing = client.delete(f"/reservations/{reservation['id']}")
    assert missing.status_code == 404


def test_reservations_are_scoped_per_owner(client: TestClient, monkeypatch) -> None:
    from backend.app import auth

    token_map = {
        "token-a": {"sub": "user-a", "scope": "demo"},
        "token-b": {"sub": "user-b", "scope": "demo"},
    }

    def fake_verify(token: str, required_scopes: list[str] | None = None):
        payload = token_map.get(token)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid token")
        return payload

    monkeypatch.setattr(auth.auth0_verifier, "verify", fake_verify)
    previous_bypass = settings.AUTH0_BYPASS
    settings.AUTH0_BYPASS = False
    headers_a = {"Authorization": "Bearer token-a"}
    headers_b = {"Authorization": "Bearer token-b"}

    try:
        day = _iso_today()
        availability = client.get(
            f"/restaurants/{RID}/availability",
            params={"date": day, "party_size": 2},
            headers=headers_a,
        )
        assert availability.status_code == 200
        slot = next(
            (s for s in availability.json()["slots"] if s["available_table_ids"]),
            None,
        )
        assert slot, "Expected at least one slot"

        payload = ReservationCreate(
            restaurant_id=RID,
            party_size=2,
            start=dt.datetime.fromisoformat(slot["start"]),
            end=dt.datetime.fromisoformat(slot["end"]),
            guest_name="Scoped Owner",
        )
        rec_a = DB.create_reservation_sync(payload, owner_id="user-a")

        day_b = (dt.date.fromisoformat(day) + dt.timedelta(days=1)).isoformat()
        availability_b = client.get(
            f"/restaurants/{RID}/availability",
            params={"date": day_b, "party_size": 2},
            headers=headers_b,
        )
        assert availability_b.status_code == 200
        slot_b = next(
            (s for s in availability_b.json()["slots"] if s["available_table_ids"]),
            None,
        )
        assert slot_b, "Expected at least one slot for user B"
        payload_b = ReservationCreate(
            restaurant_id=RID,
            party_size=2,
            start=dt.datetime.fromisoformat(slot_b["start"]),
            end=dt.datetime.fromisoformat(slot_b["end"]),
            guest_name="Scoped Owner",
        )
        rec_b = DB.create_reservation_sync(payload_b, owner_id="user-b")

        list_a = client.get("/reservations", headers=headers_a).json()
        assert {item["id"] for item in list_a} == {rec_a.id}

        forbidden = client.post(f"/reservations/{rec_b.id}/cancel", headers=headers_a)
        assert forbidden.status_code == 404

        allowed = client.post(f"/reservations/{rec_b.id}/cancel", headers=headers_b)
        assert allowed.status_code == 200
    finally:
        settings.AUTH0_BYPASS = previous_bypass


def test_validation_and_unknown_restaurant_rejections(client: TestClient) -> None:
    day = _iso_today()
    start = f"{day}T18:00:00"
    end = f"{day}T19:30:00"

    bad_party = {
        "restaurant_id": RID,
        "party_size": 0,
        "start": start,
        "end": end,
        "guest_name": "TooSmall",
    }
    assert client.post("/reservations", json=bad_party).status_code == 422

    unknown_restaurant = {
        "restaurant_id": str(uuid4()),
        "party_size": 2,
        "start": start,
        "end": end,
        "guest_name": "Unknown",
    }
    assert client.post("/reservations", json=unknown_restaurant).status_code == 404


def test_database_autopick_selects_smallest_fitting_table() -> None:
    day = dt.date.today()
    start = dt.datetime.combine(day, dt.time(19, 0))
    end = start + dt.timedelta(hours=2)
    payload = ReservationCreate(
        restaurant_id=RID,
        party_size=5,
        start=start,
        end=end,
        guest_name="AutoPick",
    )

    reservation = DB.create_reservation_sync(payload)
    try:
        assert reservation.table_id is not None
        tables = DB._table_lookup(RID)  # type: ignore[attr-defined]
        chosen_capacity = tables[reservation.table_id]["capacity"]
        eligible = [t["capacity"] for t in tables.values() if t["capacity"] >= payload.party_size]
        assert chosen_capacity == min(eligible)
    finally:
        DB.cancel_reservation_sync(reservation.id)


def test_absolute_media_helpers_normalize_relative_values() -> None:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [],
        "scheme": "https",
        "server": ("demo.example", 443),
    }
    request = Request(scope)
    assert absolute_media_url(request, "/assets/r/1.jpg") == "https://demo.example/assets/r/1.jpg"
    assert absolute_media_url(request, "https://cdn.example/r.jpg") == "https://cdn.example/r.jpg"
    assert absolute_media_list(request, ["/a.jpg", "https://b.jpg"]) == [
        "https://demo.example/a.jpg",
        "https://b.jpg",
    ]


def test_availability_helper_blocks_shared_reservations() -> None:
    class FakeDb:
        def __init__(self) -> None:
            self.reservations = {
                "specific": {
                    "restaurant_id": RID,
                    "table_id": "t-specific",
                    "party_size": 2,
                    "start": "2025-01-01T18:00:00",
                    "end": "2025-01-01T19:30:00",
                    "status": "booked",
                },
                "shared": {
                    "restaurant_id": RID,
                    "table_id": "",
                    "party_size": 4,
                    "start": "2025-01-01T19:30:00",
                    "end": "2025-01-01T21:00:00",
                    "status": "booked",
                },
            }

        def eligible_tables(self, rid: str, party_size: int):
            return [
                {"id": "t-specific", "capacity": 2},
                {"id": "t-shared", "capacity": 4},
            ]

        async def reservations_for_day(self, rid: str, day: dt.date, restaurant_tz: str):
            return list(self.reservations.values())

    fake_db = FakeDb()
    restaurant = {"id": RID}
    day = dt.date(2025, 1, 1)
    result = asyncio.run(availability_for_day(restaurant, 2, day, fake_db))
    slots = {slot["start"][:19]: slot for slot in result["slots"]}
    specific_slot = slots.get("2025-01-01T18:00:00")
    assert specific_slot is not None
    assert specific_slot["available_table_ids"] == ["t-shared"]

    shared_slot = slots.get("2025-01-01T19:30:00")
    assert shared_slot is not None
    assert shared_slot["available_table_ids"] == ["t-specific"]


def test_conflicting_status_changes_are_rejected() -> None:
    day = dt.date.today()
    start = dt.datetime.combine(day, dt.time(22, 0))
    end = start + dt.timedelta(hours=1, minutes=30)
    payload = ReservationCreate(
        restaurant_id=RID,
        party_size=2,
        start=start,
        end=end,
        guest_name="Status",
    )
    reservation = DB.create_reservation_sync(payload)
    try:
        with pytest.raises(HTTPException):
            DB.set_status_sync(reservation.id, "seated")  # type: ignore[arg-type]
    finally:
        DB.cancel_reservation_sync(reservation.id)
