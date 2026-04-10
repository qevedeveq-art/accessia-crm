#!/usr/bin/env bash
set -euo pipefail

setup_runtime_path() {
  local entries=(
    "/opt/homebrew/bin"
    "/usr/local/bin"
    "/Applications/Docker.app/Contents/Resources/bin"
    "${HOME}/.docker/bin"
    "/usr/bin"
    "/bin"
    "/usr/sbin"
    "/sbin"
  )
  local path_joined=""
  local entry

  for entry in "${entries[@]}"; do
    if [ -d "${entry}" ]; then
      if [ -n "${path_joined}" ]; then
        path_joined="${path_joined}:${entry}"
      else
        path_joined="${entry}"
      fi
    fi
  done

  export PATH="${path_joined}"
}

setup_runtime_path

APP_NAME="ACCESSIA Pro"
APP_SLUG="accessia-pro"
APP_SUPPORT_DIR="${HOME}/Library/Application Support/${APP_NAME}"
WORKSPACE_DIR="${APP_SUPPORT_DIR}/workspace"
CRM_DIR="${WORKSPACE_DIR}/CRM"
LOG_DIR="${APP_SUPPORT_DIR}/logs"
LOG_FILE="${LOG_DIR}/launcher.log"

RUNTIME_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESOURCES_DIR="$(cd "${RUNTIME_DIR}/.." && pwd)"
PAYLOAD_DIR="${RESOURCES_DIR}/payload"
PAYLOAD_ROOT="${PAYLOAD_DIR}/root"
VERSION_FILE="${PAYLOAD_DIR}/version.txt"
REVISION_FILE="${PAYLOAD_DIR}/revision.txt"
APP_VERSION="0.0.0"
APP_REVISION="0"
INSTALLED_VERSION_FILE="${APP_SUPPORT_DIR}/installed-version.txt"
INSTALLED_REVISION_FILE="${APP_SUPPORT_DIR}/installed-revision.txt"

COMPOSE_BIN=()
DATA_ITEMS=(
  "01_COMMERCIAL"
  "02_COMPTABILITE"
  "03_JURIDIQUE"
  "04_MARKETING"
  "05_PROJETS"
  "06_FORMATION"
  "07_ADMINISTRATIF"
  "_ACCESSIA_APP"
)

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

log() {
  mkdir -p "${LOG_DIR}"
  printf '[%s] %s\n' "$(timestamp)" "$*" | tee -a "${LOG_FILE}" >&2
}

escape_applescript() {
  local value="${1//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "${value}"
}

notify() {
  local title message subtitle
  title="$(escape_applescript "${1}")"
  message="$(escape_applescript "${2}")"
  subtitle="$(escape_applescript "${3:-}")"
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"${message}\" with title \"${title}\" subtitle \"${subtitle}\"" >/dev/null 2>&1 || true
  fi
}

alert() {
  local title message
  title="$(escape_applescript "${1}")"
  message="$(escape_applescript "${2}")"
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display alert \"${title}\" message \"${message}\" buttons {\"OK\"} default button \"OK\"" >/dev/null 2>&1 || true
  fi
  log "${1}: ${2}"
}

confirm() {
  local message action_raw action_label choice
  if [ "${ACCESSIA_AUTO_CONFIRM:-0}" = "1" ]; then
    return 0
  fi
  message="$(escape_applescript "${1}")"
  action_raw="${2:-Continuer}"
  action_label="$(escape_applescript "${action_raw}")"
  if ! command -v osascript >/dev/null 2>&1; then
    return 1
  fi
  choice="$(osascript -e "button returned of (display dialog \"${message}\" buttons {\"Annuler\", \"${action_label}\"} default button \"${action_label}\" with title \"${APP_NAME}\")" 2>/dev/null || true)"
  [[ "${choice}" == "${action_raw}" ]]
}

fail() {
  alert "${APP_NAME}" "${1}"
  exit 1
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
    return 0
  fi
  date '+%s' | shasum -a 256 | awk '{print $1}'
}

ensure_workspace_dirs() {
  mkdir -p "${APP_SUPPORT_DIR}" "${WORKSPACE_DIR}" "${LOG_DIR}"
}

