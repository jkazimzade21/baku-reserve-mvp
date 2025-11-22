from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ...auth import require_auth
from ...contracts import (
    Reservation,
    ReservationCreate,
)
from ...schemas import PreorderConfirmRequest, PreorderQuoteResponse, PreorderRequest
from ...storage import DB
from ..utils import (
    build_prep_plan,
    ensure_prep_feature_enabled,
    ensure_reservation_owner,
    notify_restaurant,
    rec_to_reservation,
    require_active_reservation,
    sanitize_items,
)

router = APIRouter(tags=["reservations"])


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


@router.post("/reservations/{resid}/preorder/quote", response_model=PreorderQuoteResponse)
async def preorder_quote(
    resid: UUID, payload: PreorderRequest, claims: dict[str, Any] = Depends(require_auth)
):
    ensure_prep_feature_enabled()
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    record = await require_active_reservation(str(resid), owner_id=owner_id, allow_admin=is_admin)
    recommended, policy = build_prep_plan(record, payload.scope, payload.minutes_away)
    return PreorderQuoteResponse(policy=policy, recommended_prep_minutes=recommended)


@router.post("/reservations/{resid}/preorder/confirm", response_model=Reservation)
async def preorder_confirm(
    resid: UUID, payload: PreorderConfirmRequest, claims: dict[str, Any] = Depends(require_auth)
):
    ensure_prep_feature_enabled()
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    record = await require_active_reservation(str(resid), owner_id=owner_id, allow_admin=is_admin)
    _, policy = build_prep_plan(record, payload.scope, payload.minutes_away)
    items = sanitize_items(payload.normalized_items)
    now = datetime.now(UTC)
    updated = await DB.update_reservation(
        str(resid),
        prep_eta_minutes=payload.minutes_away,
        prep_scope=payload.scope,
        prep_request_time=now,
        prep_items=items,
        prep_status="accepted",
        prep_policy=policy,
    )
    if not updated:
        raise HTTPException(404, "Reservation not found")
    notify_restaurant(
        updated,
        {"minutes_away": payload.minutes_away, "scope": payload.scope, "items": items or []},
    )
    return rec_to_reservation(updated)
