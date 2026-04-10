#!/usr/bin/env bash
set -euo pipefail

echo "Arrêt de ACCESSIA Pro..."

if docker compose version &>/dev/null 2>&1; then
  docker compose down
elif command -v docker-compose &>/dev/null; then
  docker-compose down
else
  echo "[ERREUR] docker compose introuvable."
  exit 1
fi

echo "✅ Services arrêtés."
