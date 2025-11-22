from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from hashlib import sha256
from threading import Lock
from typing import Any

import numpy as np
from openai import OpenAI
from openai._exceptions import OpenAIError

from .json_utils import extract_json_dict
from .schemas import ConciergeQuery
from .settings import settings
from .storage import DB

logger = logging.getLogger(__name__)

_NEW_STYLE_MODEL_PREFIXES = (
    "gpt-4o",
    "gpt-4.1",
    "gpt-5",
    "o1",
    "o3",
    "o4",
    "o-",
)


def _token_param(model: str | None) -> tuple[str, int]:
    name = (model or "").lower()
    for prefix in _NEW_STYLE_MODEL_PREFIXES:
        if name.startswith(prefix):
            return "max_completion_tokens", 200
    return "max_tokens", 200


def _normalize_token(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def _tagify(value: str) -> str:
    return _normalize_token(value).replace(" ", "_")


def _humanize_tag(value: str) -> str:
    cleaned = value.strip().replace("_", " ").replace("-", " ")
    if not cleaned:
        return value
    return cleaned.title()


def _price_bucket_from_string(value: str | None) -> int:
    if not value:
        return 2
    match = re.search(r"([1-4])\s*/\s*4", value)
    if match:
        return int(match.group(1))
    digit = re.search(r"([1-4])", value)
    if digit:
        return int(digit.group(1))
    return 2


def _detect_language(prompt: str) -> str:
    lowered = prompt.lower()
    if re.search(r"[əığöüşç]", lowered):
        return "az"
    if re.search(r"[А-Яа-яЁё]", prompt):
        return "ru"
    return "en"


@dataclass
class IntentData:
    language: str | None = None
    vibes: list[str] | None = None
    cuisines: list[str] | None = None
    locations: list[str] | None = None
    price_bucket: int | None = None
    special: list[str] | None = None
    avoid: list[str] | None = None

    @property
    def normalized_tags(self) -> set[str]:
        tokens: set[str] = set()
        for coll in (self.vibes, self.special):
            if not coll:
                continue
            for item in coll:
                tokens.add(_tagify(item))
        return tokens

    @property
    def normalized_cuisines(self) -> set[str]:
        if not self.cuisines:
            return set()
        return {_tagify(item) for item in self.cuisines}

    @property
    def normalized_locations(self) -> set[str]:
        if not self.locations:
            return set()
        return {_tagify(item) for item in self.locations}

    @property
    def normalized_avoid(self) -> set[str]:
        if not self.avoid:
            return set()
        return {_tagify(item) for item in self.avoid}


@dataclass
class RestaurantProfile:
    id: str
    slug: str | None
    name: str
    tags: set[str]
    cuisines: set[str]
    city: str | None
    neighborhood: str | None
    price_bucket: int
    corpus: str
    fallback_rank: int


@dataclass
class EngineMatch:
    restaurant_id: str
    score: float
    reason: str | None
    tags: list[str]
    fallback: bool = False


@dataclass
class EngineResult:
    matches: list[EngineMatch]
    fallback_used: bool
    language: str | None


class ConciergeEngine:
    def __init__(self) -> None:
        self.embedding_model = settings.CONCIERGE_EMBED_MODEL or "text-embedding-3-small"
        self.chat_model = settings.CONCIERGE_GPT_MODEL or "gpt-3.5-turbo-0125"
        self._client: OpenAI | None = None
        self._profiles: list[RestaurantProfile] = self._load_profiles()
        self._profile_lookup: dict[str, RestaurantProfile] = {
            profile.id: profile for profile in self._profiles
        }
        self._vector_lock = Lock()
        self._vectors: dict[str, np.ndarray] = {}
        self._vector_norms: dict[str, float] = {}
        self._hashes: dict[str, str] = {}
        self._cache_path = settings.data_dir / "concierge_embeddings.json"
        self._load_cached_embeddings()

    # ---- public API ----
    def recommend(self, payload: ConciergeQuery) -> EngineResult:
        prompt = payload.prompt.strip()
        limit = max(1, min(8, payload.limit or 4))
        if not prompt:
            return EngineResult(matches=[], fallback_used=True, language=None)

        intent = self._interpret_prompt(prompt, payload.locale)
        language = (
            intent.language if intent.language else (payload.locale or _detect_language(prompt))
        )

        client = self._get_client()
        embeddings_ready = self._ensure_embeddings(client)
        if not client or not embeddings_ready:
            logger.info("Concierge falling back – embeddings unavailable")
            return EngineResult(self._fallback_matches(limit), True, language)

        query_vector = self._embed_query(prompt, client)
        if query_vector is None:
            logger.info("Concierge falling back – query embedding failed")
            return EngineResult(self._fallback_matches(limit), True, language)

        matches = self._score_profiles(query_vector, intent, limit)
        fallback_used = not matches
        if fallback_used:
            matches = self._fallback_matches(limit)
        return EngineResult(matches=matches, fallback_used=fallback_used, language=language)

    # ---- intent + embeddings ----
    def _interpret_prompt(self, prompt: str, locale: str | None) -> IntentData:
        client = self._get_client()
        if not client:
            return IntentData(language=locale or _detect_language(prompt))
        system = (
            "You are a dining concierge for high-end restaurants in Baku. "
            "Extract intent from the user's query and respond with compact JSON only."
        )
        schema_hint = (
            "Return JSON with keys: language (ISO code), vibes (array), cuisines (array), "
            "locations (array), price (cheap|moderate|premium|any), special (array of amenities or "
            "experiences), avoid (array). Map colloquial phrases to canonical tags, e.g. "
            "domino table -> dominoes_available, board games/backgammon -> board_games/backgammon_tables, "
            "tea house/armudu -> tea_house/armudu_tea_service, samovar -> samovar_service, "
            "hookah -> shisha, vegan friendly -> vegan_options, gluten free -> gluten_free_options, "
            "wheelchair access -> wheelchair_accessible, live mugham -> live_mugham_music."
        )
        request_text = (
            f"User locale hint: {locale or 'unknown'}\n"
            f"User prompt: {prompt}\n"
            "Respond with JSON only. No prose, no code fences."
        )
        token_key, token_value = _token_param(self.chat_model)
        try:
            response = client.chat.completions.create(
                model=self.chat_model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": schema_hint},
                    {"role": "user", "content": request_text},
                ],
                temperature=0,
                **{token_key: token_value},
            )
        except OpenAIError as exc:
            logger.warning("Intent parsing failed: %s", exc)
            return IntentData(language=locale or _detect_language(prompt))

        content = response.choices[0].message.content if response.choices else None
        if not content:
            return IntentData(language=locale or _detect_language(prompt))
        try:
            data = extract_json_dict(content)
        except ValueError:
            logger.warning("Intent JSON parse failed: %s", content)
            return IntentData(language=locale or _detect_language(prompt))

        vibes = data.get("vibes") if isinstance(data.get("vibes"), list) else None
        cuisines = data.get("cuisines") if isinstance(data.get("cuisines"), list) else None
        locations = data.get("locations") if isinstance(data.get("locations"), list) else None
        special = data.get("special") if isinstance(data.get("special"), list) else None
        avoid = data.get("avoid") if isinstance(data.get("avoid"), list) else None

        price_bucket = None
        price_value = str(data.get("price", "")).lower()
        if "cheap" in price_value or "budget" in price_value:
            price_bucket = 1
        elif "moderate" in price_value or "mid" in price_value:
            price_bucket = 2
        elif "premium" in price_value or "expensive" in price_value:
            price_bucket = 4

        lang = data.get("language") if isinstance(data.get("language"), str) else None
        if lang:
            lang = lang[:8]

        return IntentData(
            language=lang or locale or _detect_language(prompt),
            vibes=vibes,
            cuisines=cuisines,
            locations=locations,
            price_bucket=price_bucket,
            special=special,
            avoid=avoid,
        )

    def _get_client(self) -> OpenAI | None:
        if not settings.OPENAI_API_KEY:
            return None
        if self._client is None:
            self._client = OpenAI(api_key=settings.OPENAI_API_KEY)
        return self._client

    def _embed_query(self, prompt: str, client: OpenAI) -> np.ndarray | None:
        try:
            response = client.embeddings.create(
                model=self.embedding_model,
                input=[prompt.strip()[:1000]],
            )
        except OpenAIError as exc:
            logger.warning("Query embedding failed: %s", exc)
            return None
        vector = response.data[0].embedding
        arr = np.array(vector, dtype=np.float32)
        return arr

    def _ensure_embeddings(self, client: OpenAI | None) -> bool:
        if not client:
            return False
        with self._vector_lock:
            pending: list[RestaurantProfile] = []
            for profile in self._profiles:
                text_hash = self._text_hash(profile)
                cached_hash = self._hashes.get(profile.id)
                if profile.id in self._vectors and cached_hash == text_hash:
                    continue
                pending.append(profile)
            if not pending:
                return True
            inputs = [profile.corpus[:2000] for profile in pending]
            try:
                response = client.embeddings.create(
                    model=self.embedding_model,
                    input=inputs,
                )
            except OpenAIError as exc:
                logger.warning("Restaurant embedding refresh failed: %s", exc)
                return False
            for profile, item in zip(pending, response.data, strict=False):
                vec = np.array(item.embedding, dtype=np.float32)
                self._vectors[profile.id] = vec
                self._vector_norms[profile.id] = float(np.linalg.norm(vec) or 1.0)
                self._hashes[profile.id] = self._text_hash(profile)
            self._persist_cache()
            return True

    # ---- scoring ----
    def _score_profiles(
        self, query_vector: np.ndarray, intent: IntentData, limit: int
    ) -> list[EngineMatch]:
        query_norm = float(np.linalg.norm(query_vector) or 1.0)
        matches: list[tuple[RestaurantProfile, float, list[str]]] = []
        for profile in self._profiles:
            vec = self._vectors.get(profile.id)
            if vec is None:
                continue
            base = float(
                np.dot(query_vector, vec) / (query_norm * self._vector_norms.get(profile.id, 1.0))
            )
            base = max(base, 0.0)
            tag_bonus, matched_tags = self._score_tags(profile, intent)
            total = (
                (base * 0.35)
                + tag_bonus
                + (0.02 * (1 - profile.fallback_rank / max(1, len(self._profiles))))
            )
            matches.append((profile, total, matched_tags))

        matches.sort(key=lambda item: item[1], reverse=True)
        results: list[EngineMatch] = []
        for profile, score, matched_tags in matches[:limit]:
            reason = " • ".join(_humanize_tag(tag) for tag in matched_tags[:3]) or None
            results.append(
                EngineMatch(
                    restaurant_id=profile.id,
                    score=round(float(score), 4),
                    reason=reason,
                    tags=matched_tags,
                )
            )
        return results

    def _score_tags(
        self, profile: RestaurantProfile, intent: IntentData
    ) -> tuple[float, list[str]]:
        matched: list[str] = []
        score = 0.0

        preference_tags = intent.normalized_tags
        pref_matches = 0
        for tag in preference_tags:
            if tag in profile.tags:
                matched.append(tag)
                score += 0.18
                pref_matches += 1

        for cuisine in intent.normalized_cuisines:
            if cuisine in profile.cuisines:
                matched.append(cuisine)
                score += 0.15

        for loc in intent.normalized_locations:
            if loc in profile.tags or (
                profile.neighborhood and loc in _tagify(profile.neighborhood)
            ):
                matched.append(loc)
                score += 0.1

        if intent.price_bucket:
            diff = abs(profile.price_bucket - intent.price_bucket)
            if diff == 0:
                score += 0.08
                matched.append(f"price_{intent.price_bucket}")
            elif diff == 1:
                score += 0.02
            else:
                score -= 0.08

        for avoid in intent.normalized_avoid:
            if avoid in profile.tags:
                score -= 0.2

        if preference_tags and pref_matches == 0:
            score -= 0.3

        return score, matched

    # ---- persistence helpers ----
    def _load_profiles(self) -> list[RestaurantProfile]:
        profiles: list[RestaurantProfile] = []
        for idx, record in enumerate(DB.restaurants.values()):
            tags = {_tagify(tag) for tag in (record.get("tags") or []) if isinstance(tag, str)}
            cuisines = {
                _tagify(item) for item in (record.get("cuisine") or []) if isinstance(item, str)
            }
            corpus_bits = [
                str(record.get("name") or ""),
                str(record.get("short_description") or ""),
                " ".join(record.get("cuisine") or []),
                " ".join(record.get("tags") or []),
                str(record.get("neighborhood") or ""),
                str(record.get("address") or ""),
            ]
            corpus = " | ".join(bit for bit in corpus_bits if bit)
            profiles.append(
                RestaurantProfile(
                    id=str(record["id"]),
                    slug=str(record.get("slug")) if record.get("slug") else None,
                    name=str(record.get("name")),
                    tags=tags,
                    cuisines=cuisines,
                    city=record.get("city"),
                    neighborhood=record.get("neighborhood"),
                    price_bucket=_price_bucket_from_string(record.get("price_level")),
                    corpus=corpus,
                    fallback_rank=idx,
                )
            )
        return profiles

    def _text_hash(self, profile: RestaurantProfile) -> str:
        return sha256(profile.corpus.encode("utf-8")).hexdigest()

    def _cache_payload(self) -> dict[str, Any]:
        return {
            "model": self.embedding_model,
            "items": [
                {
                    "id": rid,
                    "hash": self._hashes.get(rid),
                    "vector": vector.tolist(),
                }
                for rid, vector in self._vectors.items()
            ],
        }

    def _persist_cache(self) -> None:
        payload = self._cache_payload()
        try:
            self._cache_path.parent.mkdir(parents=True, exist_ok=True)
            self._cache_path.write_text(json.dumps(payload), encoding="utf-8")
        except OSError as exc:
            logger.warning("Failed to persist concierge embeddings: %s", exc)

    def _load_cached_embeddings(self) -> None:
        if not self._cache_path.exists():
            return
        try:
            payload = json.loads(self._cache_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            logger.warning("Invalid concierge embedding cache; ignoring")
            return
        if payload.get("model") != self.embedding_model:
            logger.info("Embedding cache model mismatch; regenerating")
            return
        items = payload.get("items") or []
        for item in items:
            rid = item.get("id")
            vector = item.get("vector")
            hash_value = item.get("hash")
            if not rid or not isinstance(vector, list):
                continue
            arr = np.array(vector, dtype=np.float32)
            self._vectors[rid] = arr
            self._vector_norms[rid] = float(np.linalg.norm(arr) or 1.0)
            if hash_value:
                self._hashes[rid] = str(hash_value)

    def _fallback_matches(self, limit: int) -> list[EngineMatch]:
        matches: list[EngineMatch] = []
        for profile in self._profiles[:limit]:
            matches.append(
                EngineMatch(
                    restaurant_id=profile.id,
                    score=0.0,
                    reason=None,
                    tags=[],
                    fallback=True,
                )
            )
        return matches


concierge_engine = ConciergeEngine()
