from __future__ import annotations

import datetime as dt
from uuid import uuid4

import pytest
from backend.app.settings import settings
from backend.app.storage import DB
from fastapi.testclient import TestClient


def _sample_restaurant_id() -> str:
    try:
        return next(iter(DB.restaurants.keys()))
    except StopIteration as exc:
        raise AssertionError("Seed data missing restaurants") from exc


def _create_reservation(client: TestClient, *, minutes_from_now: int = 120) -> dict:
    rid = _sample_restaurant_id()
    start = dt.datetime.utcnow() + dt.timedelta(minutes=minutes_from_now)
    end = start + dt.timedelta(hours=2)
    payload = {
        "restaurant_id": rid,
        "party_size": 2,
        "start": start.replace(microsecond=0).isoformat(),
        "end": end.replace(microsecond=0).isoformat(),
        "guest_name": f"Prep Flow {uuid4().hex[:6]}",
    }
    resp = client.post("/reservations", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_prep_quote_disabled_returns_404(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "PREP_NOTIFY_ENABLED", False)
    reservation = _create_reservation(client)
    resp = client.post(
        f"/reservations/{reservation['id']}/preorder/quote",
        json={"minutes_away": 10, "scope": "starters"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Feature disabled"


def test_prep_quote_and_confirm_success(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "PREP_NOTIFY_ENABLED", True)
    reservation = _create_reservation(client)

    quote = client.post(
        f"/reservations/{reservation['id']}/preorder/quote",
        json={"minutes_away": 10, "scope": "full"},
    )
    assert quote.status_code == 200, quote.text
    payload = quote.json()
    assert payload["recommended_prep_minutes"] >= 10
    assert isinstance(payload["policy"], str)
    assert payload["policy"].strip() != ""

    confirm = client.post(
        f"/reservations/{reservation['id']}/preorder/confirm",
        json={"minutes_away": 15, "scope": "full", "items": ["dolma"]},
    )
    assert confirm.status_code == 200, confirm.text
    body = confirm.json()
    assert body["prep_status"] == "accepted"
    assert body["prep_eta_minutes"] == 15
    assert body["prep_items"] == ["dolma"]
    assert body["prep_policy"] == payload["policy"]


def test_prep_confirm_sanitizes_items(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "PREP_NOTIFY_ENABLED", True)
    reservation = _create_reservation(client)
    resp = client.post(
        f"/reservations/{reservation['id']}/preorder/confirm",
        json={"minutes_away": 5, "scope": "starters", "items": ["  ", "qutab", ""]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["prep_items"] == ["qutab"]
