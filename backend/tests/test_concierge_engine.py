# ruff: noqa: E402
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.concierge import ConciergeEngine, extract_intent


def test_extract_intent_basic():
    intent = extract_intent("Family friendly Azerbaijani in Old City, budget")
    assert "azerbaijani" in intent.cuisines
    assert any("old city" in loc for loc in intent.locations)
    assert intent.price_max == 2


def test_concierge_recommend_returns_results():
    engine = ConciergeEngine.default()
    intent, results, message = engine.recommend("Old City brunch with coffee", top_k=2)
    assert intent.query
    assert results
    assert message
