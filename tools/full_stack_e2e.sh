#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-}" 

if [[ -z "$PYTHON_BIN" ]]; then
  if [[ -x "$ROOT/.venv/bin/python3" ]]; then
    PYTHON_BIN="$ROOT/.venv/bin/python3"
  else
    PYTHON_BIN="${PYTHON:-python3}"
  fi
fi

exec "$PYTHON_BIN" "$ROOT/tools/full_stack_tester.py" "$@"
