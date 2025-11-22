import asyncio
import logging
from typing import Any

from fastapi import HTTPException
from openai import OpenAI

try:
    from .concierge_search import HybridSearcher
except ImportError as exc:  # pragma: no cover - optional dependency in dev
    HybridSearcher = None  # type: ignore
    _hybrid_import_error = exc
else:
    _hybrid_import_error = None
from .contracts import RestaurantListItem
from .json_utils import extract_json_dict
from .schemas import ConciergeRequest, ConciergeResponse
from .serializers import restaurant_to_list_item
from .settings import settings
from .storage import DB

logger = logging.getLogger(__name__)


class ConciergeV2Service:
    def __init__(self):
        self.searcher = None
        self.client = None
        self._initialized = False
        self._init_lock = asyncio.Lock()
        self._init_task: asyncio.Task | None = None
        self._health = {
            "embeddings": {"status": "unknown", "updated_at": None, "detail": None},
            "llm": {"status": "unknown", "updated_at": None, "detail": None},
        }

    async def startup(self):
        """Initialize resources on app startup."""
        if self._initialized or self._init_task:
            return

        # Schedule initialization in background (non-blocking for server startup)
        self._init_task = asyncio.create_task(self._do_init())

    async def _do_init(self):
        """Async wrapper for synchronous initialization."""
        async with self._init_lock:
            if self._initialized:
                return
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, self.initialize_sync)
            self._initialized = True

    async def shutdown(self):
        """Cleanup resources."""
        if self._init_task and not self._init_task.done():
            self._init_task.cancel()
            try:
                await self._init_task
            except asyncio.CancelledError:
                pass

    def initialize_sync(self):
        logger.info("Initializing Concierge V2 Service...")
        restaurants = list(DB.restaurants.values())
        cache_dir = settings.data_dir / "concierge_v2_cache"

        if HybridSearcher is None:
            msg = f"HybridSearcher unavailable: {_hybrid_import_error}"
            logger.warning(msg)
            self._set_health("embeddings", "degraded", msg)
        else:
            self.searcher = HybridSearcher(restaurants, cache_dir)
            try:
                self.searcher.initialize_embeddings()
                self._set_health("embeddings", "healthy")
            except Exception as e:
                logger.error(f"Failed to initialize embeddings: {e}")
                self._set_health("embeddings", "degraded", str(e))

        if settings.OPENAI_API_KEY:
            self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
            self._set_health("llm", "healthy")
        else:
            logger.warning("No OpenAI API Key found. LLM features disabled.")
            self._set_health("llm", "degraded", "Missing API Key")

        logger.info("Concierge V2 Service Initialized.")

    def _set_health(self, component: str, status: str, detail: str | None = None):
        from datetime import UTC, datetime

        self._health[component] = {
            "status": status,
            "updated_at": datetime.now(UTC),
            "detail": detail,
        }

    @property
    def health_snapshot(self) -> dict[str, dict[str, object | None]]:
        return {key: value.copy() for key, value in self._health.items()}

    async def recommend(
        self, payload: ConciergeRequest, request, mode_override: str | None = None
    ) -> ConciergeResponse:
        # Ensure initialization is complete before serving requests
        if not self._initialized:
            if self._init_task:
                await self._init_task
            else:
                # Fallback if startup didn't run (shouldn't happen in normal app flow)
                await self.startup()
                if self._init_task:
                    await self._init_task

        # If optional search dependencies failed to load (e.g., FAISS/torch missing)
        # the HybridSearcher will be unavailable. Instead of crashing the request
        # (which surfaced as AttributeError: 'NoneType' object has no attribute 'search'
        # in CI), return a clear 503 so callers know concierge is temporarily offline.
        if self.searcher is None:
            raise HTTPException(status_code=503, detail="Concierge search unavailable")

        prompt = payload.prompt
        limit = payload.limit or 5
        loop = asyncio.get_running_loop()

        # Determine mode
        mode = mode_override or "ai"

        if mode == "local":
            # Fast path: Lexical search only
            results = await loop.run_in_executor(
                None, lambda: self.searcher.search_lexical(prompt, limit=limit)
            )
            match_reason = {}
            explanations = {}
            list_items = []

            for item in results:
                r = item["restaurant"]
                summary = restaurant_to_list_item(r, request=request)
                list_item = RestaurantListItem(**summary)
                list_items.append(list_item)
                key = (list_item.slug or str(list_item.id)).lower()
                match_reason[key] = ["Keyword match"]
                explanations[key] = "Matches your search terms."

            return ConciergeResponse(
                results=list_items,
                match_reason=match_reason,
                explanations=explanations,
                mode="local",
            )

        # AI / Hybrid Mode
        # 1. Parse Intent (Async)
        intent = await self._parse_intent_async(prompt)

        # 2. Search (Run in executor)
        hard_filters = intent.get("hard_filters", {})

        # Use hard_filters for search
        # Note: searcher.search is sync/CPU bound
        results = await loop.run_in_executor(
            None,
            lambda: self.searcher.search(prompt, hard_filters=hard_filters, limit=limit),
        )

        # 3. Format Response
        list_items = []
        match_reason = {}
        explanations = {}

        for item in results:
            r = item["restaurant"]
            # Convert to RestaurantListItem using existing serializer
            # serializer expects 'request' object for building absolute URLs
            summary = restaurant_to_list_item(r, request=request)
            list_item = RestaurantListItem(**summary)
            list_items.append(list_item)

            # Reason generation
            key = (list_item.slug or str(list_item.id)).lower()

            # Check if this was a relaxed result
            is_relaxed = item.get("relaxed", False)

            reason = self._generate_reason(r, intent, item.get("reason_tags", []))
            if is_relaxed:
                reason = f"Similar option: {reason}"

            match_reason[key] = [reason]  # API expects list of strings (chips)
            explanations[key] = f"{reason} Score: {item['score']:.2f}"  # Simple explanation

        return ConciergeResponse(
            results=list_items,
            match_reason=match_reason,
            explanations=explanations,
            mode="ai",
        )

    async def _parse_intent_async(self, prompt: str) -> dict[str, Any]:
        if not self.client:
            return {}

        system_prompt = """
        You are a parser for a Baku restaurant concierge.
        Convert the user's query into a JSON object with 'hard_filters' and 'soft_preferences'.
        
        Schema:
        {
          "hard_filters": {
             "location_baku": ["sea_breeze_resort", "old_city", "port_baku", ...], 
             "diet_allergen": ["halal_certified", "vegan_options", ...],
             "venue_type": ["tea_house", "rooftop_bar", ...]
          },
          "soft_preferences": ["romantic", "jazz", "italian", "sushi", "late_night", "shisha", "view"]
        }
        
        Mapping Rules:
        - "dominoes", "backgammon", "nard" -> venue_type: "tea_house" (Context: implies tea culture) AND soft: "dominoes"
        - "chaykhana", "tea house" -> venue_type: "tea_house" (HARD FILTER)
        - "Seabreeze", "Sea breeze" -> location_baku: "sea_breeze_resort" (HARD FILTER)
        - "Old City", "Icherisheher" -> location_baku: "icherisheher_old_city"
        - "Halal" -> diet_allergen: "halal_certified" (HARD FILTER)
        
        CRITICAL: 
        1. If user says "Chaykhana" or "Tea House", you MUST add "tea_house" to "hard_filters.venue_type".
        2. ONLY include keys in "hard_filters" if the user EXPLICITLY requests them.
        3. Do NOT infer hard filters from cuisine names (e.g. "Italian" does NOT mean "Halal").
        """

        try:
            loop = asyncio.get_running_loop()
            # Wrap the synchronous OpenAI call
            response = await loop.run_in_executor(
                None,
                lambda: self.client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0,
                    response_format={"type": "json_object"},
                ),
            )
            content = response.choices[0].message.content
            logger.info(f"LLM Raw Response: {content}")
            parsed = extract_json_dict(content)
            logger.info(f"Parsed Intent Object: {parsed}")
            return parsed
        except Exception as e:
            logger.error(f"Intent parsing failed: {e}")
            return {}

    def _generate_reason(
        self, restaurant: dict[str, Any], intent: dict[str, Any], matched_tags: list[str]
    ) -> str:
        soft_prefs = intent.get("soft_preferences", [])
        tags = restaurant.get("tags", [])

        # Find intersection
        matched = [t for t in soft_prefs if t in tags]
        if matched:
            return f"Matches: {', '.join(matched)}"
        elif (
            matched_tags
        ):  # Fallback to what the re-ranker might have liked? Reranker doesn't return matched keywords easily
            pass

        return "Recommended for you"


concierge_v2_service = ConciergeV2Service()
