from __future__ import annotations

import json
import logging
import math
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .embeddings import EmbeddingBackend, get_default_embedder
from .normalize import build_summary, humanize_tag
from .types import Intent, SearchResult, Venue

logger = logging.getLogger(__name__)


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _doc_for_venue(v: Venue) -> str:
    tag_parts: list[str] = []
    for key, values in (v.tags or {}).items():
        for val in values:
            tag_parts.append(humanize_tag(val))
            tag_parts.append(key)
    pieces = [
        v.name or "",
        v.name_az or "",
        v.summary or "",
        v.address or "",
        " ".join(tag_parts),
    ]
    return " ".join(pieces)


class ConciergeIndex:
    def __init__(
        self,
        venues: list[Venue],
        vectors: list[list[float]],
        embedder: EmbeddingBackend,
        meta: dict[str, Any] | None = None,
    ) -> None:
        self.venues = venues
        self.vectors = vectors
        self.embedder = embedder
        self.meta = meta or {}

    @classmethod
    def build(
        cls,
        venues: list[Venue],
        embedder: EmbeddingBackend | None = None,
    ) -> "ConciergeIndex":
        embedder = embedder or get_default_embedder()
        docs = [_doc_for_venue(v) for v in venues]
        vectors = embedder.embed_batch(docs)
        meta = {
            "version": 1,
            "embedding_backend": embedder.name,
            "dimension": len(vectors[0]) if vectors else embedder.dimension,
            "count": len(vectors),
        }
        return cls(venues, vectors, embedder, meta)

    def search(self, query: str, intent: Intent, top_k: int = 20) -> list[SearchResult]:
        doc = build_query_document(intent)
        qvec = self.embedder.embed_batch([doc])[0]
        scored: list[SearchResult] = []
        
        # Normalize intent locations for checking
        target_locations = [loc.lower() for loc in intent.locations] if intent.locations else []

        for venue, vec in zip(self.venues, self.vectors):
            # Hard Filter: Location (if specified)
            # If user explicitly asks for an area, penalize or exclude venues not in that area/tag group
            if target_locations:
                venue_locs = [str(l).lower() for l in venue.tags.get("location", [])]
                # Check if any venue location tag matches any target location (partial match allowed)
                # E.g. target="narimanov", venue has "narimanov-metro"
                
                has_location_match = False
                for t_loc in target_locations:
                    if any(t_loc in v_loc for v_loc in venue_locs):
                        has_location_match = True
                        break
                
                # If location is totally wrong, skip semantic search for this venue OR give it 0 score
                # Skipping is cleaner for "Top-K"
                if not has_location_match:
                    continue

            score = _cosine(qvec, vec)
            scored.append(SearchResult(venue=venue, score=score))
            
        scored.sort(key=lambda r: r.score, reverse=True)
        
        # Fallback: if strict filtering killed everything (e.g. bad tag mapping), try again without filter?
        # For now, let's return what we found. If empty, maybe we should have relaxed.
        # A robust system would retry with relaxed constraints.
        if not scored and target_locations:
             # Retry without filter
             for venue, vec in zip(self.venues, self.vectors):
                score = _cosine(qvec, vec)
                scored.append(SearchResult(venue=venue, score=score))
             scored.sort(key=lambda r: r.score, reverse=True)

        return scored[: max(1, top_k)]

    def save(self, path: Path) -> None:
        payload = {
            "meta": self.meta,
            "venues": [asdict(v) for v in self.venues],
            "vectors": self.vectors,
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")
        logger.info("Saved concierge index to %s", path)

    @classmethod
    def load(cls, path: Path, embedder: EmbeddingBackend | None = None) -> "ConciergeIndex":
        payload = json.loads(path.read_text(encoding="utf-8"))
        embedder = embedder or get_default_embedder()
        venues = [Venue(**item) for item in payload.get("venues", [])]
        vectors = payload.get("vectors", [])
        meta = payload.get("meta", {})
        return cls(venues, vectors, embedder, meta)


# ---------- query document ----------


def build_query_document(intent: Intent) -> str:
    parts = [intent.query]
    if intent.cuisines:
        parts.append("cuisine: " + ", ".join(intent.cuisines))
    if intent.locations:
        parts.append("area: " + ", ".join(intent.locations))
    if intent.vibe:
        parts.append("vibe: " + ", ".join(intent.vibe))
    if intent.amenities:
        parts.append("amenities: " + ", ".join(intent.amenities))
    if intent.occasions:
        parts.append("occasion: " + ", ".join(intent.occasions))
    if intent.dietary:
        parts.append("dietary: " + ", ".join(intent.dietary))
    if intent.price_min or intent.price_max:
        parts.append(f"price {intent.price_min or ''}-{intent.price_max or ''}")
    return " | ".join(parts)