# Full Code Audit Ledger

Generated: Step 1 baseline inventory. Update each Findings column as we inspect files.

## Test Baseline (2025-11-13)

- Backend smoke per AGENTS.md: `pytest backend/tests/test_gomap.py backend/tests/test_backend_system.py backend/tests/test_validation.py`
  - Result: PASS (22 tests, ~8.7s). Slowest case `test_reservation_lifecycle_and_conflict_detection` (~7.3s); flag for future optimization in storage/reservation flow.
  - Logged here to anchor future regression comparisons.
- Mobile suite: `cd mobile && npm test -- --watchAll=false`
  - Result: PASS (6 suites, 68 tests, ~2.5s). Console warns `process.env.EXPO_OS` undefined inside jest — track for tooling cleanup when tackling mobile infra.
  - Concierge assistant test logs expected offline warning (mocked); acceptable baseline.
## Backend Python Modules

| File | Area | Findings / TODO |
| --- | --- | --- |
| `backend/app/__init__.py` | `backend/app` | Pending review |
| `backend/app/accounts.py` | `backend/app` | Stores users/sessions in `backend/app/data/users.json` rather than the shared data dir, so deploying multiple workers causes divergent auth state; sessions live in-memory so restart logs everyone out. Need persistent store or remove dead module. |
| `backend/app/api_v1.py` | `backend/app` | Router exists but exports no endpoints; main registers nothing on it except via custom decorator, so `/v1` surface is effectively empty—contradicts release notes + breaks client versioning expectations. |
| `backend/app/auth.py` | `backend/app` | JWT verifier fetches JWKS with synchronous `httpx.get` inside request path and no retry/backoff, so any Auth0 hiccup blocks the event loop; `_validate_token_security` rejects tokens expiring in <60 s which will log users out arbitrarily while mobile timers still show them as signed in—needs async client + leeway config. |
| `backend/app/autocomplete_endpoint.py` | `backend/app` | Example code references `@app.get`/`@app.websocket` but never imports or defines `app`; importing this module would raise `NameError`. If we intend to use it, move handlers into FastAPI router; otherwise delete file. |
| `backend/app/availability.py` | `backend/app` | Availability hardcodes 10:00‑23:00 Baku hours, 90‑min slots, and ignores each restaurant’s actual hours/turn times; shared blocks logic treats any reservation without `table_id` as blocking *every* table, so fallback auto-assignment can zero out the entire day. Needs per-venue schedule + smarter overlap handling. |
| `backend/app/backup.py` | `backend/app` | Pending review |
| `backend/app/cache.py` | `backend/app` | TTL caches never prune unless a caller invokes `cleanup_expired`, so the global route/geocode caches grow unbounded during high churn; also uses O(n) `list.remove` on every read which will tank under 1k+ entries—needs a deque or `OrderedDict` plus scheduled sweeps. |
| `backend/app/circuit_breaker.py` | `backend/app` | Breaker wraps sync functions with blocking `time.sleep` backoff and thread locks, so calling it inside async FastAPI endpoints blocks the event loop; Redis persistence helper catches ImportError but still logs warnings every request when Redis isn’t configured, spamming logs. Need async-aware breaker or background worker. |
| `backend/app/concierge_enhanced.py` | `backend/app` | Massive “enhanced” concierge engine duplicate that isn’t imported anywhere; it drags in numpy, datetime, json but never runs, so rot accumulates. Decide whether to delete or integrate—right now it’s dead code confusing new agents. |
| `backend/app/concierge_optimizer.py` | `backend/app` | Pure CLI toy that prints numpy-driven “optimization” but never integrates with settings; kept in repo yet unused. Either hook into CI or delete to cut noise. |
| `backend/app/concierge_service.py` | `backend/app` | Loads restaurant data + embeddings once at import and never refreshes, so any seed edits or new venues require process restart; `_ai_recommend` calls blocking OpenAI + embedding functions serially per request without timeouts, so spikes will saturate workers. Need background refresh + async clients. |
| `backend/app/concierge_tags.py` | `backend/app` | Pending review |
| `backend/app/concierge.py` | `backend/app` | Legacy engine still instantiates the global OpenAI client on first request, caches embeddings to `~/.baku-reserve-data/concierge_embeddings.json`, and never invalidates when restaurant seeds change; uses blocking OpenAI SDK in-requests and falls back silently, so we can’t tell when GPT is down. Needs background warmup + metrics. |
| `backend/app/config.py` | `backend/app` | Legacy settings shim still creates its own `DATA_DIR` under `backend/app/data`, conflicting with `settings.data_dir`; importing both modules writes to different folders. Decide on single configuration entry point. |
| `backend/app/deposits.py` | `backend/app` | Pending review |
| `backend/app/embeddings.py` | `backend/app` | Uses module-global OpenAI client + numpy arrays without persistence, so every process rebuilds embeddings at startup; no retry/backoff, no timeout, and `_client` only created once so rotated API keys require restart. Needs background refresh + keyed caching. |
| `backend/app/file_lock.py` | `backend/app` | Pending review |
| `backend/app/gomap.py` | `backend/app` | `_post_with_retry` calls `time.sleep` inside FastAPI request handlers and every HTTP call uses blocking `httpx.post`, so any GoMap retry freezes the entire worker; also returns circuit-breaker errors directly to clients without fallback to OSRM/ETA builder even though those helpers exist elsewhere—needs async client + graceful degradation. |
| `backend/app/health.py` | `backend/app` | Health “database” check just counts in-memory dictionaries so it will happily return OK even if the JSON files can’t be read/written; GoMap check does a naked GET on the ASMX base URL (no GUID) so false positives abound. Need real self-tests (RW probe, sample API call). |
| `backend/app/input_validation.py` | `backend/app` | `validate_coordinates` return annotation is `tuple[float, lon]` (typo) so type checkers flag everything; also hardcodes default language `az` instead of pulling from settings, so English-only deployments still emit Azerbaijani queries. |
| `backend/app/integrate_gomap_endpoints.py` | `backend/app` | Removed in favour of real router under `api/routes/gomap.py`; no further action needed. |
| `backend/app/llm_intent.py` | `backend/app` | Pending review |
| `backend/app/logging_config.py` | `backend/app` | Pending review |
| `backend/app/api/routes/gomap.py` | `backend/app/api/routes` | Added real `/search/*` + `/route/*` GoMap router mounted on both legacy + `/v1`; old `main_gomap_endpoints.py` deleted. Still need typed schemas for responses instead of raw dicts. |
| `backend/app/main.py` | `backend/app` | Began extracting routers: restaurants + reservations now mount under both legacy + `/v1` via shared helper, shrinking main to boot logic/diagnostics; still need concierge/maps/config routes moved plus documented DTOs for remaining endpoints. |
| `backend/app/maps.py` | `backend/app` | `compute_eta_with_traffic` fires GoMap and OSRM sequentially, both blocking synchronous calls, so any directions request makes two external HTTP calls per user tap; also traffic probe hits two more endpoints serially. Needs async fan‑out + caching. |
| `backend/app/metrics.py` | `backend/app` | `track_circuit_breaker_metrics`/`track_cache_metrics` blindly `inc()` with cumulative stats, so every scrape doubles totals (monotonic counters go 0→total→2×total→3×total…); also `normalize_endpoint` regex runs per request, hurting hot-path latency—need cached label mapping. |
| `backend/app/models.py` | `backend/app` | Second set of DTOs overlapping with `schemas.py`; mixes lowercase string IDs + business logic (validators) and is imported by FastAPI responses, so reshaping it will require a plan—documented to consolidate once shared schema settled. |
| `backend/app/osrm.py` | `backend/app` | Uses synchronous `httpx.get` without async adapter and caches only successful responses; failures are not retried and we never invalidate stale cached entries when OSRM routing changes (perms). Need async client + TTL. |
| `backend/app/payments/__init__.py` | `backend/app/payments` | Pending review |
| `backend/app/payments/azericard.py` | `backend/app/payments` | Pending review |
| `backend/app/payments/base.py` | `backend/app/payments` | Pending review |
| `backend/app/payments/factory.py` | `backend/app/payments` | Pending review |
| `backend/app/payments/mock.py` | `backend/app/payments` | Pending review |
| `backend/app/payments/paymentwall.py` | `backend/app/payments` | Pending review |
| `backend/app/redis_client.py` | `backend/app` | Module-level singleton reconnects lazily but never resets on failure; calling `get_redis_client` after a transient outage keeps returning the old dead client since `_redis_client` stays cached—need health-check/refresh logic. |
| `backend/app/request_batcher.py` | `backend/app` | Batch processor calls blocking `search_objects_smart` inside `async` functions, so every “batched” autocomplete still blocks the loop; cache never evicts per-session keys except oldest 100, so long‑running sessions leak memory. Needs real async + LRU. |
| `backend/app/route_optimizer.py` | `backend/app` | Builds full distance matrix by calling GoMap for every pair (O(n²) blocking HTTP calls) inside request path, so a 10‑stop optimization fires 90 network trips and blocks the event loop; no caching beyond process lifetime. Needs async fan‑out + heuristics. |
| `backend/app/schemas.py` | `backend/app` | Drifted copy of reservation/restaurant models using UUIDs while storage + `app.main` use string IDs, so anything instantiating these schemas (tests, concierge, seeding) disagrees with live payloads; need single source of truth + conversion helpers. |
| `backend/app/scoring.py` | `backend/app` | Pending review |
| `backend/app/seed.py` | `backend/app` | Calls `DB.add_restaurant` which isn’t implemented anymore, so running the seeder will crash immediately—needs rewrite to use storage adapter or drop entirely. |
| `backend/app/serializers.py` | `backend/app` | Pending review |
| `backend/app/settings.py` | `backend/app` | Defaults `DEBUG=True`, `RATE_LIMIT_ENABLED=True`, etc., but `settings.data_dir.mkdir(...)` runs at import time and writes to `~/.baku-reserve-data` even in CI/production containers, violating build immutability; also no env var validation (e.g., `GOMAP_GUID` empty string still truthy in code). Need settings factory + env schema. |
| `backend/app/storage.py` | `backend/app` | Added coarse `RLock` coverage around reservation CRUD so double-booking window closes; still need schema validation around `update_reservation` mutations + reconcile dead `seed.py` expectations. |
| `backend/app/test_concierge_enhanced.py` | `backend/app` | Pending review |
| `backend/app/test_gomap_enhanced.py` | `backend/app` | Pending review |
| `backend/app/traffic_patterns.py` | `backend/app` | `CREATE TABLE` statements contain inline `INDEX ...` clauses, which SQLite rejects, so the tracker crashes the first time it runs and never records traffic; also this module writes directly under `settings.DATA_DIR` without respecting the file lock used elsewhere. |
| `backend/app/ui.py` | `backend/app` | Pending review |
| `backend/app/utils.py` | `backend/app` | Rate limiter shares a single `asyncio.Lock` for every request and stores unbounded per-IP history, so burst traffic will serialize all requests and leak memory; also trusting `X-Forwarded-For` requires the *direct* client IP to be in the trusted list, which fails behind multi-proxy chains (Cloudflare→Nginx) and causes all rate limits to count the edge proxy. |
| `backend/app/validators.py` | `backend/app` | Pending review |
| `backend/app/versioning.py` | `backend/app` | Middleware injects `Link: </v1{path}>` for every legacy request even though `/v1` routes aren’t registered, so clients will follow dead links; also hardcodes sunset date 2026‑12‑31 with no config knob. |
| `backend/locustfile.py` | `backend` | Pending review |
| `backend/tests/conftest.py` | `backend/tests` | Pending review |
| `backend/tests/test_auth.py` | `backend/tests` | Pending review |
| `backend/tests/test_backend_system.py` | `backend/tests` | Pending review |
| `backend/tests/test_cache.py` | `backend/tests` | Pending review |
| `backend/tests/test_circuit_breaker.py` | `backend/tests` | Pending review |
| `backend/tests/test_e2e_workflows.py` | `backend/tests` | Pending review |
| `backend/tests/test_endpoint.py` | `backend/tests` | Pending review |
| `backend/tests/test_file_locking.py` | `backend/tests` | Pending review |
| `backend/tests/test_gomap.py` | `backend/tests` | Pending review |
| `backend/tests/test_input_validation.py` | `backend/tests` | Pending review |
| `backend/tests/test_integration_api.py` | `backend/tests` | Pending review |
| `backend/tests/test_intent.py` | `backend/tests` | Pending review |
| `backend/tests/test_maps.py` | `backend/tests` | Pending review |
| `backend/tests/test_observability.py` | `backend/tests` | Pending review |
| `backend/tests/test_performance.py` | `backend/tests` | Pending review |
| `backend/tests/test_places_api.py` | `backend/tests` | Pending review |
| `backend/tests/test_preorder.py` | `backend/tests` | Pending review |
| `backend/tests/test_rate_limiter_security.py` | `backend/tests` | Pending review |
| `backend/tests/test_scoring.py` | `backend/tests` | Pending review |
| `backend/tests/test_security.py` | `backend/tests` | Pending review |
| `backend/tests/test_validation.py` | `backend/tests` | Pending review |
| `backend/tools/stress_race.py` | `backend/tools` | Pending review |

