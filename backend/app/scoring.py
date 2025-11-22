from __future__ import annotations

import re
from dataclasses import dataclass

from .concierge_tags import price_bucket_to_int
from .schemas import ConciergeIntent
from .settings import ConciergeWeights


@dataclass(slots=True)
class RestaurantFeatures:
    restaurant_id: str
    slug: str | None
    name: str
    tags: set[str]
    cuisines: set[str]
    locations: set[str]
    price_bucket: str
    short_description: str | None = None
    search_blob: str = ""


NEGATIVE_BLOCKERS: dict[str, set[str]] = {
    "no_loud_music": {"live_music", "dj", "club"},
    "no_smoking": {"shisha", "smoking", "hookah"},
    "not_spicy": {"spicy", "chili"},
    "no_shisha": {"shisha", "hookah"},
}


def score_embedding(similarity: float, weights: ConciergeWeights) -> float:
    return similarity * weights.alpha


def score_vibe(
    intent: ConciergeIntent, features: RestaurantFeatures, weights: ConciergeWeights
) -> tuple[float, list[str]]:
    desired = set(intent.vibe_tags or []) | set(intent.amenities or [])
    if not desired:
        return 0.0, []
    matches = sorted(desired & features.tags)
    if not matches:
        return 0.0, []
    fraction = len(matches) / max(1, len(desired))
    return weights.beta * fraction, matches


def score_cuisine(
    intent: ConciergeIntent, features: RestaurantFeatures, weights: ConciergeWeights
) -> tuple[float, list[str]]:
    if not intent.cuisine_tags:
        return 0.0, []
    desired = set(intent.cuisine_tags)
    matches = sorted(desired & features.cuisines)
    if not matches:
        return 0.0, []
    fraction = len(matches) / max(1, len(desired))
    return weights.gamma * fraction, matches


def score_location(
    intent: ConciergeIntent, features: RestaurantFeatures, weights: ConciergeWeights
) -> tuple[float, list[str]]:
    if not intent.location_tags:
        return 0.0, []
    desired = set(intent.location_tags)
    matches = sorted(desired & features.locations)
    if not matches:
        return 0.0, []
    fraction = len(matches) / max(1, len(desired))
    return weights.delta * fraction, matches


def score_price_fit(
    intent: ConciergeIntent, features: RestaurantFeatures, weights: ConciergeWeights
) -> tuple[float, list[str]]:
    desired = price_bucket_to_int(intent.price_bucket)
    actual = price_bucket_to_int(features.price_bucket)
    diff = abs(actual - desired)
    if diff == 0:
        base = 1.0
    elif diff == 1:
        base = 0.4
    else:
        base = -0.8
    return weights.epsilon * base, [features.price_bucket]


def score_desc_overlap(
    prompt_terms: set[str], features: RestaurantFeatures, weights: ConciergeWeights
) -> tuple[float, list[str]]:
    if not prompt_terms or not features.short_description:
        return 0.0, []
    desc_terms = {
        token
        for token in re.findall(r"[\w]+", features.short_description.lower())
        if len(token) > 3
    }
    matches = sorted(prompt_terms & desc_terms)
    if not matches:
        return 0.0, []
    capped = matches[:3]
    score = weights.zeta * min(1.0, len(matches) / 5)
    return score, capped


def score_negatives(
    intent: ConciergeIntent, features: RestaurantFeatures
) -> tuple[float, list[str]]:
    if not intent.negatives:
        return 0.0, []
    penalties = 0.0
    reasons: list[str] = []
    for negative in intent.negatives:
        blockers = NEGATIVE_BLOCKERS.get(negative)
        if not blockers:
            continue
        if blockers & features.tags:
            penalties += 1.0
            reasons.append(negative)
    if not penalties:
        return 0.0, []
    normalized = penalties / len(intent.negatives)
    return normalized, reasons


def hybrid_score(
    intent: ConciergeIntent,
    features: RestaurantFeatures,
    embedding_similarity: float,
    weights: ConciergeWeights,
    prompt_terms: set[str],
) -> tuple[float, list[str]]:
    total = score_embedding(embedding_similarity, weights)
    reasons: list[str] = []

    vibe_score, vibe_reasons = score_vibe(intent, features, weights)
    total += vibe_score
    reasons.extend(vibe_reasons)

    cuisine_score, cuisine_reasons = score_cuisine(intent, features, weights)
    total += cuisine_score
    reasons.extend(cuisine_reasons)

    location_score, location_reasons = score_location(intent, features, weights)
    total += location_score
    reasons.extend(location_reasons)

    price_score, price_reasons = score_price_fit(intent, features, weights)
    total += price_score
    reasons.extend(price_reasons)

    desc_score, desc_reasons = score_desc_overlap(prompt_terms, features, weights)
    total += desc_score
    reasons.extend(desc_reasons)

    penalty, penalty_reasons = score_negatives(intent, features)
    if penalty:
        total -= weights.eta * penalty
        reasons.extend(penalty_reasons)

    return total, reasons[:6]
