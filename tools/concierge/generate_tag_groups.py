#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "backend" / "app" / "data"
RESEARCH_PATH = ROOT / "docs" / "research" / "2025-11-18_enriched_restaurants.md"
RESTAURANTS_PATH = DATA_DIR / "restaurants.json"
OUTPUT_PATH = DATA_DIR / "restaurant_tags_enriched.json"

TARGET_TAG_COUNT = 45

CATEGORY_KEYS = {
    "core identity": "core_identity",
    "ambiance/vibe": "ambiance_vibe",
    "experiences/amenities": "experiences_amenities",
    "temporal/contextual": "temporal_contextual",
    "dietary": "dietary",
    "cultural/local-specific": "cultural_local_specific",
}

CATEGORY_SUFFIXES = {
    "core_identity": ["concept"],
    "ambiance_vibe": ["vibe"],
    "experiences_amenities": ["amenity"],
    "temporal_contextual": ["service"],
    "dietary": ["friendly"],
    "cultural_local_specific": ["heritage"],
}

CATEGORY_LIMITS = {
    "core_identity": 9,
    "ambiance_vibe": 9,
    "experiences_amenities": 9,
    "temporal_contextual": 7,
    "dietary": 6,
    "cultural_local_specific": 7,
}

CATEGORY_FALLBACKS = {
    "core_identity": [
        "chef_led_menu",
        "ingredient_focus",
        "seasonal_menu",
        "signature_cuisine",
        "locally_sourced",
        "concept_forward",
        "heirloom_recipes",
    ],
    "ambiance_vibe": [
        "lighting_design",
        "background_music",
        "intimate_booths",
        "social_tables",
        "art_forward_space",
        "view_friendly",
    ],
    "experiences_amenities": [
        "sommelier_guidance",
        "mixology_program",
        "chef_table",
        "table_side_service",
        "live_entertainment",
        "community_tables",
    ],
    "temporal_contextual": [
        "weekday_specials",
        "weekend_energy",
        "sunrise_service",
        "late_service",
        "holiday_favorites",
        "afterwork_scene",
    ],
    "dietary": [
        "inclusive_menu",
        "allergy_awareness",
        "dietary_guidance",
        "balanced_portions",
        "wellness_friendly",
    ],
    "cultural_local_specific": [
        "storytelling_staff",
        "local_artisans",
        "heritage_music",
        "culinary_storytelling",
        "regional_pairings",
        "tradition_forward",
    ],
}

TAG_SYNONYMS = {
    "romantic": ["date_night_ready", "anniversary_spot"],
    "sea_view": ["caspian_view", "waterfront_view"],
    "outdoor_terrace": ["open_air_terrace", "terrace_lounge"],
    "cozy_interior": ["warm_interior", "intimate_interior"],
    "lively_atmosphere": ["vibrant_energy", "buzzing_room"],
    "live_music": ["music_evenings", "live_performances"],
    "full_bar": ["cocktail_service", "spirits_program"],
    "shisha_available": ["hookah_service", "nargile_program"],
    "late_night": ["after_hours", "night_owl_spot"],
    "free_wifi": ["wifi_enabled", "remote_work_friendly"],
    "vegetarian_friendly": ["vegetarian_menu", "veg_forward_options"],
    "vegan_options": ["plant_forward_menu", "vegan_friendly"],
    "gluten_free_options": ["gf_menu", "gluten_conscious"],
    "halal": ["halal_certified", "halal_forward"],
    "halal_meat": ["halal_certified", "muslim_friendly"],
    "heritage": ["heritage_focus", "tradition_rich"],
    "family_friendly": ["kids_welcome", "family_tables"],
    "rooftop": ["skyline_rooftop", "roof_lounge"],
    "mixology": ["craft_cocktails", "signature_drinks"],
    "brunch": ["brunch_service", "midmorning_menu"],
    "breakfast": ["breakfast_service", "morning_menu"],
    "wine_cellar": ["wine_program", "cellar_collection"],
    "tea_house": ["tea_salon", "tea_atrium"],
    "armudu_tea_service": ["pear_glass_tea", "tea_ritual"],
    "dominoes_available": ["domino_games", "table_games_domino"],
    "backgammon_tables": ["nard_tables", "backgammon_corner"],
    "dj_nights": ["dj_sets", "club_energy"],
    "live_mugham_music": ["mugham_sets", "heritage_music"],
    "sunset_dining": ["sunset_sessions", "day_to_night"],
    "specialty_coffee": ["third_wave_coffee", "coffee_program"],
    "wine_bar": ["wine_lounge", "vino_bar"],
    "vegan_snacks": ["plant_snacks", "vegan_bites"],
    "halva_dessert": ["sheki_halva", "traditional_halva"],
}

