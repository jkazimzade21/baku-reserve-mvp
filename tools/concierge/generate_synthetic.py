#!/usr/bin/env python3
"""
Generate synthetic concierge conversations for training/eval.

Outputs JSONL rows with:
{
  "conversation_id": "...",
  "turns": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "intent_summary": {...},
  "candidate_venues": [<venue ids>],
  "metadata": {...}
}

Usage:
  python tools/concierge/generate_synthetic.py --count 800 \
      --restaurants backend/app/data/restaurants.json \
      --train-output artifacts/concierge/train_conversations.jsonl \
      --test-output artifacts/concierge/test_conversations.jsonl
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import uuid
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]

DEFAULT_RESTAURANTS = ROOT / "backend" / "app" / "data" / "restaurants.json"
DEFAULT_TRAIN_OUTPUT = ROOT / "artifacts" / "concierge" / "train_conversations.jsonl"
DEFAULT_TEST_OUTPUT = ROOT / "artifacts" / "concierge" / "test_conversations.jsonl"

AREAS = [
    "Old City",
    "Fountain Square",
    "Boulevard",
    "Bayil",
    "Sea Breeze",
    "Shikhov",
    "Narimanov",
    "White City",
    "Bilgah",
]

VIBES = [
    "romantic",
    "family-friendly",
    "party",
    "rooftop",
    "quiet",
    "lounge",
    "traditional",
    "beach club",
]

AMENITIES = [
    "sea view",
    "rooftop",
    "live music",
    "dj",
    "shisha",
    "kids playground",
    "parking",
    "board games",
    "wheelchair access",
]

OCCASIONS = [
    "date night",
    "birthday",
    "business dinner",
    "family gathering",
    "tour group",
    "brunch",
    "wedding",
]

PRICES = ["budget", "mid", "high"]


def load_restaurants(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise RuntimeError("restaurants file must be a list")
    return payload


def sample_venues(restaurants: list[dict[str, Any]], k: int = 5) -> list[dict[str, Any]]:
    return random.sample(restaurants, k=min(k, len(restaurants)))


def make_intent() -> dict[str, Any]:
    cuisines = [
        "Azerbaijani",
        "Georgian",
        "Italian",
        "Seafood",
        "Asian",
        "Steakhouse",
        "Cafe",
        "Desserts",
    ]
    # Sometimes users specify cuisine, sometimes they don't
    picked_cuisine = random.sample(cuisines, k=random.randint(0, 1))
    
    return {
        "cuisines": picked_cuisine,
        "areas": random.sample(AREAS, k=random.randint(0, 1)),
        "vibe": random.sample(VIBES, k=random.randint(0, 1)),
        "amenities": random.sample(AMENITIES, k=random.randint(0, 1)),
        "occasion": random.choice(OCCASIONS + [None]),
        "price_range": random.choice(PRICES + [None]),
        "party_size": random.choice([2, 4, 6, 8, 10, None]),
        "hard_constraints": [],
        "soft_constraints": [],
    }


def user_prompt(intent: dict[str, Any]) -> str:
    """
    Generate a natural language prompt based on the intent using various templates.
    """
    
    # Extract components
    cuisine = intent["cuisines"][0] if intent["cuisines"] else None
    area = intent["areas"][0] if intent["areas"] else None
    vibe = intent["vibe"][0] if intent["vibe"] else None
    amenity = intent["amenities"][0] if intent["amenities"] else None
    occasion = intent["occasion"]
    price = intent["price_range"]
    party_size = intent["party_size"]

    # 1. Construct phrases for each component
    
    cuisine_phrases = [
        f"{cuisine} food", f"{cuisine} restaurant", f"{cuisine} place", f"{cuisine} cuisine", f"{cuisine}"
    ] if cuisine else ["somewhere to eat", "a restaurant", "a place", "somewhere"]

    area_phrases = [
        f"in {area}", f"near {area}", f"around {area}", f"in the {area} area"
    ] if area else []

    vibe_phrases = [
        f"{vibe}", f"{vibe} vibes", f"{vibe} atmosphere"
    ] if vibe else []

    amenity_phrases = [
        f"with {amenity}", f"that has {amenity}", f"featuring {amenity}"
    ] if amenity else []
    
    occasion_phrases = [
        f"for a {occasion}", f"for {occasion}"
    ] if occasion else []

    price_phrases = [
        f"{price} budget", f"{price} price", f"not too expensive" if price == "budget" else f"fancy" if price == "high" else "moderately priced"
    ] if price else []
    
    party_phrases = [
        f"for {party_size} people", f"table for {party_size}", f"group of {party_size}"
    ] if party_size else []

    # 2. Select a sentence structure template
    
    templates = [
        # Direct requests
        "I'm looking for {cuisine} {area} {vibe} {occasion} {amenity} {price}.",
        "Can you find me a {vibe} {cuisine} spot {area}?",
        "I need a reservation {party} {occasion} {area}.",
        "Suggest some {cuisine} places {amenity} {price}.",
        "Where can I find {cuisine} {area}?",
        "Any recommendations for {occasion} {area} {vibe}?",
        "I want {cuisine} {amenity}.",
        "Looking for {vibe} {cuisine} {area}.",
        "Do you know any {cuisine} restaurants {area} {amenity}?",
        "Planning a {occasion} {party}, need {cuisine} {area}.",
    ]
    
    # 3. Fill the template dynamically
    
    # We'll build a list of available fragments to plug in.
    # Since templates are rigid, a better approach is to build the sentence from fragments.
    
    openers = [
        "I'm looking for", "Can you recommend", "I need", "Find me", "Suggest", 
        "Where is a good", "Any good", "Is there a", "Help me find", "I want"
    ]
    
    # Core object
    core = random.choice(cuisine_phrases)
    
    # Modifiers
    modifiers = []
    if vibe:
        modifiers.append(random.choice(vibe_phrases))
    if area:
        modifiers.append(random.choice(area_phrases))
    if amenity:
        modifiers.append(random.choice(amenity_phrases))
    if occasion:
        modifiers.append(random.choice(occasion_phrases))
    if price:
        modifiers.append(random.choice(price_phrases))
    if party_size:
        modifiers.append(random.choice(party_phrases))
        
    random.shuffle(modifiers)
    
    # Assemble
    if random.random() < 0.3:
        # Short style: "Italian food, Old City, romantic"
        parts = [core] + modifiers
        return ", ".join(parts)
    else:
        # Natural sentence style
        opener = random.choice(openers)
        sentence = f"{opener} {core}"
        if modifiers:
            sentence += " " + " ".join(modifiers)
        return sentence.strip()


def assistant_reply(intent: dict[str, Any], candidates: list[dict[str, Any]]) -> str:
    lines = []
    openers = ["Here are a few options:", "I found these places for you:", "Check these out:", "How about one of these?"]
    lines.append(random.choice(openers))
    
    for idx, venue in enumerate(candidates[:3], start=1):
        name = venue.get("name_en") or venue.get("name") or venue.get("slug") or f"Venue {idx}"
        locs = venue.get("tags", {}).get("location", [])
        area = locs[0] if locs else "Baku"
        cuisine = ", ".join(venue.get("tags", {}).get("cuisine", [])[:2]) or "Mixed"
        vibe = ", ".join(venue.get("tags", {}).get("vibe", [])[:2]) or "General"
        price = venue.get("price_level") or "".join(venue.get("tags", {}).get("price", [])[:1])
        
        # Add natural explanation
        reasons = []
        if intent['occasion']: reasons.append(intent['occasion'])
        if intent['vibe']: reasons.append(intent['vibe'][0])
        if intent['amenities']: reasons.append(intent['amenities'][0])
        
        reason_str = f"Good for {'/'.join(reasons)}" if reasons else "Popular spot"
        
        lines.append(
            f"{idx}) {name} — {area}\n   Cuisine: {cuisine}; Vibe: {vibe}; Price: {price or 'unknown'}\n   Why: {reason_str}"
        )
    
    closers = ["Want me to filter further?", "Shall I book one?", "Do any of these look good?", "Need more options?"]
    lines.append(random.choice(closers))
    return "\n".join(lines)


def generate(records: list[dict[str, Any]], count: int, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    seen_prompts = set()
    
    with out_path.open("w", encoding="utf-8") as f:
        generated = 0
        attempts = 0
        while generated < count:
            attempts += 1
            if attempts > count * 5: # Avoid infinite loop if constraints are too tight
                print(f"Warning: Could only generate {generated} unique prompts out of {count} requested.")
                break
                
            intent = make_intent()
            # Ensure at least one criterion is present to avoid completely empty vague prompts
            if not any(intent.values()):
                continue
                
            prompt = user_prompt(intent)
            
            if prompt in seen_prompts:
                continue
            
            seen_prompts.add(prompt)
            
            convo_id = str(uuid.uuid4())
            candidates = sample_venues(records, k=5)
            row = {
                "conversation_id": convo_id,
                "turns": [
                    {"role": "user", "content": prompt},
                    {"role": "assistant", "content": assistant_reply(intent, candidates)},
                ],
                "intent_summary": intent,
                "candidate_venues": [c.get("id") for c in candidates],
                "metadata": {"source": "synthetic", "generator": "concierge-script", "version": 2},
            }
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            generated += 1


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Generate synthetic concierge conversations")
    parser.add_argument("--restaurants", type=Path, default=DEFAULT_RESTAURANTS)
    parser.add_argument("--count", type=int, default=800, help="Total number of conversations to generate")
    parser.add_argument("--train-output", type=Path, default=DEFAULT_TRAIN_OUTPUT)
    parser.add_argument("--test-output", type=Path, default=DEFAULT_TEST_OUTPUT)
    parser.add_argument("--test-split", type=float, default=0.2, help="Fraction of data to use for testing")
    
    args = parser.parse_args(argv)

    records = load_restaurants(args.restaurants)
    
    total_count = args.count
    test_count = int(total_count * args.test_split)
    train_count = total_count - test_count
    
    print(f"Generating {train_count} training and {test_count} testing conversations...")
    
    generate(records, train_count, args.train_output)
    print(f"Wrote {train_count} conversations -> {args.train_output}")
    
    generate(records, test_count, args.test_output)
    print(f"Wrote {test_count} conversations -> {args.test_output}")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