seed_data() {
  local item src dest
  for item in "${DATA_ITEMS[@]}"; do
    src="${PAYLOAD_ROOT}/${item}"
    dest="${WORKSPACE_DIR}/${item}"
    if [ ! -e "${src}" ]; then
      continue
    fi
    mkdir -p "${dest}"
    if [ -d "${src}" ]; then
      rsync -a --ignore-existing --exclude '.DS_Store' "${src}/" "${dest}/"
    else
      [ -e "${dest}" ] || cp "${src}" "${dest}"
    fi
  done
}

install_workspace_if_needed() {
  ensure_workspace_dirs

  if [ ! -f "${CRM_DIR}/docker-compose.yml" ]; then
    log "Installation initiale du workspace ${APP_VERSION} dans ${WORKSPACE_DIR}"
    mkdir -p "${CRM_DIR}"
    rsync -a --delete \
      --exclude '.env' \
      --exclude '.DS_Store' \
      --exclude 'backend/venv' \
	      --exclude 'frontend/node_modules' \
	      --exclude 'frontend/.next' \
	      --exclude 'dist' \
	      "${PAYLOAD_ROOT}/CRM/" "${CRM_DIR}/"
    printf '%s\n' "${APP_VERSION}" > "${INSTALLED_VERSION_FILE}"
    printf '%s\n' "${APP_REVISION}" > "${INSTALLED_REVISION_FILE}"
  else
    sync_workspace_code_if_needed
  fi

  seed_data
  ensure_env_file
}

workspace_repo_is_dirty() {
  if [ ! -d "${CRM_DIR}/.git" ] || ! command -v git >/dev/null 2>&1; then
    return 1
  fi
  [ -n "$(git -C "${CRM_DIR}" status --porcelain --untracked-files=no 2>/dev/null)" ]
}

read_file_value() {
  local file_path="${1}"
  if [ -f "${file_path}" ]; then
    tr -d '\n' < "${file_path}"
  fi
}

APP_VERSION="$(read_file_value "${VERSION_FILE}")"
APP_VERSION="${APP_VERSION:-0.0.0}"
APP_REVISION="$(read_file_value "${REVISION_FILE}")"
APP_REVISION="${APP_REVISION:-0}"

sync_workspace_code_if_needed() {
  local installed_revision
  installed_revision="$(read_file_value "${INSTALLED_REVISION_FILE}")"

  if [ "${installed_revision}" = "${APP_REVISION}" ]; then
    return 0
  fi

  if workspace_repo_is_dirty; then
    log "Workspace local modifie detecte, synchronisation du code embarque forcee"
  fi

  log "Synchronisation du code embarque vers le workspace (${installed_revision:-aucune} -> ${APP_REVISION})"
  rsync -a --delete \
    --exclude '.env' \
    --exclude '.git' \
    --exclude '.DS_Store' \
    --exclude 'backend/venv' \
    --exclude 'frontend/node_modules' \
    --exclude 'frontend/.next' \
    --exclude 'dist' \
    "${PAYLOAD_ROOT}/CRM/" "${CRM_DIR}/"

  printf '%s\n' "${APP_VERSION}" > "${INSTALLED_VERSION_FILE}"
  printf '%s\n' "${APP_REVISION}" > "${INSTALLED_REVISION_FILE}"
}

ensure_env_file() {
  local env_file secret tmp_file
  env_file="${CRM_DIR}/.env"
  if [ -f "${env_file}" ]; then
    return 0
  fi

  if [ -f "${CRM_DIR}/.env.example" ]; then
    cp "${CRM_DIR}/.env.example" "${env_file}"
  else
    cat > "${env_file}" <<EOF
SENSIA_BASE_DIR=${WORKSPACE_DIR}
SECRET_KEY=$(generate_secret)
NEXT_PUBLIC_API_URL=http://localhost:8001
EOF
    return 0
  fi

  secret="$(generate_secret)"
  tmp_file="$(mktemp)"
  awk -v workspace="${WORKSPACE_DIR}" -v secret="${secret}" '
    BEGIN { api_written = 0 }
    /^SENSIA_BASE_DIR=/ { print "SENSIA_BASE_DIR=" workspace; next }
    /^SECRET_KEY=/ { print "SECRET_KEY=" secret; next }
    /^NEXT_PUBLIC_API_URL=/ { print "NEXT_PUBLIC_API_URL=http://localhost:8001"; api_written = 1; next }
    { print }
    END {
      if (!api_written) {
        print "NEXT_PUBLIC_API_URL=http://localhost:8001"
      }
    }
  ' "${env_file}" > "${tmp_file}"
  mv "${tmp_file}" "${env_file}"
}

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_BIN=(docker compose)
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_BIN=(docker-compose)
    return 0
  fi
  fail "Docker Compose est introuvable. Installez Docker Desktop puis relancez ${APP_NAME}."
}

