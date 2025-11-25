#!/usr/bin/env python3
"""Evaluate Concierge retrieval/ranking against a labeled set.

Usage examples:
  python backend/tools/evaluate_concierge.py \
    --cases tools/concierge/eval_set.json --top-k 5

The cases file is a JSON list with fields:
  - query (str)
  - good_ids (list[str])   # acceptable venue ids
  - areas (list[str])      # optional hard-ish area hints to verify
  - max_price_band (int)   # optional price ceiling (1-4)
  - notes (str)            # optional free-form notes
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

# Ensure backend imports resolve when executed from repo root
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.concierge import ConciergeEngine  # noqa: E402


@dataclass
class EvalCase:
    query: str
    good_ids: list[str]
    areas: list[str] = field(default_factory=list)
    max_price_band: int | None = None
    notes: str | None = None


def load_cases(path: Path) -> list[EvalCase]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return [EvalCase(**item) for item in data]


STOP_LOC_TOKENS = {
    "city",
    "district",
    "street",
    "avenue",
    "road",
    "area",
    "park",
    "mall",
    "center",
    "centre",
    "downtown",
    "metro",
    "station",
}


def _norm_tokens(text: str) -> set[str]:
    import re

    tokens = re.split(r"[^a-z0-9]+", text.lower())
    out = set()
    for tok in tokens:
        if not tok or tok in STOP_LOC_TOKENS:
            continue
        if tok.endswith("s") and len(tok) > 4:
            tok = tok[:-1]
        if tok in STOP_LOC_TOKENS:
            continue
        out.add(tok)
    return out


def area_match(venue_tags: dict[str, list[str]], targets: list[str]) -> bool:
    if not targets:
        return True
    venue_sets = [_norm_tokens(str(loc)) for loc in venue_tags.get("location", [])]
    for target in targets:
        tset = _norm_tokens(target)
        if not tset:
            continue
        if any(tset & v for v in venue_sets):
            return True
    return False


def price_ok(band: int | None, max_band: int | None) -> bool:
    if max_band is None or band is None:
        return True
    return band <= max_band


def satisfies_constraints(res, case: EvalCase) -> bool:
    v = res.venue
    return area_match(v.tags, case.areas) and price_ok(v.price_band, case.max_price_band)


def evaluate_case(engine: ConciergeEngine, case: EvalCase, top_k: int):
    intent, results, _ = engine.recommend(case.query, top_k=top_k)
    top1 = results[0] if results else None

    def is_good(res) -> bool:
        return res.venue.id in case.good_ids and satisfies_constraints(res, case)

    top1_hit = bool(top1 and is_good(top1))
    top3_hit = any(is_good(r) for r in results[:3])
    constraint_pass = bool(top1 and satisfies_constraints(top1, case))

    return {
        "top1_hit": top1_hit,
        "top3_hit": top3_hit,
        "constraint_pass": constraint_pass,
        "top_id": top1.venue.id if top1 else None,
        "top_name": top1.venue.name if top1 else None,
        "top_score": top1.score if top1 else None,
        "results": results,
        "intent": intent,
    }


def run_eval(cases: Iterable[EvalCase], top_k: int, prefer_openai: bool) -> None:
    engine = ConciergeEngine.default(prefer_openai=prefer_openai)

    stats = {
        "total": 0,
        "top1_hits": 0,
        "top3_hits": 0,
        "constraint_pass": 0,
        "failures": [],
    }

    for case in cases:
        stats["total"] += 1
        outcome = evaluate_case(engine, case, top_k=top_k)

        stats["top1_hits"] += int(outcome["top1_hit"])
        stats["top3_hits"] += int(outcome["top3_hit"])
        stats["constraint_pass"] += int(outcome["constraint_pass"])

        if not outcome["top3_hit"]:
            stats["failures"].append((case, outcome))

    total = max(1, stats["total"])
    print(f"Cases: {stats['total']}")
    print(f"Top-1 hit rate: {stats['top1_hits']/total*100:.1f}% ({stats['top1_hits']}/{total})")
    print(f"Top-3 hit rate: {stats['top3_hits']/total*100:.1f}% ({stats['top3_hits']}/{total})")
    print(
        f"Top-1 constraint pass: {stats['constraint_pass']/total*100:.1f}% ({stats['constraint_pass']}/{total})"
    )

    if stats["failures"]:
        print("\nFailures (no acceptable venue in Top-3):")
        for idx, (case, outcome) in enumerate(stats["failures"], start=1):
            top_id = outcome["top_id"] or "<none>"
            print(f"{idx}. '{case.query}' → top={top_id} (wanted any of {case.good_ids})")
            top_res = outcome["results"][0] if outcome["results"] else None
            if top_res:
                v = top_res.venue
                loc = ", ".join(v.tags.get("location", [])[:2])
                print(f"   top tags: {loc} | cuisine: {', '.join(v.tags.get('cuisine', [])[:3])}")
                print(f"   scores: {top_res.debug_scores}")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate concierge retrieval/ranking")
    parser.add_argument(
        "--cases",
        type=Path,
        default=ROOT / "tools" / "concierge" / "eval_set.json",
        help="Path to eval cases JSON file",
    )
    parser.add_argument("--top-k", type=int, default=5, help="Number of results to pull per query")
    parser.add_argument(
        "--use-openai", action="store_true", help="Use OpenAI embeddings if available"
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    cases = load_cases(args.cases)
    if not cases:
        print(f"No eval cases found at {args.cases}")
        return 1
    run_eval(cases, top_k=args.top_k, prefer_openai=args.use_openai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
