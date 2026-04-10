#!/bin/bash
set -e

# Crée le répertoire de la base de données si absent
DB_URL="${DATABASE_URL:-sqlite:///./sensia.db}"
if [[ "$DB_URL" == sqlite://* ]]; then
  DB_PATH="${DB_URL/sqlite:\/\/\//}"
  DB_PATH="${DB_PATH/sqlite:\/\//}"
  DB_DIR=$(dirname "$DB_PATH")
  mkdir -p "$DB_DIR"
  echo "[entrypoint] Répertoire DB prêt : $DB_DIR"
fi

# Crée aussi le dossier de base SENSIA si défini
if [ -n "${SENSIA_BASE_DIR:-}" ]; then
  mkdir -p "${SENSIA_BASE_DIR}/_ACCESSIA_APP"
  echo "[entrypoint] Répertoire ACCESSIA prêt : ${SENSIA_BASE_DIR}/_ACCESSIA_APP"
fi

exec "$@"