LOCATION_HINTS = {
    "seaside boulevard": ["waterfront_stride", "caspian_breeze"],
    "boulevard": ["boulevard_strolls"],
    "icheri": ["old_city_walls"],
    "içərişəhər": ["old_city_walls"],
    "old city": ["old_city_walls"],
    "port baku": ["port_baku_views"],
    "ganjlik": ["ganjlik_energy"],
    "nizami street": ["torqovaya_vibes"],
}


def normalize_name(value: str) -> str:
    normalized = "".join(
        ch
        for ch in unicodedata.normalize("NFKD", value)
        if not unicodedata.combining(ch)
    )
    normalized = normalized.lower().replace("&", "and")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def normalize_tag(value: str) -> str:
    value = value.strip().lower()
    value = value.replace("&", "and")
    value = re.sub(r"[^a-z0-9_\- ]+", " ", value)
    value = value.replace("-", "_")
    value = re.sub(r"\s+", "_", value)
    value = re.sub(r"_+", "_", value)
    return value.strip("_")


def parse_research() -> list[dict[str, Any]]:
    content = RESEARCH_PATH.read_text(encoding="utf-8")
    name_pattern = re.compile(r"^(\d+)\.\s+(.+)$")
    category_pattern = re.compile(r"^([A-Za-z /&()-]+):\s*(.+)$")

    entries: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        name_match = name_pattern.match(line)
        if name_match:
            if current:
                entries.append(current)
            current = {
                "name": name_match.group(2).strip(),
                "tag_groups": defaultdict(list),
            }
            continue
        if current is None:
            continue
        category_match = category_pattern.match(line)
        if category_match:
            cat_key = category_match.group(1).strip().lower()
            normalized_key = CATEGORY_KEYS.get(cat_key)
            if not normalized_key:
                raise RuntimeError(f"Unknown category line: {line}")
            tags = [normalize_tag(item) for item in category_match.group(2).split(",")]
            tags = [tag for tag in tags if tag]
            current["tag_groups"][normalized_key].extend(tags)

    if current:
        entries.append(current)
    return entries


def load_restaurant_records() -> dict[str, dict[str, Any]]:
    records = json.loads(RESTAURANTS_PATH.read_text(encoding="utf-8"))
    lookup: dict[str, dict[str, Any]] = {}
    for record in records:
        key = normalize_name(record.get("name", ""))
        if key and key not in lookup:
            lookup[key] = record
    return lookup


ALIAS_MAP = {
    normalize_name("Vapiano Baku (Aziz Aliyev)"): "vapiano",
    normalize_name("Vapiano Baku (Port Baku)"): "vapiano-baku-port",
    normalize_name("Syrovarnya Restaurant (Port Baku)"): "syrovarnya",
    normalize_name("Pasifico Lounge & Dining"): "pasifico-lounge-and-dining",
    normalize_name("Mangal Steak House"): "mangal-steak-house",
    normalize_name("Cafe City Fountain"): "cafe-city-fountain",
    normalize_name("Cafe Metropol 145"): "cafe-metropol-145",
    normalize_name("Buta Art Club (Buta Restaurant)"): "buta-art-club",
}


def price_bucket_from_level(value: str | None) -> str | None:
    if not value:
        return None
    digits = re.findall(r"([1-4])", value)
    if digits:
        idx = int(digits[0])
    else:
        return None
    return {1: "budget", 2: "mid", 3: "upper", 4: "luxury"}.get(idx)


def category_suffix_tags(category: str, base_tags: list[str]) -> set[str]:
    suffixes = CATEGORY_SUFFIXES.get(category, [])
    expanded: set[str] = set()
    for tag in base_tags:
        for suffix in suffixes:
            expanded.add(f"{tag}_{suffix}")
    return expanded


