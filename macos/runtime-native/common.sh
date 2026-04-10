#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  ACCESSIA Pro — Runtime natif (sans Docker)
#  Fonctions partagées pour launch.sh et stop.sh
# ═══════════════════════════════════════════════════════════
set -euo pipefail

setup_runtime_path() {
  local entries=(
    "/opt/homebrew/bin"
    "/opt/homebrew/sbin"
    "/usr/local/bin"
    "/usr/local/sbin"
    "/usr/bin"
    "/bin"
    "/usr/sbin"
    "/sbin"
  )
  local p=""
  for entry in "${entries[@]}"; do
    [ -d "${entry}" ] && p="${p:+${p}:}${entry}"
  done
  export PATH="${p}"
}

setup_runtime_path

# ── Constantes ───────────────────────────────────────────────────
APP_NAME="ACCESSIA Pro"
APP_SUPPORT_DIR="${HOME}/Library/Application Support/${APP_NAME}"
WORKSPACE_DIR="${APP_SUPPORT_DIR}/workspace"
CRM_DIR="${WORKSPACE_DIR}/CRM"
LOG_DIR="${APP_SUPPORT_DIR}/logs"
LOG_FILE="${LOG_DIR}/launcher-native.log"

BACKEND_PID_FILE="${APP_SUPPORT_DIR}/backend-native.pid"
FRONTEND_PID_FILE="${APP_SUPPORT_DIR}/frontend-native.pid"
SECRET_FILE="${APP_SUPPORT_DIR}/secret.key"

INSTALLED_VERSION_FILE="${APP_SUPPORT_DIR}/installed-version-native.txt"
INSTALLED_REVISION_FILE="${APP_SUPPORT_DIR}/installed-revision-native.txt"
REQ_HASH_FILE="${APP_SUPPORT_DIR}/.req_hash_native"
PKG_HASH_FILE="${APP_SUPPORT_DIR}/.pkg_hash_native"
BUILD_HASH_FILE="${APP_SUPPORT_DIR}/.build_hash_native"

# BASH_SOURCE[0] = chemin du fichier courant (bash uniquement)
_COMMON_SELF="${BASH_SOURCE[0]:-${(%):-%x}}"   # bash: BASH_SOURCE, zsh: %x
_COMMON_SELF="${_COMMON_SELF:-${0}}"            # fallback si aucun
RUNTIME_DIR="$(cd "$(dirname "${_COMMON_SELF}")" && pwd)"
RESOURCES_DIR="$(cd "${RUNTIME_DIR}/.." && pwd)"
PAYLOAD_DIR="${RESOURCES_DIR}/payload"
PAYLOAD_ROOT="${PAYLOAD_DIR}/root"
VERSION_FILE="${PAYLOAD_DIR}/version.txt"
REVISION_FILE="${PAYLOAD_DIR}/revision.txt"

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

# ── Utilitaires ──────────────────────────────────────────────────
timestamp() { date '+%Y-%m-%d %H:%M:%S'; }

log() {
  mkdir -p "${LOG_DIR}"
  printf '[%s] %s\n' "$(timestamp)" "$*" | tee -a "${LOG_FILE}" >&2
}

escape_applescript() {
  local v="${1//\\/\\\\}"; v="${v//\"/\\\"}"; printf '%s' "${v}"
}

notify() {
  local t m s
  t="$(escape_applescript "${1}")"
  m="$(escape_applescript "${2}")"
  s="$(escape_applescript "${3:-}")"
  osascript -e "display notification \"${m}\" with title \"${t}\" subtitle \"${s}\"" \
    >/dev/null 2>&1 || true
}

alert() {
  local t m
  t="$(escape_applescript "${1}")"
  m="$(escape_applescript "${2}")"
  osascript -e "display alert \"${t}\" message \"${m}\" buttons {\"OK\"} default button \"OK\"" \
    >/dev/null 2>&1 || true
  log "${1}: ${2}"
}

confirm() {
  local msg action_raw action choice
  [ "${ACCESSIA_AUTO_CONFIRM:-0}" = "1" ] && return 0
  msg="$(escape_applescript "${1}")"
  action_raw="${2:-Continuer}"
  action="$(escape_applescript "${action_raw}")"
  command -v osascript >/dev/null 2>&1 || return 1
  choice="$(osascript -e "button returned of (display dialog \"${msg}\" buttons {\"Annuler\", \"${action}\"} default button \"${action}\" with title \"${APP_NAME}\")" 2>/dev/null || true)"
  [[ "${choice}" == "${action_raw}" ]]
}

