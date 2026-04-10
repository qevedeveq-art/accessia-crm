# ── Build stage ─────────────────────────────────────────────
FROM python:3.11-slim-bookworm AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Runtime stage ────────────────────────────────────────────
FROM python:3.11-slim-bookworm

WORKDIR /app

# Outils runtime : wget (healthcheck) + git (auto-update)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    git \
    && rm -rf /var/lib/apt/lists/*

# Utilisateur non-root
RUN groupadd -r accessia && useradd -r -g accessia -d /app accessia

# Copier les dépendances compilées depuis le builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY . .

# Rendre l'entrypoint exécutable
RUN chmod +x entrypoint.sh

# Nettoyage des fichiers sensibles
RUN rm -rf __pycache__ venv *.db .env

# Données montées en volume
ENV SENSIA_BASE_DIR=/sensia_data
ENV DATABASE_URL=sqlite:////sensia_data/_ACCESSIA_APP/sensia.db

# Optimisations Python
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONOPTIMIZE=1

EXPOSE 8000

# SQLite = 1 seul worker (évite les conflits de locks)
# uvloop + httptools pour de bonnes perfs en environnement natif
ENTRYPOINT ["./entrypoint.sh"]
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1", \
     "--loop", "uvloop", \
     "--http", "httptools", \
     "--no-access-log"]