compose() {
  (cd "${CRM_DIR}" && COMPOSE_PROJECT_NAME="${APP_SLUG}" "${COMPOSE_BIN[@]}" "$@")
}

ensure_docker_installed() {
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi

  if command -v open >/dev/null 2>&1; then
    open "https://www.docker.com/products/docker-desktop/" >/dev/null 2>&1 || true
  fi
  fail "Docker Desktop est requis pour executer ${APP_NAME}."
}

ensure_docker_running() {
  local attempt
  ensure_docker_installed

  if docker info >/dev/null 2>&1; then
    return 0
  fi

  log "Docker Desktop n'est pas demarre, tentative d'ouverture"
  if command -v open >/dev/null 2>&1; then
    open -a Docker >/dev/null 2>&1 || true
  fi

  for attempt in $(seq 1 24); do
    sleep 5
    if docker info >/dev/null 2>&1; then
      log "Docker Desktop est pret"
      return 0
    fi
  done

  fail "Docker Desktop n'a pas demarre. Ouvrez-le manuellement, attendez qu'il soit pret, puis relancez ${APP_NAME}."
}

check_port_conflict() {
  local port service pid cmd safe_cmd
  port="${1}"
  service="${2}"
  pid="$(lsof -ti :"${port}" 2>/dev/null | head -n 1 || true)"

  if [ -z "${pid}" ]; then
    return 0
  fi

  cmd="$(ps -p "${pid}" -o comm= 2>/dev/null | tr -d '\n' || true)"
  if [[ "${cmd}" =~ docker|com\.docker|vpnkit ]]; then
    return 0
  fi

  safe_cmd="${cmd:-processus inconnu}"
  if ! confirm "Le port ${port} est deja utilise par ${safe_cmd} (PID ${pid}). ${APP_NAME} en a besoin pour ${service}. Voulez-vous arreter ce processus ?" "Arreter le processus"; then
    fail "Le port ${port} est occupe. Fermez l'application concernee puis relancez ${APP_NAME}."
  fi

  log "Arret du processus ${safe_cmd} (PID ${pid}) sur le port ${port}"
  kill "${pid}" >/dev/null 2>&1 || true
  sleep 2
  if kill -0 "${pid}" >/dev/null 2>&1; then
    kill -9 "${pid}" >/dev/null 2>&1 || true
  fi
}

wait_for_http() {
  local url attempts delay_seconds attempt
  url="${1}"
  attempts="${2:-30}"
  delay_seconds="${3:-2}"

  for attempt in $(seq 1 "${attempts}"); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${delay_seconds}"
  done
  return 1
}

is_running() {
  curl -fsS "http://localhost:8001/api/health" >/dev/null 2>&1 && \
  curl -fsS "http://localhost:3001" >/dev/null 2>&1
}

open_frontend() {
  if command -v open >/dev/null 2>&1; then
    open "http://localhost:3001" >/dev/null 2>&1 || true
  fi
}

start_stack() {
  detect_compose

  if is_running; then
    log "ACCESSIA Pro est deja disponible"
    open_frontend
    return 0
  fi

  check_port_conflict 8001 "l'API backend"
  check_port_conflict 3001 "l'interface web"

  log "Demarrage du backend"
  compose up -d --build backend >> "${LOG_FILE}" 2>&1

  if ! wait_for_http "http://localhost:8001/api/health" 45 2; then
    fail "Le backend FastAPI n'a pas demarre correctement. Consultez ${LOG_FILE}."
  fi

  log "Demarrage du frontend"
  compose up -d --build frontend >> "${LOG_FILE}" 2>&1

  if ! wait_for_http "http://localhost:3001" 45 2; then
    fail "Le frontend Next.js n'a pas demarre correctement. Consultez ${LOG_FILE}."
  fi

  open_frontend
  notify "${APP_NAME}" "Application prete" "http://localhost:3001"
  log "ACCESSIA Pro est pret"
}

stop_stack() {
  detect_compose
  if [ ! -d "${CRM_DIR}" ]; then
    log "Aucun workspace a arreter"
    return 0
  fi

  log "Arret des services Docker"
  compose down >> "${LOG_FILE}" 2>&1
  notify "${APP_NAME}" "Services arretes" ""
}