fail() {
  alert "${APP_NAME}" "${1}"
  exit 1
}

read_file_value() {
  [ -f "${1}" ] && tr -d '\n' < "${1}" || true
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import secrets; print(secrets.token_hex(32))"
  else
    date '+%s' | shasum -a 256 | awk '{print $1}'
  fi
}

get_or_create_secret() {
  if [ -f "${SECRET_FILE}" ]; then
    cat "${SECRET_FILE}"
    return 0
  fi
  mkdir -p "${APP_SUPPORT_DIR}"
  local s
  s="$(generate_secret)"
  printf '%s' "${s}" > "${SECRET_FILE}"
  chmod 600 "${SECRET_FILE}"
  printf '%s' "${s}"
}

# ── Workspace ────────────────────────────────────────────────────
APP_VERSION="$(read_file_value "${VERSION_FILE}")"
APP_VERSION="${APP_VERSION:-0.0.0}"
APP_REVISION="$(read_file_value "${REVISION_FILE}")"
APP_REVISION="${APP_REVISION:-0}"

ensure_workspace_dirs() {
  mkdir -p "${APP_SUPPORT_DIR}" "${WORKSPACE_DIR}" "${LOG_DIR}"
  mkdir -p "${WORKSPACE_DIR}/_ACCESSIA_APP"
}

seed_data() {
  local item src dest
  for item in "${DATA_ITEMS[@]}"; do
    src="${PAYLOAD_ROOT}/${item}"
    dest="${WORKSPACE_DIR}/${item}"
    [ -e "${src}" ] || continue
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
    log "Installation initiale du workspace ${APP_VERSION}"
    notify "${APP_NAME}" "Installation initiale en cours…" "Première exécution"
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
}

sync_workspace_code_if_needed() {
  local installed_revision
  installed_revision="$(read_file_value "${INSTALLED_REVISION_FILE}")"
  [ "${installed_revision}" = "${APP_REVISION}" ] && return 0

  log "Synchronisation du code embarqué → workspace (${installed_revision:-–} → ${APP_REVISION})"
  rsync -a --delete \
    --exclude '.env' \
    --exclude '.git' \
    --exclude '.DS_Store' \
    --exclude 'backend/venv' \
    --exclude 'frontend/node_modules' \
    --exclude 'frontend/.next' \
    --exclude 'dist' \
    "${PAYLOAD_ROOT}/CRM/" "${CRM_DIR}/"

  # Invalider les hashes pour forcer reinstall/rebuild
  rm -f "${REQ_HASH_FILE}" "${PKG_HASH_FILE}" "${BUILD_HASH_FILE}"
  printf '%s\n' "${APP_VERSION}" > "${INSTALLED_VERSION_FILE}"
  printf '%s\n' "${APP_REVISION}" > "${INSTALLED_REVISION_FILE}"
}

# ── Python ───────────────────────────────────────────────────────
find_python() {
  local candidates=("python3.12" "python3.11" "python3.10" "python3")
  for py in "${candidates[@]}"; do
    if command -v "${py}" >/dev/null 2>&1; then
      printf '%s' "$(command -v "${py}")"
      return 0
    fi
  done
  fail "Python 3.10+ introuvable. Installez-le via : brew install python@3.12"
}

install_python_deps() {
  local venv_dir="${CRM_DIR}/backend/venv"
  local req_file="${CRM_DIR}/backend/requirements-native.txt"

  # Fallback si requirements-native.txt absent
  [ -f "${req_file}" ] || req_file="${CRM_DIR}/backend/requirements.txt"

  local current_hash
  current_hash="$(shasum -a 256 "${req_file}" 2>/dev/null | awk '{print $1}' || true)"
  local stored_hash
  stored_hash="$(read_file_value "${REQ_HASH_FILE}")"

  local needs_install=0
  [ ! -d "${venv_dir}" ] && needs_install=1
  [ "${current_hash}" != "${stored_hash}" ] && needs_install=1

  if [ "${needs_install}" -eq 0 ]; then
    return 0
  fi

  log "Préparation de l'environnement Python…"
  notify "${APP_NAME}" "Installation des dépendances Python…" "Patientez quelques instants"

  if [ ! -d "${venv_dir}" ]; then
    local py
    py="$(find_python)"
    log "Création du virtualenv avec ${py}"
    "${py}" -m venv "${venv_dir}"
  fi

  "${venv_dir}/bin/pip" install --upgrade pip -q 2>>"${LOG_FILE}"
  # Essai avec --no-deps sur les packages potentiellement incompatibles
  "${venv_dir}/bin/pip" install -r "${req_file}" -q 2>>"${LOG_FILE}" \
    || "${venv_dir}/bin/pip" install -r "${req_file}" 2>>"${LOG_FILE}"

  printf '%s' "${current_hash}" > "${REQ_HASH_FILE}"
  log "Dépendances Python installées"
}

