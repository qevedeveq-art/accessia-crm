# ACCESSIA Pro

Application de gestion complète pour **ACCESSIA** — cabinet de conseil IA pour PME et entrepreneurs.

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)
![Next.js](https://img.shields.io/badge/Frontend-Next.js%2014-000000?logo=next.js)
![Docker](https://img.shields.io/badge/Deploy-Docker%20Compose-2496ED?logo=docker)
![SQLite](https://img.shields.io/badge/DB-SQLite-003B57?logo=sqlite)

## Fonctionnalités

| Module | Description |
|--------|-------------|
| **Dashboard** | KPIs temps réel, pipeline commercial, CA encaissé, graphiques |
| **Clients** | Gestion PME/ETI avec carte interactive (géocodage), fiche détaillée |
| **Projets** | Suivi en 8 phases (Découverte → MCO), budget, RGPD |
| **Devis** | QuoteBuilder 3 étapes (client → catalogue → finalisation), PDF brandé, statuts |
| **Prestations** | Catalogue ACCESSIA : 15 offres avec livrables, financement éligible, fourchettes de prix |
| **Finances** | Facturation TTC, statuts (brouillon → payée), KPIs |
| **CRM** | Pipeline kanban 6 étapes, activités, tâches & relances |
| **Fichiers** | Explorateur avec arborescence ACCESSIA standard (7 catégories) |
| **Reporting** | Graphiques CA, pipeline, activité |
| **Sauvegarde** | Backup automatique quotidien (SQLite + catalogue), restauration manuelle |
| **Mise à jour** | Vérification et application des mises à jour via git |

## Architecture

```
_ACCESSIA_APP/
├── backend/                      # API FastAPI + SQLAlchemy
│   ├── main.py                   # Routes API + backup + update
│   ├── models.py                 # Modèles SQLAlchemy
│   ├── database.py               # SQLite + WAL mode
│   ├── file_service.py           # Gestion fichiers + catalogue ACCESSIA
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .dockerignore
├── frontend/                     # Interface Next.js 14 + Tailwind CSS
│   ├── src/app/                  # Pages (dashboard, clients, devis, prestations…)
│   ├── src/components/           # Sidebar, ClientsMap, DiagnosticRecsPanel
│   ├── src/lib/api.ts            # Client API typé
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
├── docker-compose.yml            # Orchestration (backend + frontend)
├── .env.example                  # Template de configuration
├── start.bat / start.sh          # Lancement Docker — Windows / Linux-macOS
├── start-dev.bat / start-dev.sh  # Mode dev local sans Docker
└── stop.bat / stop.sh            # Arrêt
```

## Démarrage rapide

### Prérequis

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (toutes plateformes)
- **Ou** Python 3.11+ et Node.js 20+ pour le mode dev local

### Avec Docker (recommandé — Windows / Linux / macOS)

**Windows :**
```
Double-cliquer start.bat
```

**Linux / macOS :**
```bash
chmod +x start.sh start-dev.sh stop.sh
./start.sh
```

**Manuel :**
```bash
cp .env.example .env        # une seule fois
docker compose up -d --build
```

Accès :
- **Application** → http://localhost:3001
- **API Swagger** → http://localhost:8001/docs

### Sans Docker (mode développement)

**Windows :** `start-dev.bat`
**Linux / macOS :** `./start-dev.sh`

Accès :
- **Application** → http://localhost:3001
- **API Swagger** → http://localhost:8000/docs

### Arrêt

```bash
./stop.sh          # Linux/macOS
stop.bat           # Windows
docker compose down  # Manuel
```

## Configuration

Copier `.env.example` en `.env` et adapter :

```env
# Répertoire racine (dossier parent de _ACCESSIA_APP)
SENSIA_BASE_DIR=C:/Users/votre_user/MonDossierTravail    # Windows
# SENSIA_BASE_DIR=/home/votre_user/MonDossierTravail     # Linux/macOS

SECRET_KEY=votre_cle_secrete_32_caracteres_minimum
```

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Backend | Python 3.11, FastAPI 0.110, SQLAlchemy 2.0, Pydantic v2 |
| Frontend | Next.js 14, React 18, Tailwind CSS 3.4, Recharts, Leaflet |
| Base de données | SQLite (WAL mode) |
| Déploiement | Docker Compose — Windows / Linux / macOS |

## API Endpoints principaux

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/health` | Health check + version |
| GET | `/api/dashboard` | KPIs tableau de bord |
| GET/POST | `/api/clients` | Clients |
| GET/POST | `/api/quotes` | Devis |
| GET | `/api/quotes/{id}/pdf` | PDF du devis |
| GET/POST | `/api/prestations` | Catalogue offres |
| GET/POST | `/api/invoices` | Factures |
| POST | `/api/backup/create` | Créer une sauvegarde |
| GET | `/api/backup/list` | Lister les sauvegardes |
| GET | `/api/update/check` | Vérifier les mises à jour |
| POST | `/api/update/apply` | Appliquer une mise à jour |

## Licence

Projet privé — ACCESSIA © 2026
