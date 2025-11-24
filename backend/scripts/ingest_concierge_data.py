import difflib
import json
import logging
import shutil
from pathlib import Path

import pandas as pd
from backend.app.settings import settings

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "backend" / "app" / "data"
JSON_PATH = DATA_DIR / "restaurants.json"
CSV_PATH = BASE_DIR / "baku_restaurants_tags_v1.csv"


def normalize_tag(tag):
    if not isinstance(tag, str):
        return ""
    return tag.strip().lower().replace(" ", "_").replace("-", "_")


def ingest_data():
    logger.info(f"Loading JSON from {JSON_PATH}")
    with open(JSON_PATH) as f:
        restaurants = json.load(f)

    if not CSV_PATH.exists():
        logger.warning(
            "CSV source %s missing; skipping concierge tag ingestion (no changes applied)", CSV_PATH
        )
        return

    logger.info(f"Loading CSV from {CSV_PATH}")
    df = pd.read_csv(CSV_PATH)

    # Create a map of normalized JSON names to their index
    json_name_map = {r["name"].lower().strip(): i for i, r in enumerate(restaurants)}

    matched_count = 0

    for _, row in df.iterrows():
        csv_name = row["name"].strip()

        # Try exact match first
        match_idx = json_name_map.get(csv_name.lower())

        # Fuzzy match if not found
        if match_idx is None:
            matches = difflib.get_close_matches(
                csv_name.lower(), json_name_map.keys(), n=1, cutoff=0.8
            )
            if matches:
                match_idx = json_name_map[matches[0]]
                logger.info(f"Fuzzy match: '{csv_name}' -> '{restaurants[match_idx]['name']}'")
            else:
                logger.warning(f"No match found for CSV restaurant: '{csv_name}'")
                continue

        matched_count += 1
        restaurant = restaurants[match_idx]

        # Process Tags
        # We want to combine all relevant columns into a rich tag set
        new_tags = set()
        structured = {}

        # Venue Type
        if pd.notna(row["venue_type"]):
            v_types = [normalize_tag(t) for t in row["venue_type"].split(";")]
            new_tags.update(v_types)
            structured["venue_type"] = v_types

        # Cuisine
        cuisines = []
        if pd.notna(row["cuisine_primary"]):
            cuisines.extend([normalize_tag(t) for t in row["cuisine_primary"].split(";")])
        if pd.notna(row["cuisine_secondary"]):
            cuisines.extend([normalize_tag(t) for t in row["cuisine_secondary"].split(";")])
        new_tags.update(cuisines)
        structured["cuisine"] = cuisines

        # Vibe
        if pd.notna(row["vibe"]):
            vibes = [normalize_tag(t) for t in row["vibe"].split(";")]
            new_tags.update(vibes)
            structured["vibe"] = vibes

        # Features
        if pd.notna(row["features"]):
            feats = [normalize_tag(t) for t in row["features"].split(";")]
            new_tags.update(feats)
            structured["features"] = feats

        # View
        if pd.notna(row["view"]):
            views = [normalize_tag(t) for t in row["view"].split(";")]
            new_tags.update(views)
            structured["view"] = views

        # AZ Culture
        if pd.notna(row["az_culture"]):
            az = [normalize_tag(t) for t in row["az_culture"].split(";")]
            new_tags.update(az)
            structured["az_culture"] = az

        # Area
        if pd.notna(row["area"]):
            areas = [normalize_tag(t) for t in row["area"].split(";")]
            new_tags.update(areas)
            structured["area"] = areas

        # Open Hours Notes
        if pd.notna(row["open_hours_notes"]):
            restaurant["open_hours_notes"] = str(row["open_hours_notes"])

        # Merge with existing tags (preserving manual ones if any, but CSV is authoritative for this task)
        # The prompt implies CSV should drive the tags.
        # Let's keep existing tags but ensure new ones are added.
        existing_tags = set(restaurant.get("tags", []))
        final_tags = list(existing_tags.union(new_tags))

        restaurant["tags"] = final_tags
        restaurant["structured_tags"] = structured

        # Update specific fields if missing
        if not restaurant.get("instagram") and pd.notna(row["instagram"]):
            restaurant["instagram"] = str(row["instagram"])

    logger.info(f"Matched {matched_count} out of {len(df)} CSV entries.")

    with open(JSON_PATH, "w") as f:
        json.dump(restaurants, f, indent=2)
    logger.info(f"Successfully updated source JSON at {JSON_PATH}")

    # Copy to settings.data_dir
    target_path = settings.data_dir / "restaurants.json"
    shutil.copy2(JSON_PATH, target_path)
    logger.info(f"Successfully synced to runtime data dir at {target_path}")


if __name__ == "__main__":
    ingest_data()
