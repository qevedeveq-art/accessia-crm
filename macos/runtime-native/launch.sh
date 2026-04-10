#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  ACCESSIA Pro — Lanceur natif (sans Docker)
# ═══════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/common.sh" ]; then
  # shellcheck source=./common.sh
  source "${SCRIPT_DIR}/common.sh"
else
  # Depuis le bundle .app
  # shellcheck source=./common.sh
  source "${SCRIPT_DIR}/../Resources/runtime-native/common.sh"
fi

main() {
  install_workspace_if_needed
  start_stack_native
}

main "$@"
