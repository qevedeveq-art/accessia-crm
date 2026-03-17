FROM python:3.11-slim

WORKDIR /app

# wget pour le healthcheck (curl absent de python:3.11-slim)
RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*

# Créer un utilisateur non-root pour la sécurité
RUN groupadd -r sensia && useradd -r -g sensia sensia

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Supprimer les fichiers sensibles du conteneur
RUN rm -rf __pycache__ venv *.db .env

# Le dossier SENSIA DVZ sera monté comme volume
ENV SENSIA_BASE_DIR=/sensia_data
ENV DATABASE_URL=sqlite:////sensia_data/_SENSIA_APP/sensia.db

EXPOSE 8000

# Pas de --reload en production
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
