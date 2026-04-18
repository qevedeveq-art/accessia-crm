#!/usr/bin/env bash
set -euo pipefail

echo ""
echo " ╔═══════════════════════════════════════════╗"
echo " ║         ACCESSIA Pro v1.2.0               ║"
echo " ║   Conseil IA · PME et Entrepreneurs       ║"
echo " ╚═══════════════════════════════════════════╝"
echo ""

# ── Détection Apple Silicon ────────────────────────────────
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  echo "  ✦ Apple Silicon détecté (ARM64) — mode natif activé"
else
  echo "  ⚠ Architecture $ARCH"
fi
echo ""

# ── Vérifier Docker ────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "[ERREUR] Docker n'est pas installé."
  echo "→ https://www.docker.com/products/docker-desktop"
  exit 1
fi

if ! docker info &>/dev/null 2>&1; then
  # Essayer d'ouvrir Docker Desktop automatiquement (macOS)
  if command -v open &>/dev/null; then
    echo "[INFO] Docker Desktop n'est pas démarré — tentative d'ouverture..."
    open -a Docker 2>/dev/null || true
    echo "[INFO] Attente du démarrage de Docker (max 2 min)..."
    for i in $(seq 1 24); do
      sleep 5
      if docker info &>/dev/null 2>&1; then
        echo "[INFO] Docker prêt ✅"
        break
      fi
      if [ $i -eq 24 ]; then
        echo "[ERREUR] Docker n'a pas démarré. Lance Docker Desktop manuellement puis relance."
        exit 1
      fi
      printf "."
    done
    echo ""
  else
    echo "[ERREUR] Docker Desktop n'est pas démarré."
    exit 1
  fi
fi

# Vérifier docker compose
if docker compose version &>/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose &>/dev/null; then
  DC="docker-compose"
else
  echo "[ERREUR] docker compose introuvable."
  exit 1
fi

# ── Gestion des conflits de ports ─────────────────────────
check_port() {
  local PORT=$1
  local SERVICE=$2
  local PID
  PID=$(lsof -ti :"$PORT" 2>/dev/null || true)

  if [ -z "$PID" ]; then
    return 0  # Port libre, OK
  fi

  # Vérifier si c'est un conteneur Docker ACCESSIA (déjà lancé)
  local CMD
  CMD=$(ps -p "$PID" -o comm= 2>/dev/null || echo "inconnu")
  if echo "$CMD" | grep -qiE "docker|com.docker|vpnkit"; then
    echo "[INFO] Port $PORT déjà utilisé par Docker — ACCESSIA est peut-être déjà lancé."
    echo "       → http://localhost:3001"
    exit 0
  fi

  echo ""
  echo "[⚠] CONFLIT — Port $PORT utilisé par : $CMD (PID $PID)"
  echo "    Ce port est requis pour le $SERVICE d'ACCESSIA."
  echo ""
  read -rp "    Libérer le port $PORT et continuer ? [o/N] : " CONFIRM
  if [[ "$CONFIRM" =~ ^[oOyY]$ ]]; then
    kill -9 "$PID" 2>/dev/null || true
    sleep 1
    echo "    ✅ Port $PORT libéré."
  else
    echo "[ARRÊT] Fermez l'application qui utilise le port $PORT, puis relancez."
    exit 1
  fi
}

check_port 8001 "backend API"
check_port 3001 "frontend"

# ── Copier .env si absent ──────────────────────────────────
if [ ! -f ".env" ]; then
  echo "[INFO] Création du fichier .env..."
  cp .env.example .env
  sed -i '' "s|/Users/votre_utilisateur|$HOME|g" .env 2>/dev/null || true
  echo "[INFO] Chemin configuré automatiquement : $HOME"
  echo "[INFO] Personnalise SECRET_KEY dans .env si besoin."
  echo ""
fi

# ── Démarrage des services ─────────────────────────────────
echo "[1/2] Démarrage du backend FastAPI (ARM64)..."
$DC up -d --build backend

echo ""
echo "[2/2] Démarrage du frontend Next.js (ARM64)..."
$DC up -d --build frontend

echo ""
echo "══════════════════════════════════════════════════"
echo "  ✅  ACCESSIA Pro est démarré !"
echo ""
echo "  → Application  : http://localhost:3001"
echo "  → API (Swagger): http://localhost:8001/docs"
echo "  → Arrêter      : ./stop.sh"
echo "══════════════════════════════════════════════════"
echo ""

# Navigateur non ouvert automatiquement — ouvre manuellement http://localhost:3001
