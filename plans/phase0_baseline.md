# Phase 0 Baseline (2025-11-13)

## Repository Topology
- **backend/** FastAPI service (monolithic `app/` package with 40+ modules, mixed responsibilities).
- **mobile/** Expo React Native client.
- **tools/** Automation scripts (full-stack e2e, enrichment, chrome harnesses).
- **admin-ui/** legacy web console (needs owner confirmation).
- Numerous docs/reports (`*_SUMMARY.md`, `PRODUCTION_DEPLOYMENT_GUIDE.md`, etc.) plus MCP utilities.

## Outstanding Changes (`git status -sb`)
- 23 tracked files modified (core app modules, tests, README) and 33+ untracked files including new tooling/tests. Worktree is far from clean—must triage before large refactor to avoid conflicts.

## Test & Build Health
- `.venv` exists but `pytest` full suite **times out after ~4 minutes** (see command log 12:42/12:46). Output shows tests begin (`..F....`) but hang during concierge embedding calls (OpenAI key placeholder). Need test isolation + network mocking before CI gating.
- Import errors previously observed (`ModuleNotFoundError: app.cache`). Need deterministic `PYTHONPATH` fix.
- No coverage or performance metrics captured yet.

## Toolchain Snapshot
- Python: system default (lock to 3.11.14) — currently unspecified.
- Node: repo root has `package-lock.json` targeting Node 18/??; need to pin Node 20.
- No `.tool-versions` / devcontainer.
- Requirements: backend `requirements.txt` + `requirements-dev.txt`; mobile uses npm.

## Immediate Gaps for Phase 0
1. **Environment Standardization**
   - Define canonical tool versions.
   - Regenerate dependency locks after cleanup.
   - Author `make doctor` script to verify OS/library prereqs.
2. **Test Pipeline**
   - Short-term: configure `PYTHONPATH=backend` for pytest, skip network calls (mock OpenAI) to avoid timeouts.
   - Capture runtime + coverage (pytest `--durations=20`, `--cov=backend/app`).
   - Update CI to fail fast with `--maxfail=1`.
3. **Code Quality Gates**
   - Introduce Ruff+mypy, ESLint+TS strict, pre-commit.
4. **DX Telemetry**
   - Instrument `scripts/dev_backend.sh` & `scripts/dev_mobile.sh` to log restarts/lint/test failures for future analytics.

## Next Actions
- Clean up stray dependency artifact `backend/=0.19.0` and ensure `pip install -r backend/requirements.txt` completes (redis missing).
- Collect precise Python/Node versions and record in `.tool-versions` draft.
- Prototype `make doctor` tasks list.
- Fix pytest import path + network mocking to get deterministic baseline runtime.
