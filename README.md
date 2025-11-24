## Baku Reserve Monorepo

This workspace contains the FastAPI backend, Expo/React Native mobile client, and
support tooling (scripts + photo processors) that power the Baku Reserve demo.

### Backend

```bash
cd baku-reserve
python3.11 -m venv .venv  # pinned via .tool-versions (3.11.14)
source .venv/bin/activate
pip install -r backend/requirements-dev.txt

# Run the API with autoreload
./scripts/dev_backend.sh

# Lint + format + tests
./.venv/bin/ruff check backend
./.venv/bin/black backend
./.venv/bin/python -m pytest backend

### Persistent demo data

The lightweight reservation store now lives outside the repo in `~/.baku-reserve-data`
by default, so `git clean`/`git reset` no longer wipe your local bookings. Override the
location by setting `DATA_DIR=/path/to/folder` in `.env` if you want to point the store
elsewhere (the directory will be created automatically and seeded with the bundled
restaurants file on first run).
```

The FastAPI app lives under `backend/app`. The root `restaurants.json` seed file
now references curated photo assets served from `/assets/restaurants/<slug>/<n>.jpg`.
FastAPI mounts that folder automatically so any client (including Mobile/Expo) can
pull the same curated imagery.

### Containers

- Quick start (requires Docker):
  ```bash
  docker compose up --build
  ```
  This brings up Postgres + Redis + the API on port 8000 with sane defaults
  (`DEBUG=false`, dev routes disabled).

### Authentication

- The API trusts Auth0-issued access tokens. Set the following in `.env`:
  ```env
  AUTH0_DOMAIN=dev-qsgi082lyfxd6efi.eu.auth0.com
  AUTH0_AUDIENCE=https://api.bakureserve.az
  AUTH0_BYPASS=false   # leave true only for local smoke tests
  AUTH0_REALM=Username-Password-Authentication
  ```
- During local/mobile development you can keep `AUTH0_BYPASS=true`, which skips
  JWT validation and injects a mock user. Disable the bypass in staging/production.
- The Expo app expects the matching Auth0 settings via public env vars:
  ```bash
  EXPO_PUBLIC_AUTH0_DOMAIN=dev-qsgi082lyfxd6efi.eu.auth0.com \
  EXPO_PUBLIC_AUTH0_CLIENT_ID=PBkuLbGBQ1inG03lnNfja1qhdTNPoFcy \
  EXPO_PUBLIC_AUTH0_AUDIENCE=https://api.bakureserve.az \
  EXPO_PUBLIC_AUTH0_REALM=Username-Password-Authentication \
  ./scripts/dev_mobile.sh
  ```
- Users must authenticate inside the app via email/password (Auth0 Password Realm).
  Enable the Password grant type on the Auth0 application and allow sign-ups on the
  `Username-Password-Authentication` database connection. The login screen now embeds
  the credential form (create account, sign-in, reset password) and tokens are stored
  via SecureStore before the tab navigator is shown.

### Security Defaults

- Set `CORS_ALLOW_ORIGINS` in `.env` to the exact frontend origins you trust (for
  example `http://localhost:8081,http://localhost:19006`). Leaving it blank disables
  cross-origin access entirely; `*` is no longer the default.
- Basic IP-scoped rate limiting now ships with the API. Tune `RATE_LIMIT_REQUESTS`
  and `RATE_LIMIT_WINDOW_SECONDS` in `.env` (defaults are 300 requests per minute)
  or set `RATE_LIMIT_ENABLED=false` if you need to disable it for isolated testing.

### Mobile (Expo / React Native)

```bash
cd baku-reserve/mobile
npm install

# Start Metro/Expo pointing at your LAN backend
../scripts/dev_mobile.sh -- --clear

# Quality gates
npm run lint
npm run format
npm test -- --runInBand
```

The mobile client automatically prefers bundled local assets via
`src/assets/restaurantPhotoManifest.ts`. When a slug is missing curated assets it
falls back to API-provided URLs.

- Home + Explore now follow the concierge spec: Home is limited to `MAX_HOME_SECTIONS`
  (Context → Search → single hero → optional bookings/events), while Explore starts with the
  Concierge card, Trending carousel, Events (when data exists), and a compact “Browse by vibe”
  grid. “See all” routes use the `RestaurantCollection` stack screen.

### Curated Instagram Photo Pipeline

1. Drop original JPG/PNG files inside `IGPics/<slug>/1.jpg … 5.jpg`. This folder is
   now tracked so we never lose the source imagery.
2. Maintain the canonical Instagram post list for each slug inside
   `tools/update_restaurant_photos.py` (`PHOTO_SOURCES`).
3. Install the helper dependencies once per machine:
   ```bash
   source .venv/bin/activate
   pip install instaloader Pillow
   ```
4. To fetch fresh photos directly from Instagram:
   ```bash
   python tools/update_restaurant_photos.py --download [--slugs sumakh chinar]
   ```
   Provide `--login` and an `IG_PASSWORD` env var if Instagram blocks anonymous
   scraping.
5. To regenerate assets from the files already in `IGPics/`, just run:
   ```bash
   python tools/update_restaurant_photos.py
   ```

The script will:

- Convert the curated JPGs into WebP bundles under `mobile/src/assets/restaurants/<slug>/`.
- Rebuild `restaurantPhotoManifest.ts` with the exact assets (max 5 per slug).
- Rewrite `backend/app/data/restaurants.json` so every restaurant references the
  tracked `/assets/restaurants/...` URLs.

### Repo Hygiene

- Generated artefacts (`node_modules`, `__pycache__`, `.hypothesis`, etc.) are
  still ignored via `.gitignore`.
- Raw Instagram photos are now checked in under `IGPics/` so the team has a
  permanent archive of every curated shot that ships with the demo.

<!-- gemini-push-verification -->
