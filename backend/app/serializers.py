from __future__ import annotations

from typing import Any

from fastapi import Request


def get_attr(o: Any, key: str, default=None):
    if isinstance(o, dict):
        return o.get(key, default)
    return getattr(o, key, default)


def absolute_media_url(request: Request | None, value: str | None) -> str | None:
    if not value:
        return value
    if not request:
        return value
    raw = str(value).strip()
    if not raw:
        return None
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw
    normalized = raw if raw.startswith("/") else f"/{raw}"
    base = str(request.base_url).rstrip("/")
    return f"{base}{normalized}"


def absolute_media_list(request: Request | None, values: list[str]) -> list[str]:
    return [absolute_media_url(request, value) or value for value in values]


def restaurant_to_list_item(r: Any, request: Request | None = None) -> dict[str, Any]:
    slug_value = get_attr(r, "slug")
    return {
        "id": str(get_attr(r, "id")),
        "name": get_attr(r, "name"),
        "slug": str(slug_value) if slug_value else None,
        "cuisine": list(get_attr(r, "cuisine", []) or []),
        "city": get_attr(r, "city"),
        "timezone": get_attr(r, "timezone") or "Asia/Baku",
        "neighborhood": get_attr(r, "neighborhood"),
        "address": get_attr(r, "address"),
        "cover_photo": absolute_media_url(
            request,
            get_attr(r, "cover_photo") or (get_attr(r, "photos", []) or [None])[0],
        ),
        "short_description": get_attr(r, "short_description"),
        "price_level": get_attr(r, "price_level"),
        "tags": list(get_attr(r, "tags", []) or []),
        "tag_groups": get_attr(r, "tag_groups") or {},
        "average_spend": get_attr(r, "average_spend"),
        "rating": float(get_attr(r, "rating", 0.0) or 0.0),
        "reviews_count": int(get_attr(r, "reviews_count", 0) or 0),
        "instagram": get_attr(r, "instagram"),
    }


def restaurant_to_detail(r: Any, request: Request | None = None) -> dict[str, Any]:
    slug_value = get_attr(r, "slug")
    areas = []
    for a in get_attr(r, "areas", []) or []:
        tables = []
        for t in get_attr(a, "tables", []) or []:
            geometry = get_attr(t, "geometry") or {}
            footprint = get_attr(t, "footprint")
            if not footprint and isinstance(geometry, dict):
                footprint = geometry.get("footprint")
            table_payload = {
                "id": str(get_attr(t, "id")),
                "name": get_attr(t, "name") or f"Table {str(get_attr(t, 'id'))[:6]}",
                "capacity": int(get_attr(t, "capacity", 2) or 2),
                "position": (
                    get_attr(t, "position") or geometry.get("position")
                    if isinstance(geometry, dict)
                    else None
                ),
                "shape": get_attr(t, "shape"),
                "tags": list(get_attr(t, "tags", []) or []),
                "category": get_attr(t, "category"),
                "noise_level": get_attr(t, "noise_level"),
                "featured": bool(get_attr(t, "featured")),
                "rotation": get_attr(t, "rotation"),
                "footprint": footprint,
            }
            if isinstance(geometry, dict) and geometry:
                table_payload["geometry"] = geometry
            tables.append(table_payload)
        landmarks = []
        for landmark in get_attr(a, "landmarks", []) or []:
            landmarks.append(
                {
                    "id": str(get_attr(landmark, "id")),
                    "label": get_attr(landmark, "label"),
                    "type": get_attr(landmark, "type"),
                    "position": get_attr(landmark, "position"),
                    "footprint": get_attr(landmark, "footprint"),
                }
            )
        area_payload = {
            "id": str(get_attr(a, "id")),
            "name": get_attr(a, "name") or "Area",
            "tables": tables,
        }
        theme = get_attr(a, "theme")
        if isinstance(theme, dict) and theme:
            area_payload["theme"] = theme
        if landmarks:
            area_payload["landmarks"] = landmarks
        areas.append(area_payload)
    payload = {
        "id": str(get_attr(r, "id")),
        "name": get_attr(r, "name"),
        "slug": str(slug_value) if slug_value else None,
        "cuisine": list(get_attr(r, "cuisine", []) or []),
        "city": get_attr(r, "city"),
        "timezone": get_attr(r, "timezone") or "Asia/Baku",
        "address": get_attr(r, "address") or "",
        "phone": get_attr(r, "phone") or "",
        "photos": list(get_attr(r, "photos", []) or []),
        "cover_photo": (get_attr(r, "cover_photo") or (get_attr(r, "photos", []) or [None])[0]),
        "short_description": get_attr(r, "short_description") or "",
        "neighborhood": get_attr(r, "neighborhood"),
        "price_level": get_attr(r, "price_level"),
        "tags": list(get_attr(r, "tags", []) or []),
        "tag_groups": get_attr(r, "tag_groups") or {},
        "highlights": list(get_attr(r, "highlights", []) or []),
        "map_images": list(get_attr(r, "map_images", []) or []),
        "latitude": get_attr(r, "latitude"),
        "longitude": get_attr(r, "longitude"),
        "directions_url": get_attr(r, "directions_url"),
        "menu_url": get_attr(r, "menu_url"),
        "instagram": get_attr(r, "instagram"),
        "whatsapp": get_attr(r, "whatsapp"),
        "average_spend": get_attr(r, "average_spend"),
        "dress_code": get_attr(r, "dress_code"),
        "experiences": list(get_attr(r, "experiences", []) or []),
        "rating": float(get_attr(r, "rating", 0.0) or 0.0),
        "reviews_count": int(get_attr(r, "reviews_count", 0) or 0),
        "areas": areas,
    }
    photos = payload.get("photos") or []
    payload["photos"] = absolute_media_list(request, photos)
    payload["cover_photo"] = absolute_media_url(request, payload.get("cover_photo"))
    payload["map_images"] = absolute_media_list(request, payload.get("map_images", []))
    return payload