# ── Node.js ──────────────────────────────────────────────────────
find_node() {
  if command -v node >/dev/null 2>&1; then
    printf '%s' "$(command -v node)"
    return 0
  fi
  fail "Node.js introuvable. Installez-le via : brew install node"
}

find_npm() {
  if command -v npm >/dev/null 2>&1; then
    printf '%s' "$(command -v npm)"
    return 0
  fi
  fail "npm introuvable. Installez Node.js via : brew install node"
}

install_node_deps() {
  local frontend_dir="${CRM_DIR}/frontend"

  local current_hash
  current_hash="$(shasum -a 256 "${frontend_dir}/package-lock.json" 2>/dev/null | awk '{print $1}' || true)"
  local stored_hash
  stored_hash="$(read_file_value "${PKG_HASH_FILE}")"

  if [ -d "${frontend_dir}/node_modules" ] && [ "${current_hash}" = "${stored_hash}" ]; then
    return 0
  fi

  log "Installation des dépendances Node.js…"
  notify "${APP_NAME}" "Installation des modules Node.js…" "Patientez quelques instants"

  local npm_bin
  npm_bin="$(find_npm)"
  (cd "${frontend_dir}" && "${npm_bin}" install --legacy-peer-deps --prefer-offline -q 2>>"${LOG_FILE}")

  printf '%s' "${current_hash}" > "${PKG_HASH_FILE}"
  log "Dépendances Node.js installées"
}

build_frontend_if_needed() {
  local frontend_dir="${CRM_DIR}/frontend"
  local standalone_server="${frontend_dir}/.next/standalone/server.js"

  # Hash des sources pertinentes
  # Utilise while+read pour gérer correctement les chemins avec espaces
  local current_hash
  current_hash="$(find "${frontend_dir}/src" "${frontend_dir}/public" \
      "${frontend_dir}/package.json" "${frontend_dir}/next.config.js" \
      "${frontend_dir}/tailwind.config.js" \
      -type f 2>/dev/null | sort | while IFS= read -r f; do
        shasum -a 256 "${f}" 2>/dev/null
      done | shasum -a 256 | awk '{print $1}')"
  local stored_hash
  stored_hash="$(read_file_value "${BUILD_HASH_FILE}")"

  if [ -f "${standalone_server}" ] && [ "${current_hash}" = "${stored_hash}" ]; then
    return 0
  fi

  log "Build du frontend Next.js (2-3 minutes)…"
  notify "${APP_NAME}" "Build de l'interface en cours…" "Premier lancement — patientez"

  local npm_bin
  npm_bin="$(find_npm)"
  (cd "${frontend_dir}" && \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_URL=http://localhost:8001 \
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048" \
    "${npm_bin}" run build 2>>"${LOG_FILE}")

  # Copier les assets statiques dans le répertoire standalone
  local standalone_dir="${frontend_dir}/.next/standalone"
  rsync -a --delete "${frontend_dir}/.next/static/" "${standalone_dir}/.next/static/" 2>>"${LOG_FILE}"
  rsync -a --delete "${frontend_dir}/public/" "${standalone_dir}/public/" 2>>"${LOG_FILE}"

  printf '%s' "${current_hash}" > "${BUILD_HASH_FILE}"
  log "Frontend buildé"
}

