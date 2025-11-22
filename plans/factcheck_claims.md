# Fact-check Claims from External Review

Legend: ✅ = matches repo, ❌ = does not match, ⚠️ = partially accurate/mixed.

## Environment & Storage
- ✅ Python 3.11 virtualenv + `backend/requirements.txt` + `backend/requirements-dev.txt` (per README/AGENTS + files present).
- ⚠️ `.env`/.env.example manage secrets; no hardcoded secrets found but review mentions temporary GoMap test GUID in docs – no such GUID present now.
- ⚠️ `backend/app/settings.py` uses `BaseSettings`; legacy `backend/app/config.py` still exists but appears unused. Duplication risk only if someone imports it.
- ✅ Sessions/reservations stored as JSON under repo/data (`accounts.py` uses `backend/app/data`, `storage.py` uses `~/.baku-reserve-data`). Sessions kept in-memory dict.
- ✅ Multi-worker issue: `Database` loads once, writes via `FileLock`, no reload per worker; `AccountStore` in-memory and not shared.
- ✅ Feature flags: `settings.PREP_NOTIFY_ENABLED` default False; `settings.DEBUG` defaults True (prod should override to False).

## Architecture & Modules
- ✅ `include_router_on_both` registers routers for unversioned + `/v1`; `api_v1.py` exports empty router.
- ⚠️ Dead modules: `autocomplete_endpoint.py` now defines `APIRouter` without global `app`; still unused but won’t crash if imported. Files cited (concierge_optimizer, concierge_enhanced) no longer exist.
- ❌ No duplicate models: `backend/app/models.py` is absent; contracts live only in `contracts.py`.
- ✅ Availability hardcodes hours 10:00–23:00 and treats reservations without table_id as shared blocks.

## Code Quality / Maintainability
- ❌ InputValidator annotation typo (`tuple[float, lon]`) not present; returns `tuple[float, float]`.
- ⚠️ InputValidator language default hardcoded to `'az'` instead of `settings.GOMAP_DEFAULT_LANGUAGE` (though default currently also 'az').
- ⚠️ Haversine math exists both in `api/utils.py` and `_haversine` inside `maps.py`, but not literal duplicates; functions tailored per module.
- ⚠️ Metrics counters: Prometheus middleware + helper functions compute deltas to avoid double counting; no evidence of duplication bug.

## GoMap ETA Logic
- ✅ `compute_eta_with_traffic` synchronously calls `gomap_route`, then `osrm_route`, then traffic twice (origin/dest) within `to_thread` wrapper.
- ❌ `_post_with_retry` raising `CircuitOpenError` does not bubble to client; `route_directions` catches Exception and returns `None`, allowing fallback logic in `arrival_location_ping`.
- ⚠️ `build_fallback_eta` used when `compute_eta_with_traffic` returns `None`; unreachable only if exceptions propagate (they currently don’t for circuit breaker, but might for other issues).
- ✅ Traffic severity chooses worst of origin/destination and multiplies ETA using `settings.parsed_traffic_delay_factors` (heavy=1.25) plus buffer minutes.
- ✅ Route caching TTL 15 min per worker via `cache.py`; caches not shared across processes.

## Security
- ⚠️ Auth0 JWKS fetched via synchronous `httpx.get` but cached for 15 minutes; not per-request except cache expiry.
- ✅ Rate limiter stores per-process `_buckets` dict without eviction.
- ✅ Input sanitization exists (InputValidator); coordinate validation enforced.
- ✅ Dev endpoints under `/dev/*` only mounted when `settings.DEBUG` true.

## Performance
- ✅ GoMap/OSRM/httpx clients are synchronous though often run inside threadpool via `asyncio.to_thread`; still sequential and heavy.
- ✅ Each location ping can trigger GoMap route + OSRM route + two traffic lookups.
- ✅ TTL cache operations use list `.remove()` (O(n)) and no background cleanup.
- ✅ JSON storage rewrites full reservations file on each write.

## Testing & QA
- ❌ Backend already has dedicated arrival intent + map tests (see `backend/tests/test_backend_system.py`, `test_maps.py`, `test_validation.py`); review’s “no tests” claim outdated.
- ❌ Suite count >22 backend / >68 frontend (numerous test files + ledger shows more). Current counts exceed cited numbers.

## Deployment & Health
- ✅ `/health` hits GoMap base URL (no GUID) for reachability.
- ✅ Sentry initialized if DSN set as described.

Additional claims to cover during final summary will reference these notes.
