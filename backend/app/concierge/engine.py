from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import asdict
from pathlib import Path
from typing import Any

from ..settings import settings
from .embeddings import EmbeddingBackend, get_default_embedder
from .index import ConciergeIndex
from .normalize import (
    build_summary,
    normalize_phone,
    normalize_tags,
    pick_primary_location,
    price_to_band,
    summarize_price,
)
from .prompts import CONCIERGE_SYSTEM_PROMPT
from .types import Intent, SearchResult, Venue

logger = logging.getLogger(__name__)

# Repository root (three levels up from this file: backend/app/concierge)
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CORPUS_PATH = settings.data_dir / "concierge_corpus.json"
DEFAULT_INDEX_PATH = settings.data_dir / "concierge_index.json"

# Environment-driven knobs
CONCIERGE_MODE = os.getenv("CONCIERGE_MODE", "local").lower()
CONCIERGE_GPT_MODEL = os.getenv("CONCIERGE_GPT_MODEL", "gpt-4o")
CONCIERGE_SUMMARY_TEMPERATURE = float(os.getenv("CONCIERGE_SUMMARY_TEMPERATURE", "0.7"))
CONCIERGE_SUMMARY_MAX_TOKENS = int(os.getenv("CONCIERGE_SUMMARY_MAX_TOKENS", "900"))
CONCIERGE_CANDIDATE_MULTIPLIER = int(os.getenv("CONCIERGE_CANDIDATE_MULTIPLIER", "8"))

# Try to import OpenAI for LLM generation
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


def _load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None


def _restaurants_seed() -> list[dict[str, Any]]:
    # Prefer the synced data_dir copy; fall back to repo seed for dev convenience.
    candidates = [
        settings.data_dir / "restaurants.json",
        REPO_ROOT / "backend" / "app" / "data" / "restaurants.json",
    ]
    for path in candidates:
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                logger.exception("Failed to load restaurants from %s", path)
    return []


def _enriched_tags_seed() -> dict[str, Any]:
    candidates = [
        settings.data_dir / "restaurant_tags_enriched.json",
        REPO_ROOT / "backend" / "app" / "data" / "restaurant_tags_enriched.json",
    ]
    for path in candidates:
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                logger.exception("Failed to load enriched tags from %s", path)
    return {}


