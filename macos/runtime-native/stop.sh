#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  ACCESSIA Stop — Arrête les services natifs ET Docker
# ═══════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Charger le runtime natif (commun.sh)
if [ -f "${SCRIPT_DIR}/common.sh" ]; then
  # shellcheck source=./common.sh
  source "${SCRIPT_DIR}/common.sh"
elif [ -f "${SCRIPT_DIR}/../Resources/runtime-native/common.sh" ]; then
  # shellcheck source=./common.sh
  source "${SCRIPT_DIR}/../Resources/runtime-native/common.sh"
else
  echo "Impossible de trouver common.sh" >&2
  exit 1
fi

# Charger aussi le runtime Docker si disponible
DOCKER_COMMON=""
if [ -f "${SCRIPT_DIR}/../runtime/accessia-common.sh" ]; then
  DOCKER_COMMON="${SCRIPT_DIR}/../runtime/accessia-common.sh"
elif [ -f "${SCRIPT_DIR}/../Resources/runtime/accessia-common.sh" ]; then
  DOCKER_COMMON="${SCRIPT_DIR}/../Resources/runtime/accessia-common.sh"
fi

stop_docker() {
  [ -z "${DOCKER_COMMON}" ] && return 0
  # shellcheck source=../runtime/accessia-common.sh
  (
    source "${DOCKER_COMMON}"
    if detect_compose 2>/dev/null && [ -d "${CRM_DIR}" ]; then
      compose down >> "${LOG_FILE}" 2>&1 || true
      log "Services Docker arrêtés"
    fi
  ) 2>/dev/null || true
}

main() {
  local native_running=0 docker_running=0 msg

  # Détecter ce qui tourne
  is_pid_alive "${BACKEND_PID_FILE}"  2>/dev/null && native_running=1 || true
  is_pid_alive "${FRONTEND_PID_FILE}" 2>/dev/null && native_running=1 || true
  curl -fsS "http://localhost:8001/api/health" >/dev/null 2>&1 && {
    is_pid_alive "${BACKEND_PID_FILE}" 2>/dev/null || docker_running=1
  } || true

  if [ "${native_running}" -eq 0 ] && [ "${docker_running}" -eq 0 ]; then
    notify "${APP_NAME}" "Aucun service actif" ""
    log "Aucun service à arrêter"
    return 0
  fi

  msg="Voulez-vous arrêter ACCESSIA Pro ?"
  if ! confirm "${msg}" "Arrêter"; then
    exit 0
  fi

  [ "${native_running}" -eq 1 ] && stop_stack_native
  [ "${docker_running}" -eq 1 ] && stop_docker
}

main "$@"
