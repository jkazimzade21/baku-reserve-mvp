# Restaurant Partner Portal (Preview)

The partner-facing console shares the same FastAPI backend as the public booking
experience. Admin operators can now preview this view from `/admin` via the new
“Restaurant partner console” panel.

## Goals

- **Live arrival feed** – show every booked reservation with an active prep or
  arrival intent, grouped by restaurant.
- **Action shortcuts** – allow venues to approve, queue, reject, or cancel an
  arrival request without leaving the page (`/reservations/{id}/arrival_intent/decision`).
- **Prep transparency** – surface prep scope, notes, and status so chefs know
  exactly what to stage once a guest taps *On My Way*.
- **Next steps** – upcoming iterations will let venues update table states,
  block seats, and reply to guests (push + SMS) directly from this view.

## Current UI blocks

| Block | Description |
| --- | --- |
| Restaurant | Name + neighborhood pulled from `/restaurants`. |
| Guest & slot | Guest name, party size, and start time. |
| Prep & notes | Scope (starters/full), status, and a comma-separated note list. |
| Arrival intent | Current intent status plus lead time / predicted or confirmed ETAs. |
| Venue actions | Micro-buttons that call the arrival-intent decision API (`approve`, `queue`, `reject`, `cancel`). |

## API recap

- `POST /reservations/{id}/arrival_intent/decision` – accepts `{ "action": "approve" | "queue" | "reject" | "cancel" }`.
- `POST /reservations/{id}/arrival_intent/eta` – confirms a user-provided ETA (future enhancement for venues to override).
- `POST /reservations/{id}/preorder/confirm` – records prep scope/notes; venues only need read access.

## Roadmap

1. **Seat board** – add table-level switches so venues can release/hold seats.
2. **Guest messaging** – quick templates that send secure SMS/WhatsApp updates.
3. **Multi-venue selectors** – restrict partners to their own restaurants with SSO roles.
4. **Ops audit log** – per-venue logbook of every intent decision for compliance.
