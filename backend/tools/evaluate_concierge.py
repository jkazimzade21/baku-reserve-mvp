#!/usr/bin/env python3
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class TestCase:
    query: str
    expected_ids: list[str]  # Any of these is a "hit"
    hard_constraints: list[str] | None = None


TEST_CASES = [
    TestCase(
        query="romantic seafood dinner with sea view near boulevard",
        expected_ids=["sahil_baku", "riviera_restaurant", "chayki_baku"],
    ),
    TestCase(
        query="beach club party at sea breeze",
        expected_ids=["nikkibeach.baku", "shorehousebaku", "beerbashabaku"],
    ),
    TestCase(
        query="traditional family banquet in narimanov",
        expected_ids=["chanaqqala", "nakhchivan_restaurant"],
    ),
    TestCase(
        query="high end italian dinner in port baku",
        expected_ids=["scalini_baku", "movidabaku", "portbakujasmine"],
    ),
    TestCase(
        query="casual dinner near ganclik",
        expected_ids=["themoodbaku"],
    ),
]


def run_eval() -> None:
    # Add project root to path so backend imports resolve when executed from tools/
    root = Path(__file__).resolve().parents[2]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))

    from backend.app.concierge import ConciergeEngine

    print("Initializing Concierge Engine...")
    engine = ConciergeEngine.default(
        prefer_openai=True
    )  # Use rule-based for fast eval or True for full check

    hits = 0
    total = len(TEST_CASES)

    print(f"Running {total} test cases...\n")

    for i, test in enumerate(TEST_CASES, start=1):
        print(f"Test {i}: '{test.query}'")
        _, results, _ = engine.recommend(test.query, top_k=5)

        result_ids = [r.venue.id for r in results]
        found = any(expected in result_ids for expected in test.expected_ids)

        if found:
            print(f"  ✅ PASS. Found relevant venue. Top result: {results[0].venue.name}")
            hits += 1
        else:
            print(f"  ❌ FAIL. Expected one of {test.expected_ids}, got {result_ids}")
            print(f"     Top result: {results[0].venue.name} (Score: {results[0].score:.2f})")

    accuracy = (hits / total) * 100
    print(f"\nOverall Accuracy: {accuracy:.1f}% ({hits}/{total})")


if __name__ == "__main__":
    run_eval()
