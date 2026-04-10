#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_EXEC="${ROOT_DIR}/dist/macos/ACCESSIA Pro.app/Contents/MacOS/ACCESSIA Pro"
STOP_EXEC="${ROOT_DIR}/dist/macos/ACCESSIA Stop.app/Contents/MacOS/ACCESSIA Stop"
MINIMAL_PATH="/usr/bin:/bin:/usr/sbin:/sbin"

log() {
  printf '[verify-package] %s\n' "$*"
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-45}"
  local delay_seconds="${3:-2}"
  local i

  for i in $(seq 1 "${attempts}"); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${delay_seconds}"
  done
  return 1
}

smoke_pages() {
  local page
  local pages=(
    "/"
    "/clients"
    "/projects"
    "/crm"
    "/finances"
    "/devis"
    "/files"
    "/reporting"
    "/prestations"
    "/diagnostics"
    "/notifications"
    "/templates"
    "/today"
    "/time-tracking"
    "/webhooks"
    "/guide"
    "/recherche"
    "/rgpd"
  )

  for page in "${pages[@]}"; do
    curl -fsS "http://127.0.0.1:3001${page}" >/dev/null
  done
}

smoke_api() {
  local endpoint
  local endpoints=(
    "/api/health"
    "/api/dashboard"
    "/api/clients"
    "/api/projects"
    "/api/invoices"
    "/api/quotes"
    "/api/prestations"
    "/api/reporting"
    "/api/backup/list"
    "/api/update/check"
    "/api/files"
    "/api/files/browse?path=/sensia_data"
  )

  for endpoint in "${endpoints[@]}"; do
    curl -fsS "http://127.0.0.1:8001${endpoint}" >/dev/null
  done
}

main() {
  if [ ! -x "${APP_EXEC}" ]; then
    log "Executable app introuvable: ${APP_EXEC}"
    exit 1
  fi

  log "Lancement avec un PATH minimal pour simuler Finder"
  env -i HOME="${HOME}" USER="${USER}" LOGNAME="${LOGNAME:-$USER}" PATH="${MINIMAL_PATH}" ACCESSIA_AUTO_CONFIRM=1 "${APP_EXEC}"

  log "Attente du backend"
  wait_for_http "http://127.0.0.1:8001/api/health"

  log "Attente du frontend"
  wait_for_http "http://127.0.0.1:3001"

  log "Smoke tests HTTP"
  smoke_pages
  smoke_api

  log "Arret propre du stack"
  env -i HOME="${HOME}" USER="${USER}" LOGNAME="${LOGNAME:-$USER}" PATH="${MINIMAL_PATH}" ACCESSIA_AUTO_CONFIRM=1 "${STOP_EXEC}" || true

  log "Verification reussie"
}

main "$@"