def derive_contextual_tags(
    category: str, tags: list[str], context: dict[str, Any]
) -> set[str]:
    derived: set[str] = set()
    if category == "core_identity":
        for cuisine in context["cuisines"]:
            derived.add(f"cuisine_{cuisine}")
            derived.add(f"cuisine_{cuisine}_heritage")
        bucket = context.get("price_bucket")
        if bucket:
            derived.add(f"price_band_{bucket}")
        if context.get("neighborhood"):
            derived.add(f"district_{context['neighborhood']}")
        if context.get("slug"):
            derived.add(f"concept_{context['slug']}")
    elif category == "ambiance_vibe":
        if context.get("has_sea_view"):
            derived.add("waterfront_aura")
        if context.get("is_old_city"):
            derived.add("historic_ambiance")
        if context.get("has_rooftop"):
            derived.add("skyline_panorama")
    elif category == "experiences_amenities":
        if context.get("offers_shisha"):
            derived.add("hookah_lounge_program")
        if context.get("has_bar"):
            derived.add("signature_bar_program")
    elif category == "temporal_contextual":
        if context.get("open_24_7"):
            derived.add("always_open")
        if context.get("sunset_spot"):
            derived.add("sunset_service")
    elif category == "dietary":
        if context.get("halal_friendly"):
            derived.add("halal_dining")
        if context.get("vegetarian_friendly"):
            derived.add("veg_dining")
    elif category == "cultural_local_specific":
        if context.get("is_old_city"):
            derived.add("old_city_story")
        if context.get("has_live_music"):
            derived.add("cultural_performances")
    return derived


def build_context(
    record: dict[str, Any], manual_tags: dict[str, list[str]]
) -> dict[str, Any]:
    cuisines = [normalize_tag(item) for item in record.get("cuisine", [])]
    neighborhood = normalize_tag(record.get("neighborhood") or "")
    address = record.get("address") or ""
    price_bucket = price_bucket_from_level(record.get("price_level"))
    all_tags = {tag for tags in manual_tags.values() for tag in tags}
    tags_lower = {tag.lower() for tag in all_tags}
    text_blob = " ".join([address.lower(), record.get("short_description", "").lower()])

    def contains_any(keys: list[str]) -> bool:
        return any(key in tags_lower for key in keys)

    context = {
        "slug": record.get("slug"),
        "cuisines": cuisines,
        "neighborhood": neighborhood,
        "price_bucket": price_bucket,
        "has_bar": contains_any(["full_bar", "cocktail_bar", "wine_bar"]),
        "offers_shisha": contains_any(
            ["shisha_available", "hookah_service", "shisha_corner"]
        ),
        "has_rooftop": contains_any(["rooftop", "rooftop_lounge"]),
        "has_live_music": contains_any(
            ["live_music", "live_mugham_music", "dj_nights", "live_mugham_or_jazz"]
        ),
        "has_sea_view": contains_any(["sea_view", "waterfront", "sunset_dining"])
        or "boulevard" in text_blob,
        "sunset_spot": contains_any(["sunset_dining"]) or "sunset" in text_blob,
        "open_24_7": contains_any(["24_7_service", "open_all_day"]),
        "halal_friendly": contains_any(
            ["halal", "halal_meat", "halal_options", "halal_restaurant"]
        ),
        "vegetarian_friendly": contains_any(
            ["vegetarian_friendly", "vegetarian_options"]
        ),
        "is_old_city": "old city" in address.lower() or neighborhood == "old_city",
    }

    for needle, tags in LOCATION_HINTS.items():
        if needle in address.lower():
            context.setdefault("location_tags", set()).update(tags)
    return context


def enrich_categories(
    manual_tags: dict[str, list[str]], context: dict[str, Any]
) -> dict[str, set[str]]:
    enriched: dict[str, set[str]] = {}
    for category, tags in manual_tags.items():
        base_tags = list(dict.fromkeys(tags))
        expanded: set[str] = set(base_tags)

        for tag in base_tags:
            expanded.update(TAG_SYNONYMS.get(tag, []))

        expanded.update(category_suffix_tags(category, base_tags))
        expanded.update(derive_contextual_tags(category, base_tags, context))

        for hint_tags in context.get("location_tags", []):
            if category == "cultural_local_specific":
                expanded.add(hint_tags)
            elif category == "ambiance_vibe":
                expanded.add(f"ambiance_{hint_tags}")

        enriched[category] = expanded
    return enriched


