#!/usr/bin/env python3
"""
Extract user utterances from an Apple Numbers case-study file into a label-ready JSONL/CSV.

Assumes columns:
  Agent | Chat Duration | Teams | Interactive Chat | Customer Rating | Customer Comment | Text

Usage:
  python tools/concierge/export_numbers_questions.py \
      --source "Chat_Team_CaseStudy FINAL.numbers" \
      --out-jsonl artifacts/concierge/numbers_questions.jsonl \
      --sample 500
"""

from __future__ import annotations

import argparse
import csv
import json
import random
from pathlib import Path
from typing import Iterable

from numbers_parser import Document


def load_rows(path: Path) -> list[dict]:
    doc = Document(path)
    table = doc.sheets[0].tables[0]
    header = [table.cell(0, c).value for c in range(table.num_cols)]
    rows: list[dict] = []
    for r in range(1, table.num_rows):
        row = {header[c]: table.cell(r, c).value for c in range(table.num_cols)}
        rows.append(row)
    return rows


def normalize_row(row: dict) -> dict | None:
    text = (row.get("Text") or "") if isinstance(row, dict) else ""
    if not text or str(text).strip() in {"", " ", "None"}:
        return None
    comment = row.get("Customer Comment") or ""
    prompt = str(text).strip()
    if comment and str(comment).strip() and str(comment).strip().lower() != "none":
        prompt = f"{prompt}\n\nAdditional note: {comment}".strip()
    duration = row.get("Chat Duration")
    if duration is not None:
        duration = str(duration)
    return {
        "user_text": prompt,
        "team": str(row.get("Teams") or "").strip() or None,
        "agent": str(row.get("Agent") or "").strip() or None,
        "interactive": bool(row.get("Interactive Chat")),
        "rating": row.get("Customer Rating"),
        "chat_duration": duration,
    }


def write_jsonl(rows: Iterable[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_csv(rows: Iterable[dict], path: Path) -> None:
    rows = list(rows)
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Export Numbers case-study questions to JSONL/CSV")
    parser.add_argument("--source", type=Path, required=True, help="Path to .numbers file")
    parser.add_argument("--out-jsonl", type=Path, default=None, help="Output JSONL file")
    parser.add_argument("--out-csv", type=Path, default=None, help="Output CSV file")
    parser.add_argument("--sample", type=int, default=None, help="Limit/sample rows")
    args = parser.parse_args(argv)

    rows = [r for r in (normalize_row(r) for r in load_rows(args.source)) if r]
    if args.sample and args.sample > 0 and args.sample < len(rows):
        random.seed(42)
        rows = random.sample(rows, args.sample)

    if args.out_jsonl:
        write_jsonl(rows, args.out_jsonl)
        print(f"Wrote {len(rows)} rows -> {args.out_jsonl}")
    if args.out_csv:
        write_csv(rows, args.out_csv)
        print(f"Wrote {len(rows)} rows -> {args.out_csv}")
    if not args.out_jsonl and not args.out_csv:
        print(f"Loaded {len(rows)} rows (no output paths provided)")
    return 0


if __name__ == "__main__":
    import sys

    raise SystemExit(main(sys.argv[1:]))
