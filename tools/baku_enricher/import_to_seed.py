#!/usr/bin/env python3
"""Ingest baku-enricher outputs into backend/app/data/restaurants.json."""

from __future__ import annotations

import argparse
import json
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = REPO_ROOT / "backend" / "app" / "data" / "restaurants.json"
OUT_DIR = REPO_ROOT / "tools" / "baku_enricher" / "out"

UNSPLASH_IMAGES = (
    "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1481833761820-0509d3217039?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=1200&q=80",
)

THEME_SWATCHES = (
    {"accent": "#E7A977", "ambientLight": "rgba(231, 169, 119, 0.16)", "texture": "marble"},
    {"accent": "#F4978E", "ambientLight": "rgba(255, 210, 155, 0.22)", "texture": "linen"},
    {"accent": "#C88EA7", "ambientLight": "rgba(238, 207, 195, 0.18)", "texture": "velvet"},
    {"accent": "#A0C1B8", "ambientLight": "rgba(160, 193, 184, 0.2)", "texture": "parquet"},
)

NEIGHBORHOOD_RULES = (
    ("Port Baku", "Port Baku"),
    ("Port Baku Towers", "Port Baku"),
    ("Boulevard Hotel", "White City"),
    ("Boulevard", "Seaside Boulevard"),
    ("Neftç", "Seaside Boulevard"),
    ("Azadliq", "Azadliq Square"),
    ("Fountain", "Fountain Square"),
    ("Nizami", "Nizami Street"),
    ("Old City", "Old City"),
    ("Icherisheher", "Old City"),
    ("İçəri", "Old City"),
    ("Fairmont", "Flame Towers"),
    ("Flame", "Flame Towers"),
    ("Flag Square", "Bayil"),
    ("Bayil", "Bayil"),
    ("Convention", "Nagorny"),
    ("White City", "White City"),
    ("Nasimi", "Nasimi"),
    ("Khatai", "Khatai"),
)

FEATURE_PHRASES = {
    "seafood": "Caspian seafood towers",
    "sushi": "omakase-style sushi flights",
    "steakhouse": "smoked prime steaks",
    "steak": "smoked prime steaks",
    "pizza": "wood-fired pizzas",
    "bar": "signature cocktails",
    "coffee": "third-wave coffee service",
    "dessert": "plated desserts",
    "family_friendly": "family-size platters",
    "shisha": "pergola shisha corners",
    "late_night": "after-dark lounge energy",
    "rooftop": "skyline terrace seating",
    "live_music": "live music sets",
    "azerbaijani": "modern Azeri flavors",
    "fine_dining": "chef-driven tasting plates",
}

HIGHLIGHT_MAP = {
    "rooftop": "Skyline terrace with Caspian views",
    "shisha": "Dedicated shisha pergola",
    "live_music": "Resident DJs on weekends",
    "family_friendly": "Spacious booths for families",
    "seafood": "Daily seafood and raw bar",
    "sushi": "Chef-led sushi counter",
    "bar": "Mixology-led cocktail list",
    "coffee": "Spritz-friendly coffee program",
    "dessert": "Showpiece dessert trolley",
}

CUISINE_HINTS = (
    ("azerbaijani", "Azerbaijani"),
    ("seafood", "Seafood"),
    ("sushi", "Japanese"),
    ("steak", "Steakhouse"),
    ("pizza", "Italian"),
    ("burger", "Grill"),
    ("coffee", "Cafe"),
    ("dessert", "Patisserie"),
    ("bar", "Bar & Lounge"),
)

TABLE_TEMPLATE_PRIMARY = (
    ("T1", 2, [18, 32], "circle", ["window", "intimate"], "low", [[16, 30], [20, 30], [20, 34], [16, 34]]),
    ("T2", 4, [38, 34], "rect", ["chef_counter"], "medium", [[34, 32], [42, 32], [42, 38], [34, 38]]),
    ("T3", 4, [58, 36], "booth", ["view"], "medium", [[54, 32], [62, 32], [62, 40], [54, 40]]),
    ("T4", 6, [34, 62], "rect", ["family"], "medium", [[30, 58], [38, 58], [38, 66], [30, 66]]),
    ("T5", 6, [62, 64], "rect", ["celebration"], "high", [[58, 60], [66, 60], [66, 68], [58, 68]]),
)

TABLE_TEMPLATE_SECONDARY = (
    ("L1", 2, [22, 40], "circle", ["sunset"], "low", [[20, 38], [24, 38], [24, 42], [20, 42]]),
    ("L2", 4, [42, 44], "rect", ["terrace"], "medium", [[38, 42], [46, 42], [46, 48], [38, 48]]),
    ("L3", 4, [62, 46], "rect", ["view"], "medium", [[58, 44], [66, 44], [66, 48], [58, 48]]),
    ("L4", 6, [34, 72], "booth", ["lounge"], "medium", [[30, 68], [38, 68], [38, 76], [30, 76]]),
    ("L5", 6, [62, 74], "circle", ["firepit"], "high", [[58, 70], [66, 70], [66, 78], [58, 78]]),
)


