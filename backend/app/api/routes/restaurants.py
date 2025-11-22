from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from ...availability import availability_for_day
from ...contracts import Restaurant, RestaurantListItem, Review
from ...serializers import get_attr, restaurant_to_detail, restaurant_to_list_item
from ...storage import DB
from ..types import DateQuery, RestaurantSearch

router = APIRouter(tags=["restaurants"])


@router.get("/restaurants", response_model=list[RestaurantListItem])
def list_restaurants(request: Request, q: RestaurantSearch = None):
    items = DB.list_restaurants(q)
    return [restaurant_to_list_item(r, request) for r in items]


@router.get("/restaurants/{rid}", response_model=Restaurant)
def get_restaurant(rid: UUID, request: Request):
    record = DB.get_restaurant(str(rid))
    if not record:
        raise HTTPException(404, "Restaurant not found")
    return restaurant_to_detail(record, request)


@router.get("/restaurants/{rid}/availability")
async def restaurant_availability(rid: UUID, date_: DateQuery, party_size: int = 2):
    record = DB.get_restaurant(str(rid))
    if not record:
        raise HTTPException(404, "Restaurant not found")
    return await availability_for_day(record, party_size, date_, DB)


@router.get("/restaurants/{rid}/reviews", response_model=list[Review])
async def list_reviews(rid: UUID, limit: int = 20, offset: int = 0):
    record = DB.get_restaurant(str(rid))
    if not record:
        raise HTTPException(404, "Restaurant not found")
    return await DB.list_reviews(str(rid), limit=limit, offset=offset)
