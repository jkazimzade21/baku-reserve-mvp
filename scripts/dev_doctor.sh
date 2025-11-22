#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
TOOL_VERSIONS_FILE="$ROOT_DIR/.tool-versions"
REQUIRED_PYTHON_VERSION="3.11.14"

function log() {
  printf '\033[1;34m[doctor]\033[0m %s\n' "$1"
}

function fail() {
  printf '\033[1;31m[doctor]\033[0m %s\n' "$1" >&2
  exit 1
}

missing_required=0

function check_cmd() {
  local cmd="$1"
  local hint="${2:-}"
  local optional="${3:-false}"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    if [[ "$optional" == "true" ]]; then
      log "Optional command missing: $cmd${hint:+ ($hint)}"
      return 0
    else
      log "Required command missing: $cmd${hint:+ ($hint)}"
      missing_required=1
    fi
    return 1
  fi
}

function check_version() {
  local name="$1"
  local cmd="$2"
  local expected="$3"
  local actual
  if ! actual=$($cmd); then
    fail "Unable to read $name version via '$cmd'"
  fi
  if [[ "$actual" != "$expected"* ]]; then
    log "$name version mismatch: expected $expected, got $actual"
  else
    log "$name $actual"
  fi
}

log "root directory: $ROOT_DIR"

if [[ -f "$TOOL_VERSIONS_FILE" ]]; then
  log "reading desired tool versions from .tool-versions"
else
  log ".tool-versions not found; using detected versions"
fi

check_cmd python3.11 "Install Python ${REQUIRED_PYTHON_VERSION} (asdf/pyenv/homebrew)."
check_cmd node "Install Node.js 20 via asdf/nvm."
check_cmd npm "Install npm (bundled with Node)."
check_cmd openssl
check_cmd watchman "brew install watchman" true
check_cmd pkg-config "brew install pkg-config" true

PY311_VER=""
if command -v python3.11 >/dev/null 2>&1; then
  PY311_VER=$(python3.11 --version 2>/dev/null | awk '{print $2}')
fi
NODE_VER=$(node -v 2>/dev/null)
NPM_VER=$(npm -v 2>/dev/null)
OPENSSL_VER=$(openssl version 2>/dev/null)
WATCHMAN_VER=$(watchman --version 2>/dev/null)

if [[ -n "$PY311_VER" ]]; then
  if [[ "$PY311_VER" != "$REQUIRED_PYTHON_VERSION" ]]; then
    log "Python version mismatch: expected ${REQUIRED_PYTHON_VERSION}, got $PY311_VER"
    missing_required=1
  else
    log "Python ${PY311_VER}"
  fi
fi
log "Node: $NODE_VER"
log "npm: $NPM_VER"
log "OpenSSL: $OPENSSL_VER"
log "Watchman: $WATCHMAN_VER"

log "verifying libffi via pkg-config"
if command -v pkg-config >/dev/null 2>&1 && pkg-config --libs libffi >/dev/null 2>&1; then
  log "libffi detected via pkg-config"
else
  log "libffi not reported by pkg-config; ensure libffi-devel is installed"
fi

log "checking Python venv"
if [[ -d "$ROOT_DIR/.venv" ]]; then
  log "virtualenv present"
else
  log "virtualenv missing; run 'python3.11 -m venv .venv && source .venv/bin/activate' (ensure interpreter reports ${REQUIRED_PYTHON_VERSION})"
fi

if [[ $missing_required -eq 1 ]]; then
  fail "doctor found missing required dependencies"
fi

log "doctor complete"
