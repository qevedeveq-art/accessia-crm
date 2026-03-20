#!/usr/bin/env bash
set -euo pipefail

echo ""
echo " ACCESSIA Pro — Mode Développement (sans Docker)"
echo " ══════════════════════════════════════════════════"
echo ""

# Vérifier Python
if ! command -v python3 &>/dev/null && ! command -v python &>/dev/null; then
  echo "[ERREUR] Python 3.11+ requis."
  exit 1
fi
PYTHON=$(command -v python3 || command -v python)

# Vérifier Node.js
if ! command -v node &>/dev/null; then
  echo "[ERREUR] Node.js 20+ requis."
  exit 1
fi

# Copier .env si absent
if [ ! -f ".env" ]; then
  cp .env.example .env
fi

# ── Backend ──────────────────────────────────────────────
echo "[1/3] Installation des dépendances Python..."
cd backend
if [ ! -d "venv" ]; then
  $PYTHON -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt -q

echo "[2/3] Démarrage du backend FastAPI (port 8000)..."
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# ── Frontend ─────────────────────────────────────────────
echo "[3/3] Démarrage du frontend Next.js (port 3001)..."
cd frontend
if [ ! -d "node_modules" ]; then
  echo "Installation des dépendances npm..."
  npm install
fi
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

# Ouvrir le navigateur après 5s
sleep 5
if command -v xdg-open &>/dev/null; then
  xdg-open http://localhost:3001 &
elif command -v open &>/dev/null; then
  open http://localhost:3001
fi

# Attendre Ctrl+C et tuer les processus enfants
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo 'Services arrêtés.'; exit 0" INT TERM
wait
