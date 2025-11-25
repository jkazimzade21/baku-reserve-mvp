from __future__ import annotations

import hashlib
import logging
import math
import os
import re
from typing import Sequence

logger = logging.getLogger(__name__)

try:  # Optional dependency; we fall back to hashing if missing.
    from openai import OpenAI
except Exception:  # pragma: no cover - import guard
    OpenAI = None  # type: ignore


class EmbeddingBackend:
    name: str = "base"
    dimension: int = 0

    def embed_batch(self, texts: Sequence[str]) -> list[list[float]]:
        raise NotImplementedError


class HashingEmbedder(EmbeddingBackend):
    """Lightweight, dependency-free hashing trick for small corpora."""

    def __init__(self, dimension: int = 256) -> None:
        self.dimension = dimension
        self.name = f"hash-{dimension}"

    def _embed(self, text: str) -> list[float]:
        tokens = re.findall(r"[a-z0-9]+", text.lower())
        vec = [0.0] * self.dimension
        if not tokens:
            return vec
        for tok in tokens:
            h = int(hashlib.sha1(tok.encode("utf-8")).hexdigest(), 16)
            vec[h % self.dimension] += 1.0
        norm = math.sqrt(sum(v * v for v in vec))
        return [v / norm for v in vec] if norm else vec

    def embed_batch(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._embed(t or "") for t in texts]


class OpenAIEmbedder(EmbeddingBackend):
    """Uses OpenAI embeddings if available and configured."""

    def __init__(self, model: str = "text-embedding-3-small", api_key: str | None = None) -> None:
        if OpenAI is None:
            raise RuntimeError("openai package not installed; cannot use OpenAIEmbedder")
        key = api_key or os.getenv("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("OPENAI_API_KEY not set; cannot use OpenAIEmbedder")
        self.client = OpenAI(api_key=key)
        self.model = model
        # dimension is model dependent; leave as 0 to avoid stale numbers
        self.dimension = 0
        self.name = model

    def embed_batch(self, texts: Sequence[str]) -> list[list[float]]:
        # OpenAI client handles batching internally.
        resp = self.client.embeddings.create(input=list(texts), model=self.model)
        ordered = sorted(resp.data, key=lambda d: d.index)
        return [item.embedding for item in ordered]


def get_default_embedder(prefer_openai: bool = False) -> EmbeddingBackend:
    if prefer_openai:
        try:
            return OpenAIEmbedder()
        except Exception as exc:  # pragma: no cover - runtime fallback
            logger.warning("OpenAI embedder unavailable, falling back to hashing: %s", exc)
    return HashingEmbedder()