# ── Services natifs ──────────────────────────────────────────────
is_pid_alive() {
  local pid_file="${1}"
  [ -f "${pid_file}" ] || return 1
  local pid
  pid="$(cat "${pid_file}")"
  [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null
}

kill_pid_file() {
  local pid_file="${1}"
  [ -f "${pid_file}" ] || return 0
  local pid
  pid="$(cat "${pid_file}")"
  [ -z "${pid}" ] && { rm -f "${pid_file}"; return 0; }
  if kill -0 "${pid}" 2>/dev/null; then
    kill "${pid}" 2>/dev/null || true
    sleep 2
    kill -0 "${pid}" 2>/dev/null && kill -9 "${pid}" 2>/dev/null || true
  fi
  rm -f "${pid_file}"
}

check_port_conflict() {
  local port="${1}" service="${2}"
  local pid
  pid="$(lsof -ti :"${port}" 2>/dev/null | head -n 1 || true)"
  [ -z "${pid}" ] && return 0

  local cmd
  cmd="$(ps -p "${pid}" -o comm= 2>/dev/null | tr -d '\n' || true)"
  local safe_cmd="${cmd:-processus inconnu}"

  if ! confirm "Le port ${port} est utilisé par ${safe_cmd} (PID ${pid}). Arrêter ce processus ?" "Arrêter"; then
    fail "Port ${port} occupé. Fermez ${safe_cmd} puis relancez ${APP_NAME}."
  fi
  kill "${pid}" 2>/dev/null || true
  sleep 2
  kill -0 "${pid}" 2>/dev/null && kill -9 "${pid}" 2>/dev/null || true
}

start_native_backend() {
  local backend_dir="${CRM_DIR}/backend"
  local venv_dir="${backend_dir}/venv"
  local secret
  secret="$(get_or_create_secret)"

  log "Démarrage du backend FastAPI (port 8001)…"
  mkdir -p "${WORKSPACE_DIR}/_ACCESSIA_APP"

  (cd "${backend_dir}" && \
    SENSIA_BASE_DIR="${WORKSPACE_DIR}" \
    DATABASE_URL="sqlite://///${WORKSPACE_DIR}/_ACCESSIA_APP/sensia.db" \
    SECRET_KEY="${secret}" \
    GIT_REPO_PATH="${CRM_DIR}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    "${venv_dir}/bin/uvicorn" main:app \
      --host 127.0.0.1 \
      --port 8001 \
      --workers 1 \
      --loop asyncio \
      --no-access-log \
      >> "${LOG_FILE}" 2>&1) &

  local pid=$!
  printf '%s' "${pid}" > "${BACKEND_PID_FILE}"
  log "Backend PID ${pid}"
}

start_native_frontend() {
  local frontend_dir="${CRM_DIR}/frontend"
  local standalone_dir="${frontend_dir}/.next/standalone"
  local node_bin
  node_bin="$(find_node)"

  log "Démarrage du frontend Next.js (port 3001)…"

  PORT=3001 \
  HOSTNAME=127.0.0.1 \
  NEXT_PUBLIC_API_URL=http://localhost:8001 \
  NODE_OPTIONS="--max-old-space-size=512" \
  NEXT_TELEMETRY_DISABLED=1 \
    "${node_bin}" "${standalone_dir}/server.js" \
      >> "${LOG_FILE}" 2>&1 &

  local pid=$!
  printf '%s' "${pid}" > "${FRONTEND_PID_FILE}"
  log "Frontend PID ${pid}"
}

wait_for_http() {
  local url="${1}" attempts="${2:-60}" delay="${3:-2}" attempt
  for attempt in $(seq 1 "${attempts}"); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${delay}"
  done
  return 1
}

is_running() {
  curl -fsS "http://localhost:8001/api/health" >/dev/null 2>&1 && \
  curl -fsS "http://localhost:3001" >/dev/null 2>&1
}

open_frontend() {
  command -v open >/dev/null 2>&1 && open "http://localhost:3001" >/dev/null 2>&1 || true
}

# ── Stack ────────────────────────────────────────────────────────
start_stack_native() {
  if is_running; then
    log "ACCESSIA Pro est déjà disponible"
    open_frontend
    return 0
  fi

  check_port_conflict 8001 "l'API backend"
  check_port_conflict 3001 "l'interface web"

  install_python_deps
  install_node_deps
  build_frontend_if_needed

  start_native_backend

  if ! wait_for_http "http://localhost:8001/api/health" 60 2; then
    fail "Le backend n'a pas démarré. Consultez ${LOG_FILE}."
  fi

  start_native_frontend

  if ! wait_for_http "http://localhost:3001" 60 2; then
    fail "Le frontend n'a pas démarré. Consultez ${LOG_FILE}."
  fi

  open_frontend
  notify "${APP_NAME}" "Application prête" "http://localhost:3001"
  log "ACCESSIA Pro est prêt"
}

stop_stack_native() {
  log "Arrêt des services natifs…"
  kill_pid_file "${FRONTEND_PID_FILE}"
  kill_pid_file "${BACKEND_PID_FILE}"
  notify "${APP_NAME}" "Services arrêtés" ""
  log "Services arrêtés"
}
