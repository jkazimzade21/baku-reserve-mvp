# Testing Guide

This repository has two actively maintained surfaces: the FastAPI backend (`backend/`) and the Expo/React Native client (`mobile/`). All commands run from the repo root unless noted.

## Backend

```bash
source .venv/bin/activate           # python 3.11.14
pip install -r backend/requirements-dev.txt
pytest backend                       # full suite
pytest backend/tests/test_backend_system.py backend/tests/test_validation.py
pytest backend/tests/test_observability.py
ruff check backend && black --check backend
```

Notes
- Tests rely on the lightweight SQLite store under `~/.baku-reserve-data`; fixtures reset it automatically.
- `backend/full_regression.sh` assumes a running API on `http://127.0.0.1:8000` and exercises create/overlap/cancel flows end to end.
- Mapping providers are disabled; no external map credentials are required.

## Mobile

```bash
cd mobile
npm ci                                 # or npm install
npm run lint && npm run format
npm test -- --ci --runInBand           # RN Testing Library suite
```

Helpful flags:
- `npm test -- --runTestsByPath __tests__/dateInput.test.ts` (focused run)
- `EXPO_OS=ios` is set automatically through `package.json`; Metro picks up API base URL via `scripts/dev_mobile.sh`.

## CI Overview
- `.github/workflows/ci.yml` defines three jobs: backend lint/pytest, mobile lint/Jest, and a backend regression smoke (runs on push only).
- All jobs pin Python 3.11.14 and Node 20; caching is enabled for pip/npm.

## When to Run What
| Change Type | Minimum Commands |
|-------------|------------------|
| Backend endpoints, schemas, availability logic | `pytest backend/tests/test_backend_system.py backend/tests/test_validation.py && backend/full_regression.sh` |
| Map/arrival work | `pytest backend/tests/test_observability.py` |
| Mobile UI / hooks | `cd mobile && npm run lint && npm test -- __tests__/experience.ui.test.tsx` |
| Shared contracts | Regenerate `mobile/src/types/server.d.ts` (see relevant script) and rerun both suites |

Keep commits small, and record which commands you ran in your PR description.
