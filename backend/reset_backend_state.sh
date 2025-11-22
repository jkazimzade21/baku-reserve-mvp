#!/usr/bin/env bash
set -euo pipefail
# Nuke persisted reservations to guarantee a clean baseline.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
PYTHON_BIN="${PYTHON_BIN:-$ROOT/.venv/bin/python3}"

if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="$(command -v python3)"
fi

if [[ -z "$PYTHON_BIN" ]]; then
  echo "python3 is required to resolve DATA_DIR" >&2
  exit 1
fi

DATA_DIR="$(
  BACKEND_DIR="$BACKEND_DIR" "$PYTHON_BIN" - <<'PY'
import os
from pathlib import Path
import sys

backend_dir = Path(os.environ["BACKEND_DIR"])
sys.path.insert(0, str(backend_dir))
env_override = os.environ.get("DATA_DIR")
try:
    from app.settings import settings
except Exception:  # pragma: no cover
    if env_override:
        data_dir = Path(env_override).expanduser()
    else:
        data_dir = (Path.home() / ".baku-reserve-data").resolve()
else:
    data_dir = settings.data_dir

print(data_dir)
PY
)"

DB_FILE="$DATA_DIR/baku_reserve.db"
mkdir -p "$DATA_DIR"
if [[ -f "$DB_FILE" ]]; then
  rm -f "$DB_FILE"
  echo "[ok] Removed $DB_FILE"
else
  echo "[ok] No database file to remove; a fresh one will be created on next start"
fi
