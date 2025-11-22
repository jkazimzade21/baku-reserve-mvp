#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:8000}"
RID="${RID:-fc34a984-0b39-4f0a-afa2-5b677c61f044}"  # demo restaurant
TID="${TID:-e5c360cf-31df-4276-841e-8cd720b5942c}"  # a 2-top
DAY="${DAY:-$(date +%F)}"
TAG="VRG-$(date +%s)"

say(){ printf "%b\n" "$1"; }

say "===== [0] Health ====="
curl -fsS "$BASE/health" >/dev/null && echo " -> OK" || { echo " -> FAIL /health"; exit 1; }

say "===== [1] CORS preflight on /reservations ====="
HDRS="$(curl -s -X OPTIONS "$BASE/reservations" -H "Origin: http://example.com" -H "Access-Control-Request-Method: POST" -D - -o /dev/null)"
echo "$HDRS" | grep -qi "^access-control-allow-origin:" && echo " -> OK" || { echo " -> FAIL (no ACAO)"; exit 1; }

say "===== [2] Baseline availability must include TID at 10:00 ====="
HAS="$(curl -fsS "$BASE/restaurants/$RID/availability?date=$DAY&party_size=2" \
  | jq -r --arg D "$DAY" --arg T "$TID" '.slots[] | select(.start==($D+"T10:00:00")) | (.available_table_ids|index($T)!=null)')"
[ "$HAS" = "true" ] && echo " -> OK" || { echo " -> FAIL (table not free at baseline)"; exit 1; }

say "===== [3] Create R1, reject overlapping, create back-to-back R2, autopick R3 ====="
R1="$(
  jq -cn --arg r "$RID" --arg d "$DAY" --arg t "$TID" --arg g "$TAG-1" \
    '{restaurant_id:$r,party_size:2,start:($d+"T10:00:00"),end:($d+"T11:30:00"),guest_name:$g,table_id:$t}' \
  | curl -fsS -X POST "$BASE/reservations" -H "Content-Type: application/json" -d @- \
  | jq -r .id
)"
[ -n "$R1" ] && echo " -> created $R1" || { echo " -> FAIL create R1"; exit 1; }

code="$(
  jq -cn --arg r "$RID" --arg d "$DAY" --arg t "$TID" --arg g "$TAG-ov" \
    '{restaurant_id:$r,party_size:2,start:($d+"T10:30:00"),end:($d+"T12:00:00"),guest_name:$g,table_id:$t}' \
  | curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/reservations" -H "Content-Type: application/json" -d @-
)"
[ "$code" = "409" ] && echo " -> overlap blocked (409)" || { echo " -> FAIL: expected 409, got $code"; exit 1; }

R2="$(
  jq -cn --arg r "$RID" --arg d "$DAY" --arg t "$TID" --arg g "$TAG-2" \
    '{restaurant_id:$r,party_size:2,start:($d+"T11:30:00"),end:($d+"T13:00:00"),guest_name:$g,table_id:$t}' \
  | curl -fsS -X POST "$BASE/reservations" -H "Content-Type: application/json" -d @- \
  | jq -r .id
)"
[ -n "$R2" ] && echo " -> created $R2 (back-to-back)" || { echo " -> FAIL create R2"; exit 1; }

R3="$(
  jq -cn --arg r "$RID" --arg d "$DAY" --arg g "$TAG-3" \
    '{restaurant_id:$r,party_size:2,start:($d+"T13:00:00"),end:($d+"T14:30:00"),guest_name:$g}' \
  | curl -fsS -X POST "$BASE/reservations" -H "Content-Type: application/json" -d @- \
  | jq -r .id
)"
[ -n "$R3" ] && echo " -> auto-selected $R3" || { echo " -> FAIL create R3"; exit 1; }

say "===== [4] Cancel idempotent; then confirm R3 ====="
curl -fsS -X POST "$BASE/reservations/$R3/cancel"  >/dev/null && echo " cancel -> 200"
curl -fsS -X POST "$BASE/reservations/$R3/cancel"  >/dev/null && echo " cancel again -> 200"
curl -fsS -X POST "$BASE/reservations/$R3/confirm" >/dev/null && echo " confirm -> 200"

say "===== [5] Cleanup ====="
for id in "$R1" "$R2" "$R3"; do
  echo -n " delete $id -> "
  curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/reservations/$id"
done
echo "[done] FULL REGRESSION VERBOSE GREEN"
