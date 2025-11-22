import logging
from pathlib import Path
from typing import Any

import faiss
import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder, SentenceTransformer

logger = logging.getLogger(__name__)


class HybridSearcher:
    def __init__(self, restaurants: list[dict[str, Any]], cache_dir: Path):
        self.restaurants = restaurants
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        self.embedding_model_name = "intfloat/multilingual-e5-large"  # As requested
        # Fallback to a smaller one if memory is an issue, but let's try the requested one.
        # Actually, for 53 items, large is fine.

        self.reranker_model_name = "cross-encoder/ms-marco-MiniLM-L6-v2"

        self.ids = [str(r["id"]) for r in restaurants]
        self.docs = [self._create_search_blob(r) for r in restaurants]

        # Initialize BM25
        self.tokenized_corpus = [doc.lower().split() for doc in self.docs]
        self.bm25 = BM25Okapi(self.tokenized_corpus)

        # Initialize Vector Index
        self.embedder = None  # Lazy load
        self.vector_index = None
        self.embeddings = None

        # Initialize Reranker
        self.reranker = None  # Lazy load

    def search_lexical(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """Fast lexical-only search using BM25 (for local mode)."""
        tokenized_query = query.lower().split()
        bm25_scores = self.bm25.get_scores(tokenized_query)

        # Get top indices
        # We can't use argpartition if we want sorted order easily, but for small N argsort is fine
        top_indices = np.argsort(bm25_scores)[::-1][:limit]

        results = []
        for idx in top_indices:
            score = bm25_scores[idx]
            if score <= 0:
                continue
            r = self.restaurants[idx]
            results.append(
                {
                    "restaurant": r,
                    "score": float(score),
                    "reason_tags": r.get("tags", []),
                    "relaxed": False,
                }
            )
        return results

    def _create_search_blob(self, r: dict[str, Any]) -> str:
        # Helper to humanize tags for better BM25/Vector matching
        def humanize(val):
            if isinstance(val, list):
                return " ".join([v.replace("_", " ") for v in val if isinstance(v, str)])
            if isinstance(val, str):
                return val.replace("_", " ")
            return ""

        # Combine all text fields for broad matching
        parts = [
            r.get("name", ""),
            r.get("short_description", ""),
            humanize(r.get("tags", [])),
            humanize(r.get("cuisine", [])),
            r.get("neighborhood", ""),
            r.get("address", ""),
            # Add structured tags values for keyword matching
            humanize(r.get("structured_tags", {}).get("venue_type", [])),
            humanize(r.get("structured_tags", {}).get("features", [])),
            humanize(r.get("structured_tags", {}).get("az_culture", [])),
            humanize(r.get("structured_tags", {}).get("area", [])),  # Explicitly add area
        ]
        return " ".join(parts)

    def _load_embedder(self):
        if self.embedder is None:
            logger.info(f"Loading embedding model: {self.embedding_model_name}")
            self.embedder = SentenceTransformer(self.embedding_model_name)

    def _load_reranker(self):
        if self.reranker is None:
            logger.info(f"Loading reranker model: {self.reranker_model_name}")
            self.reranker = CrossEncoder(self.reranker_model_name)

    def initialize_embeddings(self):
        cache_file = self.cache_dir / "concierge_vectors_v2.npy"

        if cache_file.exists():
            logger.info("Loading cached embeddings...")
            self.embeddings = np.load(cache_file)
            if self.embeddings.shape[0] != len(self.restaurants):
                logger.warning("Cached embeddings count mismatch. Recomputing.")
                self.embeddings = None

        if self.embeddings is None:
            self._load_embedder()
            logger.info("Computing embeddings (this may take a moment)...")
            # E5 requires "query: " and "passage: " prefixes, but for simple similarity on this scale
            # we can just embed. Technically E5 expects "passage: " for docs.
            passages = [f"passage: {doc}" for doc in self.docs]
            self.embeddings = self.embedder.encode(
                passages, convert_to_numpy=True, normalize_embeddings=True
            )
            np.save(cache_file, self.embeddings)

        # Build FAISS index
        d = self.embeddings.shape[1]
        self.vector_index = faiss.IndexFlatIP(d)  # Inner Product (Cosine since normalized)
        self.vector_index.add(self.embeddings)
        logger.info(f"Vector index initialized with {self.vector_index.ntotal} items.")

    def search(
        self, query: str, hard_filters: dict[str, Any] = None, limit: int = 10
    ) -> list[dict[str, Any]]:
        if not self.vector_index:
            self.initialize_embeddings()

        # 1. Identify Strict Candidates
        valid_indices = set(range(len(self.restaurants)))
        if hard_filters:
            logger.info(f"Applying hard filters: {hard_filters}")
            for idx, r in enumerate(self.restaurants):
                if not self._matches_filters(r, hard_filters):
                    valid_indices.discard(idx)

        logger.info(f"Candidates after hard filters: {len(valid_indices)}")

        strict_results = []
        if valid_indices:
            strict_results = self._rank_candidates(list(valid_indices), query, limit)

        # 2. Relaxation (Fallback) if we don't have enough results
        # The user wants at least 5 results.
        relaxed_results = []
        if len(strict_results) < 5:
            needed = 5 - len(strict_results)
            logger.info(
                f"Found {len(strict_results)} strict matches. Relaxing constraints to find {needed} more."
            )

            # Candidates are everyone NOT in strict_results
            # (We map back from result object to index, or just track indices)
            strict_ids = {res["restaurant"]["id"] for res in strict_results}
            relaxed_indices = [
                i
                for i in range(len(self.restaurants))
                if self.restaurants[i]["id"] not in strict_ids
            ]

            if relaxed_indices:
                # Rank the rest purely on semantic/keyword match
                # We ask for more than needed to ensure quality after reranking
                raw_relaxed = self._rank_candidates(relaxed_indices, query, limit=needed * 2)

                for item in raw_relaxed:
                    # Penalize score slightly to ensure they stay below strict matches if merged?
                    # Actually, we will append them, so order is preserved by list order.
                    # But we mark them as relaxed.
                    item["relaxed"] = True
                    relaxed_results.append(item)
                    if len(relaxed_results) >= needed:
                        break

        return strict_results + relaxed_results

    def _rank_candidates(self, indices: list[int], query: str, limit: int) -> list[dict[str, Any]]:
        """
        Performs BM25 + Vector + RRF + Reranking on a specific subset of indices.
        """
        if not indices:
            return []

        # BM25 Search
        tokenized_query = query.lower().split()
        bm25_scores = self.bm25.get_scores(tokenized_query)

        # Vector Search
        self._load_embedder()
        query_emb = self.embedder.encode(
            [f"query: {query}"], convert_to_numpy=True, normalize_embeddings=True
        )
        # We search ALL to get scores, then filter by indices
        # Alternatively, we could just score the specific vectors, but FAISS is fast.
        # Let's search top K globally and filter? No, that might miss our specific subset if K is small.
        # For 53 items, we can do exact dot product easily.

        # Get vectors for our indices
        subset_vectors = self.embeddings[indices]
        # Dot product (cosine sim)
        # query_emb is (1, D), subset is (N, D) -> (1, N)
        vector_scores_subset = np.dot(query_emb, subset_vectors.T)[0]

        # RRF Fusion
        # Rank within the subset
        # Sort indices by BM25 score
        # We need to map 'index in subset' back to 'index in corpus'

        # Create list of (corpus_idx, bm25_score, vector_score)
        candidates = []
        for i, corpus_idx in enumerate(indices):
            candidates.append(
                {
                    "idx": corpus_idx,
                    "bm25": bm25_scores[corpus_idx],
                    "vector": vector_scores_subset[i],
                }
            )

        # Sort by BM25 to get rank
        candidates.sort(key=lambda x: x["bm25"], reverse=True)
        for rank, c in enumerate(candidates):
            c["bm25_rank"] = rank + 1

        # Sort by Vector to get rank
        candidates.sort(key=lambda x: x["vector"], reverse=True)
        for rank, c in enumerate(candidates):
            c["vector_rank"] = rank + 1

        # Calculate RRF
        k = 60
        for c in candidates:
            c["rrf"] = (1 / (k + c["bm25_rank"])) + (1 / (k + c["vector_rank"]))

        # Select top for Reranking
        candidates.sort(key=lambda x: x["rrf"], reverse=True)
        top_candidates = candidates[: min(50, len(candidates))]

        # Reranking
        self._load_reranker()
        pairs = []
        for c in top_candidates:
            pairs.append([query, self.docs[c["idx"]]])

        rerank_scores = self.reranker.predict(pairs)

        final_results = []
        for i, c in enumerate(top_candidates):
            r = self.restaurants[c["idx"]]
            final_results.append(
                {
                    "restaurant": r,
                    "score": float(rerank_scores[i]),
                    "reason_tags": r.get("tags", []),
                }
            )

        final_results.sort(key=lambda x: x["score"], reverse=True)
        return final_results[:limit]

    def _matches_filters(self, r: dict[str, Any], filters: dict[str, Any]) -> bool:
        st = r.get("structured_tags", {})

        # Location Filter
        if "location_baku" in filters and filters["location_baku"]:
            req_locs = set(filters["location_baku"])
            rest_locs = set(st.get("area", []))
            if not rest_locs:
                return False
            if not req_locs.intersection(rest_locs):
                return False

        # Diet Filter
        if "diet_allergen" in filters and filters["diet_allergen"]:
            req_diets = set(filters["diet_allergen"])
            rest_tags = set(r.get("tags", []))
            if not req_diets.issubset(rest_tags):
                return False

        # Venue Type Filter
        if "venue_type" in filters and filters["venue_type"]:
            req_types = set(filters["venue_type"])
            rest_types = set(st.get("venue_type", []))
            # Intersection (e.g. tea_house OR lounge)
            if not req_types.intersection(rest_types):
                return False

        return True
