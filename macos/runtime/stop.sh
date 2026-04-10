#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/accessia-common.sh" ]; then
  # shellcheck source=./accessia-common.sh
  source "${SCRIPT_DIR}/accessia-common.sh"
else
  # shellcheck source=./accessia-common.sh
  source "${SCRIPT_DIR}/../Resources/runtime/accessia-common.sh"
fi

main() {
  if ! confirm "Voulez-vous arreter ACCESSIA Pro ?" "Arreter"; then
    exit 0
  fi
  stop_stack
}

main "$@"
