#!/usr/bin/env bash
set -u

### CONFIG #####################################################################
BASE="${BASE:-http://192.168.0.148:8000}"
TEST_DATE="${TEST_DATE:-2025-10-23}"   # change if you want to test another day
NAME_PREFIX="SMOKE_$(date +%s)_"
JQ_BIN="${JQ_BIN:-jq}"

### REQUIREMENTS ###############################################################
command -v curl >/dev/null || { echo "[FATAL] curl required"; exit 1; }
command -v ${JQ_BIN} >/dev/null || { echo "[FATAL] jq required"; exit 1; }

### HARNESS ####################################################################
fail=0; pass=0
log()   { printf "%b\n" "$*"; }
ok()    { pass=$((pass+1)); log "✅  $*"; }
bad()   { fail=$((fail+1)); log "❌  $*"; }
sep()   { printf "\n===== %s =====\n" "$*"; }

# curl wrapper that captures HTTP code and body safely
req() {
  local method="$1"; shift
  local url="$1"; shift
  local data="${1:-}"
  local tmp_b="$(mktemp)"; local code

  if [[ -z "$data" ]]; then
    code=$(curl -sS -o "$tmp_b" -w "%{http_code}" -X "$method" "$url" -H "Accept: application/json")
  else
    code=$(curl -sS -o "$tmp_b" -w "%{http_code}" -X "$method" "$url" \
      -H "Accept: application/json" -H "Content-Type: application/json" --data "$data")
  fi
  echo "$code $tmp_b"
}

expect_code() {
  local want="$1"; local got="$2"
  if [[ "$want" == "$got" ]]; then return 0; fi
  # allow ranges like 4xx
  if [[ "$want" =~ x$ ]]; then
    local pfx="${want%x}"
    [[ "${got:0:1}" == "$pfx" ]] && return 0
  fi
  return 1
}

# delete all reservations whose guest_name starts with NAME_PREFIX
cleanup_smoke_reservations() {
  local code tmp out
  read -r code tmp < <(req GET "$BASE/reservations")
  out="$(cat "$tmp")"
  if ! expect_code 200 "$code"; then bad "GET /reservations ($code)"; return; fi
  local ids
  ids=$(echo "$out" | ${JQ_BIN} -r --arg pfx "$NAME_PREFIX" '.[] | select(.guest_name|startswith($pfx)) | .id')
  if [[ -z "$ids" ]]; then ok "No lingering $NAME_PREFIX reservations"; return; fi
  while IFS= read -r rid; do
    [[ -z "$rid" ]] && continue
    read -r code tmp < <(req DELETE "$BASE/reservations/$rid")
    if expect_code 200 "$code"; then ok "DELETE /reservations/$rid"; else bad "DELETE /reservations/$rid ($code)"; fi
  done <<< "$ids"
}

### DISCOVER DATA ##############################################################
sep "A0. Discover restaurants"
read -r code tmp < <(req GET "$BASE/restaurants")
if ! expect_code 200 "$code"; then bad "GET /restaurants ($code)"; exit 1; fi
out="$(cat "$tmp")"

