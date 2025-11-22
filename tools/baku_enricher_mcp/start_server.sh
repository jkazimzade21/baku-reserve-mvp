#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
STAMP=".mcp-deps.stamp"
if [[ ! -d node_modules ]] || [[ ! -f "$STAMP" ]] || [[ package-lock.json -nt "$STAMP" ]]; then
  echo "[baku-enricher-mcp] Installing dependencies..." >&2
  npm install --no-audit --no-fund >/dev/null
  touch "$STAMP"
fi
exec node server.mjs
