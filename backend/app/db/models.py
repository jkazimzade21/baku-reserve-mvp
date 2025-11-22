from __future__ import annotations

import uuid

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Column,
    DateTime,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)

from ..settings import settings
from .core import Base


class ReservationRecord(Base):
    __tablename__ = "reservations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    restaurant_id = Column(String(64), nullable=False, index=True)
    table_id = Column(String(64), nullable=True, index=True)
    party_size = Column(Integer, nullable=False)
    start = Column(DateTime(timezone=True), nullable=False, index=True)
    end = Column(DateTime(timezone=True), nullable=False, index=True)
    guest_name = Column(String(255), nullable=False)
    guest_phone = Column(String(50), nullable=True)
    status = Column(String(20), nullable=False, default="booked", server_default=text("'booked'"))
    arrival_intent = Column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    owner_id = Column(String(128), nullable=True, index=True)
    prep_eta_minutes = Column(Integer, nullable=True)
    prep_scope = Column(String(50), nullable=True)
    prep_request_time = Column(DateTime(timezone=True), nullable=True)
    prep_items = Column(JSON, nullable=True)
    prep_status = Column(String(32), nullable=True)
    prep_policy = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


constraints = [
    UniqueConstraint("restaurant_id", "table_id", "start", name="uq_reservation_slot"),
    CheckConstraint("end > start", name="ck_reservation_times"),
]

if settings.database_url.startswith("postgresql"):
    try:
        from sqlalchemy.dialects.postgresql import ExcludeConstraint

        constraints.append(
            ExcludeConstraint(
                (func.tstzrange(ReservationRecord.start, ReservationRecord.end, "[]"), "&&"),
                (ReservationRecord.restaurant_id, "="),
                (ReservationRecord.table_id, "="),
                name="reservations_no_overlap",
                using="gist",
            )
        )
    except Exception:
        # Skip exclusion constraint if dialect/types unavailable (e.g., SQLite)
        pass

ReservationRecord.__table_args__ = tuple(constraints)


class RestaurantRecord(Base):
    __tablename__ = "restaurants"

    id = Column(String(64), primary_key=True)
    slug = Column(String(128), nullable=True, index=True, unique=True)
    name = Column(String(255), nullable=False)
    city = Column(String(64), nullable=True)
    timezone = Column(String(64), nullable=True)
    cuisine = Column(JSON, nullable=True)
    tags = Column(JSON, nullable=True)
    payload = Column(JSON, nullable=False, server_default=text("'{}'"))

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "restaurant_id": self.restaurant_id,
            "table_id": self.table_id,
            "party_size": self.party_size,
            "start": self.start,
            "end": self.end,
            "guest_name": self.guest_name,
            "guest_phone": self.guest_phone,
            "status": self.status,
            "owner_id": self.owner_id,
            "prep_eta_minutes": self.prep_eta_minutes,
            "prep_scope": self.prep_scope,
            "prep_request_time": self.prep_request_time,
            "prep_items": self.prep_items,
            "prep_status": self.prep_status,
            "prep_policy": self.prep_policy,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