## Mobile TypeScript / TSX Modules

| File | Area | Findings / TODO |
| --- | --- | --- |
| `mobile/__tests__/concierge.assistant.test.tsx` | `mobile/__tests__` | Pending review |
| `mobile/__tests__/experience.ui.test.tsx` | `mobile/__tests__` | Pending review |
| `mobile/__tests__/integration.api.test.tsx` | `mobile/__tests__` | Pending review |
| `mobile/__tests__/performance.test.tsx` | `mobile/__tests__` | Pending review |
| `mobile/__tests__/platform.core.test.tsx` | `mobile/__tests__` | Pending review |
| `mobile/__tests__/security.test.tsx` | `mobile/__tests__` | Pending review |
| `mobile/App.tsx` | `mobile` | Pending review |
| `mobile/index.ts` | `mobile` | Pending review |
| `mobile/src/api.ts` | `mobile/src` | `handleResponse` calls `res.json()` for every `res.ok` even when backend returns 204/empty, causing hard crashes on noop endpoints (e.g., cancel). Also API base auto-detection prefers Expo host but hardcodes fallback `http://192.168.0.148:8000`, so other developers hit the wrong LAN IP. Need sane defaults + 204 guard + abortable fetch with timeouts. |
| `mobile/src/assets/restaurantPhotoManifest.ts` | `mobile/src/assets` | Pending review |
| `mobile/src/components/ArrivalInsightCard.tsx` | `mobile/src/components` | Pending review |
| `mobile/src/components/ConciergeAssistantCard.tsx` | `mobile/src/components` | Pending review |
| `mobile/src/components/EnhancedLocationSearch.tsx` | `mobile/src/components` | Entire UI depends on `useEnhancedLocation` hook + nonexistent `/api/v1/search/*` endpoints, yet no screen uses the component; we’re shipping 1000+ lines of dead code (MapView, modals, AsyncStorage) that bloats bundle size ~50 KB. Decide whether to wire it up or strip it. |
| `mobile/src/components/floor/FloorPlanExplorer.tsx` | `mobile/src/components/floor` | Pending review |
| `mobile/src/components/floor/types.ts` | `mobile/src/components/floor` | Pending review |
| `mobile/src/components/InfoBanner.tsx` | `mobile/src/components` | Pending review |
| `mobile/src/components/PhotoCarousel.tsx` | `mobile/src/components` | Pending review |
| `mobile/src/components/RestaurantCard.tsx` | `mobile/src/components` | Pending review |
| `mobile/src/components/SeatMap.tsx` | `mobile/src/components` | Pending review |
| `mobile/src/components/SectionHeading.tsx` | `mobile/src/components` | Pending review |
| `mobile/src/components/StatPill.tsx` | `mobile/src/components` | Pending review |
| `mobile/src/components/Surface.tsx` | `mobile/src/components` | Pending review |
| `mobile/src/config/api.ts` | `mobile/src/config` | Pending review |
| `mobile/src/config/auth.ts` | `mobile/src/config` | Pending review |
| `mobile/src/config/theme.ts` | `mobile/src/config` | Pending review |
| `mobile/src/contexts/AuthContext.tsx` | `mobile/src/contexts` | Pending review |
| `mobile/src/data/floorPlans.ts` | `mobile/src/data` | Pending review |
| `mobile/src/data/restaurantImages.ts` | `mobile/src/data` | Pending review |
| `mobile/src/debug/probe.ts` | `mobile/src/debug` | Pending review |
| `mobile/src/hooks/useArrivalSuggestions.ts` | `mobile/src/hooks` | Debounces with `setTimeout` but never aborts `fetchArrivalLocationSuggestions`, so slow responses can race and overwrite newer queries; also clears suggestions whenever `enabled` flips false which wipes preset list even while API in flight. |
| `mobile/src/hooks/useEnhancedLocation.ts` | `mobile/src/hooks` | Talks to `/api/v1/search/*` and `/api/v1/route/*` endpoints that aren’t wired up in FastAPI (see backend audit), so the hook can never succeed; it also opens a WebSocket and recursively reconnects forever even when component unmounts. Consider deleting until backend ships. |
| `mobile/src/hooks/useRestaurants.ts` | `mobile/src/hooks` | Fires `fetchRestaurants` without AbortController, so slow searches resolve out-of-order and overwrite newer results; also `clear()` just calls `load('')` which still sets `loading=true` even if data already cached, causing visible flicker. Needs race guard + caching. |
| `mobile/src/hooks/useWarmRestaurantPhotoCovers.ts` | `mobile/src/hooks` | Pending review |
| `mobile/src/mocks/venues.ts` | `mobile/src/mocks` | Pending review |
| `mobile/src/screens/AuthScreen.tsx` | `mobile/src/screens` | Pending review |
| `mobile/src/screens/BookScreen.tsx` | `mobile/src/screens` | Pending review |
| `mobile/src/screens/ExploreScreen.tsx` | `mobile/src/screens` | Pending review |
| `mobile/src/screens/HomeScreen.tsx` | `mobile/src/screens` | Prefetches every photo URL on every render via `useEffect` without cancellation or size cap, so scrolling through 50+ venues spawns dozens of concurrent `Image.prefetch` calls and thrashes cache; also quick-filter chips call `clear()` which immediately triggers a blocking fetch even when data already filtered locally. |
| `mobile/src/screens/PrepNotifyScreen.tsx` | `mobile/src/screens` | Pending review |
| `mobile/src/screens/ProfileScreen.tsx` | `mobile/src/screens` | Pending review |
| `mobile/src/screens/ReservationsScreen.tsx` | `mobile/src/screens` | Pending review |
| `mobile/src/screens/RestaurantScreen.tsx` | `mobile/src/screens` | Pending review |
| `mobile/src/screens/SeatPicker.tsx` | `mobile/src/screens` | Pending review |
| `mobile/src/screens/SeatPicker/components/FloorCanvas.tsx` | `mobile/src/screens/SeatPicker/components` | Pending review |
| `mobile/src/screens/SeatPicker/components/LiveSyncBadge.tsx` | `mobile/src/screens/SeatPicker/components` | Pending review |
| `mobile/src/screens/SeatPicker/components/SeatPreviewDrawer.tsx` | `mobile/src/screens/SeatPicker/components` | Pending review |
| `mobile/src/screens/SeatPicker/components/TableMarker.tsx` | `mobile/src/screens/SeatPicker/components` | Pending review |
| `mobile/src/screens/SeatPicker/components/ZoneToggle.tsx` | `mobile/src/screens/SeatPicker/components` | Pending review |
| `mobile/src/screens/SeatPicker/useVenueLayout.ts` | `mobile/src/screens/SeatPicker` | Pending review |
| `mobile/src/types/external.d.ts` | `mobile/src/types` | Pending review |
| `mobile/src/types/navigation.ts` | `mobile/src/types` | Pending review |
| `mobile/src/utils/availability.ts` | `mobile/src/utils` | All availability math is locked to `America/Chicago`; formatting labels append “CT” and conversions use US time even though restaurants are in Baku (UTC+4), so slot selection drifts by 9–10 hours. Needs timezone config sourced from backend. |
| `mobile/src/utils/color.ts` | `mobile/src/utils` | Pending review |
| `mobile/src/utils/conciergeRecommender.ts` | `mobile/src/utils` | Pending review |
| `mobile/src/utils/floorPlans.ts` | `mobile/src/utils` | Pending review |
| `mobile/src/utils/geometry.ts` | `mobile/src/utils` | Pending review |
| `mobile/src/utils/location.ts` | `mobile/src/utils` | Pending review |
| `mobile/src/utils/photoSources.ts` | `mobile/src/utils` | Pending review |
| `mobile/src/utils/validation.ts` | `mobile/src/utils` | Pending review |
