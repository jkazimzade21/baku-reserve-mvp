from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .validators import normalize_display_name, normalize_phone


# --- Tables & floorplan (string IDs so our demo IDs work) ---
class Table(BaseModel):
    id: str
    name: str | None = None
    capacity: int = 2
    position: tuple[int, int] | None = None
    shape: Literal["circle", "rect", "booth", "pod"] | None = "circle"


class Area(BaseModel):
    id: str
    name: str | None = None
    tables: list[Table] = Field(default_factory=list)


# --- Restaurant list/detail ---
class RestaurantListItem(BaseModel):
    id: str
    name: str
    cuisine: list[str] = Field(default_factory=list)
    city: str
    slug: str | None = None
    cover_photo: str | None = None
    timezone: str | None = None
    neighborhood: str | None = None
    address: str | None = None
    short_description: str | None = None
    price_level: str | None = None
    tags: list[str] = Field(default_factory=list)
    tag_groups: dict[str, list[str]] | None = None
    average_spend: str | None = None
    rating: float | None = None
    reviews_count: int = 0
    instagram: str | None = None


class Restaurant(BaseModel):
    id: str
    name: str
    slug: str | None = None
    cuisine: list[str] = Field(default_factory=list)
    city: str = "Baku"
    timezone: str = "Asia/Baku"
    address: str | None = None
    phone: str | None = None
    photos: list[str] = Field(default_factory=list)
    cover_photo: str | None = None
    short_description: str | None = None
    neighborhood: str | None = None
    price_level: str | None = None
    tags: list[str] = Field(default_factory=list)
    tag_groups: dict[str, list[str]] | None = None
    highlights: list[str] = Field(default_factory=list)
    map_images: list[str] = Field(default_factory=list)
    latitude: float | None = None
    longitude: float | None = None
    directions_url: str | None = None
    menu_url: str | None = None
    instagram: str | None = None
    whatsapp: str | None = None
    average_spend: str | None = None
    dress_code: str | None = None
    experiences: list[str] = Field(default_factory=list)
    areas: list[Area] = Field(default_factory=list)
    rating: float | None = None
    reviews_count: int = 0


# --- Reservations ---
class ReservationCreate(BaseModel):
    restaurant_id: str
    party_size: int
    start: datetime
    end: datetime
    guest_name: str
    guest_phone: str | None = None
    table_id: str | None = None

    @field_validator("party_size")
    @classmethod
    def _party_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("party_size must be >= 1")
        return v

    @field_validator("end")
    @classmethod
    def _end_after_start(cls, v: datetime, info):
        start = info.data.get("start")
        if isinstance(start, datetime) and v <= start:
            raise ValueError("end must be after start")
        return v

    @field_validator("guest_name")
    @classmethod
    def _guest_name(cls, value: str) -> str:
        return normalize_display_name(value, field="guest_name")

    @field_validator("guest_phone")
    @classmethod
    def _guest_phone(cls, value: str | None) -> str | None:
        return normalize_phone(value)


class UserBase(BaseModel):
    name: str
    email: str
    phone: str


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class User(UserBase):
    id: str
    verified_email: bool = False
    verified_phone: bool = False
    created_at: datetime
    updated_at: datetime


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)


class Reservation(BaseModel):
    id: str
    restaurant_id: str
    party_size: int
    start: datetime
    end: datetime
    guest_name: str
    guest_phone: str | None = None
    table_id: str | None = None
    status: Literal["pending", "booked", "cancelled", "arrived", "no_show"] = "booked"

    @field_validator("guest_name")
    @classmethod
    def _res_guest_name(cls, value: str) -> str:
        return normalize_display_name(value, field="guest_name")

    @field_validator("guest_phone")
    @classmethod
    def _res_guest_phone(cls, value: str | None) -> str | None:
        return normalize_phone(value)


class Review(BaseModel):
    id: str
    reservation_id: str
    restaurant_id: str
    rating: int = Field(ge=1, le=5)
    comment: str | None = None
    guest_name: str | None = None
    created_at: datetime
