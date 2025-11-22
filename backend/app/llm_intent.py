from __future__ import annotations

import asyncio
import json
import logging
import time
from hashlib import sha256

from pydantic import ValidationError

from .concierge_tags import (
    canonicalize_amenities,
    canonicalize_cuisines,
    canonicalize_locations,
    canonicalize_negatives,
    canonicalize_vibes,
)
from .openai_async import OpenAIUnavailable, post_json
from .schemas import ConciergeIntent
from .settings import settings

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 2.0
MAX_FAILURES = 3
COOLDOWN_SECONDS = 300.0  # 5 minutes

_failure_count = 0
_disabled_until = 0.0


class IntentUnavailable(RuntimeError):
    """Raised when the intent parser cannot be used."""


def _now() -> float:
    return time.monotonic()


def _prompt_fingerprint(prompt: str) -> str:
    return sha256(prompt.encode("utf-8")).hexdigest()[:10]


def _normalize_lang(lang: str | None) -> str | None:
    if not lang:
        return None
    lowered = lang.strip().lower()
    if lowered in ("en", "english"):
        return "en"
    if lowered in ("az", "aze", "az-az"):
        return "az"
    if lowered in ("ru", "rus", "ru-ru"):
        return "ru"
    return None


def _detect_lang(prompt: str) -> str:
    lowered = prompt.lower()
    if any(ch in lowered for ch in "əığöüşç"):
        return "az"
    if any("\u0400" <= ch <= "\u04ff" for ch in prompt):
        return "ru"
    return "en"


def _circuit_open() -> bool:
    return _failure_count >= MAX_FAILURES and _disabled_until > _now()


def _register_failure(exc: Exception | None = None) -> None:
    global _failure_count, _disabled_until
    _failure_count += 1
    if _failure_count >= MAX_FAILURES:
        _disabled_until = _now() + COOLDOWN_SECONDS
    if exc:
        logger.warning("LLM intent failure (%s/%s)", _failure_count, MAX_FAILURES, exc_info=exc)


def _register_success() -> None:
    global _failure_count, _disabled_until
    _failure_count = 0
    _disabled_until = 0.0


SYSTEM_PROMPT = (
    "You are a multilingual dining concierge for Baku. "
    "Return structured JSON only. No prose. Map preferences to canonical tags."
)

CANONICAL_GUIDE = (
    "Vibe & amenity tags: romantic, family_friendly, rooftop, rooftop_lounge, scenic_view, skyline, waterfront, "
    "tea_house, armudu_tea_service, samovar_service, sunset_dining, shisha, dj_nights, live_music, live_mugham_music, "
    "dominoes_available, backgammon_tables, board_games, specialty_coffee, wine_bar, mixology, brunch, breakfast, late_night, "
    "vegan_options, gluten_free_options, kids_corner, wheelchair_accessible, private_rooms, valet_parking, cozy, fine_dining, trendy, "
    "heritage, seafood, steakhouse, sushi, group_friendly. "
    "Location tags: old_city, fountain_square, port_baku, seaside, flame_towers, bayil, yasamal, city_center, ganjlik. "
    "Negatives: no_loud_music, no_smoking, not_spicy, no_shisha. "
    "Price bucket: budget | mid | upper | luxury."
)

FEW_SHOT_EXAMPLES = [
    (
        "PROMPT (en): Romantic dinner near Flame Towers, rooftop or skyline vibes, no loud music please, budget 120 AZN per person",
        {
            "lang": "en",
            "vibe_tags": ["romantic", "rooftop", "skyline"],
            "cuisine_tags": [],
            "location_tags": ["flame_towers"],
            "price_bucket": "upper",
            "time_context": ["dinner"],
            "amenities": ["live_music"],
            "negatives": ["no_loud_music"],
            "budget_azn": {"max_pp": 120},
        },
    ),
    (
        "PROMPT (az): Ailəvi rahat brunch üçün Fountain Square ətrafında sakit, şişəsiz məkan axtarıram",
        {
            "lang": "az",
            "vibe_tags": ["family_friendly", "cozy", "brunch"],
            "cuisine_tags": [],
            "location_tags": ["fountain_square"],
            "price_bucket": "mid",
            "time_context": ["brunch"],
            "amenities": [],
            "negatives": ["no_shisha"],
        },
    ),
    (
        "PROMPT (ru): Хочу роскошный ужин у моря в Port Baku, без кальяна и слишком громкой музыки",
        {
            "lang": "ru",
            "vibe_tags": ["fine_dining", "waterfront"],
            "cuisine_tags": [],
            "location_tags": ["port_baku"],
            "price_bucket": "luxury",
            "time_context": ["dinner"],
            "amenities": [],
            "negatives": ["no_shisha", "no_loud_music"],
        },
    ),
    (
        "PROMPT (en): Need a sushi-focused spot with late night hours around Port Baku",
        {
            "lang": "en",
            "vibe_tags": ["late_night"],
            "cuisine_tags": ["sushi"],
            "location_tags": ["port_baku"],
            "price_bucket": "upper",
            "time_context": ["late_night"],
            "amenities": [],
            "negatives": [],
        },
    ),
    (
        "PROMPT (az): Şəhər mərkəzində iş yeməyi üçün sakit, fine dining, şərab kolleksiyası olan məkan",
        {
            "lang": "az",
            "vibe_tags": ["fine_dining", "cozy"],
            "cuisine_tags": [],
            "location_tags": ["city_center"],
            "price_bucket": "upper",
            "time_context": ["lunch"],
            "amenities": ["wine_cellar"],
            "negatives": ["no_loud_music"],
        },
    ),
    (
        "PROMPT (ru): Ищу семейный ресторан азербайджанской кухни в Ичеришехере, бюджет до 60 AZN",
        {
            "lang": "ru",
            "vibe_tags": ["family_friendly", "heritage"],
            "cuisine_tags": ["azerbaijani"],
            "location_tags": ["old_city"],
            "price_bucket": "mid",
            "time_context": ["dinner"],
            "amenities": [],
            "negatives": [],
            "budget_azn": {"max_pp": 60},
        },
    ),
]