def build_corpus(force: bool = False) -> list[Venue]:
    if DEFAULT_CORPUS_PATH.exists() and not force:
        try:
            payload = _load_json(DEFAULT_CORPUS_PATH)
            if payload:
                return [Venue(**item) for item in payload]
        except Exception:  # pragma: no cover - defensive
            logger.warning("Failed to reuse cached concierge corpus; rebuilding.")

    raw_restaurants = _restaurants_seed()
    enriched = _enriched_tags_seed()
    venues: list[Venue] = []
    for item in raw_restaurants:
        tags = normalize_tags(item, enriched)

        # Handle nested contact/links if present (starter111.txt format)
        contact = item.get("contact") or {}
        links = item.get("links") or {}

        # Extract fields, falling back to top-level if not in nested dict
        address = contact.get("address") or item.get("address")
        phone_raw = contact.get("phone") or item.get("phone")
        website = contact.get("website") or item.get("website") or item.get("menu_url")

        menu_url = links.get("menu") or item.get("menu_url")
        tripadvisor = links.get("tripadvisor") or item.get("tripadvisor")

        venue = Venue(
            id=str(item.get("id") or item.get("slug") or len(venues)),
            name=item.get("name") or item.get("name_en") or "Unknown",
            slug=item.get("slug"),
            name_az=item.get("name_az"),
            address=address,
            phones=normalize_phone(phone_raw),
            instagram=item.get("instagram"),
            website=website,
            links={
                "menu": menu_url,
                "tripadvisor": tripadvisor,
                "whatsapp": item.get("whatsapp"),
            },
            tags=tags,
            price_level=item.get("price_level"),
            price_band=price_to_band(
                item.get("price_level") or item.get("tags", {}).get("price", ["$$"])[0]
            ),  # parsing price tag
            raw=item,
        )
        venue.summary = build_summary(venue)
        venues.append(venue)

    try:
        DEFAULT_CORPUS_PATH.parent.mkdir(parents=True, exist_ok=True)
        DEFAULT_CORPUS_PATH.write_text(
            json.dumps([asdict(v) for v in venues], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        logger.info("Cached concierge corpus to %s", DEFAULT_CORPUS_PATH)
    except Exception:
        logger.exception("Failed to persist concierge corpus; continuing in-memory.")

    return venues


def load_index(
    embedder: EmbeddingBackend | None = None, allow_rebuild: bool = True
) -> ConciergeIndex:
    embedder = embedder or get_default_embedder()
    if DEFAULT_INDEX_PATH.exists():
        try:
            index = ConciergeIndex.load(DEFAULT_INDEX_PATH, embedder=embedder)
            saved_backend = (index.meta or {}).get("embedding_backend")
            if saved_backend and saved_backend != embedder.name:
                raise ValueError(
                    f"Index embedder mismatch (saved={saved_backend}, expected={embedder.name}); rebuilding."
                )
            return index
        except Exception:
            logger.warning("Concierge index was unreadable or mismatched, rebuilding.")
    if not allow_rebuild:
        raise RuntimeError("Concierge index missing and rebuild disabled")
    venues = build_corpus(force=False)
    index = ConciergeIndex.build(venues, embedder=embedder)
    try:
        index.save(DEFAULT_INDEX_PATH)
    except Exception:
        logger.exception("Failed to save concierge index; continuing with in-memory copy.")
    return index


# ---------- intent parsing ----------


STOP_LOC_TOKENS = {
    "city",
    "district",
    "street",
    "avenue",
    "road",
    "area",
    "park",
    "mall",
    "center",
    "centre",
    "downtown",
    "metro",
    "station",
}


def _normalize_tokens(text: str) -> set[str]:
    tokens = re.split(r"[^a-z0-9]+", text.lower())
    out: set[str] = set()
    for tok in tokens:
        if not tok or tok in STOP_LOC_TOKENS:
            continue
        # crude singularization to align "fountains" vs "fountain"
        if tok.endswith("s") and len(tok) > 4:
            tok = tok[:-1]
        if tok in STOP_LOC_TOKENS:
            continue
        out.add(tok)
    return out


CUISINE_KEYWORDS = {
    "azerbaijani": ["azerbaijani", "local", "national"],
    "georgian": ["georgian", "khinkali", "khachapuri"],
    "italian": ["italian", "pasta", "pizza"],
    "asian": ["asian", "pan-asian", "sushi", "japanese", "thai"],
    "seafood": ["seafood", "fish"],
    "steakhouse": ["steak", "steakhouse"],
    "desserts": ["dessert", "patisserie", "cake", "sweet"],
    "cafe": ["cafe", "coffee"],
}

LOCATION_KEYWORDS = {
    "old city / icherisheher": ["old city", "icheri", "icherisheher", "ichari", "maiden tower"],
    "fountain square / targovi": ["targovi", "torqovi", "fountain square", "nizami street"],
    "boulevard": ["boulevard", "seaside", "seaside boulevard", "deniz mall", "bulvar"],
    "sea breeze": ["sea breeze", "nardaran"],
    "bayil / flag square": ["bayil", "flag square", "seaside boulevard south"],
    "narimanov": ["narimanov"],
    "white city": ["white city", "agh seher"],
    "ganjlik": ["ganjlik", "gandja", "gənclik", "ganclik"],
    "port baku": ["port baku"],
    "shikhov": ["shikhov", "şıxov", "bibi heybat", "bibiheybat"],
    "qaba": ["quba", "guba"],
    "shamakhi": ["shamakhi", "shamaxi"],
}

VIBE_KEYWORDS = {
    "romantic": ["romantic", "date"],
    "family-friendly": ["family", "kids"],
    "party-atmosphere": ["party", "club", "dj"],
    "lounge": ["lounge"],
    "rooftop": ["rooftop", "skyline"],
    "traditional": ["traditional", "authentic"],
    "upscale": ["upscale", "fine dining", "luxury", "premium"],
    "casual": ["casual", "relaxed"],
    "beach-club": ["beach", "beach club", "pool", "day club"],
}

DIETARY_KEYWORDS = {
    "vegetarian-friendly": ["vegetarian", "veg-friendly", "ovo-lacto"],
    "vegan-options": ["vegan"],
    "halal": ["halal", "no alcohol", "alcohol-free"],
    "gluten-free-options": ["gluten free"],
}

AMENITY_KEYWORDS = {
    "live_music": ["live music", "mugham", "jazz band"],
    "dj": ["dj", "club"],
    "shisha_hookah": ["shisha", "hookah", "nargile"],
    "kids_playground": ["kids area", "playground", "children"],
    "parking": ["parking"],
    "wheelchair_accessible": ["wheelchair", "accessible"],
    "sea_view": ["sea view", "caspian view", "waterfront"],
    "rooftop_view": ["rooftop", "skyline"],
    "outdoor_seating": ["terrace", "outdoor", "patio"],
    "board_games": ["board game", "boardgame", "backgammon", "domino", "okey", "okey101", "nardi"],
}

OCCASION_KEYWORDS = {
    "date_night": ["date", "anniversary"],
    "birthday": ["birthday"],
    "wedding": ["wedding", "banquet"],
    "business_meeting": ["business", "meeting", "corporate"],
    "tour_group": ["tour", "group"],
    "brunch": ["brunch"],
}


def _match_keywords(text: str, mapping: dict[str, list[str]]) -> list[str]:
    hits: list[str] = []
    for label, needles in mapping.items():
        for needle in needles:
            if needle in text:
                hits.append(label)
                break
    return hits


def extract_intent(query: str) -> Intent:
    lowered = query.lower()
    intent = Intent(query=query)
    intent.cuisines = _match_keywords(lowered, CUISINE_KEYWORDS)
    intent.locations = _match_keywords(lowered, LOCATION_KEYWORDS)
    intent.vibe = _match_keywords(lowered, VIBE_KEYWORDS)
    intent.amenities = _match_keywords(lowered, AMENITY_KEYWORDS)
    intent.occasions = _match_keywords(lowered, OCCASION_KEYWORDS)
    intent.dietary = _match_keywords(lowered, DIETARY_KEYWORDS)

    # Price parsing
    if any(word in lowered for word in ["cheap", "budget", "affordable", "$"]):
        intent.price_max = 2
        intent.price_range_label = "budget"
        intent.hard_constraints.append("budget")
    if any(word in lowered for word in ["mid", "moderate", "not too expensive"]):
        intent.price_max = intent.price_max or 3
        if not intent.price_range_label:
            intent.price_range_label = "mid"
    if any(word in lowered for word in ["luxury", "fine dining", "premium", "$$$"]):
        intent.price_min = 3
        intent.price_range_label = "high"

    # Party size
    match = re.search(r"for\s+(\d+)", lowered)
    if match:
        try:
            intent.party_size = int(match.group(1))
        except ValueError:
            pass

    # Time of day
    for label in ["breakfast", "brunch", "lunch", "dinner", "late night"]:
        if label in lowered:
            intent.time_of_day = label
            break

    # Identify Hard Constraints (Heuristic)
    # In a real AI system, the LLM would extract these, but for the "Retrieval" phase we use heuristics.
    if "no alcohol" in lowered or "halal" in lowered:
        intent.hard_constraints.append("no_alcohol")

    if "kid" in lowered or "children" in lowered or "family" in lowered:
        # If explicitly asked for family stuff, treat as important preference, maybe not HARD hard unless "only" is used
        intent.soft_constraints.append("family_friendly")

    if intent.locations:
        # Treating location as a high-priority soft constraint or semi-hard constraint
        intent.soft_constraints.extend(intent.locations)

    return intent


# ---------- ranking & formatting ----------


def _loc_tokens(value: str) -> set[str]:
    return _normalize_tokens(value)


def _tag_matches(venue: Venue, keywords: list[str], tag_group: str) -> int:
    matches = 0
    values = venue.tags.get(tag_group, [])
    if not values or not keywords:
        return 0

    if tag_group == "location":
        value_tokens = [_loc_tokens(str(v)) for v in values]
        for kw in keywords:
            kw_tokens = _loc_tokens(kw)
            if not kw_tokens:
                continue
            # Require ALL tokens in the keyword to be present in the location tag
            # e.g. "sea breeze" {sea, breeze} must be a subset of "Sea-Breeze-Resort" {sea, breeze, resort}
            if any(kw_tokens.issubset(vt) for vt in value_tokens):
                matches += 1
        return matches

    for kw in keywords:
        kw_norm = kw.lower()
        if any(kw_norm in str(v).lower() for v in values):
            matches += 1
    return matches


def calculate_weighted_score(result: SearchResult, intent: Intent) -> SearchResult:
    """
    Applies the weighted scoring formula:
    score = w_sim * similarity_score
          + w_cuisine * cuisine_match
          + w_area * area_match
          + w_price * price_match
          + w_vibe * vibe_match
          + w_occasion * occasion_match
          + w_amenities * amenity_score
    """

    # Weights (tilt toward area/constraints to boost accuracy)
    W_SIM = 0.35
    W_CUISINE = 0.15
    W_AREA = 0.2
    W_PRICE = 0.1
    W_VIBE = 0.1
    W_OCCASION = 0.04
    W_AMENITIES = 0.05
    W_DIETARY = 0.05

    # Base similarity score (already cosine 0-1)
    sim_score = max(0, result.score)

    # 1. Cuisine Match
    cuisine_score = 0.0
    if intent.cuisines:
        matches = _tag_matches(result.venue, intent.cuisines, "cuisine")
        if matches > 0:
            cuisine_score = 1.0
        # We could implement partial matching here if we had a hierarchy

    # 2. Area Match
    area_score = 0.0
    if intent.locations:
        matches = _tag_matches(result.venue, intent.locations, "location")
        if matches > 0:
            area_score = 1.0
        # Note: Proximity logic would go here if we had lat/lon and distance calc

    # 3. Price Match
    price_score = 0.0
    v_band = result.venue.price_band or 2  # Default to mid if unknown
    if intent.price_range_label == "budget":  # max 2
        if v_band <= 2:
            price_score = 1.0
        else:
            price_score = -0.5  # Penalty for expensive
    elif intent.price_range_label == "high":  # min 3
        if v_band >= 3:
            price_score = 1.0
        else:
            price_score = 0.2  # Cheaper is okay-ish but not requested
    else:  # mid or unspecified
        if 1 <= v_band <= 4:
            price_score = 1.0  # Generally everything is okay if not specified
        if intent.price_max and v_band > intent.price_max:
            price_score = -0.2

    # 4. Vibe Match
    vibe_score = 0.0
    if intent.vibe:
        matches = _tag_matches(result.venue, intent.vibe, "vibe")
        if matches > 0:
            vibe_score = min(1.0, matches * 0.5)  # 2 matches = 1.0

    # 5. Occasion Match
    occasion_score = 0.0
    if intent.occasions:
        matches = _tag_matches(result.venue, intent.occasions, "occasions")
        if matches > 0:
            occasion_score = 1.0

    # 6. Amenities Match
    amenity_score = 0.0
    if intent.amenities:
        matches = _tag_matches(result.venue, intent.amenities, "amenities")
        if matches > 0:
            amenity_score = min(1.0, matches * 0.3)

    # 7. Dietary Match
    dietary_score = 0.0
    if intent.dietary:
        matches = _tag_matches(result.venue, intent.dietary, "dietary")
        if matches > 0:
            dietary_score = 1.0
        else:
            dietary_score = -0.2  # requested dietary need not met

    # Hard Constraint Penalties
    penalty = 0.0
    if "no_alcohol" in intent.hard_constraints:
        # Heuristic check for alcohol tags
        alcohol_indicators = ["full-bar", "cocktails", "wine", "beer", "serves-alcohol"]
        venue_amenities = [str(a).lower() for a in result.venue.tags.get("amenities", [])]
        if any(ind in " ".join(venue_amenities) for ind in alcohol_indicators):
            penalty += 0.5  # Big penalty

    # Board Games / Dominoes Hard Constraint
    if "board_games" in intent.amenities:
        venue_amenities = [str(a).lower() for a in result.venue.tags.get("amenities", [])]
        has_games = any("board" in a or "game" in a for a in venue_amenities)

        # Also check the dedicated 'entertainment' tag group if present
        if not has_games:
            entertainment = [str(e).lower() for e in result.venue.tags.get("entertainment", [])]
            has_games = any(
                "board" in e or "game" in e or "domino" in e or "nardi" in e for e in entertainment
            )

        if not has_games:
            penalty += 10.0  # Strict penalty for missing board games

    # Penalize location miss when user specified an area
    if intent.locations and area_score == 0:
        penalty += 10.0  # Strict penalty for wrong location

    final_score = (
        (W_SIM * sim_score)
        + (W_CUISINE * cuisine_score)
        + (W_AREA * area_score)
        + (W_PRICE * price_score)
        + (W_VIBE * vibe_score)
        + (W_OCCASION * occasion_score)
        + (W_AMENITIES * amenity_score)
        + (W_DIETARY * dietary_score)
    ) - penalty

    result.score = final_score
    result.debug_scores = {
        "sim": sim_score,
        "cuisine": cuisine_score,
        "area": area_score,
        "price": price_score,
        "vibe": vibe_score,
        "occ": occasion_score,
        "amen": amenity_score,
        "diet": dietary_score,
        "penalty": penalty,
    }
    return result


def format_recommendations(intent: Intent, results: list[SearchResult], limit: int = 5) -> str:
    if not results:
        return "No suitable venue in my database; want to relax any filters?"

    lines: list[str] = []
    intro_bits: list[str] = []
    if intent.cuisines:
        intro_bits.append(", ".join(intent.cuisines))
    if intent.locations:
        intro_bits.append(", ".join(intent.locations))
    if intent.vibe:
        intro_bits.append(", ".join(intent.vibe))
    if intent.price_max:
        intro_bits.append(f"<= ${intent.price_max}")
    intro = (
        "Here are options"
        if not intro_bits
        else f"Here are options matching {' / '.join(intro_bits)}"
    )
    lines.append(intro + ":")

    for idx, res in enumerate(results[:limit], start=1):
        v = res.venue
        area = (
            (v.raw.get("neighborhood") if v.raw else None)
            or pick_primary_location(v.tags)
            or "Baku"
        )
        cuisine = ", ".join(v.tags.get("cuisine", [])[:3]) or "Mixed"
        vibe = ", ".join(v.tags.get("vibe", [])[:2]) or "General"
        price = summarize_price(v.price_band, v.price_level)
        reason = v.summary or ""
        lines.append(f"{idx}) {v.name} — {area}")
        lines.append(f"   Cuisine: {cuisine}; Vibe: {vibe}; Price: {price}")
        if v.address:
            lines.append(f"   Address: {v.address}")
        if v.instagram:
            lines.append(f"   IG: @{v.instagram}")
        if reason:
            lines.append(f"   Why: {reason}")

    lines.append("Want me to narrow it further or suggest a different vibe?")
    return "\n".join(lines)


class ConciergeEngine:
    def __init__(self, index: ConciergeIndex, prefer_openai: bool = False) -> None:
        self.index = index
        self.prefer_openai = prefer_openai
        self.openai_client = None
        self.chat_model = CONCIERGE_GPT_MODEL
        self.temperature = CONCIERGE_SUMMARY_TEMPERATURE
        self.max_tokens = CONCIERGE_SUMMARY_MAX_TOKENS
        if prefer_openai and OpenAI:
            api_key = os.getenv("OPENAI_API_KEY")
            if api_key:
                self.openai_client = OpenAI(api_key=api_key)
            else:
                logger.warning("OpenAI API key not found; falling back to rule-based response.")

    @classmethod
    def default(cls, prefer_openai: bool = False) -> ConciergeEngine:
        env_prefers_openai = CONCIERGE_MODE not in {"local", "off", "disabled"}
        prefer_llm = prefer_openai or env_prefers_openai
        embedder = get_default_embedder(prefer_openai=prefer_llm)
        index = load_index(embedder=embedder, allow_rebuild=True)
        return cls(index, prefer_openai=prefer_llm)

    def generate_llm_response(
        self,
        query: str,
        intent: Intent,
        results: list[SearchResult],
        top_k: int,
        location_warning: str | None = None,
    ) -> str:
        if not self.openai_client:
            return format_recommendations(intent, results, limit=top_k)

        candidates_json = []
        for r in results[:top_k]:
            v = r.venue
            candidates_json.append(
                {
                    "id": v.id,
                    "name_en": v.name,
                    "name_az": v.name_az,
                    "instagram": v.instagram,
                    "contact": {
                        "address": v.address,
                        "phone": v.phones,
                        "website": v.website,
                    },
                    "links": v.links,
                    "tags": v.tags,
                    "summary": v.summary,
                    "relevance_debug": r.debug_scores,  # Pass debug scores to help understand why it was picked
                }
            )

        # Pass the updated intent structure
        intent_summary = asdict(intent)

        system_prompt = CONCIERGE_SYSTEM_PROMPT
        if location_warning:
            system_prompt += f"\n\nCRITICAL INSTRUCTION: {location_warning}"

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"User Query: {query}\n\nIntent Summary: {json.dumps(intent_summary, ensure_ascii=False)}\n\nCANDIDATE_VENUES: {json.dumps(candidates_json, ensure_ascii=False)}",
            },
        ]

        try:
            response = self.openai_client.chat.completions.create(
                model=self.chat_model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"LLM generation failed: {e}")
            return format_recommendations(intent, results, limit=top_k)

    def recommend(self, query: str, top_k: int = 5) -> tuple[Intent, list[SearchResult], str]:
        intent = extract_intent(query)

        # Check for trivial/conversational query
        is_trivial = (
            not intent.cuisines
            and not intent.locations
            and not intent.vibe
            and not intent.amenities
            and not intent.occasions
            and not intent.dietary
            and not intent.price_max
            and not intent.price_min
            and len(query.split()) < 3
        )

        if is_trivial:
            # Return empty results and a polite prompt
            return (
                intent,
                [],
                "Hello! I can help you find the perfect table. Tell me what you're in the mood for (e.g., 'romantic dinner in Old City' or 'seafood with a view').",
            )

        fetch_k = max(top_k * CONCIERGE_CANDIDATE_MULTIPLIER, top_k)
        raw_results = self.index.search(query, intent, top_k=fetch_k)
        adjusted = [calculate_weighted_score(r, intent) for r in raw_results]
        adjusted.sort(key=lambda r: r.score, reverse=True)

        # Strategy:
        # 1. Strict matches (positive score)
        # 2. Fallback matches (negative score due to penalty, but high quality otherwise)

        strict_matches = [r for r in adjusted if r.score > 0]
        final_results = strict_matches
        location_warning = None

        if not strict_matches and intent.locations:
            # Try to find high-quality fallbacks that failed ONLY due to location
            # We reconstruct the base score (score + penalty)
            # Threshold 0.6 ensures it's a very good match otherwise
            fallbacks = []
            for r in adjusted:
                base_score = r.score + r.debug_scores.get("penalty", 0.0)
                if base_score > 0.6:
                    fallbacks.append(r)

            if fallbacks:
                final_results = fallbacks
                location_warning = (
                    f"NO venues found in the requested location(s) {intent.locations}. "
                    f"The provided candidates are in DIFFERENT locations. "
                    f"You MUST explicitly clarify to the user that these are alternatives outside their requested area."
                )

        # If we have an LLM, we delegate the final response generation
        message = self.generate_llm_response(
            query, intent, final_results, top_k, location_warning=location_warning
        )

        return intent, final_results[:top_k], message
