#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/mobile"

DEFAULT_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"
IP="${EXPO_HOST_IP:-$DEFAULT_IP}"
API_PORT="${API_PORT:-8000}"
PORT="${EXPO_DEV_PORT:-8081}"

# Auth0 defaults for local dev; override via environment when needed
export EXPO_PUBLIC_AUTH0_DOMAIN="${EXPO_PUBLIC_AUTH0_DOMAIN:-dev-qsgi082lyfxd6efi.eu.auth0.com}"
export EXPO_PUBLIC_AUTH0_CLIENT_ID="${EXPO_PUBLIC_AUTH0_CLIENT_ID:-PBkuLbGBQ1inG03lnNfja1qhdTNPoFcy}"
export EXPO_PUBLIC_AUTH0_AUDIENCE="${EXPO_PUBLIC_AUTH0_AUDIENCE:-https://api.bakureserve.az}"
export EXPO_PUBLIC_AUTH0_REALM="${EXPO_PUBLIC_AUTH0_REALM:-Username-Password-Authentication}"
export EXPO_PUBLIC_CONCIERGE_MODE="${EXPO_PUBLIC_CONCIERGE_MODE:-ai}"
export EXPO_PUBLIC_SENTRY_DSN="${EXPO_PUBLIC_SENTRY_DSN:-https://3064ef3ffd6731fbe3d280b8b0a4d026@o4510277399543808.ingest.us.sentry.io/4510347154554880}"

export EXPO_PUBLIC_API_BASE="${EXPO_PUBLIC_API_BASE:-http://$IP:$API_PORT}"

APP_CONFIG_LOCAL="$ROOT/mobile/app.config.local.json"
cat <<EOF > "$APP_CONFIG_LOCAL"
{
  "expo": {
    "extra": {
      "apiUrl": "http://$IP:$API_PORT",
      "auth0Domain": "$EXPO_PUBLIC_AUTH0_DOMAIN",
      "auth0ClientId": "$EXPO_PUBLIC_AUTH0_CLIENT_ID",
      "auth0Audience": "$EXPO_PUBLIC_AUTH0_AUDIENCE",
      "auth0Realm": "$EXPO_PUBLIC_AUTH0_REALM",
      "conciergeMode": "$EXPO_PUBLIC_CONCIERGE_MODE",
      "sentryDsn": "$EXPO_PUBLIC_SENTRY_DSN"
    }
  }
}
EOF

cat <<EOF > "$ROOT/mobile/.env"
EXPO_PUBLIC_API_BASE=http://$IP:$API_PORT
EXPO_PUBLIC_AUTH0_DOMAIN=$EXPO_PUBLIC_AUTH0_DOMAIN
EXPO_PUBLIC_AUTH0_CLIENT_ID=$EXPO_PUBLIC_AUTH0_CLIENT_ID
EXPO_PUBLIC_AUTH0_AUDIENCE=$EXPO_PUBLIC_AUTH0_AUDIENCE
EXPO_PUBLIC_AUTH0_REALM=$EXPO_PUBLIC_AUTH0_REALM
EXPO_PUBLIC_CONCIERGE_MODE=$EXPO_PUBLIC_CONCIERGE_MODE
EXPO_PUBLIC_SENTRY_DSN=$EXPO_PUBLIC_SENTRY_DSN
EOF

echo "[dev-mobile] Using API at $EXPO_PUBLIC_API_BASE"
echo "[dev-mobile] Starting Expo Dev Client on port $PORT"
exec npx expo start --dev-client --port "$PORT" "$@"