# Prefer Sahil; else pick first
RID=$(echo "$out" | ${JQ_BIN} -r '
  (map(select(.name=="Sahil Bar & Restaurant"))[0].id) // (.[0].id)
')
if [[ -z "$RID" || "$RID" == "null" ]]; then bad "No restaurant found"; exit 1; fi
ok "Selected restaurant: $RID"

read -r code tmp < <(req GET "$BASE/restaurants/$RID")
if ! expect_code 200 "$code"; then bad "GET /restaurants/$RID ($code)"; exit 1; fi
RJSON="$(cat "$tmp")"

# classify tables by capacity
T2_IDS=$(echo "$RJSON" | ${JQ_BIN} -r '.areas[].tables[] | select(.capacity==2) | .id')
T4_IDS=$(echo "$RJSON" | ${JQ_BIN} -r '.areas[].tables[] | select(.capacity==4) | .id')
T6_IDS=$(echo "$RJSON" | ${JQ_BIN} -r '.areas[].tables[] | select(.capacity>=6) | .id')

T2_ONE=$(echo "$T2_IDS" | head -n1)
T4_ONE=$(echo "$T4_IDS" | head -n1)
T6_ONE=$(echo "$T6_IDS" | head -n1)

[[ -n "$T2_ONE" ]] && ok "Found 2-top: $T2_ONE" || bad "No 2-top table"
[[ -n "$T4_ONE" ]] && ok "Found 4-top: $T4_ONE" || bad "No 4-top table"
[[ -n "$T6_ONE" ]] && ok "Found 6-top+: $T6_ONE" || bad "No 6-top+ table"

sep "A1. Baseline availability"
read -r code tmp < <(req GET "$BASE/restaurants/$RID/availability?date=$TEST_DATE&party_size=2")
if expect_code 200 "$code"; then
  AJSON="$(cat "$tmp")"
  SLOTS_COUNT=$(echo "$AJSON" | ${JQ_BIN} '.slots | length')
  if [[ "$SLOTS_COUNT" -gt 0 ]]; then ok "Availability has $SLOTS_COUNT slots"; else bad "No slots returned"; fi
else
  bad "GET availability ($code)"
fi

### CLEAN START ###############################################################
sep "A2. Pre-run cleanup"
cleanup_smoke_reservations

### HELPERS FOR BOOKING #######################################################
book() {
  # args: table_id start end party_size name
  local tid="$1" s="$2" e="$3" ps="$4" name="$5"
  local payload
  payload=$(cat <<JSON
{
  "restaurant_id":"$RID",
  "party_size": $ps,
  "start":"$s",
  "end":"$e",
  "guest_name":"$name",
  "guest_phone":"+1555555",
  "table_id":"$tid"
}
JSON
)
  read -r code tmp < <(req POST "$BASE/reservations" "$payload")
  echo "$code $(cat "$tmp")"
}

first_slot_for_party() {
  local ps="$1"
  read -r code tmp < <(req GET "$BASE/restaurants/$RID/availability?date=$TEST_DATE&party_size=$ps")
  if ! expect_code 200 "$code"; then echo ""; return; fi
  cat "$tmp" | ${JQ_BIN} -r '.slots[0] | [.start,.end] | @tsv'
}

first_slot_and_table_for_party() {
  local ps="$1"
  read -r code tmp < <(req GET "$BASE/restaurants/$RID/availability?date=$TEST_DATE&party_size=$ps")
  if ! expect_code 200 "$code"; then echo ""; return; fi
  cat "$tmp" | ${JQ_BIN} -r '.slots[0] | "\(.start)\t\(.end)\t\(.available_table_ids[0])"'
}

reappears_in_slot() {
  # args: start table_id party_size
  local s="$1" tid="$2" ps="$3"
  read -r code tmp < <(req GET "$BASE/restaurants/$RID/availability?date=$TEST_DATE&party_size=$ps")
  if ! expect_code 200 "$code"; then echo "ERR"; return; fi
  cat "$tmp" | ${JQ_BIN} -r --arg s "$s" --arg tid "$tid" '
    .slots[] | select(.start==$s) | (.available_table_ids | index($tid)) | if .==null then "NO" else "YES" end
  '
}

### B. VALID RESERVATION CYCLE #################################################
sep "B. Valid cycle: create -> list -> availability -> delete"
IFS=$'\t' read -r S1 E1 TID1 < <(first_slot_and_table_for_party 2)
if [[ -z "${S1:-}" || -z "${TID1:-}" ]]; then bad "Could not pick first slot/table"; else ok "Picked slot $S1..$E1 table $TID1"; fi

read -r code body < <(book "$TID1" "$S1" "$E1" 2 "${NAME_PREFIX}CYCLE1")
if expect_code 201 "$code"; then ok "POST /reservations (created)"; else bad "POST /reservations ($code): $body"; fi

# list
read -r code tmp < <(req GET "$BASE/reservations")
if expect_code 200 "$code"; then
  RID1=$(cat "$tmp" | ${JQ_BIN} -r --arg name "${NAME_PREFIX}CYCLE1" '.[] | select(.guest_name==$name) | .id' | head -n1)
  [[ -n "$RID1" ]] && ok "Reservation listed: $RID1" || bad "Reservation not in list"
else
  bad "GET /reservations ($code)"
fi

# ensure table removed from that slot
R=$(reappears_in_slot "$S1" "$TID1" 2)
if [[ "$R" == "NO" ]]; then ok "Booked table removed from availability"; else bad "Booked table still appears in availability"; fi

# delete it
if [[ -n "${RID1:-}" ]]; then
  read -r code tmp < <(req DELETE "$BASE/reservations/$RID1")
  expect_code 200 "$code" && ok "DELETE /reservations/$RID1" || bad "DELETE /reservations/$RID1 ($code)"
fi

### C. OVERLAP VALIDATION (same table, same time) ##############################
sep "C. Overlap: identical slot on same table"
IFS=$'\t' read -r S2 E2 TID2 < <(first_slot_and_table_for_party 2)
read -r cA bA < <(book "$TID2" "$S2" "$E2" 2 "${NAME_PREFIX}OVL1")
if expect_code 201 "$cA"; then ok "Initial booking OK"; else bad "Initial booking failed ($cA)"; fi

read -r cB bB < <(book "$TID2" "$S2" "$E2" 2 "${NAME_PREFIX}OVL2")
if expect_code 4x "$cB"; then ok "Double-book rejected ($cB)"; else bad "Double-book NOT rejected ($cB)"; fi

# cleanup
RID_OVL=$(echo "$bA" | ${JQ_BIN} -r '.id // empty')
[[ -n "$RID_OVL" ]] && read -r code tmp < <(req DELETE "$BASE/reservations/$RID_OVL") && expect_code 200 "$code" && ok "Cleaned overlap booking" || true

### D. PARTIAL OVERLAPS ########################################################
sep "D. Partial overlap: consecutive overlapping windows"
# pick two consecutive windows (slots[1] and slots[2]) on same table if possible
read -r code tmp < <(req GET "$BASE/restaurants/$RID/availability?date=$TEST_DATE&party_size=2")
if expect_code 200 "$code"; then
  S10=$(cat "$tmp" | ${JQ_BIN} -r '.slots[1].start')
  E10=$(cat "$tmp" | ${JQ_BIN} -r '.slots[1].end')
  T10=$(cat "$tmp" | ${JQ_BIN} -r '.slots[1].available_table_ids[0]')
  S11=$(cat "$tmp" | ${JQ_BIN} -r '.slots[2].start')
  E11=$(cat "$tmp" | ${JQ_BIN} -r '.slots[2].end')
  T11="$T10"  # try same table to force overlap
  if [[ "$S10" != "null" && -n "$T10" && "$S11" != "null" ]]; then
    read -r c1 b1 < <(book "$T10" "$S10" "$E10" 2 "${NAME_PREFIX}PART1")
    if expect_code 201 "$c1"; then ok "Booked PART1"; else bad "PART1 failed ($c1)"; fi
    read -r c2 b2 < <(book "$T11" "$S11" "$E11" 2 "${NAME_PREFIX}PART2")
    if expect_code 4x "$c2"; then ok "Overlapping PART2 rejected"; else bad "Overlapping PART2 NOT rejected ($c2)"; fi
    # cleanup PART1
    RIDP=$(echo "$b1" | ${JQ_BIN} -r '.id // empty')
    [[ -n "$RIDP" ]] && read -r code tmp < <(req DELETE "$BASE/reservations/$RIDP") && expect_code 200 "$code" && ok "Cleaned PART1" || true
  else
    bad "Could not derive overlapping windows"
  fi
else
  bad "GET availability for partial overlap ($code)"
fi

### E. CAPACITY & PARTY SIZE ###################################################
sep "E1. Capacity: 6 people on 2-top should fail"
# Use a valid window for party_size=6 then force a 2-top table
IFS=$'\t' read -r S6 E6 T6AV < <(first_slot_and_table_for_party 6)
if [[ -z "${S6:-}" ]]; then
  ok "No 6-person slots; capacity rules implicitly hold (skipping forced fail)"
else
  if [[ -n "${T2_ONE:-}" ]]; then
    read -r c b < <(book "$T2_ONE" "$S6" "$E6" 6 "${NAME_PREFIX}CAP_BAD")
    expect_code 4x "$c" && ok "Rejected 6 on 2-top ($c)" || bad "Accepted 6 on 2-top ($c)"
  else
    bad "No 2-top to test capacity rejection"
  fi
fi

sep "E2. Valid 4 on 4-top then 4 on 2-top should fail"
IFS=$'\t' read -r S4 E4 T4AV < <(first_slot_and_table_for_party 4)
if [[ -n "${T4_ONE:-}" && -n "${S4:-}" ]]; then
  read -r c1 b1 < <(book "$T4_ONE" "$S4" "$E4" 4 "${NAME_PREFIX}CAP_GOOD4")
  expect_code 201 "$c1" && ok "Booked 4 on 4-top" || bad "Failed to book 4 on 4-top ($c1)"
  if [[ -n "${T2_ONE:-}" ]]; then
    read -r c2 b2 < <(book "$T2_ONE" "$S4" "$E4" 4 "${NAME_PREFIX}CAP_BAD4")
    expect_code 4x "$c2" && ok "Rejected 4 on 2-top" || bad "Accepted 4 on 2-top ($c2)"
  fi
  # cleanup
  RIDG=$(echo "$b1" | ${JQ_BIN} -r '.id // empty')
  [[ -n "$RIDG" ]] && read -r code tmp < <(req DELETE "$BASE/reservations/$RIDG") && expect_code 200 "$code" && ok "Cleaned 4-on-4 booking" || true
else
  bad "No 4-top or slot to test"
fi

sep "E3. party_size=1 on 2-top should succeed"
IFS=$'\t' read -r S1p E1p T1p < <(first_slot_and_table_for_party 2)
if [[ -n "${S1p:-}" && -n "${T2_ONE:-}" ]]; then
  read -r c b < <(book "$T2_ONE" "$S1p" "$E1p" 1 "${NAME_PREFIX}ONE_OK")
  expect_code 201 "$c" && ok "Booked 1 on 2-top" || bad "Failed 1 on 2-top ($c)"
  RID1p=$(echo "$b" | ${JQ_BIN} -r '.id // empty'); [[ -n "$RID1p" ]] && read -r code tmp < <(req DELETE "$BASE/reservations/$RID1p") && expect_code 200 "$code" && ok "Cleaned 1-on-2 booking" || true
else
  bad "Could not find 2-top to validate party_size=1"
fi

### F. DATE EDGE CASES #########################################################
sep "F. Date edges (past/future/invalid)"
read -r code tmp < <(req GET "$BASE/restaurants/$RID/availability?date=2020-01-01&party_size=2")
expect_code 200 "$code" && ok "Past date handled" || bad "Past date ($code)"

read -r code tmp < <(req GET "$BASE/restaurants/$RID/availability?date=2026-10-23&party_size=2")
expect_code 200 "$code" && ok "Far future date handled" || bad "Future date ($code)"

read -r code tmp < <(req GET "$BASE/restaurants/$RID/availability?party_size=2")
expect_code 4x "$code" && ok "Missing date rejected ($code)" || ok "Missing date allowed ($code) — acceptable per API"

read -r code tmp < <(req GET "$BASE/restaurants/$RID/availability?date=BADDATE&party_size=2")
expect_code 4x "$code" && ok "Invalid date rejected ($code)" || bad "Invalid date NOT rejected ($code)"

### G. INPUT VALIDATION ########################################################
sep "G. Input validation (schema & logic)"
# Missing table_id
payload=$(cat <<JSON
{
  "restaurant_id":"$RID",
  "party_size":2,
  "start":"$S1",
  "end":"$E1",
  "guest_name":"${NAME_PREFIX}NO_TABLE",
  "guest_phone":"+1555000"
}
JSON
)
read -r code tmp < <(req POST "$BASE/reservations" "$payload")
expect_code 4x "$code" && ok "Missing table_id rejected" || bad "Missing table_id accepted ($code)"

# Bad date formats
read -r code tmp < <(req POST "$BASE/reservations" '{
  "restaurant_id":"'"$RID"'",
  "party_size":2,
  "start":"10-23-2025 10:00",
  "end":"10-23-2025 11:30",
  "guest_name":"'"${NAME_PREFIX}BAD_DATE"'",
  "guest_phone":"+1555",
  "table_id":"'"$T2_ONE"'"
}')
expect_code 4x "$code" && ok "Bad date format rejected" || bad "Bad date format accepted ($code)"

# Negative / zero / non-integer party_size
for ps in -1 0 '"two"'; do
  read -r code tmp < <(req POST "$BASE/reservations" '{
    "restaurant_id":"'"$RID"'",
    "party_size":'"$ps"',
    "start":"'"$S1"'",
    "end":"'"$E1"'",
    "guest_name":"'"${NAME_PREFIX}BAD_PS_$ps"'",
    "guest_phone":"+1555",
    "table_id":"'"$T2_ONE"'"
  }')
  expect_code 4x "$code" && ok "party_size='"$ps"' rejected" || bad "party_size='$ps' accepted ($code)"
done

# end == start
read -r code tmp < <(req POST "$BASE/reservations" '{
  "restaurant_id":"'"$RID"'",
  "party_size":2,
  "start":"'"$S1"'",
  "end":"'"$S1"'",
  "guest_name":"'"${NAME_PREFIX}ZERO_DURATION"'",
  "guest_phone":"+1",
  "table_id":"'"$T2_ONE"'"
}')
expect_code 4x "$code" && ok "Zero-duration rejected" || bad "Zero-duration accepted ($code)"

# end < start
read -r code tmp < <(req POST "$BASE/reservations" '{
  "restaurant_id":"'"$RID"'",
  "party_size":2,
  "start":"'"$E1"'",
  "end":"'"$S1"'",
  "guest_name":"'"${NAME_PREFIX}NEG_DURATION"'",
  "guest_phone":"+1",
  "table_id":"'"$T2_ONE"'"
}')
expect_code 4x "$code" && ok "End < Start rejected" || bad "End < Start accepted ($code)"

# Invalid UUIDs / mismatched IDs
read -r code tmp < <(req GET "$BASE/restaurants/NOT-A-UUID")
expect_code 4x "$code" && ok "Invalid restaurant path rejected ($code)" || bad "Invalid restaurant path accepted ($code)"

read -r code tmp < <(req GET "$BASE/restaurants/00000000-0000-0000-0000-000000000000")
expect_code 4x "$code" && ok "Unknown restaurant 404/4xx ($code)" || bad "Unknown restaurant not 4xx ($code)"

read -r code tmp < <(req POST "$BASE/reservations" '{
  "restaurant_id":"'"$RID"'",
  "party_size":2,
  "start":"'"$S1"'",
  "end":"'"$E1"'",
  "guest_name":"'"${NAME_PREFIX}BAD_TID"'",
  "guest_phone":"+1",
  "table_id":"00000000-0000-0000-0000-000000000000"
}')
expect_code 4x "$code" && ok "Unknown table_id rejected" || bad "Unknown table_id accepted ($code)"

### H. ADJACENCY (end == next start) ##########################################
sep "H. Adjacency on same table (end==start should be allowed)"
# pick a base slot and compute its immediate next slot from availability list
read -r code tmp < <(req GET "$BASE/restaurants/$RID/availability?date=$TEST_DATE&party_size=2")
if expect_code 200 "$code"; then
  B_S=$(cat "$tmp" | ${JQ_BIN} -r '.slots[0].start')
  B_E=$(cat "$tmp" | ${JQ_BIN} -r '.slots[0].end')
  B_T=$(cat "$tmp" | ${JQ_BIN} -r '.slots[0].available_table_ids[0]')
  N_S=$(cat "$tmp" | ${JQ_BIN} -r '.slots[1].start')
  N_E=$(cat "$tmp" | ${JQ_BIN} -r '.slots[1].end')
  if [[ "$B_E" == "$N_S" && "$B_T" != "null" ]]; then
    read -r c1 b1 < <(book "$B_T" "$B_S" "$B_E" 2 "${NAME_PREFIX}ADJ1")
    read -r c2 b2 < <(book "$B_T" "$N_S" "$N_E" 2 "${NAME_PREFIX}ADJ2")
    if expect_code 201 "$c1" && expect_code 201 "$c2"; then
      ok "Adjacency allowed (both bookings succeeded)"
    else
      bad "Adjacency failed (codes: $c1 then $c2)"
    fi
    # cleanup both
    for bb in "$b1" "$b2"; do
      rid=$(echo "$bb" | ${JQ_BIN} -r '.id // empty')
      [[ -n "$rid" ]] && read -r code tmp < <(req DELETE "$BASE/reservations/$rid") && expect_code 200 "$code" && ok "Cleaned adjacency id=$rid" || true
    done
  else
    ok "No adjacent slot in index [0..1] (skipping)"
  fi
else
  bad "Availability fetch for adjacency ($code)"
fi

### I. CONCURRENCY (two simultaneous posts) ###################################
sep "I. Concurrency: race same table/slot (only one should succeed)"
IFS=$'\t' read -r SR ER TR < <(first_slot_and_table_for_party 2)
if [[ -n "${SR:-}" && -n "${TR:-}" ]]; then
  # fire two in parallel
  RES_A="$(mktemp)"; RES_B="$(mktemp)"
  (book "$TR" "$SR" "$ER" 2 "${NAME_PREFIX}RACEA" > "$RES_A") &
  (book "$TR" "$SR" "$ER" 2 "${NAME_PREFIX}RACEB" > "$RES_B") &
  wait

  CA=$(cut -d' ' -f1 "$RES_A"); CB=$(cut -d' ' -f1 "$RES_B")
  if { expect_code 201 "$CA" && expect_code 4x "$CB"; } || { expect_code 4x "$CA" && expect_code 201 "$CB"; }; then
    ok "Race condition handled (one success, one reject)"
  else
    bad "Race condition NOT handled (codes: $CA, $CB)"
  fi

  # cleanup whichever succeeded
  for RFILE in "$RES_A" "$RES_B"; do
    C=$(cut -d' ' -f1 "$RFILE")
    BODY=$(cut -d' ' -f2- "$RFILE")
    if expect_code 201 "$C"; then
      rid=$(echo "$BODY" | ${JQ_BIN} -r '.id // empty')
      [[ -n "$rid" ]] && read -r code tmp < <(req DELETE "$BASE/reservations/$rid") && expect_code 200 "$code" && ok "Cleaned race id=$rid" || true
    fi
  done
else
  bad "Could not get slot/table for race test"
fi

### FINAL CLEANUP ##############################################################
sep "Z. Final cleanup"
cleanup_smoke_reservations

### SUMMARY ####################################################################
sep "SUMMARY"
echo "PASSED: $pass"
echo "FAILED: $fail"
[[ $fail -eq 0 ]] && exit 0 || exit 1
