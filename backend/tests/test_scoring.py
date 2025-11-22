from backend.app.concierge_tags import prompt_keywords
from backend.app.schemas import ConciergeIntent
from backend.app.scoring import RestaurantFeatures, hybrid_score
from backend.app.settings import ConciergeWeights


def build_features(**overrides):
    base = dict(
        restaurant_id="test",
        slug="test",
        name="Demo",
        tags={"romantic", "rooftop", "live_music"},
        cuisines={"azerbaijani", "seafood"},
        locations={"old_city"},
        price_bucket="upper",
        short_description="Romantic rooftop dinner with live music",
    )
    base.update(overrides)
    return RestaurantFeatures(**base)


def test_hybrid_score_rewards_matching_preferences():
    intent = ConciergeIntent(
        lang="en",
        vibe_tags=["romantic", "rooftop"],
        cuisine_tags=["azerbaijani"],
        location_tags=["old_city"],
        price_bucket="upper",
        amenities=["live_music"],
    )
    features = build_features()
    weights = ConciergeWeights()

    score, reasons = hybrid_score(intent, features, 0.6, weights, {"romantic"})

    assert score > 0.6  # intent matches should boost the embedding baseline
    assert "romantic" in reasons
    assert "live_music" in features.tags


def test_hybrid_score_penalizes_negative_preferences():
    intent = ConciergeIntent(
        lang="en",
        negatives=["no_loud_music"],
        vibe_tags=[],
    )
    features = build_features(tags={"live_music"})
    weights = ConciergeWeights()

    score, reasons = hybrid_score(intent, features, 0.0, weights, set())

    assert score < 0  # penalty applied when venue conflicts with "no loud music"
    assert "no_loud_music" in reasons


def test_prompt_keywords_filters_stopwords():
    tokens = prompt_keywords("Romantic dinner with skyline views and cocktails")
    assert "with" not in tokens
    assert "romantic" in tokens
