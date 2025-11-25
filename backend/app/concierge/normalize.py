from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable
from typing import Any

from .types import Intent, Venue

# Human-friendly overrides for some common locations.
LOCATION_OVERRIDES = {
    "baku_old_town": "Old City / Icherisheher",
    "icheri_sheher": "Old City / Icherisheher",
    "icheri_sheher_old_city": "Old City / Icherisheher",
    "old_city": "Old City / Icherisheher",
    "fountain_square_area": "Fountain Square / Targovi",
    "nizami_street": "Nizami Street / Targovi",
    "baku_boulevard": "Baku Boulevard",
    "denizkenari_milli_park": "Baku Boulevard",
    "boulevard": "Baku Boulevard",
    "sea_breeze_resort": "Sea Breeze Resort",
    "white_city": "White City",
    "agh_seher_white_city": "White City",
    "port_baku": "Port Baku",
    "bayil": "Bayil",
    "bilgah": "Bilgah",
    "narimanov": "Narimanov",
    "amburan_mall": "Amburan",
    "shikhov": "Shikhov",
    "quba_region": "Quba Region",
    "shamakhi_region": "Shamakhi Region",
}


def _to_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def normalize_phone(value: Any) -> list[str]:
    phones: list[str] = []
    for item in _to_list(value):
        if not item:
            continue
        if not isinstance(item, str):
            item = str(item)
        split = re.split(r"[;/,]+", item)
        for phone in split:
            p = phone.strip()
            if p:
                phones.append(p)
    return phones


def price_to_band(price_level: str | None) -> int | None:
    if not price_level:
        return None
    import math
    import re

    text = price_level.strip()
    if not text:
        return None

    # If we have mixed ranges like "$ - $$" or "$$-$$$", average the lengths
    dollar_groups = re.findall(r"\$+", text)
    if dollar_groups:
        avg = sum(len(s) for s in dollar_groups) / len(dollar_groups)
        band = int(math.ceil(avg))
        return min(4, max(1, band))

    compact = text.replace(" ", "")
    dollar_count = compact.count("$")
    if dollar_count:
        return min(4, max(1, dollar_count))
    lowered = text.lower()
    if "budget" in lowered or "cheap" in lowered:
        return 1
    if "mid" in lowered:
        return 2
    if "premium" in lowered or "lux" in lowered:
        return 4
    return None


def _dedupe(seq: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in seq:
        key = item.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def normalize_tags(
    raw: dict[str, Any], enriched_tags: dict[str, Any] | None = None
) -> dict[str, list[str]]:
    tags: dict[str, list[str]] = {}
    tag_groups: dict[str, Any] = raw.get("tag_groups") or raw.get("tags") or {}
    slug = str(raw.get("slug") or "").lower()
    if not tag_groups and enriched_tags and slug in enriched_tags:
        tag_groups = enriched_tags[slug].get("tag_groups") or {}

    for group_name, values in tag_groups.items():
        if isinstance(values, list):
            cleaned = [str(v).strip() for v in values if v]
            tags[group_name] = _dedupe(cleaned)

    # Add cuisines if present
    if raw.get("cuisine"):
        existing = tags.get("cuisine", [])
        combined = existing + [str(c) for c in raw["cuisine"] if c]
        tags["cuisine"] = _dedupe(combined)

    # Add neighborhood as a location tag if available
    neighborhood = raw.get("neighborhood")
    if neighborhood:
        locs = tags.get("location", [])
        locs.append(str(neighborhood))
        tags["location"] = _dedupe(locs)

    # Promote board games / games flags into amenities for searchability
    board_games = tag_groups.get("board_games") if isinstance(tag_groups, dict) else None
    games_field = raw.get("games") if isinstance(raw, dict) else None
    board_flags: list[str] = []
    if isinstance(board_games, list):
        board_flags.extend(str(v) for v in board_games if v)
    if isinstance(games_field, dict):
        board_flags.extend(f"{k}:{v}" for k, v in games_field.items() if v)
    if board_flags:
        amenities = tags.get("amenities", [])
        amenities.append("Board-Games")
        tags["amenities"] = _dedupe(amenities)
        tags.setdefault("entertainment", [])
        tags["entertainment"] = _dedupe(tags["entertainment"] + board_flags)

    # Normalize price into tag bucket
    price_level = raw.get("price_level")
    band = price_to_band(price_level)
    if band:
        tags.setdefault("price", []).append("$" * band)

    return tags


def humanize_tag(tag: str) -> str:
    key = tag.strip().replace("-", "_").lower()
    if key in LOCATION_OVERRIDES:
        return LOCATION_OVERRIDES[key]
    words = re.split(r"[_\\-\\s]+", key)
    words = [w for w in words if w]
    return " ".join(word.capitalize() for word in words)


def pick_primary_location(tags: dict[str, list[str]]) -> str | None:
    for loc in tags.get("location", []):
        normalized = loc.strip().replace("-", "_").lower()
        if normalized in LOCATION_OVERRIDES:
            return LOCATION_OVERRIDES[normalized]
        if loc:
            return humanize_tag(loc)
    return None


def _top_items(values: list[str], limit: int = 3) -> list[str]:
    return values[:limit] if len(values) > limit else values


def summarize_price(band: int | None, price_level: str | None) -> str:
    if band == 1:
        return "budget"
    if band == 2:
        return "mid-range"
    if band == 3:
        return "upscale"
    if band == 4:
        return "premium"
    if price_level:
        return price_level
    return "unknown price"


def build_summary(venue: Venue) -> str:
    cuisine = ", ".join(_top_items(venue.tags.get("cuisine", []), 3))
    vibe = ", ".join(_top_items(venue.tags.get("vibe", []), 2))
    location = pick_primary_location(venue.tags) or "Baku"
    price_word = summarize_price(venue.price_band, venue.price_level)
    amenities = ", ".join(_top_items(venue.tags.get("amenities", []), 3))
    parts: list[str] = []
    parts.append(f"{venue.name} is a {price_word} {cuisine or 'mixed'} spot in {location}.")
    if vibe:
        parts.append(f"Vibe: {vibe}.")
    if amenities:
        parts.append(f"Notable: {amenities}.")
    if venue.tags.get("occasions"):
        occasions = ", ".join(_top_items(venue.tags["occasions"], 2))
        if occasions:
            parts.append(f"Good for {occasions}.")
    return " ".join(parts).strip()


def hash_intent_key(intent: Intent) -> str:
    payload = "|".join(
        [
            intent.query.strip().lower(),
            ",".join(sorted(intent.cuisines)),
            ",".join(sorted(intent.locations)),
            ",".join(sorted(intent.vibe)),
            ",".join(sorted(intent.amenities)),
        ]
    )
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()