_NEW_STYLE_MODEL_PREFIXES = (
    "gpt-4o",
    "gpt-4.1",
    "gpt-5",
    "o1",
    "o3",
    "o4",
    "o-",
)


def _token_param(model: str | None) -> str:
    name = (model or "").lower()
    for prefix in _NEW_STYLE_MODEL_PREFIXES:
        if name.startswith(prefix):
            return "max_completion_tokens"
    return "max_tokens"


def _few_shot_messages() -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for user_prompt, response in FEW_SHOT_EXAMPLES:
        messages.append({"role": "user", "content": user_prompt})
        messages.append({"role": "assistant", "content": json.dumps(response, ensure_ascii=False)})
    return messages


async def parse_intent_async(prompt: str, lang_hint: str | None) -> ConciergeIntent:
    normalized_prompt = prompt.strip()
    if not normalized_prompt:
        raise IntentUnavailable("Empty prompt")
    if _circuit_open():
        raise IntentUnavailable("Intent parser cooling down")

    normalized_hint = _normalize_lang(lang_hint) or _detect_lang(normalized_prompt)
    digest = _prompt_fingerprint(normalized_prompt)
    payload = {
        "model": settings.CONCIERGE_GPT_MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": CANONICAL_GUIDE},
            *_few_shot_messages(),
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "lang_hint": normalized_hint,
                        "prompt": normalized_prompt,
                        "instructions": "Respond with valid JSON only, matching the schema.",
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }
    payload[_token_param(settings.CONCIERGE_GPT_MODEL)] = 450

    try:
        response = await post_json(
            "/chat/completions",
            payload,
            timeout=settings.OPENAI_TIMEOUT_SECONDS,
        )
    except OpenAIUnavailable as exc:
        _register_failure(exc)
        raise IntentUnavailable("LLM call failed") from exc

    choices = response.get("choices") or []
    content = choices[0]["message"].get("content") if choices else None
    if not content:
        _register_failure()
        raise IntentUnavailable("Empty LLM response")

    try:
        payload_obj = json.loads(content)
    except json.JSONDecodeError as exc:
        logger.warning("Intent JSON decode failed (%s): %s", digest, content)
        _register_failure(exc)
        raise IntentUnavailable("Invalid intent JSON") from exc

    bucket = str(payload_obj.get("price_bucket") or "").strip().lower()
    if bucket not in {"budget", "mid", "upper", "luxury"}:
        payload_obj["price_bucket"] = "mid"

    try:
        intent_model = ConciergeIntent.model_validate(payload_obj)
    except ValidationError as exc:
        logger.warning("Intent validation failed (%s): %s", digest, payload_obj)
        _register_failure(exc)
        raise IntentUnavailable("Invalid intent format") from exc

    lang_value = _normalize_lang(intent_model.lang) or normalized_hint or "en"
    canonical_intent = intent_model.model_copy(
        update={
            "lang": lang_value,
            "vibe_tags": canonicalize_vibes(intent_model.vibe_tags, lang_value),
            "cuisine_tags": canonicalize_cuisines(intent_model.cuisine_tags, lang_value),
            "location_tags": canonicalize_locations(intent_model.location_tags, lang_value),
            "amenities": canonicalize_amenities(intent_model.amenities, lang_value),
            "negatives": canonicalize_negatives(intent_model.negatives, lang_value),
        }
    )
    _register_success()
    logger.debug("Intent parsed %s -> %s", digest, canonical_intent.model_dump(exclude_none=True))
    return canonical_intent


def parse_intent(prompt: str, lang_hint: str | None) -> ConciergeIntent:
    return asyncio.run(parse_intent_async(prompt, lang_hint))
