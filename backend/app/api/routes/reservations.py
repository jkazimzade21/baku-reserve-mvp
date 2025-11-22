from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ...auth import require_auth
from ...contracts import Reservation, ReservationCreate, Review
from ...storage import DB
from ..utils import ensure_reservation_owner, rec_to_reservation

router = APIRouter(tags=["reservations"])


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)


def _scope_tokens(claims: dict[str, Any]) -> set[str]:
    raw = claims.get("scope")
    if isinstance(raw, str):
        return {token for token in raw.split() if token}
    if isinstance(raw, list | tuple | set):
        return {str(token) for token in raw if str(token).strip()}
    return set()


def _is_reservations_admin(claims: dict[str, Any]) -> bool:
    scopes = _scope_tokens(claims)
    return any(scope in scopes for scope in ("reservations:admin", "reservations:all"))


def _owner_id_from_claims(claims: dict[str, Any]) -> str | None:
    sub = claims.get("sub")
    if isinstance(sub, str):
        trimmed = sub.strip()
        if trimmed:
            return trimmed
    return None


@router.get("/reservations")
async def list_reservations(claims: dict[str, Any] = Depends(require_auth)):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    if not is_admin and not owner_id:
        raise HTTPException(401, "Missing subject claim")
    return await DB.list_reservations(None if is_admin else owner_id)


@router.post("/reservations", response_model=Reservation, status_code=201)
async def create_reservation(
    payload: ReservationCreate, claims: dict[str, Any] = Depends(require_auth)
):
    owner_id = _owner_id_from_claims(claims)
    if not owner_id:
        raise HTTPException(401, "Missing subject claim")
    try:
        return await DB.create_reservation(payload, owner_id=owner_id)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/reservations/{resid}/cancel", response_model=Reservation)
async def soft_cancel_reservation(resid: UUID, claims: dict[str, Any] = Depends(require_auth)):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    ensure_reservation_owner(await DB.get_reservation(str(resid)), owner_id, is_admin)
    record = await DB.set_status(str(resid), "cancelled")
    if not record:
        raise HTTPException(404, "Reservation not found")
    return rec_to_reservation(record)


@router.post("/reservations/{resid}/confirm", response_model=Reservation)
async def confirm_reservation(resid: UUID, claims: dict[str, Any] = Depends(require_auth)):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    ensure_reservation_owner(await DB.get_reservation(str(resid)), owner_id, is_admin)
    record = await DB.set_status(str(resid), "booked")
    if not record:
        raise HTTPException(404, "Reservation not found")
    return rec_to_reservation(record)


@router.delete("/reservations/{resid}", response_model=Reservation)
async def hard_delete_reservation(resid: UUID, claims: dict[str, Any] = Depends(require_auth)):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    ensure_reservation_owner(await DB.get_reservation(str(resid)), owner_id, is_admin)
    record = await DB.cancel_reservation(str(resid))
    if not record:
        raise HTTPException(404, "Reservation not found")
    return rec_to_reservation(record)


@router.post("/reservations/{resid}/arrive", response_model=Reservation)
async def mark_arrived(resid: UUID, claims: dict[str, Any] = Depends(require_auth)):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    ensure_reservation_owner(await DB.get_reservation(str(resid)), owner_id, is_admin)
    record = await DB.set_status(str(resid), "arrived")
    if not record:
        raise HTTPException(404, "Reservation not found")
    return rec_to_reservation(record)


@router.post("/reservations/{resid}/no-show", response_model=Reservation)
async def mark_no_show(resid: UUID, claims: dict[str, Any] = Depends(require_auth)):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    ensure_reservation_owner(await DB.get_reservation(str(resid)), owner_id, is_admin)
    record = await DB.set_status(str(resid), "no_show")
    if not record:
        raise HTTPException(404, "Reservation not found")
    return rec_to_reservation(record)


@router.get("/reservations/{resid}/review", response_model=Review)
async def get_review(resid: UUID, claims: dict[str, Any] = Depends(require_auth)):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    ensure_reservation_owner(await DB.get_reservation(str(resid)), owner_id, is_admin)
    review = await DB.get_review_for_reservation(str(resid))
    if not review:
        raise HTTPException(404, "Review not found")
    return review


@router.post("/reservations/{resid}/review", response_model=Review, status_code=201)
async def submit_review(
    resid: UUID, payload: ReviewCreate, claims: dict[str, Any] = Depends(require_auth)
):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    ensure_reservation_owner(await DB.get_reservation(str(resid)), owner_id, is_admin)
    try:
        review = await DB.create_review(
            str(resid), owner_id=owner_id if not is_admin else None, rating=payload.rating, comment=payload.comment
        )
    except HTTPException:
        raise
    return review