def finalize_categories(
    candidates: dict[str, set[str]], manual_tags: dict[str, list[str]]
) -> dict[str, list[str]]:
    finalized: dict[str, list[str]] = {}
    for category, values in candidates.items():
        base_tags = manual_tags.get(category, [])
        limit = CATEGORY_LIMITS.get(category)
        ordered: list[str] = []
        seen: set[str] = set()

        for tag in base_tags:
            if tag in values and tag not in seen:
                ordered.append(tag)
                seen.add(tag)

        extras = sorted(values - seen)
        ordered.extend(extras)
        if limit:
            ordered = ordered[:limit]
        finalized[category] = ordered
    return finalized


def ensure_minimum(enriched: dict[str, list[str]]) -> None:
    total = sum(len(values) for values in enriched.values())
    if total >= TARGET_TAG_COUNT:
        return
    order = [
        "core_identity",
        "ambiance_vibe",
        "experiences_amenities",
        "temporal_contextual",
        "dietary",
        "cultural_local_specific",
    ]
    idx = 0
    attempts = 0
    while total < TARGET_TAG_COUNT and attempts < 500:
        category = order[idx % len(order)]
        idx += 1
        attempts += 1
        limit = CATEGORY_LIMITS.get(category)
        if limit and len(enriched.get(category, [])) >= limit:
            continue
        fallback_pool = CATEGORY_FALLBACKS.get(category, [])
        for tag in fallback_pool:
            if tag not in enriched.setdefault(category, []):
                enriched[category].append(tag)
                total += 1
                break


def main() -> None:
    entries = parse_research()
    records = load_restaurant_records()

    candidate_map: dict[str, dict[str, set[str]]] = {}
    manual_map: dict[str, dict[str, list[str]]] = {}
    slug_name: dict[str, str] = {}

    for entry in entries:
        name = entry["name"]
        normalized = normalize_name(name)
        record = records.get(normalized)
        if not record:
            alias_slug = ALIAS_MAP.get(normalized)
            if alias_slug:
                record = next(
                    (r for r in records.values() if r.get("slug") == alias_slug), None
                )
        if not record:
            raise RuntimeError(f"No restaurant record found for research entry: {name}")

        slug = record.get("slug")
        if not slug:
            continue

        manual_tags = {
            key: list(dict.fromkeys(values))
            for key, values in entry["tag_groups"].items()
        }
        context = build_context(record, manual_tags)

        candidate_sets = enrich_categories(manual_tags, context)
        slot = candidate_map.setdefault(slug, defaultdict(set))
        for category, values in candidate_sets.items():
            slot.setdefault(category, set()).update(values)

        manual_bucket = manual_map.setdefault(slug, defaultdict(list))
        for category, values in manual_tags.items():
            seen = set(manual_bucket[category])
            for value in values:
                if value not in seen:
                    manual_bucket[category].append(value)
                    seen.add(value)

        slug_name.setdefault(slug, record.get("name"))

    slug_map: dict[str, dict[str, list[str]]] = {}
    for slug, candidate_sets in candidate_map.items():
        manual_tags = manual_map.get(slug, {})
        enriched = finalize_categories(candidate_sets, manual_tags)
        ensure_minimum(enriched)
        slug_map[slug] = {"name": slug_name.get(slug, ""), "tag_groups": enriched}

    OUTPUT_PATH.write_text(
        json.dumps(slug_map, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    counts = [
        sum(len(values) for values in entry["tag_groups"].values())
        for entry in slug_map.values()
    ]
    print(f"Generated tag groups for {len(slug_map)} restaurants.")
    if counts:
        print(
            f"Min tags: {min(counts)} / Max tags: {max(counts)} / Avg: {sum(counts) / len(counts):.1f}"
        )


if __name__ == "__main__":
    main()