@dataclass
class EnrichedRecord:
    slug: str
    name: str
    address: str
    lat: float
    lng: float
    phone: str
    website: str | None
    instagram_url: str | None
    menu_url: str | None
    tags: list[str]


def load_enriched_records(slug_filter: set[str] | None) -> list[EnrichedRecord]:
    records: list[EnrichedRecord] = []
    for path in sorted(OUT_DIR.glob("*.json")):
        payload = json.loads(path.read_text())
        slug = payload.get("slug")
        if not slug:
            continue
        if slug_filter and slug not in slug_filter:
            continue
        records.append(
            EnrichedRecord(
                slug=slug,
                name=payload.get("name") or slug.replace("-", " ").title(),
                address=payload.get("address") or "",
                lat=payload.get("location", {}).get("lat", 0.0),
                lng=payload.get("location", {}).get("lng", 0.0),
                phone=payload.get("phone") or "",
                website=payload.get("website"),
                instagram_url=(payload.get("instagram") or {}).get("url"),
                menu_url=(payload.get("menu_url") or {}).get("url"),
                tags=payload.get("tags") or [],
            )
        )
    return records


def detect_neighborhood(address: str) -> str:
    for needle, label in NEIGHBORHOOD_RULES:
        if needle.lower() in address.lower():
            return label
    return "Downtown"


def slugify_tag(tag: str) -> str:
    cleaned = tag.strip().lower().replace("-", "_").replace(" ", "_")
    cleaned = re.sub(r"[^a-z0-9_]+", "", cleaned)
    return cleaned


def format_tags(raw_tags: Iterable[str], neighborhood: str) -> list[str]:
    tags: list[str] = []
    for tag in raw_tags:
        cleaned = slugify_tag(tag)
        if cleaned and cleaned not in tags:
            tags.append(cleaned)
    if "port" in neighborhood.lower() and "port_baku" not in tags:
        tags.append("port_baku")
    return tags[:8]


def derive_cuisine(name: str, tags: list[str]) -> list[str]:
    label_list: list[str] = []
    name_lower = name.lower()
    for needle, label in CUISINE_HINTS:
        if needle in name_lower or any(needle in t.lower() for t in tags):
            if label not in label_list:
                label_list.append(label)
    if not label_list:
        label_list.append("International")
    return label_list[:2]


def derive_price(tags: list[str]) -> str:
    lowered = [t.lower() for t in tags]
    if any("fine dining" in t for t in lowered):
        return "AZN 4/4"
    if any(token in lowered for token in ("steakhouse", "steak", "rooftop", "late night", "seafood")):
        return "AZN 3/4"
    if any(token in lowered for token in ("coffee", "dessert", "bar")):
        return "AZN 2/4"
    return "AZN 3/4"


def average_spend(price_level: str) -> str:
    if price_level == "AZN 4/4":
        return "AZN 110–160 per guest"
    if price_level == "AZN 2/4":
        return "AZN 45–75 per guest"
    return "AZN 70–110 per guest"


def dress_code(tags: list[str], price_level: str) -> str:
    lowered = [t.lower() for t in tags]
    if price_level == "AZN 4/4" or "fine dining" in " ".join(lowered):
        return "Chic evening"
    if "rooftop" in lowered or "late night" in lowered:
        return "Smart nightlife"
    return "Smart casual"


def short_description(name: str, tags: list[str], neighborhood: str) -> str:
    normalized = [slugify_tag(tag) for tag in tags]
    phrases = [FEATURE_PHRASES[key] for key in normalized if key in FEATURE_PHRASES]
    phrases = list(dict.fromkeys(phrases))
    if not phrases:
        return f"{name} keeps the service warm and flexible in {neighborhood or 'central Baku'}."
    if len(phrases) == 1:
        return f"{name} highlights {phrases[0]} in {neighborhood or 'central Baku'}."
    return f"{name} pairs {phrases[0]} with {phrases[1]} in {neighborhood or 'central Baku'}."


def build_highlights(tags: list[str]) -> list[str]:
    normalized = [slugify_tag(tag) for tag in tags]
    result: list[str] = []
    for tag in normalized:
        if tag in HIGHLIGHT_MAP and HIGHLIGHT_MAP[tag] not in result:
            result.append(HIGHLIGHT_MAP[tag])
        if len(result) == 3:
            break
    if not result:
        result.append("Service-led dining room with attentive hosts")
    return result


