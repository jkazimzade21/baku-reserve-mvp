
import json
import sys
from pathlib import Path

# Paths
REPO_ROOT = Path(".").resolve()
JSON_PATH = REPO_ROOT / "backend" / "app" / "data" / "restaurants.json"
SEED_PATH = REPO_ROOT / "mobile" / "src" / "data" / "restaurantsSeed.ts"

def main():
    print(f"Reading {JSON_PATH}...")
    try:
        # Use utf-8-sig to handle potential BOM
        data = json.loads(JSON_PATH.read_text(encoding='utf-8-sig'))
    except Exception as e:
        print(f"Error reading JSON: {e}")
        sys.exit(1)

    print(f"Loaded {len(data)} restaurants.")

    # Prepare TS content
    # We want to export the JSON data as a TypeScript const
    # We need to dump it to a string, but JSON format is compatible with TS for objects/arrays
    json_str = json.dumps(data, indent=2, ensure_ascii=False)

    ts_content = f"""// Auto-generated from backend/app/data/restaurants.json
// This file is committed so designers can preview the UI without the API.
import type {{ RestaurantSummary }} from '../api';

export const RESTAURANT_SEED: RestaurantSummary[] =
{json_str};
"""

    print(f"Writing to {SEED_PATH}...")
    SEED_PATH.write_text(ts_content, encoding='utf-8')
    print("Done.")

if __name__ == "__main__":
    main()
