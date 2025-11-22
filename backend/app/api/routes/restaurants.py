from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from ...availability import availability_for_day
from ...contracts import Restaurant, RestaurantListItem
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


@router.get("/restaurants/{rid}/floorplan")
def get_floorplan(rid: UUID):
    record = DB.get_restaurant(str(rid))
    if not record:
        raise HTTPException(404, "Restaurant not found")
    canvas = {"width": 1000, "height": 1000}
    areas = []
    for area in get_attr(record, "areas", []) or []:
        tables = []
        for table in get_attr(area, "tables", []) or []:
            geometry = get_attr(table, "geometry") or {}
            tables.append(
                {
                    "id": str(get_attr(table, "id")),
                    "name": get_attr(table, "name"),
                    "capacity": int(get_attr(table, "capacity", 2) or 2),
                    "position": (
                        get_attr(table, "position") or geometry.get("position")
                        if isinstance(geometry, dict)
                        else None
                    ),
                    "shape": get_attr(table, "shape"),
                    "tags": list(get_attr(table, "tags", []) or []),
                    "rotation": get_attr(table, "rotation"),
                    "footprint": get_attr(table, "footprint")
                    or (geometry.get("footprint") if isinstance(geometry, dict) else None),
                    "geometry": geometry if isinstance(geometry, dict) and geometry else None,
                }
            )
        areas.append(
            {
                "id": str(get_attr(area, "id")),
                "name": get_attr(area, "name"),
                "tables": tables,
                "theme": get_attr(area, "theme"),
                "landmarks": get_attr(area, "landmarks"),
            }
        )
    return {"canvas": canvas, "areas": areas}


@router.get("/restaurants/{rid}/availability")
async def restaurant_availability(rid: UUID, date_: DateQuery, party_size: int = 2):
    record = DB.get_restaurant(str(rid))
    if not record:
        raise HTTPException(404, "Restaurant not found")
    return await availability_for_day(record, party_size, date_, DB)
