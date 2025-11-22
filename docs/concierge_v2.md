# Concierge V2 – Intent + Embeddings Stack

## Overview

- Front door: `POST /concierge/recommendations` on the FastAPI service. Accepts `{ prompt, lang?, limit? }` and returns `{ results: RestaurantListItem[], match_reason: Record<slug,string[]> }`.
- The AI path performs: language-aware intent parsing → Ada embeddings (prompt + venue corpora) → hybrid scoring with deterministic tie-breaks.
- Offline kill-switch + on-device recommender ensure zero-regression behaviour when OpenAI or embeddings are unavailable.
- Median online latency target ≤1.5s: embeddings are precomputed at startup, prompt→result LUT caches the last 128 queries for 30 minutes, and Sentry spans cover every stage.

## Intent Schema

`backend/app/schemas.py::ConciergeIntent`

```json
{
  "lang": "en|az|ru",
  "vibe_tags": ["romantic", "family_friendly"],
  "cuisine_tags": ["azerbaijani"],
  "location_tags": ["old_city", "port_baku"],
  "price_bucket": "budget|mid|upper|luxury",
  "time_context": ["brunch", "dinner"],
  "amenities": ["live_music", "wine_cellar"],
  "negatives": ["no_loud_music", "no_smoking"],
  "budget_azn": { "max_pp": 70 }
}
```

Canonicalisation happens in `concierge_tags.py` (multilingual synonyms + neighborhood mapping). Negative preferences currently translate to deterministic blockers (e.g. `no_loud_music` penalises venues tagged with `live_music`).

## Endpoint contract

```http
POST /concierge/recommendations?mode=ai
{
  "prompt": "Romantik dam terası", 
  "lang": "az",
  "limit": 4
}
```

Response:

```json
{
  "results": [ { "id": "...", "name": "Skyline" , ... } ],
  "match_reason": {
    "skyline-lounge": ["Romantic", "Rooftop", "$$$"]
  },
  "explanations": {
    "skyline-lounge": "Skyline pairs rooftop cocktails with AZN 3/4 pricing and views over the boulevard."
  }
}
```

- `mode` query param overrides `CONCIERGE_MODE` (`local|ai|ab`).
- `match_reason` keys use lower-cased slug (or UUID fallback). Client maps chips against `slug ?? id`. `explanations` reuses the same keys for 1–2 sentence rationales that the UI can surface.
- Validation rejects prompts <3 chars and limits >12.

## Hybrid scoring

`score = α·embedding + β·vibe + γ·cuisine + δ·location + ε·price - η·negatives + ζ·descOverlap`

Weights default via `.env` → `CONCIERGE_WEIGHTS`. Update at runtime without redeploy.

Implementation: `backend/app/scoring.py` with `RestaurantFeatures` (cached tags/cuisines/locations per venue). Deterministic tie-break uses slug/id order.

## Feature flags & kill switches

Env | Purpose | Default
---|---|---
`CONCIERGE_MODE` | `local`, `ai`, `ab` split on hashed session/device header | `local`
`AI_SCORE_FLOOR` | Hides low-confidence AI matches | `0.0`
`CONCIERGE_WEIGHTS` | Runtime tuning for hybrid scorer | defaults per spec
`OPENAI_API_KEY` | Enables LLM + embeddings | unset in CI

- A/B mode uses headers (`X-Concierge-Session`, `X-Device-Id`, fallback to prompt hash) for sticky assignment. Tag recorded in Sentry scope (`feature_flag.concierge_mode`).
- When LLM/embeddings fail, `IntentUnavailable`/`EmbeddingUnavailable` triggers `_local_fallback` which mirrors the previous deterministic engine.

## Observability & caching

- Sentry initialised in `main.py` (FastAPI integration, `traces_sample_rate=0.2`).
- Scoped spans: `concierge.intent`, `concierge.embed`, `concierge.score`, `concierge.serialize`.
- Prompt fingerprints are SHA-256 (first 12 chars) to avoid logging raw text.
- In-memory caches:
  - Restaurant vectors (Ada 002) at startup.
  - Prompt cache (`CachedPayload`) storing IDs + reasons for 30 minutes (128 entries). Responses are rehydrated per-request to ensure absolute URLs remain correct.

## Failure modes & rollback

Scenario | Behaviour
---|---
LLM timeout / 3 consecutive failures | Circuit breaker disables AI path for 5 minutes → automatic fallback to local recommender.
Embeddings unavailable | warm path logs warning, endpoint falls back to local engine instantly.
PP65: degrade to deterministic results | Set `CONCIERGE_MODE=local` (backend) and `EXPO_PUBLIC_CONCIERGE_MODE=local` (mobile) – no deploy required.

Rollback recipe: flip envs to `local`, redeploy backend/mobile configs, clear `concierge_service._cache` (restart process). Old heuristics remain compiled in `backend/app/concierge.py` and mobile `recommendRestaurants` utility.

## Mobile client updates

- `CONCIERGE_MODE` injected via Expo extra (`app.config.js`, `.env`, `scripts/dev_mobile.sh`). Offline mode short-circuits to on-device recommender.
- `fetchConciergeRecommendations(prompt, { mode, lang, limit })` posts to new endpoint and handles match reason chips.
- `ConciergeAssistantCard` shows chips (romantic • $$$ • Port Baku) and a toast when operating offline.
- Tests (`__tests__/concierge.assistant.test.tsx`) cover API success + fallback.

## MCP utility scripts

Tool | Entry point | Description
---|---|---
Restaurant enrichment | `scripts/enrich_baku.py --slugs narghiz baku` | Iterates slugs, runs `tools/baku_enricher_mcp/call_tool.mjs`, merges fields into `backend/app/data/restaurants.json`. `make enrich ENRICH_SLUGS="narghiz"`.
Chrome perf | `tools/e2e_perf.mjs --url http://localhost:8081` | Uses the `chrome-devtools` MCP to launch a page, capture performance trace, and snapshot into `artifacts/perf-*`. `make perf PERF_URL=http://localhost:8081/book`.
Ref docs | `scripts/ref_docs.mjs --query "expo font" [--read-first]` | Calls the Ref MCP helper for local SDK lookups. Wrap with `DOC_QUERY='expo font' make ref-docs`.
Sentry bootstrap | `scripts/sentry_bootstrap.mjs --org baku-reserve --project concierge-ai` | Via Sentry MCP: ensures project exists, creates DSN, prints credentials. `make sentry-bootstrap`.

## A/B plan

- Use `CONCIERGE_MODE=ab` on the backend, `EXPO_PUBLIC_CONCIERGE_MODE=ab` on mobile.
- Assignment keyed by header → 50/50 split stored in Sentry scope and breadcrumb.
- Metrics to monitor: `concierge.intent.duration`, `fallback_rate`, conversion per mode (log via future analytics hook).

## Failure drills & next steps

- Validate cache purge: restart backend (or call future admin endpoint) after weights/tags change.
- Keep `backend/app/data/restaurants.json` synced with the runtime store (helper snippet lives in `AGENTS.md`).
- Extend `concierge_tags.py` as new concepts surface; tests cover intent canonicalisation + scoring penalties.
