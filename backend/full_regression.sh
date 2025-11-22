#!/usr/bin/env bash
set -euo pipefail

# --- config ---
BASE="${BASE:-http://127.0.0.1:8000}"
RID="${RID:-fc34a984-0b39-4f0a-afa2-5b677c61f044}"
TID="${TID:-e5c360cf-31df-4276-841e-8cd720b5942c}"
DAY="${DAY:-$(date +%F)}"
TAG="RG-$(date +%s)"

need(){ command -v "$1" >/dev/null || { echo "need $1"; exit 1; }; }
need curl; need jq

ok(){ echo "$1"; }
die(){ echo "FAIL: $1" >&2; exit 1; }

# 0) server up
curl -fsS "$BASE/health" >/dev/null || die "backend not reachable at $BASE"

# 1) CORS preflight works (for mobile)
HDRS="$(curl -s -X OPTIONS "$BASE/reservations" \
  -H "Origin: http://example.com" \
  -H "Access-Control-Request-Method: POST" \
  -D - -o /dev/null)"
echo "$HDRS" | grep -qi "^access-control-allow-origin:" || die "CORS headers missing"
ok "[ok] CORS preflight allowed"

# 2) Baseline availability contains our table at 10:00
HAS="$(curl -fsS "$BASE/restaurants/$RID/availability?date=$DAY&party_size=2" \
  | jq -r --arg D "$DAY" --arg T "$TID" \
    ".slots[] | select((.start|tostring)|startswith(\$D+\"T10:00:00\")) | (.available_table_ids|index(\$T)!=null)")"
[ "$HAS" = true ] || die "table not free at baseline"
ok "[ok] baseline ok"

# 3) Create R1, ensure overlap blocked, create back-to-back R2, auto-pick R3
R1="$(
  jq -cn --arg r "$RID" --arg d "$DAY" --arg t "$TID" --arg g "$TAG-1" \
    '{restaurant_id:$r,party_size:2,start:($d+"T10:00:00"),end:($d+"T11:30:00"),guest_name:$g,table_id:$t}' \
  | curl -fsS -X POST "$BASE/reservations" -H "Content-Type: application/json" -d @- \
  | jq -r .id
)"
[ "$R1" != null ] && [ -n "$R1" ] || die "create R1"
ok "[ok] created $R1"

code="$(
  jq -cn --arg r "$RID" --arg d "$DAY" --arg t "$TID" --arg g "$TAG-ov" \
    '{restaurant_id:$r,party_size:2,start:($d+"T10:30:00"),end:($d+"T12:00:00"),guest_name:$g,table_id:$t}' \
  | curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/reservations" -H "Content-Type: application/json" -d @-
)"
[ "$code" = 409 ] || die "expected overlap=409, got $code"
ok "[ok] overlap blocked (409)"

R2="$(
  jq -cn --arg r "$RID" --arg d "$DAY" --arg t "$TID" --arg g "$TAG-2" \
    '{restaurant_id:$r,party_size:2,start:($d+"T11:30:00"),end:($d+"T13:00:00"),guest_name:$g,table_id:$t}' \
  | curl -fsS -X POST "$BASE/reservations" -H "Content-Type: application/json" -d @- \
  | jq -r .id
)"
[ "$R2" != null ] && [ -n "$R2" ] || die "create R2"
ok "[ok] created $R2 (back-to-back)"

R3="$(
  jq -cn --arg r "$RID" --arg d "$DAY" --arg g "$TAG-3" \
    '{restaurant_id:$r,party_size:2,start:($d+"T13:00:00"),end:($d+"T14:30:00"),guest_name:$g}' \
  | curl -fsS -X POST "$BASE/reservations" -H "Content-Type: application/json" -d @- \
  | jq -r .id
)"
[ "$R3" != null ] && [ -n "$R3" ] || die "create R3"
ok "[ok] auto-selected $R3"

# 4) Validation: missing date & bad date must be 422
curl -s -o /dev/null -w "%{http_code}" "$BASE/restaurants/$RID/availability?party_size=2" | grep -qx "422" \
  || die "missing date should be 422"
curl -s -o /dev/null -w "%{http_code}" "$BASE/restaurants/$RID/availability?date=BAD&party_size=2" | grep -qx "422" \
  || die "bad date should be 422"
ok "[ok] availability validates params"

# 5) Persistence across reload (simulate autoreload)
touch "$(dirname "$0")/app/storage.py" || true
sleep 2
curl -fsS "$BASE/reservations" \
  | jq -e --arg tag "$TAG" "(map(select(.guest_name|tostring|startswith(\$tag)))|length)>=3" >/dev/null \
  || die "persistence after reload"
ok "[ok] persisted after reload"

# 6) cancel -> idempotent -> confirm flow works
curl -fsS -X POST "$BASE/reservations/$R3/cancel"  >/dev/null || die "cancel 1"
curl -fsS -X POST "$BASE/reservations/$R3/cancel"  >/dev/null || die "cancel idempotent"
curl -fsS -X POST "$BASE/reservations/$R3/confirm" >/dev/null || die "confirm"
ok "[ok] cancel/confirm flow ok"

# 7) Cleanup only our 3
for id in "$R1" "$R2" "$R3"; do
  curl -s -o /dev/null -w "delete $id -> %{http_code}\n" -X DELETE "$BASE/reservations/$id" || true
done
curl -fsS "$BASE/reservations" \
  | jq -e --arg tag "$TAG" "(map(select(.guest_name|tostring|startswith(\$tag)))|length)==0" >/dev/null \
  || die "cleanup"
ok "[done] FULL REGRESSION GREEN"
