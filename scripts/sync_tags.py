#!/usr/bin/env python3
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STARTER_PATH = ROOT / "starter111.txt"
RESTAURANTS_PATH = ROOT / "backend" / "app" / "data" / "restaurants.json"
SEED_PATH = ROOT / "mobile" / "src" / "data" / "restaurantsSeed.ts"

def normalize_name(value: str) -> str:
    normalized = "".join(ch for ch in unicodedata.normalize("NFKD", value) if not unicodedata.combining(ch))
    normalized = normalized.lower().replace("&", "and")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()

def load_json(path: Path):
    with open(path, "r", encoding="utf-8-sig") as f:
        content = f.read()
        # Handle multiple JSON arrays concatenated
        content = content.replace("]\n\n[", ",\n").replace("][", ",")
        # If it's still multiple arrays not joined, we might need more robust handling
        # But let's try to just parse it as one big list if we joined them
        # Or if they are just adjacent, we can wrap them?
        # Actually, if we replace `][` with `,` and they are `[...] [...]`, we get `[...,...]`.
        # But we need to be careful about the boundaries.
        # Let's try a regex approach to join them.
        content = re.sub(r'\]\s*\[', ',', content)
        return json.loads(content)

def save_json(path: Path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def main():
    print(f"Loading starter data from {STARTER_PATH}...")
    starter_data = load_json(STARTER_PATH)
    
    print(f"Loading restaurants data from {RESTAURANTS_PATH}...")
    restaurants_data = load_json(RESTAURANTS_PATH)
    
    # Build lookup map for restaurants
    restaurant_map = {normalize_name(r["name"]): r for r in restaurants_data}
    
    updated_count = 0
    not_found = []
    
    for item in starter_data:
        name = item.get("name_en") or item.get("name")
        if not name:
            continue
            
        norm_name = normalize_name(name)
        restaurant = restaurant_map.get(norm_name)
        
        # Try fuzzy match or alias if needed (simple check for now)
        if not restaurant:
            # Try matching by ID if available in starter and it looks like a slug/id
            # But starter IDs are like "yanardag_restaurant", backend are UUIDs.
            # So name matching is best.
            not_found.append(name)
            continue
            
        # Update tags
        starter_tags = item.get("tags", {})
        
        # Flatten tags for the 'tags' list
        flat_tags = set()
        tag_groups = {}
        
        for category, tags in starter_tags.items():
            # Normalize category name for tag_groups
            # Map starter categories to backend categories if needed
            # Backend uses: cuisine, location, vibe, dining_style, amenities, occasions, dietary, games
            # Starter uses: cuisine, location, vibe, dining_style, amenities, price, occasions, dietary, music, audience, view
            
            # We'll map them directly or with some adjustments
            cat_key = category.lower().replace(" ", "_")
            
            # Clean tags
            cleaned_tags = []
            for t in tags:
                # Normalize tag string: "Live-Music-Daily" -> "live_music_daily"
                t_clean = t.lower().replace("-", "_").replace(" ", "_")
                cleaned_tags.append(t_clean)
                flat_tags.add(t_clean)
            
            tag_groups[cat_key] = cleaned_tags

        # Update the restaurant record
        restaurant["tags"] = sorted(list(flat_tags))
        restaurant["tag_groups"] = tag_groups
        
        # Also update cuisine if present in starter
        if "cuisine" in starter_tags:
             # We might want to keep existing cuisine or merge. 
             # Starter cuisine tags are like "Azerbaijani", "Traditional".
             # Backend cuisine field is a list of strings.
             # Let's overwrite for now as starter seems richer/cleaner for these 111.
             restaurant["cuisine"] = starter_tags["cuisine"]
             
        updated_count += 1

    print(f"Updated {updated_count} restaurants.")
    if not_found:
        print(f"Could not find {len(not_found)} restaurants:")
        for n in not_found[:10]:
            print(f"  - {n}")
            
    print(f"Saving updated data to {RESTAURANTS_PATH}...")
    save_json(RESTAURANTS_PATH, restaurants_data)
    
    print(f"Regenerating seed data to {SEED_PATH}...")
    ts_content = f"""// Auto-generated from backend/app/data/restaurants.json
// This file is committed so designers can preview the UI without the API.
import type {{ RestaurantSummary }} from '../api';

export const RESTAURANT_SEED: RestaurantSummary[] =
{json.dumps(restaurants_data, indent=2, ensure_ascii=False)};
"""
    with open(SEED_PATH, "w", encoding="utf-8") as f:
        f.write(ts_content)
        
    print("Done!")

if __name__ == "__main__":
    main()
