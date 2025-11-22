from __future__ import annotations

import uuid

from sqlalchemy import (
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
    owner_id = Column(String(128), nullable=True, index=True)
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


class ReviewRecord(Base):
    __tablename__ = "reviews"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    reservation_id = Column(String(36), nullable=False, index=True, unique=True)
    restaurant_id = Column(String(64), nullable=False, index=True)
    owner_id = Column(String(128), nullable=True, index=True)
    guest_name = Column(String(255), nullable=True)
    rating = Column(Integer, nullable=False)
    comment = Column(String(1000), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
