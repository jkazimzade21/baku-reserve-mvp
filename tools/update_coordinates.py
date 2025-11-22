#!/usr/bin/env python3
"""
Audit and update restaurant coordinates using Nominatim.

Usage:
    python tools/update_coordinates.py [--limit 20]
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = REPO_ROOT / "backend" / "app" / "data" / "restaurants.json"
OUTPUT_PATH = DATA_PATH  # overwrite in place
USER_AGENT = "baku-reserve-coordinate-bot/2025.11 (dev@bakureserve.az)"
LAT_BOUNDS = (40.2, 40.6)
LON_BOUNDS = (49.5, 50.2)
MAX_DELTA = 0.05  # roughly 5km guardrail


def _query_nominatim(query: str, bounded: bool = True) -> tuple[float, float] | None:
    params = {
        "q": query,
        "format": "json",
        "limit": 1,
    }
    if bounded:
        # viewbox: left, top, right, bottom (lon, lat)
        params["viewbox"] = f"{LON_BOUNDS[0]},{LAT_BOUNDS[1]},{LON_BOUNDS[1]},{LAT_BOUNDS[0]}"
        params["bounded"] = 1
    try:
        resp = httpx.get(
            "https://nominatim.openstreetmap.org/search",
            params=params,
            headers={"User-Agent": USER_AGENT},
            timeout=10.0,
        )
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # pragma: no cover - network
        print(f"[coords] Failed to fetch '{query}': {exc}")
        return None
    if not payload:
        return None
    try:
            lat = float(payload[0]["lat"])
            lon = float(payload[0]["lon"])
            if LAT_BOUNDS[0] <= lat <= LAT_BOUNDS[1] and LON_BOUNDS[0] <= lon <= LON_BOUNDS[1]:
                return lat, lon
            return None
    except (KeyError, ValueError):
        return None


def fetch_coords(name: str, address: str | None) -> tuple[float, float] | None:
    queries = []
    if address:
        queries.append(f"{name}, {address}")
    queries.append(f"{name}, Baku, Azerbaijan")
    queries.append(name)
    for q in queries:
        result = _query_nominatim(q)
        if result:
            return result
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Update restaurant coordinates via Nominatim")
    parser.add_argument("--sleep", type=float, default=1.0, help="Delay between requests (seconds)")
    parser.add_argument("--dry-run", action="store_true", help="Only report differences")
    args = parser.parse_args()

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    updated = 0
    skipped = 0
    for entry in data:
        name = entry.get("name")
        address = entry.get("address")
        query_address = address or "Baku, Azerbaijan"
        current_lat = float(entry.get("latitude") or 0.0)
        current_lon = float(entry.get("longitude") or 0.0)
        result = fetch_coords(name, query_address)
        if not result:
            skipped += 1
            continue
        lat, lon = result
        delta = abs(lat - current_lat) + abs(lon - current_lon)
        if delta < 0.0005:
            continue
        if delta > MAX_DELTA:
            print(f"[coords] skipped {name}: candidate outside guardrail (delta={delta:.3f})")
            continue
        print(f"[coords] {name}: ({current_lat:.6f},{current_lon:.6f}) -> ({lat:.6f},{lon:.6f})")
        if not args.dry_run:
            entry["latitude"] = round(lat, 6)
            entry["longitude"] = round(lon, 6)
        updated += 1
        time.sleep(args.sleep)

    if not args.dry_run:
        OUTPUT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[coords] Saved updates to {OUTPUT_PATH}")
    print(f"[coords] Updated {updated}, skipped {skipped}")


if __name__ == "__main__":
    main()
