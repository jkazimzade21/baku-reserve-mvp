#!/usr/bin/env python3
"""
Lightweight CLI concierge that ranks venues from backend/app/data/restaurants.json
using keyword/BM25 search. Ready to plug in LLM-on-top or run standalone for
quick recommendations.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Repository root and data path
ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "backend" / "app" / "data" / "restaurants.json"


# ---------- Text utils ----------
WORD_RE = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    return WORD_RE.findall(text.lower())


def humanize(tag: str) -> str:
    return tag.replace("_", " ").replace("-", " ").strip().title()


# ---------- Data model ----------
@dataclass
class VenueDoc:
    id: str
    name: str
    address: str
    neighborhood: str | None
    cuisine: list[str]
    tags: list[str]
    locations: list[str]
    price_level_raw: str | None
    price_rank: float | None
    summary: str
    text: str
    source: dict = field(repr=False)


# ---------- Price parsing ----------
def parse_price_rank(raw: str | None) -> float | None:
    if not raw:
        return None
    if "$" in raw:
        return raw.count("$")
    digits = re.findall(r"\d", raw)
    if digits:
        try:
            return float(digits[0])
        except ValueError:
            return None
    return None


def price_bucket(rank: float | None) -> str:
    if rank is None:
        return "unknown"
    if rank <= 1.5:
        return "budget ($)"
    if rank <= 2.5:
        return "mid ($$)"
    if rank <= 3.5:
        return "mid-high ($$-$$$)"
    return "premium ($$$)"


# ---------- Loading and enrichment ----------
def load_raw(path: Path = DATA_PATH) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise RuntimeError("restaurants.json did not contain a list")
    return data


def build_summary(item: dict) -> str:
    if item.get("short_description"):
        return item["short_description"]
    cuisine = ", ".join(item.get("cuisine", [])) or "mixed menu"
    vibe = ", ".join(item.get("tag_groups", {}).get("vibe", []))
    loc = ", ".join(item.get("tag_groups", {}).get("location", []))
    parts = [f"{item.get('name', 'This place')} offers {cuisine}"]
    if loc:
        parts.append(f"around {loc}")
    if vibe:
        parts.append(f"with a {vibe} vibe")
    return "; ".join(parts)


def to_doc(item: dict) -> VenueDoc:
    tag_groups: dict = item.get("tag_groups") or {}
    all_tags: list[str] = []
    for values in tag_groups.values():
        all_tags.extend(values or [])
    all_tags.extend(item.get("tags") or [])
    all_tags = list({t for t in all_tags if t})

    locations = tag_groups.get("location") or []
    cuisine = item.get("cuisine") or []

    text_parts = [
        item.get("name", ""),
        item.get("slug", ""),
        item.get("neighborhood", "") or "",
        item.get("address", "") or "",
        item.get("short_description", "") or "",
        " ".join(cuisine),
        " ".join(all_tags),
    ]
    summary = build_summary(item)
    text_parts.append(summary)

    price_rank = parse_price_rank(item.get("price_level"))

    return VenueDoc(
        id=item.get("id") or item.get("slug") or "",
        name=item.get("name", "Unknown"),
        address=item.get("address", "Address not listed"),
        neighborhood=item.get("neighborhood") or None,
        cuisine=cuisine,
        tags=all_tags,
        locations=locations,
        price_level_raw=item.get("price_level"),
        price_rank=price_rank,
        summary=summary,
        text=" ".join(text_parts),
        source=item,
    )


def load_docs(path: Path = DATA_PATH) -> list[VenueDoc]:
    return [to_doc(item) for item in load_raw(path)]


# ---------- BM25 scoring ----------
class BM25Index:
    def __init__(self, docs: list[VenueDoc], k1: float = 1.6, b: float = 0.75) -> None:
        self.docs = docs
        self.k1 = k1
        self.b = b
        self.doc_tokens: list[list[str]] = [tokenize(doc.text) for doc in docs]
        self.doc_lengths = [len(tokens) for tokens in self.doc_tokens]
        self.avg_len = sum(self.doc_lengths) / len(self.doc_lengths) if docs else 0.0
        self.idf = self._compute_idf()

    def _compute_idf(self) -> dict[str, float]:
        df: dict[str, int] = {}
        for tokens in self.doc_tokens:
            for term in set(tokens):
                df[term] = df.get(term, 0) + 1
        total_docs = len(self.docs)
        return {
            term: math.log((total_docs - freq + 0.5) / (freq + 0.5) + 1.0)
            for term, freq in df.items()
        }

    def score(self, query: str) -> list[tuple[VenueDoc, float]]:
        q_tokens = tokenize(query)
        if not q_tokens:
            return []
        scores = []
        for doc, tokens, doc_len in zip(self.docs, self.doc_tokens, self.doc_lengths):
            tf: dict[str, int] = {}
            for term in tokens:
                tf[term] = tf.get(term, 0) + 1
            score = 0.0
            for term in q_tokens:
                if term not in tf:
                    continue
                idf = self.idf.get(term, 0.0)
                denom = tf[term] + self.k1 * (1 - self.b + self.b * doc_len / (self.avg_len or 1))
                score += idf * ((tf[term] * (self.k1 + 1)) / denom)
            scores.append((doc, score))
        return sorted(scores, key=lambda pair: pair[1], reverse=True)


# ---------- Simple intent hints ----------
LOCATION_HINTS = {
    "old_city": ["old city", "icheri", "icherisheher", "i\u00e7\u0259ri", "maiden tower"],
    "boulevard": ["boulevard", "seaside", "seafront", "waterfront", "bulvar", "bayil", "flag square"],
    "targovi": ["targovi", "fountain square", "nizami"],
    "sea_breeze": ["sea breeze", "seabreeze", "nardaran"],
    "narimanov": ["narimanov", "ganjlik"],
}

CUISINE_HINTS = {
    "seafood": ["seafood", "fish", "caviar", "oyster"],
    "azerbaijani": ["azerbaijan", "local", "national", "kebab", "kebabs"],
    "georgian": ["georgian", "khinkali", "khachapuri"],
    "italian": ["italian", "pasta", "pizza"],
    "asian": ["asian", "sushi", "japanese", "pan-asian"],
    "steak": ["steak", "chophouse", "meat"],
    "coffee": ["coffee", "cafe", "espresso"],
    "brunch": ["brunch", "breakfast", "pastry"],
}

PRICE_HINTS = {
    "budget": ["cheap", "budget", "affordable", "inexpensive", "$"],
    "mid": ["mid", "midrange", "middle", "$$"],
    "premium": ["expensive", "upscale", "fine dining", "fancy", "$$$"],
}

AMENITY_HINTS = {
    "live_music": ["live music", "band", "mugham"],
    "dj": ["dj", "club", "dance"],
    "shisha": ["shisha", "hookah", "nargile"],
    "kids": ["kids", "children", "family"],
    "view": ["view", "sea view", "rooftop", "skyline"],
}


@dataclass
class IntentFilters:
    locations: list[str] = field(default_factory=list)
    cuisines: list[str] = field(default_factory=list)
    price_max: float | None = None
    price_min: float | None = None
    amenities: list[str] = field(default_factory=list)


def parse_intent(query: str) -> IntentFilters:
    q = query.lower()
    filters = IntentFilters()

    for loc_key, keywords in LOCATION_HINTS.items():
        if any(k in q for k in keywords):
            filters.locations.append(loc_key)

    for cuisine_key, keywords in CUISINE_HINTS.items():
        if any(k in q for k in keywords):
            filters.cuisines.append(cuisine_key)

    for price_key, keywords in PRICE_HINTS.items():
        if any(k in q for k in keywords):
            if price_key == "budget":
                filters.price_max = 2.0
            elif price_key == "premium":
                filters.price_min = 3.0

    for amenity_key, keywords in AMENITY_HINTS.items():
        if any(k in q for k in keywords):
            filters.amenities.append(amenity_key)

    return filters


def location_match(doc: VenueDoc, wanted: list[str]) -> bool:
    if not wanted:
        return True
    haystack = " ".join(doc.locations + [doc.address, doc.neighborhood or ""]).lower()
    return any(key in haystack for key in wanted)


def cuisine_match(doc: VenueDoc, wanted: list[str]) -> bool:
    if not wanted:
        return True
    haystack = " ".join(doc.cuisine).lower()
    return any(key in haystack for key in wanted)


def price_match(doc: VenueDoc, price_min: float | None, price_max: float | None) -> bool:
    if doc.price_rank is None:
        return True
    if price_min is not None and doc.price_rank < price_min:
        return False
    if price_max is not None and doc.price_rank > price_max:
        return False
    return True


def filter_and_rank(
    docs: list[VenueDoc], query: str, top_k: int = 5
) -> list[tuple[VenueDoc, float, str]]:
    intent = parse_intent(query)
    index = BM25Index(docs)
    scored = index.score(query)

    results: list[tuple[VenueDoc, float, str]] = []
    for doc, base_score in scored:
        if not price_match(doc, intent.price_min, intent.price_max):
            continue
        if not location_match(doc, intent.locations):
            continue
        if not cuisine_match(doc, intent.cuisines):
            continue

        bonus = 0.0
        # lightweight boosts
        if intent.amenities:
            tag_text = " ".join(doc.tags).lower()
            for amenity in intent.amenities:
                if amenity in tag_text:
                    bonus += 0.6
        if intent.locations and any(loc in (doc.locations or []) for loc in intent.locations):
            bonus += 0.5
        if intent.cuisines and cuisine_match(doc, intent.cuisines):
            bonus += 0.5
        results.append((doc, base_score + bonus, explain_match(doc, intent)))
        if len(results) >= max(50, top_k * 3):
            break

    results.sort(key=lambda pair: pair[1], reverse=True)
    return results[:top_k]


# ---------- Explanation formatting ----------
def explain_match(doc: VenueDoc, intent: IntentFilters) -> str:
    reasons: list[str] = []
    if intent.cuisines:
        reasons.append(f"matches cuisine: {', '.join(doc.cuisine[:3]) or 'mixed'}")
    if intent.locations:
        loc = doc.neighborhood or (doc.locations[0] if doc.locations else "")
        if loc:
            reasons.append(f"in {loc}")
    view_tags = [
        t
        for t in doc.tags
        if any(
            key in t
            for key in (
                "sea_view",
                "caspian",
                "waterfront",
                "rooftop",
                "skyline",
                "terrace",
                "view",
                "boulevard",
            )
        )
    ]
    if view_tags:
        reasons.append(f"has views ({humanize(view_tags[0])})")
    if "live_music" in doc.tags:
        reasons.append("live music")
    if "dj" in doc.tags:
        reasons.append("DJ / lounge energy")
    if "shisha" in doc.tags or "hookah" in doc.tags or "nargile" in doc.tags:
        reasons.append("shisha available")
    if not reasons:
        reasons.append("good match by overall tags")
    return "; ".join(reasons)


def format_result(doc: VenueDoc, rank: float) -> str:
    loc = doc.neighborhood or (doc.locations[0] if doc.locations else "Baku")
    cuisine = ", ".join(doc.cuisine[:3]) or "Mixed"
    vibe_tags = [t for t in doc.tags if "romantic" in t or "family" in t or "party" in t or "lounge" in t]
    vibe = humanize(vibe_tags[0]) if vibe_tags else "Varied"
    lines = [
        f"{doc.name} — {loc}",
        f"  Cuisine: {cuisine}",
        f"  Vibe: {vibe}",
        f"  Price: {price_bucket(doc.price_rank)} ({doc.price_level_raw or 'n/a'})",
        f"  Why: {doc.summary}",
        f"  Address: {doc.address}",
    ]
    return "\n".join(lines)


# ---------- CLI ----------
def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="CLI concierge over restaurants.json")
    parser.add_argument("-q", "--query", required=True, help="User request to search for")
    parser.add_argument("-k", "--top-k", type=int, default=4, help="Number of results to show")
    parser.add_argument(
        "-p",
        "--print-prompt",
        action="store_true",
        help="Print the system prompt for the LLM and exit",
    )
    parser.add_argument(
        "--data-path",
        type=Path,
        default=DATA_PATH,
        help="Path to restaurants.json (defaults to repo data file)",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    if args.print_prompt:
        prompt_path = ROOT / "tools" / "concierge" / "system_prompt.txt"
        sys.stdout.write(prompt_path.read_text(encoding="utf-8"))
        return 0

    docs = load_docs(args.data_path)
    matches = filter_and_rank(docs, args.query, top_k=args.top_k)

    if not matches:
        print("No suitable venue in the database for those filters. Try relaxing price/area.")
        return 0

    print(f"Top {len(matches)} picks:")
    for idx, (doc, score, why) in enumerate(matches, start=1):
        print(f"\n{idx}) {doc.name} — score {score:.2f}")
        print(f"   Area: {doc.neighborhood or ', '.join(doc.locations) or 'Baku'}")
        print(f"   Cuisine: {', '.join(doc.cuisine[:5]) or 'Mixed'}")
        print(f"   Vibe: {', '.join(doc.tags[:6])}")
        print(f"   Price: {price_bucket(doc.price_rank)} ({doc.price_level_raw or 'n/a'})")
        print(f"   Why it fits: {why}")
        print(f"   Address: {doc.address}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
