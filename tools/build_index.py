#!/usr/bin/env python3
"""Build vector index for Concierge AI."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.concierge.embeddings import get_default_embedder  # noqa: E402
from backend.app.concierge.engine import DEFAULT_INDEX_PATH, build_corpus  # noqa: E402
from backend.app.concierge.index import ConciergeIndex  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Build concierge vector index.")
    parser.add_argument(
        "--use-openai",
        action="store_true",
        help="Use OpenAI embeddings if available (falls back to hashing).",
    )
    parser.add_argument("--force-corpus", action="store_true", help="Regenerate corpus first.")
    args = parser.parse_args()

    venues = build_corpus(force=args.force_corpus)
    embedder = get_default_embedder(prefer_openai=args.use_openai)
    index = ConciergeIndex.build(venues, embedder=embedder)
    index.save(DEFAULT_INDEX_PATH)
    print(f"Built concierge index for {len(venues)} venues using {embedder.name} -> {DEFAULT_INDEX_PATH}")


if __name__ == "__main__":
    main()