def themed_tables(slug: str, template: Iterable[tuple], prefix: str) -> list[dict]:
    tables: list[dict] = []
    for index, (name, cap, position, shape, table_tags, noise, footprint) in enumerate(template, start=1):
        tables.append(
            {
                "id": f"{slug}-{prefix}-{index}",
                "name": f"{prefix.upper()}{index}",
                "capacity": cap,
                "position": position,
                "shape": shape,
                "tags": table_tags,
                "noise_level": noise,
                "footprint": footprint,
            }
        )
    return tables


def make_areas(slug: str, tags: list[str]) -> list[dict]:
    base_index = abs(hash(slug)) % len(THEME_SWATCHES)
    primary_theme = THEME_SWATCHES[base_index]
    secondary_theme = THEME_SWATCHES[(base_index + 1) % len(THEME_SWATCHES)]
    rooftop = any("rooftop" in tag.lower() for tag in tags)
    return [
        {
            "id": f"a-{slug}-dining",
            "name": "Signature Dining",
            "theme": primary_theme,
            "landmarks": [
                {
                    "id": f"{slug}-bar",
                    "label": "Signature Bar",
                    "type": "bar",
                    "position": [18, 12],
                    "footprint": [[10, 8], [26, 8], [26, 16], [10, 16]],
                }
            ],
            "tables": themed_tables(slug, TABLE_TEMPLATE_PRIMARY, "d"),
        },
        {
            "id": f"a-{slug}-lounge",
            "name": "Sky Terrace" if rooftop else "Lounge Salon",
            "theme": secondary_theme,
            "landmarks": [
                {
                    "id": f"{slug}-dj",
                    "label": "DJ Booth",
                    "type": "stage",
                    "position": [48, 70],
                    "footprint": [[44, 66], [52, 66], [52, 74], [44, 74]],
                }
            ],
            "tables": themed_tables(slug, TABLE_TEMPLATE_SECONDARY, "l"),
        },
    ]


def select_map_image(slug: str) -> str:
    idx = abs(hash(slug)) % len(UNSPLASH_IMAGES)
    return UNSPLASH_IMAGES[idx]


def clean_phone(phone: str) -> str:
    return re.sub(r"[\s()-]", "", phone)


def tel_url(phone: str) -> str | None:
    sanitized = clean_phone(phone)
    if not sanitized:
        return None
    return f"tel:{sanitized}"


def ingest(slug_filter: set[str] | None) -> list[str]:
    if not DATA_PATH.exists():
        raise SystemExit(f"Missing seed file: {DATA_PATH}")
    existing = json.loads(DATA_PATH.read_text())
    existing_slugs = {entry.get("slug") for entry in existing}

    records = load_enriched_records(slug_filter)
    if not records:
        return []

    added: list[str] = []
    for rec in records:
        if rec.slug in existing_slugs:
            continue
        neighborhood = detect_neighborhood(rec.address)
        price_level = derive_price(rec.tags)
        entry = {
            "name": rec.name,
            "slug": rec.slug,
            "id": str(uuid.uuid4()),
            "cuisine": derive_cuisine(rec.name, rec.tags),
            "address": rec.address,
            "phone": rec.phone,
            "photos": [],
            "cover_photo": "",
            "short_description": short_description(rec.name, rec.tags, neighborhood),
            "neighborhood": neighborhood,
            "price_level": price_level,
            "tags": format_tags(rec.tags, neighborhood),
            "highlights": build_highlights(rec.tags),
            "map_images": [select_map_image(rec.slug)],
            "latitude": rec.lat,
            "longitude": rec.lng,
            "menu_url": rec.menu_url or rec.website,
            "instagram": rec.instagram_url,
            "whatsapp": rec.phone,
            "average_spend": average_spend(price_level),
            "dress_code": dress_code(rec.tags, price_level),
            "experiences": [],
            "areas": make_areas(rec.slug, rec.tags),
            "city": "Baku",
            "directions_url": f"https://maps.google.com/?q={rec.lat},{rec.lng}",
            "call_url": tel_url(rec.phone) or "",
        }
        existing.append(entry)
        existing_slugs.add(rec.slug)
        added.append(rec.slug)

    existing_json = json.dumps(existing, indent=2, ensure_ascii=False) + "\n"
    DATA_PATH.write_text(existing_json)
    return added


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest enriched restaurant records")
    parser.add_argument("slugs", nargs="*", help="Optional list of slugs to ingest")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    slug_filter = {slug.strip().lower() for slug in args.slugs} if args.slugs else None
    added = ingest(slug_filter)
    if not added:
        print("No new restaurants were ingested.")
        return
    print(f"Added {len(added)} restaurants: {', '.join(sorted(added))}")


if __name__ == "__main__":
    main()
