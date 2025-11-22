# Phase 0 – Test Pipeline Baseline (2025-11-13)

## Configuration Updates
- Added `backend/pytest.ini` with:
  - `pythonpath = .` so modules import as `app.*`.
  - Default options `--maxfail=1 --disable-warnings --durations=20`.
- Extended `tests/conftest.py` to force `AUTH0_BYPASS`, disable rate limiting, and pin concierge/OpenAI/Sentry to local/offline modes.

## Current Status (after fixes)
- Command: `source .venv/bin/activate && cd backend && pytest --maxfail=1 --disable-warnings --durations=10`
- Result: **65 passed / 1 failed** in ~10s.
- Failing test: `tests/test_endpoint.py::test_directions_rejects_out_of_range_coordinates` (expects HTTP 400, now receives 422 from new coordinate validator). Needs API/spec decision.
- Slowest test: reservation lifecycle (~7.3s). Capture for perf tracking.
- No more import errors; suite aborts on single expected failure.

## Coverage & Metrics
- Coverage not yet collected. Next steps: add `pytest --cov=backend/app --cov-report=xml` once failing test resolved.

## CI TODOs
- Add `PYTHONPATH=backend` to CI env until repo root runner matches local.
- Update pipeline to run `make doctor` + `pytest` sequentially. Include artifact upload for coverage + `pytest --durations` log.
