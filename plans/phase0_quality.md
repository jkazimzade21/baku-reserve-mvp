# Phase 0 – Code Quality Gates & DX Telemetry

## Linting / Typing Strategy
- **Backend**
  - Toolchain: Ruff (lint+format), Black, mypy (strict optional), pytest-cov.
  - Config plan:
    - Extend `backend/pyproject.toml` with `[tool.mypy]` (python_version=3.11, warn_unused_ignores, plugins for pydantic; runtime pinned to 3.11.14).
    - Add `ruff check` + `ruff format` tasks to Makefile (`make lint-backend`).
    - Introduce `pre-commit` config hooking black, ruff, mypy stub check, `pytest -k smoke`.
- **Mobile**
  - ESLint (typescript config) + Prettier + `tsc --noEmit --strict` + `jest --runInBand` smoke set.
  - Add npm scripts: `npm run lint`, `npm run typecheck`, `npm run test:ci`.

## CI Gates
- Update GitHub Actions pipeline (Phase 4) to run:
  1. `make doctor` (fail if missing required deps) – skip optional warnings.
  2. Backend lint/type/test: `ruff check`, `mypy`, `pytest --maxfail=1 --disable-warnings --cov=backend/app`.
  3. Mobile lint/type/test.
  4. Upload coverage XML + junit.

## DX Telemetry Instrumentation
- **scripts/dev_backend.sh**
  - Emit structured log lines to `~/.baku-reserve/dev_backend.log` with timestamp, command, exit status.
  - On crash, append tail of uvicorn log + reason to same file.
- **scripts/dev_mobile.sh** (similar logging for Metro restarts).
- Collect aggregated stats (counts per day) via new `tools/dev_stats.py`.

## Next Implementation Steps
1. Create `pre-commit-config.yaml` describing hooks + update README.
2. Extend Makefile with `lint`, `typecheck`, `test-smoke` targets to unify CI/local usage.
3. Instrument dev scripts as described (Phase 0 completion item once logging added).
