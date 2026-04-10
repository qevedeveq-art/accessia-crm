#!/usr/bin/env bash
set -euo pipefail

echo ""
echo " ACCESSIA Pro — Mode Développement (sans Docker)"
echo " ══════════════════════════════════════════════════"
echo ""

# ── Détection Apple Silicon ────────────────────────────────
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  echo "  ✦ Apple Silicon détecté — binaires ARM64 natifs utilisés"
  echo ""
fi

# ── Vérifier Python ────────────────────────────────────────
if command -v python3.11 &>/dev/null; then
  PYTHON="python3.11"
elif command -v python3 &>/dev/null; then
  PYTHON="python3"
elif command -v python &>/dev/null; then
  PYTHON="python"
else
  echo "[ERREUR] Python 3.11+ requis."
  echo "→ brew install python@3.11"
  exit 1
fi

PY_VERSION=$($PYTHON --version 2>&1 | awk '{print $2}')
echo "  Python : $PY_VERSION"

# ── Vérifier Node.js ───────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "[ERREUR] Node.js 20+ requis."
  echo "→ brew install node@20"
  exit 1
fi

NODE_VERSION=$(node --version)
echo "  Node.js: $NODE_VERSION"
echo ""

# ── Copier .env si absent ──────────────────────────────────
if [ ! -f ".env" ]; then
  cp .env.example .env
  # Préremplir le chemin macOS automatiquement
  sed -i '' "s|/home/votre_utilisateur/MonDossierTravail|$HOME|g" .env 2>/dev/null || true
  echo "[INFO] .env créé avec chemin macOS : $HOME"
fi

# ── Backend ───────────────────────────────────────────────
echo "[1/3] Préparation du backend Python..."
cd backend
if [ ! -d "venv" ]; then
  echo "  Création du virtualenv ARM64..."
  $PYTHON -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt -q --upgrade 2>/dev/null || pip install -r requirements.txt -q

echo "[2/3] Démarrage du backend FastAPI (port 8000)..."
# En dev : 1 worker avec reload + uvloop pour les perfs ARM64
uvicorn main:app \
  --reload \
  --port 8000 \
  --loop uvloop \
  --http httptools \
  --log-level info &
BACKEND_PID=$!
cd ..

# ── Frontend ──────────────────────────────────────────────
echo "[3/3] Démarrage du frontend Next.js (port 3001)..."
cd frontend
if [ ! -d "node_modules" ]; then
  echo "  Installation des dépendances npm..."
  npm install
fi

# Variables d'env pour les perfs ARM64
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="--max-old-space-size=4096"

npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "══════════════════════════════════════════════════"
echo "  ✅  ACCESSIA Pro démarré en mode DEV !"
echo ""
echo "  → Application  : http://localhost:3001"
echo "  → API (Swagger): http://localhost:8000/docs"
echo ""
echo "  Ctrl+C pour arrêter les deux processus."
echo "══════════════════════════════════════════════════"
echo ""

# ── Ouvrir le navigateur après démarrage ─────────────────
sleep 4
if command -v open &>/dev/null; then
  open http://localhost:3001
elif command -v xdg-open &>/dev/null; then
  xdg-open http://localhost:3001 &
fi

# Attendre Ctrl+C et tuer les processus enfants proprement
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; deactivate 2>/dev/null; echo ''; echo '  Services arrêtés.'; exit 0" INT TERM
wait
