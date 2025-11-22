#!/usr/bin/env python3
"""
Batch enrichment helper that proxies the baku-enricher MCP pipeline.

Usage:
    python scripts/enrich_baku.py --slugs narghiz chinar

This script will:
    1. Look up each slug inside backend/app/data/restaurants.json
    2. Run the MCP tool (call_tool.mjs) to fetch the latest enrichment payload
    3. Merge the returned JSON into the seed store (tags, highlights, copy, links, etc.)
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = REPO_ROOT / "backend" / "app" / "data" / "restaurants.json"
ENRICHER_SCRIPT = REPO_ROOT / "tools" / "baku_enricher_mcp" / "call_tool.mjs"

FIELDS_TO_MERGE = [
    "tags",
    "highlights",
    "short_description",
    "menu_url",
    "instagram",
    "whatsapp",
    "average_spend",
    "experiences",
    "photos",
    "cover_photo",
    "map_images",
]


def load_seed() -> list[dict[str, Any]]:
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Seed file not found: {DATA_PATH}")
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def save_seed(items: list[dict[str, Any]]) -> None:
    DATA_PATH.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def merge_record(base: dict[str, Any], enriched: dict[str, Any]) -> None:
    for field in FIELDS_TO_MERGE:
        value = enriched.get(field)
        if value in (None, ""):
            continue
        base[field] = value
    # optional nested fields
    if enriched.get("address"):
        base["address"] = enriched["address"]


def run_enricher(name: str, out_dir: Path) -> None:
    cmd = [
        "node",
        str(ENRICHER_SCRIPT),
        name,
        str(out_dir),
    ]
    print(f"[enrich] -> {name}")
    subprocess.run(cmd, cwd=REPO_ROOT, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh restaurant metadata via the MCP enricher")
    parser.add_argument(
        "--slugs",
        nargs="*",
        help="One or more restaurant slugs to refresh. Defaults to all entries in the seed store.",
    )
    parser.add_argument(
        "--out",
        default="out/restaurants",
        help="Directory where the MCP tool writes enrichment payloads (default: out/restaurants)",
    )
    args = parser.parse_args()

    out_dir = (REPO_ROOT / args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    seed = load_seed()
    slug_map = {str(item.get("slug", "")).lower(): item for item in seed if item.get("slug")}
    targets = [slug.lower() for slug in (args.slugs or slug_map.keys())]

    for slug in targets:
        record = slug_map.get(slug)
        if not record:
            print(f"[enrich] ! skipping unknown slug: {slug}")
            continue
        name = record.get("name") or slug
        try:
            run_enricher(name, out_dir)
        except subprocess.CalledProcessError as exc:
            print(f"[enrich] ! MCP run failed for {name}: {exc}", file=sys.stderr)
            continue

        enriched_path = out_dir / f"{record.get('slug')}.json"
        if not enriched_path.exists():
            print(f"[enrich] ! no payload produced for {record['slug']} (expected {enriched_path})")
            continue
        try:
            enriched = json.loads(enriched_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"[enrich] ! invalid JSON for {record['slug']}: {exc}")
            continue
        merge_record(record, enriched)
        print(f"[enrich] ✓ merged {record['slug']}")

    save_seed(seed)
    print(f"[enrich] Seed store updated -> {DATA_PATH}")


if __name__ == "__main__":
    main()
