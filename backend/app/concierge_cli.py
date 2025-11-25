#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.concierge import ConciergeEngine  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Concierge CLI for venue recommendations.")
    parser.add_argument("query", help="Free-text question or preference string")
    parser.add_argument("-k", "--top-k", type=int, default=3, help="Number of venues to show")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text")
    parser.add_argument(
        "--use-openai",
        action="store_true",
        help="Prefer OpenAI embeddings if OPENAI_API_KEY is set (falls back if unavailable)",
    )
    args = parser.parse_args()

    engine = ConciergeEngine.default(prefer_openai=args.use_openai)
    intent, results, message = engine.recommend(args.query, top_k=args.top_k)

    if args.json:
        payload = {
            "intent": asdict(intent),
            "results": [
                {
                    "id": r.venue.id,
                    "name": r.venue.name,
                    "area": r.venue.tags.get("location"),
                    "price_band": r.venue.price_band,
                    "summary": r.venue.summary,
                    "score": r.score,
                }
                for r in results
            ],
            "message": message,
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(message)


if __name__ == "__main__":
    main()
