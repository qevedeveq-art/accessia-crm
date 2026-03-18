# SENSIA Manager

Application de gestion complète pour **SENSIA DVZ** — cabinet de conseil IA pour PME et entrepreneurs.

![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)
![Next.js](https://img.shields.io/badge/Frontend-Next.js%2014-000000?logo=next.js)
![Docker](https://img.shields.io/badge/Deploy-Docker%20Compose-2496ED?logo=docker)
![SQLite](https://img.shields.io/badge/DB-SQLite-003B57?logo=sqlite)

## Fonctionnalités

### Dashboard
Tableau de bord avec KPIs en temps réel : clients actifs, projets en cours, CA encaissé, pipeline commercial, et graphique de répartition par phase projet.

### Gestion Clients
Création, édition et suivi des clients (PME, ETI, micro-entreprises, grands comptes). Chaque client dispose d'un dossier automatiquement généré avec profil Markdown, sous-dossiers Contrats/Factures/Correspondances.

### Gestion Projets
Suivi des projets en 8 phases (Découverte → MCO) avec barre de progression, budget, dates, contrat signé et conformité RGPD. Création automatique de la structure de dossiers projet.

### CRM Natif
- **Pipeline commercial** — Kanban en 6 étapes : Nouveau → Qualifié → Proposition → Négociation → Gagné / Perdu
- **Historique d'activités** — Suivi des appels, emails, réunions et notes par client
- **Tâches & relances** — Gestion des tâches avec priorité (basse/normale/haute/urgente), échéances et suivi

### Finances
Facturation avec calcul automatique TTC, suivi des statuts (brouillon → envoyée → payée), KPIs financiers.

### Explorateur de Fichiers
Navigation dans l'arborescence SENSIA DVZ avec prévisualisation des fichiers Markdown et texte.

## Architecture

```
_SENSIA_APP/
├── backend/                # API FastAPI + SQLAlchemy
│   ├── main.py             # Routes API (clients, projets, CRM, factures)
│   ├── models.py           # Modèles SQLAlchemy (Client, Project, Activity, Task...)
│   ├── database.py         # Configuration SQLite + WAL mode
│   ├── file_service.py     # Création auto de dossiers/fichiers
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/               # Interface Next.js 14 + Tailwind CSS
│   ├── src/
│   │   ├── app/            # Pages (dashboard, clients, projets, CRM, finances, fichiers)
│   │   ├── components/     # Sidebar
│   │   └── lib/api.ts      # Client API typé
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml      # Orchestration backend + frontend
├── start.bat               # Lancement rapide (Windows)
└── stop.bat                # Arrêt des services
```

## Démarrage rapide

### Prérequis
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installé et lancé

### Lancement

```bash
cd _SENSIA_APP
docker-compose build --no-cache
docker-compose up -d
```

Accès :
- **Application** : http://localhost:3001
- **API Docs (Swagger)** : http://localhost:8001/api/docs

### Arrêt

```bash
docker-compose down
```

## Configuration

Copier `.env.example` en `.env` et personnaliser :

```env
SECRET_KEY=votre_cle_secrete_32_caracteres_minimum
SENSIA_BASE_DIR=C:/Users/votre_user/SENSIA DVZ
```

## Stack technique

| Composant | Technologie |
|-----------|------------|
| Backend | Python 3.11, FastAPI 0.110, SQLAlchemy 2.0, Pydantic v2 |
| Frontend | Next.js 14, React 18, Tailwind CSS 3.4, Recharts, Lucide Icons |
| Base de données | SQLite (WAL mode, StaticPool) |
| Déploiement | Docker Compose, multi-stage builds |

## API Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/dashboard` | Tableau de bord avec KPIs |
| GET/POST | `/api/clients` | Liste / création de clients |
| GET/PUT/DELETE | `/api/clients/{id}` | Détail / modification / suppression |
| PATCH | `/api/clients/{id}/pipeline` | Déplacer dans le pipeline CRM |
| GET/POST | `/api/projects` | Liste / création de projets |
| GET/POST | `/api/invoices` | Liste / création de factures |
| PATCH | `/api/invoices/{id}/status` | Changer le statut d'une facture |
| GET | `/api/pipeline` | Pipeline commercial (kanban) |
| GET/POST/DELETE | `/api/activities` | Historique d'activités CRM |
| GET/POST | `/api/tasks` | Tâches et relances |
| PATCH | `/api/tasks/{id}/status` | Mettre à jour le statut d'une tâche |
| GET | `/api/files` | Explorateur de fichiers |
| GET | `/api/health` | Health check |

## Licence

Projet privé — SENSIA DVZ © 2026
