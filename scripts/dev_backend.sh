#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load local environment overrides so uvicorn sees OPENAI_API_KEY, CONCIERGE_MODE, etc.
if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ROOT/.env"
  set +a
fi

HOST="${DEV_BACKEND_HOST:-0.0.0.0}"
PORT="${DEV_BACKEND_PORT:-8000}"
REQUIRED_PYTHON_VERSION="3.11.14"

PYTHON_BIN="python3"
if [[ -x "$ROOT/.venv/bin/python3" ]]; then
  # Prefer the project virtualenv when available so uvicorn and deps resolve.
  PYTHON_BIN="$ROOT/.venv/bin/python3"
elif command -v python3.11 >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python3.11)"
fi

PY_VERSION_STR="$("$PYTHON_BIN" --version 2>&1 || true)"
PY_VERSION="${PY_VERSION_STR#Python }"
if [[ "$PY_VERSION" != "$REQUIRED_PYTHON_VERSION" ]]; then
  echo "[dev-backend] Python $REQUIRED_PYTHON_VERSION required (detected $PY_VERSION_STR)" >&2
  exit 1
fi

echo "[dev-backend] Starting FastAPI on ${HOST}:${PORT} (reload enabled)"
exec "$PYTHON_BIN" -m uvicorn app.main:app --app-dir backend --host "$HOST" --port "$PORT" --reload
