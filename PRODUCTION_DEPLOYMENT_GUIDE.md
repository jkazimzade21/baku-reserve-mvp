# Production Deployment Guide

Use this checklist when promoting the FastAPI backend and Expo mobile client to staging or production. Commands assume macOS/Linux shells and the repo root as the working directory.

## 1. Prerequisites
- Python **3.11.14** (see `.tool-versions`).
- Node.js **20.x** and npm **10.x**.
- Valid credentials: Auth0 domain/audience, Sentry DSNs, and any payment provider keys.
- Remote host with SQLite or external DB volume mounted at `/var/lib/baku-reserve` (or override via `DATA_DIR`).

## 2. Backend Deployment
1. **Sync code**
   ```bash
   git fetch origin && git checkout <release-tag>
   ```
2. **Create virtualenv**
   ```bash
   python3.11 -m venv /opt/baku-reserve/.venv
   source /opt/baku-reserve/.venv/bin/activate
   pip install --upgrade pip
   pip install -r backend/requirements.txt
   ```
3. **Render environment file**
   ```bash
   install -m 600 /dev/null /opt/baku-reserve/.env.production
   cat > /opt/baku-reserve/.env.production <<'ENV'
   DATA_DIR="/var/lib/baku-reserve/data"
   AUTH0_BYPASS=false
   CORS_ALLOW_ORIGINS="https://app.bakureserve.az"
   OPENAI_API_KEY="<key-if-concierge-enabled>"
   # keep the remaining values in sync with .env.example
   ENV
   ```
4. **Warm caches and migrations**
   ```bash
   mkdir -p /var/lib/baku-reserve/data
   source /opt/baku-reserve/.venv/bin/activate
   python -m app.tools.prime_caches  # optional helper
   ```
5. **Launch via systemd (example snippet)**
   ```ini
   [Service]
   WorkingDirectory=/opt/baku-reserve/backend
   EnvironmentFile=/opt/baku-reserve/.env.production
   ExecStart=/opt/baku-reserve/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
   ```
6. **Smoke tests**
   ```bash
   BASE=https://api.bakureserve.az pytest backend/tests/test_backend_system.py
   BASE=https://api.bakureserve.az bash backend/full_regression.sh
   ```

## 3. Mobile Release (Expo)
1. Install dependencies once: `cd mobile && npm ci`.
2. Set `EXPO_PUBLIC_API_BASE` to the deployed API base URL and mirror Auth0/Sentry vars.
3. Build with EAS or Expo CLI:
   ```bash
   cd mobile
   npx expo install expo@54.0.23
   eas build --platform ios --profile production
   eas build --platform android --profile production
   ```
4. Run Jest + lint before submitting binaries:
   ```bash
   npm run lint && npm run format && npm test -- --ci --runInBand
   ```

## 4. Monitoring & Rollback
- Verify `/health` and `/metrics` endpoints after deploy.
- Check Sentry dashboards for new releases.
- Roll back by redeploying the previous Git tag and restoring the prior `.env.production` snapshot.
