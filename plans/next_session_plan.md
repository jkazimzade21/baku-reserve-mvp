## Next Codex Session Plan (2025-11-13)

### R1 – BookScreen date parsing rejects UTC+ devices
1. Refactor `parseDateInput`/`formatDateInput` to operate on plain strings or UTC constructors (use `Date.UTC`) so validation no longer depends on device offsets.
2. Audit every caller (`composeDateTime`, calendar pickers, `handleDateConfirm`, `shiftDate`) to ensure comparisons use the same normalization helpers.
3. Run manual sanity check on Expo web + native (set simulator tz to `Asia/Baku`) to confirm the booking form loads availability without the “Enter a valid date” banner.
4. Add Jest test that mocks `Intl.DateTimeFormat().resolvedOptions().timeZone` to `Asia/Baku` and asserts `runLoad` proceeds with the entered date string.

### R2 – Naive slot timestamps drift outside Asia/Baku
1. Update backend `availability_for_day` to emit offset-aware strings (`datetime(..., tzinfo=ZoneInfo(restaurant_tz)).isoformat()`), migrating stored reservations accordingly.
2. If backend change must be phased, wrap `fetchAvailability` client parsing to treat slot strings as restaurant-local using Luxon/`Intl` with fixed zone until API rollout completes.
3. Propagate timezone typing across `AvailabilitySlot` so SeatPicker, BookScreen, and Suggestion helpers can format/compare via shared utilities.
4. Extend backend tests to assert timezone offsets, and add Jest coverage ensuring `findSlotForTime` matches even when `deviceTZ !== restaurantTZ`.

### R3 – SeatPicker auto-sync queries wrong day
1. Replace `baseStart.toISOString().slice(0, 10)` with a helper that formats in restaurant timezone (reuse the formatter from R2).
2. Ensure `fetchAvailability` requests include the same timezone metadata, and update SeatPicker props to carry the restaurant timezone explicitly.
3. Cover `syncAvailability` with a Jest test that stubs `slot.start` and `timezone` under `America/Los_Angeles`, plus a regression test for manual refresh.

### R4 – Reservation APIs leak cross-tenant data
1. Modify storage schema to persist `owner_id` (Auth0 `sub`) when creating reservations; add migration that backfills existing reservations with a placeholder owner so legacy data remains accessible to admins only.
2. Thread claims from `require_auth` into every reservation handler and enforce owner checks on list/update/delete routes, returning 404/403 where appropriate.
3. Update concierge/admin flows (if any) to supply elevated scopes that bypass owner checks intentionally.
4. Write backend tests that create reservations for two subs and verify isolation plus admin override scenarios.

### R5 – Arrival suggestions ignore live user location
1. Align field usage by storing `current_location` (alias pointing to `last_location`) inside `arrival_location_ping` and keep both fields in sync for backward compatibility.
2. Update suggestion endpoint to first read `current_location`, then `last_location`, defaulting to restaurant coords only when neither exists.
3. Add a FastAPI test to confirm the origin coordinates feed GoMap search payloads and surface “distance from you” text, plus a mobile test verifying the UI renders live distance when the backend populates it.

### R6 – Tokens expire before refresh can run
1. Implement refresh-token retrieval in `AuthContext` (read `REFRESH_KEY`, call `auth0.auth.refreshToken`) and make sure refreshed tokens persist back to SecureStore.
2. Update the API client to queue concurrent refresh attempts so only one refresh runs at a time, then replay pending requests once a fresh token is available.
3. Continue rejecting nearly-expired tokens on the server, but add telemetry so we can decide whether to relax the 60s buffer after the mobile refresh path ships.
4. Add automated coverage for the refresh path (unit test mocking Auth0 SDK responses) plus an integration test that simulates a 401 “expiring soon” response.

### R7 – Reservations list mislabels times
1. Introduce a shared helper that parses reservation timestamps with the restaurant timezone (now exposed via API) and compare to `now` normalized in that zone or UTC.
2. Ensure renderers format using restaurant timezone, not device default, and keep CTA eligibility (prep notify, cancel) tied to that normalized clock.
3. Add Jest tests covering upcoming/past classification plus UI snapshots where the device timezone is mocked to multiple offsets.
4. Run a manual smoke on physical devices (one in America/Los_Angeles, one in Asia/Baku) to confirm cards stay consistent.

### R8 – Restaurant search results race
1. Enhance `useRestaurants` to capture a request ID or AbortController token per fetch and discard stale responses; surface a loading indicator that only clears when the latest request returns.
2. Wire the discover screen to cancel in-flight fetches on unmount to avoid state updates on dead components.
3. Add hook tests simulating overlapping promises to ensure only the latest query updates state and that aborted responses do not raise warnings.

### R9 – Availability reads race reservation writes
1. Wrap the reservation iteration inside `availability_for_day` with `with db._lock` or expose a `DB.list_reservations()` snapshot helper that returns a deep copy for read-only loops.
2. Consider moving the in-memory reservation store to `sqlite3` or `shelve` so Python’s dict mutation edge cases disappear once R10 lands.
3. Add concurrency test (pytest) using threads or `ThreadPoolExecutor` to ensure no `RuntimeError` and consistent slot counts while writes occur.

### R10 – Arrival pings rewrite entire JSON store
1. Avoid full `_save()` per signal: queue writes, memoize arrival intent separately, or move to SQLite/redis-style store so location updates do not block bookings.
2. At minimum, persist arrival intent deltas without rewriting every reservation (e.g., store last-location file per reservation or batch writes every N seconds with debounce).
3. Build a stress test that simulates concurrent `/arrival_intent/location` updates plus bookings/cancels to validate throughput and lock behavior.
