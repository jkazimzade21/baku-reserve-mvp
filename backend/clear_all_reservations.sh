#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:8000}"

echo "== Clear all reservations at $BASE =="
IDS=$(curl -fsS "$BASE/reservations" | jq -r '.[].id')
if [ -z "$IDS" ]; then
  echo "[ok] none to delete"
  exit 0
fi
for id in $IDS; do
  code="$(curl -s -X DELETE -o /dev/null -w "%{http_code}" "$BASE/reservations/$id")"
  echo "DELETE $id -> $code"
done
echo "[ok] cleared"
