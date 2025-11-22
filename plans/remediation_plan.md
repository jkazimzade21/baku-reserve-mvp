# Comprehensive Remediation Plan (2025-11-16)

This plan tackles the prioritized gaps identified during the fact-check: state persistence, ETA/GoMap stability, rate limiting & caching, health/versioning, and documentation/tests. Work is broken into phases so we can stage commits and validations.

---
## Phase 1 – Foundation & Requirements Validation
1. **Confirm constraints**: capture operational requirements (single-node vs multi-node, acceptable downtime) and document assumptions in AGENTS.md.
2. **Schema & migration design**:
   - Model restaurants, tables, reservations, sessions, and arrival intents for SQLite/Postgres using SQLModel/SQLAlchemy.
   - Define migration path from JSON (`~/.baku-reserve-data/*.json`).
3. **ETA flow map**: diagram current arrival_intent endpoints, GoMap/OSRM calls, caching layers, and failure modes to size work.
4. **Rate limiter/cache targets**: decide whether to embed Redis option or stick with in-proc TTL sweeps; document tradeoffs.
5. **Health/versioning expectations**: confirm desire to deprecate unversioned routes and how `/health` should validate upstreams.
6. **Test coverage goals**: list backend/mobile suites to extend (arrival intent, caching, rate limiter, new persistence).

Deliverables: `plans/remediation_plan.md` (this doc), updates to `AGENTS.md` for constraints, rough data model sketches.

---
## Phase 2 – Persistence & Ownership
1. **Introduce database layer**:
   - Add SQLAlchemy/SQLModel dependencies to `backend/requirements.txt`.
   - Create `backend/app/db/core.py` with engine/session factories honoring `DATABASE_URL` env.
2. **Define models**: `Restaurant`, `Table`, `Reservation`, `ArrivalIntent`, `UserSession` with Alembic migrations or lightweight schema bootstrap.
3. **Data bootstrapping**:
   - Add CLI (`backend/scripts/migrate_json_to_db.py`) to import existing JSON records.
   - Ensure seeds sync from `backend/app/data/restaurants.json` into DB on startup if missing.
4. **Refactor storage APIs**:
   - Replace `storage.py` JSON logic with DB queries/transactions.
   - Update `accounts.py` to persist sessions (ideally stateless JWT or DB-backed tokens).
   - Maintain owner scoping and arrival intent updates.
5. **Tests**:
   - Update fixtures to use in-memory SQLite.
   - Extend `test_backend_system.py` to assert cross-worker safety (simulate double booking with DB transaction).

Success criteria: all backend tests pass using DB backend; JSON files no longer authoritative (but migration script remains available).

---
## Phase 3 – ETA/GoMap Resilience
1. **Async HTTP clients**:
   - Introduce shared `httpx.AsyncClient` usage for GoMap/OSRM; reuse across requests.
2. **Parallel routing**:
   - In `compute_eta_with_traffic`, run GoMap + OSRM + traffic lookups concurrently via `asyncio.gather`, with timeouts and fallback prioritization (OSRM first result, GoMap overrides when timely).
3. **Circuit breaker behavior**:
   - Catch `CircuitOpenError` inside the compute function; immediately return fallback estimate.
4. **Traffic caching**:
   - Enforce `GOMAP_TRAFFIC_UPDATE_INTERVAL_SECONDS` by caching severity keyed by tile; skip redundant calls.
5. **Arrival endpoints**:
   - Ensure ping throttling uses DB timestamps.
   - Provide structured diagnostics/logging for ETA composition.
6. **Tests**:
   - Unit tests for parallel/fallback logic (monkeypatch clients to simulate slow/failing providers).
   - Regression test ensuring `/arrival_intent/location` responds even when GoMap is down.
   - Mobile Jest snapshot verifying ArrivalInsightCard renders fallback ETA.

---
## Phase 4 – Rate Limiting & Caching Hardening
1. **Limiter cleanup**:
   - Add LRU expiry for `_buckets`, optionally move to `asyncio.Task` that prunes idle entries.
   - Support Redis backend when `REDIS_URL` provided.
2. **Cache improvements**:
   - Replace manual list with `collections.OrderedDict` for O(1) updates.
   - Schedule periodic cleanup coroutine (hooked into FastAPI lifespan) or expose admin endpoint to trigger.
3. **Metrics**:
   - Emit gauges for limiter bucket count and cache hits/misses.
4. **Tests**:
   - Add property-based tests ensuring limiter respects global quotas with cleanup.
   - Ensure TTL cache prunes expired keys and honors max size under concurrency.

---
## Phase 5 – Health, Versioning, and Documentation
1. **Health check**:
   - `/health` should run a lightweight routed request using OSRM (no GUID) plus optional authenticated GoMap ping when GUID present.
   - Surface cache/DB status and degrade when fallback engaged.
2. **API versioning**:
   - Decide on single surface `/v1/*`; add 301/headers guiding clients, update docs/tests.
   - Remove duplicate router registrations once consumers updated.
3. **Docs & tooling**:
   - Update README/PRODUCTION_DEPLOYMENT_GUIDE for DB setup, migration script, new env vars (`DATABASE_URL`, `REDIS_URL`).
   - Expand AGENTS.md hand-off instructions for new services.
4. **CI/test sweep**:
   - Run full backend pytest + mobile Jest.
   - If feasible, add integration tests hitting `/health`, `/metrics`, arrival intents with new infra toggles.
5. **Hand-off summary**: document terminal states and outstanding risks (if any).

---
## Stretch Goals (time permitting)
- Explore stateless JWT sessions (drop `accounts.py`).
- Add synthetic load test (Locust) for ETA endpoint.
- Consider WebSocket push for arrival updates (beyond MVP scope).

