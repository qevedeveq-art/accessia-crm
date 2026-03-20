#!/usr/bin/env bash
set -euo pipefail

echo ""
echo " ╔═══════════════════════════════════════════╗"
echo " ║         ACCESSIA Pro v1.2.0               ║"
echo " ║   Conseil IA · PME et Entrepreneurs       ║"
echo " ╚═══════════════════════════════════════════╝"
echo ""

# Vérifier Docker
if ! command -v docker &>/dev/null; then
  echo "[ERREUR] Docker n'est pas installé."
  echo "→ https://www.docker.com/products/docker-desktop"
  exit 1
fi

# Vérifier docker compose (v2) ou docker-compose (v1)
if docker compose version &>/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose &>/dev/null; then
  DC="docker-compose"
else
  echo "[ERREUR] docker compose introuvable."
  exit 1
fi

# Copier .env si absent
if [ ! -f ".env" ]; then
  echo "[INFO] Copie de .env.example → .env"
  cp .env.example .env
  echo "[INFO] Pensez à personnaliser .env avant de continuer."
  echo ""
fi

echo "[1/2] Démarrage du backend FastAPI..."
$DC up -d backend

echo ""
echo "[2/2] Démarrage du frontend Next.js..."
$DC up -d frontend

echo ""
echo "══════════════════════════════════════════════════"
echo "  ✅  ACCESSIA Pro est démarré !"
echo ""
echo "  → Application  : http://localhost:3001"
echo "  → API (Swagger): http://localhost:8001/docs"
echo "══════════════════════════════════════════════════"
echo ""

# Ouvrir le navigateur selon l'OS
if command -v xdg-open &>/dev/null; then
  xdg-open http://localhost:3001 &
elif command -v open &>/dev/null; then
  open http://localhost:3001
fi
