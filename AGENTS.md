# AGENTS.md

## Dev environment tips
- Backend: `python3.11 -m venv .venv && source .venv/bin/activate && pip install -r backend/requirements.txt`, then `./scripts/dev_backend.sh` for hot reload on :8000.
- Mobile: `npm install`, then `./scripts/dev_mobile.sh` to launch Metro/Expo with `EXPO_PUBLIC_API_BASE` pre-set.
- Sync restaurant seeds after edits:
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
- Regenerate concierge tags whenever `docs/research/2025-11-18_enriched_restaurants.md` changes: `python tools/concierge/generate_tag_groups.py && cp backend/app/data/restaurant_tags_enriched.json restaurant_tags_enriched.json artifacts/test-data/`.

## Testing instructions
- Backend: `python3.11 -m pytest backend` or targeted files (e.g., `python3.11 -m pytest backend/tests/test_scoring.py`).
- Concierge data guardrail: `python3.11 -m pytest backend/tests/test_tag_enrichment.py`.
- Mobile: `cd mobile && npm test -- --watchAll=false`.
- Full-stack sweep once services are running: `./tools/full_stack_e2e.sh`.

## PR instructions
- Title format: `[component] summary` (e.g., `[backend] tighten concierge scoring`).
- Before pushing: `python3.11 -m pytest backend` and `cd mobile && npm test -- --watchAll=false`.
- Mention any schema/API/mobile surface touched plus evidence of the command output above.
