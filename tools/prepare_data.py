#!/usr/bin/env python3
"""Normalize restaurant data and cache concierge corpus."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.concierge.engine import DEFAULT_CORPUS_PATH, build_corpus  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare concierge corpus from restaurant seed.")
    parser.add_argument("--force", action="store_true", help="Rebuild even if cache exists")
    args = parser.parse_args()

    venues = build_corpus(force=args.force)
    print(f"Prepared corpus with {len(venues)} venues -> {DEFAULT_CORPUS_PATH}")
    if not DEFAULT_CORPUS_PATH.exists():
        print("Warning: corpus file was not written (check permissions).")
    else:
        size = DEFAULT_CORPUS_PATH.stat().st_size
        print(f"Wrote {DEFAULT_CORPUS_PATH} ({size} bytes)")


if __name__ == "__main__":
    main()
