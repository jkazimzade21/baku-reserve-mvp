#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNS="${1:-50}"
BASE_URL="${BASE_URL:-http://localhost:19006}"
OUTPUT_DIR="${OUTPUT_DIR:-}"
HEADLESS_FLAG="${HEADLESS:-true}"

CMD=("node" "$ROOT/tools/concierge_smoke.js" "--runs" "$RUNS" "--base-url" "$BASE_URL")
if [[ -n "$OUTPUT_DIR" ]]; then
  CMD+=("--output-dir" "$OUTPUT_DIR")
fi
if [[ "$HEADLESS_FLAG" == "false" ]]; then
  CMD+=("--headless" "false")
fi

"${CMD[@]}"
