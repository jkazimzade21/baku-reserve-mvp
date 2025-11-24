# AGENTS.md

## What this project is
- FastAPI backend (`backend/`) with SQLite store and JSON seed for restaurants.
- Expo/React Native mobile app (`mobile/`) that consumes the API; has bundled seed for offline preview.
- Restaurant data lives in `backend/app/data/restaurants.json` and must be synced to `~/.baku-reserve-data/restaurants.json` for the API to serve it.

## Dev environment tips
- Backend: `python3.11 -m venv .venv && source .venv/bin/activate && pip install -r backend/requirements.txt`, then `./scripts/dev_backend.sh` (hot reload on :8000). Data dir: `~/.baku-reserve-data`.
- Mobile: `npm install`, then `EXPO_PUBLIC_API_BASE=http://localhost:8000 ./scripts/dev_mobile.sh` to start Metro/Expo.
- Sync seeds after edits:  
  ```bash
  python3 - <<'PY'
  import json
  from pathlib import Path
  from backend.app.settings import settings
  src = Path('backend/app/data/restaurants.json')
  dst = settings.data_dir / 'restaurants.json'
  dst.write_text(json.dumps(json.loads(src.read_text()), indent=2, ensure_ascii=False))
  print(f"Synced {dst}")
  PY
  ```

## Testing instructions
- Backend: `python3.11 -m pytest backend`
- Mobile: `cd mobile && npm test -- --runInBand`
- Full stack (after services up): `./tools/full_stack_e2e.sh`

## PR instructions
- Title: `[component] summary` (e.g., `[backend] add booking guardrails`).
- Before pushing: run backend and mobile test commands above; note any schema/API/mobile surface touched and the command outputs.
