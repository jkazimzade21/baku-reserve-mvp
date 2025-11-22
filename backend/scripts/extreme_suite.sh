#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://192.168.0.148:8000}"
export BASE

# 0) clean slate (API + on-disk)
~/baku-reserve/backend/reset_backend_state.sh || true
~/baku-reserve/backend/clear_all_reservations.sh

# 1) run pytest SERIAL to avoid shared-state races
cd ~/baku-reserve/backend
. .venv/bin/activate
pytest -q tests/test_extreme.py

# 2) deterministic race test (async) — this intentionally races; uses shared AsyncClient per best practice
python tools/stress_race.py --base "$BASE" --rid fc34a984-0b39-4f0a-afa2-5b677c61f044 \
  --tid e5c360cf-31df-4276-841e-8cd720b5942c --start "10:00" --duration "01:30" --tasks 12

# 3) clean again (leave DB pristine)
~/baku-reserve/backend/clear_all_reservations.sh

echo "[ALL GREEN] Extreme suite passed."
