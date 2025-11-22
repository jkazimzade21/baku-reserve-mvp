from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from backend.app.contracts import ReservationCreate
from backend.app.schemas import PreorderRequest
from pydantic import ValidationError


def _reservation_payload(**overrides):
    now = datetime.utcnow().replace(microsecond=0)
    payload = {
        "restaurant_id": "test-restaurant",
        "party_size": 2,
        "start": now,
        "end": now + timedelta(hours=2),
        "guest_name": "Test Diner",
        "guest_phone": "+1 555 0101",
    }
    payload.update(overrides)
    return payload


def test_reservation_rejects_blank_guest_name():
    with pytest.raises(ValidationError):
        ReservationCreate(**_reservation_payload(guest_name="   "))


def test_reservation_rejects_invalid_guest_phone():
    with pytest.raises(ValidationError):
        ReservationCreate(**_reservation_payload(guest_phone="bad-number"))


def test_reservation_trims_guest_name():
    reservation = ReservationCreate(**_reservation_payload(guest_name="  Ana   M  "))
    assert reservation.guest_name == "Ana M"


def test_preorder_items_are_normalized():
    req = PreorderRequest(minutes_away=10, scope="starters", items=["  Soup  ", "  ", "Salad"])
    assert req.items == ["Soup", "Salad"]


def test_preorder_rejects_too_many_items():
    too_many = [f"Item {i}" for i in range(20)]
    with pytest.raises(ValidationError):
        PreorderRequest(minutes_away=15, scope="full", items=too_many)
