#!/usr/bin/env python3
"""Build concierge dataset artifacts for offline training/eval.

Outputs a compact JSONL file with normalized venue records plus an optional
metadata summary. This reuses the existing concierge corpus builder so it stays
in sync with the production seed (`backend/app/data/restaurants.json`).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.concierge.engine import build_corpus  # noqa: E402
from backend.app.concierge.normalize import pick_primary_location  # noqa: E402


def flatten_tags(tags: dict[str, list[str]] | None) -> list[str]:
    if not tags:
        return []
    out: list[str] = []
    for values in tags.values():
        out.extend(values or [])
    return out


def make_embedding_text(venue) -> str:
    tag_text = " ".join(flatten_tags(venue.tags))
    parts: list[str] = [venue.name or "", venue.name_az or "", venue.summary or "", venue.address or ""]
    if tag_text:
        parts.append(tag_text)
    return " | ".join(p for p in parts if p)


def serialize_venue(venue) -> dict:
    primary_loc = pick_primary_location(venue.tags) or (venue.raw or {}).get("neighborhood")
    record = {
        "id": venue.id,
        "name_en": venue.name,
        "name_az": venue.name_az,
        "slug": venue.slug,
        "address": venue.address,
        "primary_location": primary_loc,
        "price_band": venue.price_band,
        "price_level": venue.price_level,
        "summary": venue.summary,
        "tags": venue.tags,
        "raw": venue.raw,
    }
    record["embedding_text"] = make_embedding_text(venue)
    return record


def write_jsonl(path: Path, rows: Iterable[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def build_artifacts(out_jsonl: Path, out_meta: Path | None, force_corpus: bool) -> None:
    venues = build_corpus(force=force_corpus)
    serialized = [serialize_venue(v) for v in venues]
    write_jsonl(out_jsonl, serialized)

    if out_meta:
        sample = serialized[:3]
        meta = {
            "count": len(serialized),
            "jsonl": str(out_jsonl),
            "fields": list(sample[0].keys()) if sample else [],
            "sample": sample,
        }
        out_meta.parent.mkdir(parents=True, exist_ok=True)
        out_meta.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote {len(serialized)} venues -> {out_jsonl}")
    if out_meta:
        print(f"Wrote meta -> {out_meta}")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build concierge dataset artifacts (JSONL + meta)")
    parser.add_argument(
        "--out-jsonl",
        type=Path,
        default=ROOT / "artifacts" / "concierge" / "venues_desc.jsonl",
        help="Path for the normalized JSONL dataset",
    )
    parser.add_argument(
        "--out-meta",
        type=Path,
        default=ROOT / "artifacts" / "concierge" / "venues_meta.json",
        help="Optional metadata output (omit with --out-meta '' )",
    )
    parser.add_argument("--force-corpus", action="store_true", help="Rebuild corpus even if cached")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    out_meta = None if str(args.out_meta) == "" else args.out_meta
    build_artifacts(args.out_jsonl, out_meta, force_corpus=args.force_corpus)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
