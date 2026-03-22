"""
ACCESSIA Pro — API Backend
FastAPI + SQLAlchemy + SQLite
"""
import os
import json
import uuid
import shutil
import logging
import subprocess
import httpx
import csv, io, hmac, hashlib
from apscheduler.schedulers.background import BackgroundScheduler
from dateutil.relativedelta import relativedelta
from datetime import datetime, timezone, date as date_type
from pathlib import Path
from enum import Enum
from typing import Optional, List

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Request, BackgroundTasks
from fastapi.responses import Response, RedirectResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
# TrustedHostMiddleware retiré — bloquait les requêtes Docker
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field, field_validator
from slugify import slugify

from database import engine, get_db, Base
from models import Client, Project, Contact, Invoice, Activity, Task, Diagnostic, Quote, TimeEntry, RecurringInvoice, ProjectTemplate, NpsSurvey, Webhook
import file_service

log = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════

SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    if os.getenv("ENV", "development") == "production":
        raise RuntimeError("SECRET_KEY doit être défini en production (variable d'environnement)")
    SECRET_KEY = "dev-only-insecure-key-do-not-use-in-prod"
    log.warning("SECRET_KEY non défini — clé de développement utilisée. NE PAS utiliser en production.")
ALGORITHM = os.getenv("ALGORITHM", "HS256")

# Crée les tables au démarrage + migration automatique
Base.metadata.create_all(bind=engine)

def _run_migrations():
    """Ajoute les colonnes/tables manquantes pour compatibilité avec l'ancien schéma."""
    import sqlite3
    db_url = os.getenv("DATABASE_URL", "sqlite:///./sensia.db")
    if "sqlite" not in db_url:
        return
    # Extraire le chemin du fichier SQLite
    db_path = db_url.replace("sqlite:////", "/").replace("sqlite:///", "")
    if not os.path.exists(db_path):
        return
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        # Vérifier et ajouter pipeline_stage à clients
        cursor.execute("PRAGMA table_info(clients)")
        columns = [row[1] for row in cursor.fetchall()]
        if "pipeline_stage" not in columns:
            cursor.execute("ALTER TABLE clients ADD COLUMN pipeline_stage VARCHAR(30) DEFAULT 'nouveau'")
            log.info("Migration: ajout colonne pipeline_stage à clients")
        # Créer la table diagnostics si elle n'existe pas
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS diagnostics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                type VARCHAR(30) NOT NULL,
                title VARCHAR(300) NOT NULL,
                status VARCHAR(20) DEFAULT 'en_cours',
                share_token VARCHAR(64) UNIQUE NOT NULL,
                company_info TEXT,
                answers TEXT,
                results TEXT,
                report_path VARCHAR(500),
                created_at DATETIME,
                updated_at DATETIME
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS quotes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                number VARCHAR(40) UNIQUE NOT NULL,
                client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
                title VARCHAR(300) NOT NULL,
                amount_ht REAL NOT NULL,
                tva_rate REAL DEFAULT 20.0,
                status VARCHAR(20) DEFAULT 'brouillon',
                valid_until DATETIME,
                description TEXT,
                notes TEXT,
                created_at DATETIME,
                updated_at DATETIME
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS time_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                date DATETIME,
                duration_minutes INTEGER NOT NULL,
                description VARCHAR(500),
                created_at DATETIME
            )
        """)
        # Supprimer les colonnes Twenty obsolètes n'est pas possible en SQLite (pas de DROP COLUMN avant 3.35)
        # Ajout items_json dans quotes (si absent)
        try:
            cursor.execute("ALTER TABLE quotes ADD COLUMN items_json TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # colonne déjà présente
        except Exception as mig_err:
            log.warning("Migration items_json inattendue : %s", mig_err)
        # New columns for Quote (signature + templates)
        for col_sql in [
            "ALTER TABLE quotes ADD COLUMN sign_token VARCHAR(64)",
            "ALTER TABLE quotes ADD COLUMN signed_at DATETIME",
            "ALTER TABLE quotes ADD COLUMN signed_by VARCHAR(200)",
            "ALTER TABLE quotes ADD COLUMN sign_ip VARCHAR(45)",
            "ALTER TABLE quotes ADD COLUMN is_template BOOLEAN DEFAULT 0",
            "ALTER TABLE quotes ADD COLUMN template_name VARCHAR(200)",
        ]:
            try:
                cursor.execute(col_sql)
            except sqlite3.OperationalError:
                pass
        # New tables
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS recurring_invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
                amount_ht REAL NOT NULL,
                tva_rate REAL DEFAULT 20.0,
                frequency VARCHAR(20) NOT NULL,
                next_billing_date DATETIME NOT NULL,
                active BOOLEAN DEFAULT 1,
                description VARCHAR(500),
                created_at DATETIME
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS project_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                phases_json TEXT,
                created_at DATETIME
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS nps_surveys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                score INTEGER,
                comment TEXT,
                share_token VARCHAR(64) UNIQUE NOT NULL,
                answered_at DATETIME,
                created_at DATETIME
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS webhooks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url VARCHAR(500) NOT NULL,
                events TEXT NOT NULL,
                active BOOLEAN DEFAULT 1,
                secret VARCHAR(64),
                created_at DATETIME
            )
        """)
        conn.commit()
        conn.close()
        log.info("Migrations terminées avec succès")
    except Exception as e:
        log.warning(f"Migration automatique échouée (non critique) : {e}")

_run_migrations()

# ═══════════════════════════════════════════════════════════════
# SCHEDULER — Relances + Facturation récurrente
# ═══════════════════════════════════════════════════════════════

_scheduler = BackgroundScheduler(daemon=True)


def _job_relances_automatiques():
    """Factures en retard & devis expirés → créer tâche relance."""
    from database import SessionLocal  # évite import circulaire
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        # Factures envoyées dont due_date < now → relance si pas déjà créée
        late_invoices = db.query(Invoice).filter(
            Invoice.status == "envoyee",
            Invoice.due_date < now,
        ).all()
        for inv in late_invoices:
            exists = db.query(Task).filter(
                Task.client_id == inv.client_id,
                Task.type == "relance",
                Task.status != "fait",
                Task.description.like(f"%{inv.number}%"),
            ).first()
            if not exists:
                t = Task(
                    client_id=inv.client_id,
                    project_id=inv.project_id,
                    title=f"Relance facture {inv.number}",
                    description=f"Facture {inv.number} en retard de paiement.",
                    type="relance",
                    priority="haute",
                    status="a_faire",
                    created_at=now,
                )
                db.add(t)
        # Devis envoyés expirés → status=expire
        expired_quotes = db.query(Quote).filter(
            Quote.status == "envoye",
            Quote.valid_until < now,
        ).all()
        for qt in expired_quotes:
            qt.status = "expire"
        db.commit()
    except Exception as e:
        log.warning(f"_job_relances_automatiques error: {e}")
        db.rollback()
    finally:
        db.close()


def _job_facturation_recurrente():
    """Crée les factures récurrentes dont next_billing_date <= now."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        due = db.query(RecurringInvoice).filter(
            RecurringInvoice.active == True,
            RecurringInvoice.next_billing_date <= now,
        ).all()
        for rec in due:
            # Numéro facture
            last = db.query(Invoice).order_by(Invoice.id.desc()).first()
            n = int(last.number.split("-")[-1]) + 1 if last else 1
            inv = Invoice(
                number=f"FAC-{datetime.now().year}-{n:04d}",
                client_id=rec.client_id,
                project_id=rec.project_id,
                amount_ht=rec.amount_ht,
                tva_rate=rec.tva_rate,
                status="brouillon",
                notes=rec.description or "Facture récurrente",
                created_at=now,
                updated_at=now,
            )
            db.add(inv)
            # Avancer next_billing_date
            freq = rec.frequency
            if freq == "mensuel":
                rec.next_billing_date = rec.next_billing_date + relativedelta(months=1)
            elif freq == "trimestriel":
                rec.next_billing_date = rec.next_billing_date + relativedelta(months=3)
            elif freq == "annuel":
                rec.next_billing_date = rec.next_billing_date + relativedelta(years=1)
        db.commit()
    except Exception as e:
        log.warning(f"_job_facturation_recurrente error: {e}")
        db.rollback()
    finally:
        db.close()


try:
    _scheduler.add_job(_job_relances_automatiques, "interval", hours=24, id="relances")
    _scheduler.add_job(_job_facturation_recurrente, "interval", hours=24, id="recurrents")
    _scheduler.start()
    import atexit
    atexit.register(lambda: _scheduler.shutdown(wait=False))
    log.info("APScheduler démarré (relances + récurrents)")
except Exception as _sched_err:
    log.warning(f"APScheduler non démarré : {_sched_err}")

file_service.ensure_standard_dirs()

app = FastAPI(
    title="ACCESSIA Pro API",
    version="1.1.0",
    description="Gestion clients, projets et fichiers — ACCESSIA Pro",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)


@app.get("/", include_in_schema=False)
def root_redirect():
    return RedirectResponse(url="/api/docs", status_code=308)

# ── Middleware sécurité ──────────────────────────────────────
ALLOWED_ORIGINS = [
    "http://localhost:3001",
    "http://localhost:3000",
    "http://localhost:8001",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════════════
# ENUMS DE VALIDATION
# ═══════════════════════════════════════════════════════════════

class ClientStatus(str, Enum):
    prospect = "prospect"
    active = "active"
    inactive = "inactive"


class ClientType(str, Enum):
    micro = "micro"
    pme = "pme"
    eti = "eti"
    grand_compte = "grand_compte"


class ProjectStatus(str, Enum):
    en_cours = "en_cours"
    termine = "termine"
    suspendu = "suspendu"
    annule = "annule"


class ProjectType(str, Enum):
    diagnostic = "diagnostic"
    integration = "integration"
    formation = "formation"
    mco = "mco"
    pack_pme = "pack_pme"


class InvoiceStatus(str, Enum):
    brouillon = "brouillon"
    envoyee = "envoyee"
    payee = "payee"
    annulee = "annulee"


class ActivityType(str, Enum):
    appel = "appel"
    email = "email"
    reunion = "reunion"
    note = "note"


class TaskType(str, Enum):
    relance = "relance"
    rappel = "rappel"
    tache = "tache"
    suivi = "suivi"


class TaskPriority(str, Enum):
    basse = "basse"
    normal = "normal"
    haute = "haute"
    urgente = "urgente"


class TaskStatus(str, Enum):
    a_faire = "a_faire"
    en_cours = "en_cours"
    fait = "fait"


class PipelineStage(str, Enum):
    nouveau = "nouveau"
    qualifie = "qualifie"
    proposition = "proposition"
    negociation = "negociation"
    gagne = "gagne"
    perdu = "perdu"


# ═══════════════════════════════════════════════════════════════
# SCHÉMAS PYDANTIC
# ═══════════════════════════════════════════════════════════════

class ClientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    type: Optional[ClientType] = ClientType.pme
    sector: Optional[str] = Field(None, max_length=100)
    contact_name: Optional[str] = Field(None, max_length=200)
    contact_email: Optional[str] = Field(None, max_length=200)
    contact_phone: Optional[str] = Field(None, max_length=30)
    address: Optional[str] = Field(None, max_length=500)
    website: Optional[str] = Field(None, max_length=300)
    siret: Optional[str] = Field(None, max_length=20)
    status: Optional[ClientStatus] = ClientStatus.prospect
    source: Optional[str] = Field(None, max_length=100)
    budget_range: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=5000)
    pipeline_stage: Optional[PipelineStage] = PipelineStage.nouveau

    @field_validator("siret")
    @classmethod
    def validate_siret(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.replace(" ", "").replace("-", "")
            if clean and (not clean.isdigit() or len(clean) != 14):
                raise ValueError("Le SIRET doit contenir exactement 14 chiffres")
        return v


class ClientUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    type: Optional[ClientType] = None
    sector: Optional[str] = Field(None, max_length=100)
    contact_name: Optional[str] = Field(None, max_length=200)
    contact_email: Optional[str] = Field(None, max_length=200)
    contact_phone: Optional[str] = Field(None, max_length=30)
    address: Optional[str] = Field(None, max_length=500)
    website: Optional[str] = Field(None, max_length=300)
    siret: Optional[str] = Field(None, max_length=20)
    status: Optional[ClientStatus] = None
    source: Optional[str] = Field(None, max_length=100)
    budget_range: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=5000)
    pipeline_stage: Optional[PipelineStage] = None


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    client_id: int = Field(..., gt=0)
    type: Optional[ProjectType] = ProjectType.integration
    status: Optional[ProjectStatus] = ProjectStatus.en_cours
    phase: Optional[int] = Field(0, ge=0, le=7)
    description: Optional[str] = Field(None, max_length=5000)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    budget: Optional[float] = Field(None, ge=0)
    contract_signed: Optional[bool] = False
    gdpr_done: Optional[bool] = False
    notes: Optional[str] = Field(None, max_length=5000)


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    type: Optional[ProjectType] = None
    status: Optional[ProjectStatus] = None
    phase: Optional[int] = Field(None, ge=0, le=7)
    description: Optional[str] = Field(None, max_length=5000)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    budget: Optional[float] = Field(None, ge=0)
    contract_signed: Optional[bool] = None
    gdpr_done: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=5000)


class ContactCreate(BaseModel):
    client_id: int = Field(..., gt=0)
    name: str = Field(..., min_length=1, max_length=200)
    email: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=30)
    role: Optional[str] = Field(None, max_length=100)
    is_primary: Optional[bool] = False


class InvoiceCreate(BaseModel):
    client_id: int = Field(..., gt=0)
    project_id: Optional[int] = Field(None, gt=0)
    amount_ht: float = Field(..., gt=0)
    tva_rate: Optional[float] = Field(20.0, ge=0, le=100)
    status: Optional[InvoiceStatus] = InvoiceStatus.brouillon
    issued_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=5000)


class InvoiceStatusUpdate(BaseModel):
    """Schéma pour la mise à jour du statut d'une facture (via body JSON)."""
    status: InvoiceStatus


class ActivityCreate(BaseModel):
    client_id: int = Field(..., gt=0)
    project_id: Optional[int] = Field(None, gt=0)
    contact_id: Optional[int] = Field(None, gt=0)
    type: ActivityType
    title: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = Field(None, max_length=5000)
    date: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(None, ge=0)


class TaskCreate(BaseModel):
    client_id: Optional[int] = Field(None, gt=0)
    project_id: Optional[int] = Field(None, gt=0)
    title: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = Field(None, max_length=5000)
    type: Optional[TaskType] = TaskType.tache
    priority: Optional[TaskPriority] = TaskPriority.normal
    due_date: Optional[datetime] = None


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class PipelineUpdate(BaseModel):
    pipeline_stage: PipelineStage


# ═══════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════

def _now() -> datetime:
    """Retourne l'heure UTC courante (timezone-aware)."""
    return datetime.now(timezone.utc)


def _serialize_client(c: Client) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "slug": c.slug,
        "type": c.type,
        "sector": c.sector,
        "status": c.status,
        "contact_name": c.contact_name,
        "contact_email": c.contact_email,
        "contact_phone": c.contact_phone,
        "address": c.address,
        "website": c.website,
        "siret": c.siret,
        "source": c.source,
        "budget_range": c.budget_range,
        "notes": c.notes,
        "folder_path": c.folder_path,
        "pipeline_stage": c.pipeline_stage,
        "projects_count": len(c.projects) if c.projects else 0,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


def _serialize_project(p: Project) -> dict:
    return {
        "id": p.id,
        "code": p.code,
        "name": p.name,
        "client_id": p.client_id,
        "client_name": p.client.name if p.client else None,
        "type": p.type,
        "status": p.status,
        "phase": p.phase,
        "description": p.description,
        "budget": p.budget,
        "contract_signed": p.contract_signed,
        "gdpr_done": p.gdpr_done,
        "notes": p.notes,
        "folder_path": p.folder_path,
        "start_date": p.start_date.isoformat() if p.start_date else None,
        "end_date": p.end_date.isoformat() if p.end_date else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _serialize_invoice(inv: Invoice) -> dict:
    return {
        "id": inv.id,
        "number": inv.number,
        "client_id": inv.client_id,
        "client_name": inv.client.name if inv.client else None,
        "project_id": inv.project_id,
        "amount_ht": inv.amount_ht,
        "amount_ttc": round(inv.amount_ht * (1 + inv.tva_rate / 100), 2),
        "tva_rate": inv.tva_rate,
        "status": inv.status,
        "issued_date": inv.issued_date.isoformat() if inv.issued_date else None,
        "due_date": inv.due_date.isoformat() if inv.due_date else None,
        "paid_date": inv.paid_date.isoformat() if inv.paid_date else None,
        "notes": inv.notes,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
    }


def _next_project_code(db: Session) -> str:
    year = _now().year
    count = db.query(func.count(Project.id)).filter(
        Project.code.like(f"{year}-%")
    ).scalar() or 0
    return f"{year}-{count + 1:03d}"


def _next_invoice_number(db: Session) -> str:
    year = _now().year
    count = db.query(func.count(Invoice.id)).filter(
        Invoice.number.like(f"ACC-{year}-%")
    ).scalar() or 0
    return f"ACC-{year}-{count + 1:03d}"


def _safe_json_loads(raw: Optional[str], default=None) -> list:
    """Désérialise du JSON en tolérant les données corrompues."""
    if not raw:
        return default if default is not None else []
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError) as e:
        log.warning("JSON malformé ignoré (%.100s…) : %s", raw, e)
        return default if default is not None else []


def _serialize_activity(a: Activity) -> dict:
    return {
        "id": a.id, "client_id": a.client_id, "project_id": a.project_id,
        "contact_id": a.contact_id, "type": a.type, "title": a.title,
        "description": a.description, "date": a.date.isoformat() if a.date else None,
        "duration_minutes": a.duration_minutes,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _serialize_task(t: Task) -> dict:
    return {
        "id": t.id, "client_id": t.client_id, "project_id": t.project_id,
        "title": t.title, "description": t.description, "type": t.type,
        "priority": t.priority, "status": t.status,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


# ═══════════════════════════════════════════════════════════════
# DASHBOARD
# ═══════════════════════════════════════════════════════════════

@app.get("/api/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    total_clients = db.query(func.count(Client.id)).scalar() or 0
    active_clients = db.query(func.count(Client.id)).filter(Client.status == "active").scalar() or 0
    prospects = db.query(func.count(Client.id)).filter(Client.status == "prospect").scalar() or 0
    total_projects = db.query(func.count(Project.id)).scalar() or 0
    active_projects = db.query(func.count(Project.id)).filter(Project.status == "en_cours").scalar() or 0
    ca_total = db.query(func.sum(Invoice.amount_ht)).filter(Invoice.status == "payee").scalar() or 0
    ca_pending = db.query(func.sum(Invoice.amount_ht)).filter(Invoice.status == "envoyee").scalar() or 0
    pipeline = db.query(func.sum(Project.budget)).filter(Project.status == "en_cours").scalar() or 0
    upcoming_tasks = db.query(func.count(Task.id)).filter(Task.status != "fait").scalar() or 0
    overdue_tasks = db.query(func.count(Task.id)).filter(Task.status != "fait", Task.due_date < _now()).scalar() or 0

    recent_projects = (
        db.query(Project)
        .options(joinedload(Project.client))
        .order_by(Project.created_at.desc())
        .limit(5)
        .all()
    )
    recent_clients = (
        db.query(Client)
        .order_by(Client.created_at.desc())
        .limit(5)
        .all()
    )

    # Répartition par phase — une seule requête au lieu de 8
    phase_counts = (
        db.query(Project.phase, func.count(Project.id))
        .filter(Project.status == "en_cours")
        .group_by(Project.phase)
        .all()
    )
    phase_map = dict(phase_counts)
    phase_dist = [{"phase": i, "count": phase_map.get(i, 0)} for i in range(8)]

    return {
        "kpis": {
            "total_clients": total_clients,
            "active_clients": active_clients,
            "prospects": prospects,
            "total_projects": total_projects,
            "active_projects": active_projects,
            "ca_total": round(ca_total, 2),
            "ca_pending": round(ca_pending, 2),
            "pipeline": round(pipeline, 2),
            "upcoming_tasks": upcoming_tasks,
            "overdue_tasks": overdue_tasks,
        },
        "phase_distribution": phase_dist,
        "recent_projects": [_serialize_project(p) for p in recent_projects],
        "recent_clients": [_serialize_client(c) for c in recent_clients],
    }


# ═══════════════════════════════════════════════════════════════
# CLIENTS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/clients")
def list_clients(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    status: Optional[ClientStatus] = None,
    search: Optional[str] = Query(None, max_length=100),
    db: Session = Depends(get_db),
):
    q = db.query(Client)
    if status:
        q = q.filter(Client.status == status.value)
    if search:
        safe_search = search.replace("%", "\\%").replace("_", "\\_")
        q = q.filter(Client.name.ilike(f"%{safe_search}%"))
    clients = q.order_by(Client.name).offset(skip).limit(limit).all()
    return [_serialize_client(c) for c in clients]


@app.get("/api/clients/{client_id}")
def get_client(client_id: int, db: Session = Depends(get_db)):
    c = (
        db.query(Client)
        .options(joinedload(Client.projects), joinedload(Client.contacts))
        .filter(Client.id == client_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    data = _serialize_client(c)
    data["projects"] = [_serialize_project(p) for p in c.projects]
    data["contacts"] = [
        {
            "id": ct.id,
            "name": ct.name,
            "email": ct.email,
            "phone": ct.phone,
            "role": ct.role,
            "is_primary": ct.is_primary,
        }
        for ct in c.contacts
    ]
    return data


@app.post("/api/clients", status_code=201)
def create_client(data: ClientCreate, db: Session = Depends(get_db)):
    base_slug = slugify(data.name)
    if not base_slug:
        raise HTTPException(status_code=400, detail="Nom de client invalide")
    slug, n = base_slug, 1
    while db.query(Client).filter(Client.slug == slug).first():
        slug = f"{base_slug}-{n}"
        n += 1

    client = Client(
        name=data.name.strip(),
        slug=slug,
        type=data.type.value if data.type else "pme",
        sector=data.sector,
        contact_name=data.contact_name,
        contact_email=data.contact_email,
        contact_phone=data.contact_phone,
        address=data.address,
        website=data.website,
        siret=data.siret,
        status=data.status.value if data.status else "prospect",
        source=data.source,
        budget_range=data.budget_range,
        notes=data.notes,
        pipeline_stage=data.pipeline_stage.value if data.pipeline_stage else "nouveau",
    )
    db.add(client)
    db.commit()
    db.refresh(client)

    try:
        folder = file_service.create_client_folder(data.name.strip(), data.model_dump())
        client.folder_path = folder
    except Exception as e:
        log.warning(f"Dossier client non créé : {e}")

    db.commit()
    db.refresh(client)
    return _serialize_client(client)


@app.put("/api/clients/{client_id}")
def update_client(client_id: int, data: ClientUpdate, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")

    update_data = data.model_dump(exclude_unset=True)
    for field_name, value in update_data.items():
        if isinstance(value, Enum):
            value = value.value
        setattr(client, field_name, value)

    client.updated_at = _now()
    db.commit()
    db.refresh(client)
    return _serialize_client(client)


@app.delete("/api/clients/{client_id}")
def delete_client(client_id: int, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    db.delete(client)
    db.commit()
    return {"message": "Client supprimé"}


# ─── CONTACTS ─────────────────────────────────────────────────

@app.post("/api/contacts", status_code=201)
def create_contact(data: ContactCreate, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == data.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")

    contact = Contact(**data.model_dump())
    db.add(contact)
    db.commit()
    db.refresh(contact)

    return {"id": contact.id, "name": contact.name}


# ═══════════════════════════════════════════════════════════════
# PROJETS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/projects")
def list_projects(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    status: Optional[ProjectStatus] = None,
    client_id: Optional[int] = Query(None, gt=0),
    search: Optional[str] = Query(None, max_length=100),
    db: Session = Depends(get_db),
):
    q = db.query(Project).options(joinedload(Project.client))
    if status:
        q = q.filter(Project.status == status.value)
    if client_id:
        q = q.filter(Project.client_id == client_id)
    if search:
        safe_search = search.replace("%", "\\%").replace("_", "\\_")
        q = q.filter(
            (Project.name.ilike(f"%{safe_search}%")) |
            (Project.code.ilike(f"%{safe_search}%"))
        )
    projects = q.order_by(Project.created_at.desc()).offset(skip).limit(limit).all()
    return [_serialize_project(p) for p in projects]


@app.get("/api/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    p = (
        db.query(Project)
        .options(joinedload(Project.client))
        .filter(Project.id == project_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Projet non trouvé")
    return _serialize_project(p)


@app.post("/api/projects", status_code=201)
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == data.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")

    code = _next_project_code(db)
    project = Project(
        code=code,
        name=data.name.strip(),
        client_id=data.client_id,
        type=data.type.value if data.type else "integration",
        status=data.status.value if data.status else "en_cours",
        phase=data.phase,
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
        budget=data.budget,
        contract_signed=data.contract_signed,
        gdpr_done=data.gdpr_done,
        notes=data.notes,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    try:
        folder = file_service.create_project_folder(
            {**data.model_dump(), "code": code, "id": project.id},
            client.name,
        )
        project.folder_path = folder
    except Exception as e:
        log.warning(f"Dossier projet non créé : {e}")

    db.commit()
    db.refresh(project)
    return _serialize_project(project)


@app.put("/api/projects/{project_id}")
def update_project(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db)):
    project = (
        db.query(Project)
        .options(joinedload(Project.client))
        .filter(Project.id == project_id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    update_data = data.model_dump(exclude_unset=True)
    for field_name, value in update_data.items():
        if isinstance(value, Enum):
            value = value.value
        setattr(project, field_name, value)

    project.updated_at = _now()
    db.commit()
    # Auto-create NPS survey when project is completed
    if project.status == "termine":
        existing_nps = db.query(NpsSurvey).filter(NpsSurvey.project_id == project.id).first()
        if not existing_nps:
            nps = NpsSurvey(
                project_id=project.id,
                client_id=project.client_id,
                share_token=uuid.uuid4().hex,
                created_at=_now(),
            )
            db.add(nps)
            db.commit()
    db.refresh(project)
    return _serialize_project(project)


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet non trouvé")
    db.delete(project)
    db.commit()
    return {"message": "Projet supprimé"}


# ═══════════════════════════════════════════════════════════════
# FACTURES
# ═══════════════════════════════════════════════════════════════

@app.get("/api/invoices")
def list_invoices(
    client_id: Optional[int] = Query(None, gt=0),
    status: Optional[InvoiceStatus] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Invoice).options(joinedload(Invoice.client))
    if client_id:
        q = q.filter(Invoice.client_id == client_id)
    if status:
        q = q.filter(Invoice.status == status.value)
    invoices = q.order_by(Invoice.created_at.desc()).all()
    return [_serialize_invoice(inv) for inv in invoices]


@app.post("/api/invoices", status_code=201)
def create_invoice(data: InvoiceCreate, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == data.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")

    if data.project_id:
        project = db.query(Project).filter(Project.id == data.project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Projet non trouvé")
        if project.client_id != data.client_id:
            raise HTTPException(status_code=400, detail="Le projet n'appartient pas à ce client")

    number = _next_invoice_number(db)
    invoice = Invoice(
        number=number,
        client_id=data.client_id,
        project_id=data.project_id,
        amount_ht=data.amount_ht,
        tva_rate=data.tva_rate,
        status=data.status.value if data.status else "brouillon",
        issued_date=data.issued_date,
        due_date=data.due_date,
        notes=data.notes,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return {"id": invoice.id, "number": invoice.number}


@app.patch("/api/invoices/{invoice_id}/status")
def update_invoice_status(
    invoice_id: int,
    data: InvoiceStatusUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Facture non trouvée")
    invoice.status = data.status.value
    if data.status == InvoiceStatus.payee:
        invoice.paid_date = _now()
    invoice.updated_at = _now()
    db.commit()
    if data.status == InvoiceStatus.payee:
        background_tasks.add_task(_fire_webhooks_sync, db_url=os.getenv("DATABASE_URL", "sqlite:///./sensia.db"), event="invoice.paid", payload={"id": invoice.id, "number": invoice.number})
    return {"id": invoice.id, "status": invoice.status}


# ═══════════════════════════════════════════════════════════════
# EXPLORATEUR DE FICHIERS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/files")
def browse_root():
    return file_service.list_directory(str(file_service.SENSIA_BASE))


@app.get("/api/files/browse")
def browse_directory(path: str = Query(..., max_length=500)):
    if not file_service.is_safe_path(path):
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    return file_service.list_directory(path)


@app.get("/api/files/read")
def read_file(path: str = Query(..., max_length=500)):
    if not file_service.is_safe_path(path):
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    try:
        content = file_service.read_file(path)
        return {"content": content, "path": path}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fichier non trouvé")
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))


class FileWriteRequest(BaseModel):
    path: str
    content: str


@app.post("/api/files/write")
def write_file(data: FileWriteRequest):
    if not file_service.is_safe_path(data.path):
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    try:
        file_service.write_file(data.path, data.content)
        return {"ok": True}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/prestations")
def get_prestations():
    return file_service.parse_catalogue()


class PrestationItem(BaseModel):
    id: str
    name: str
    category: str = ""
    price_ht: Optional[float] = None
    price_max: Optional[float] = None
    duration: str = ""
    target: str = ""
    active: bool = True
    description: str = ""
    deliverables: List[str] = []
    financing: List[str] = []


@app.put("/api/prestations")
def save_prestations(items: List[PrestationItem]):
    content = file_service.generate_catalogue([p.model_dump() for p in items])
    file_service.CATALOGUE_PATH.write_text(content, encoding="utf-8")
    return {"ok": True, "count": len(items)}


# ═══════════════════════════════════════════════════════════════
# CRM — ACTIVITÉS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/activities")
def list_activities(client_id: Optional[int] = None, limit: int = Query(50, ge=1, le=200), db = Depends(get_db)):
    q = db.query(Activity)
    if client_id: q = q.filter(Activity.client_id == client_id)
    return [_serialize_activity(a) for a in q.order_by(Activity.date.desc()).limit(limit).all()]


@app.post("/api/activities", status_code=201)
def create_activity(data: ActivityCreate, db = Depends(get_db)):
    client = db.query(Client).filter(Client.id == data.client_id).first()
    if not client: raise HTTPException(404, "Client non trouvé")
    activity = Activity(**data.model_dump())
    if not activity.date: activity.date = _now()
    db.add(activity); db.commit(); db.refresh(activity)
    return _serialize_activity(activity)


@app.delete("/api/activities/{activity_id}")
def delete_activity(activity_id: int, db = Depends(get_db)):
    a = db.query(Activity).filter(Activity.id == activity_id).first()
    if not a: raise HTTPException(404, "Activité non trouvée")
    db.delete(a); db.commit()
    return {"message": "Activité supprimée"}


# ═══════════════════════════════════════════════════════════════
# CRM — TÂCHES
# ═══════════════════════════════════════════════════════════════

@app.get("/api/tasks")
def list_tasks(status: Optional[TaskStatus] = None, client_id: Optional[int] = None, db = Depends(get_db)):
    q = db.query(Task)
    if status: q = q.filter(Task.status == status.value)
    if client_id: q = q.filter(Task.client_id == client_id)
    return [_serialize_task(t) for t in q.order_by(Task.due_date.asc().nullslast(), Task.created_at.desc()).all()]


@app.post("/api/tasks", status_code=201)
def create_task(data: TaskCreate, db = Depends(get_db)):
    task = Task(**data.model_dump())
    db.add(task); db.commit(); db.refresh(task)
    return _serialize_task(task)


@app.patch("/api/tasks/{task_id}/status")
def update_task_status(task_id: int, data: TaskStatusUpdate, db = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task: raise HTTPException(404, "Tâche non trouvée")
    task.status = data.status.value
    if data.status == TaskStatus.fait: task.completed_at = _now()
    db.commit()
    return _serialize_task(task)


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, db = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t: raise HTTPException(404, "Tâche non trouvée")
    db.delete(t); db.commit()
    return {"message": "Tâche supprimée"}


# ═══════════════════════════════════════════════════════════════
# CRM — PIPELINE
# ═══════════════════════════════════════════════════════════════

@app.get("/api/pipeline")
def get_pipeline(db = Depends(get_db)):
    clients = db.query(Client).filter(Client.status != "inactive").order_by(Client.name).all()
    stages = ["nouveau", "qualifie", "proposition", "negociation", "gagne", "perdu"]
    result = {s: [] for s in stages}
    for c in clients:
        stage = c.pipeline_stage or "nouveau"
        if stage in result:
            result[stage].append(_serialize_client(c))
    return result


@app.patch("/api/clients/{client_id}/pipeline")
def update_pipeline_stage(client_id: int, data: PipelineUpdate, db = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client: raise HTTPException(404, "Client non trouvé")
    client.pipeline_stage = data.pipeline_stage.value
    client.updated_at = _now()
    db.commit()
    return {"id": client.id, "pipeline_stage": client.pipeline_stage}


# ═══════════════════════════════════════════════════════════════
# DIAGNOSTICS
# ═══════════════════════════════════════════════════════════════


class DiagnosticType(str, Enum):
    cyber = "cyber"
    ia = "ia"
    rgpd = "rgpd"


class DiagnosticStatus(str, Enum):
    en_cours = "en_cours"
    termine = "termine"


class DiagnosticCreate(BaseModel):
    client_id: int = Field(..., gt=0)
    type: DiagnosticType
    title: str = Field(..., min_length=1, max_length=300)
    company_info: Optional[dict] = None


class DiagnosticUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=300)
    status: Optional[DiagnosticStatus] = None
    company_info: Optional[dict] = None
    answers: Optional[dict] = None
    results: Optional[dict] = None


def _serialize_diagnostic(d: Diagnostic) -> dict:
    return {
        "id": d.id,
        "client_id": d.client_id,
        "client_name": d.client.name if d.client else None,
        "type": d.type,
        "title": d.title,
        "status": d.status,
        "share_token": d.share_token,
        "company_info": json.loads(d.company_info) if d.company_info else None,
        "answers": json.loads(d.answers) if d.answers else None,
        "results": json.loads(d.results) if d.results else None,
        "report_path": d.report_path,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


@app.get("/api/diagnostics")
def list_diagnostics(
    client_id: Optional[int] = Query(None, gt=0),
    type: Optional[DiagnosticType] = None,
    status: Optional[DiagnosticStatus] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Diagnostic).options(joinedload(Diagnostic.client))
    if client_id:
        q = q.filter(Diagnostic.client_id == client_id)
    if type:
        q = q.filter(Diagnostic.type == type.value)
    if status:
        q = q.filter(Diagnostic.status == status.value)
    return [_serialize_diagnostic(d) for d in q.order_by(Diagnostic.created_at.desc()).all()]


@app.get("/api/diagnostics/{diag_id}")
def get_diagnostic(diag_id: int, db: Session = Depends(get_db)):
    d = db.query(Diagnostic).options(joinedload(Diagnostic.client)).filter(Diagnostic.id == diag_id).first()
    if not d:
        raise HTTPException(404, "Diagnostic non trouvé")
    return _serialize_diagnostic(d)


@app.post("/api/diagnostics", status_code=201)
def create_diagnostic(data: DiagnosticCreate, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == data.client_id).first()
    if not client:
        raise HTTPException(404, "Client non trouvé")
    diag = Diagnostic(
        client_id=data.client_id,
        type=data.type.value,
        title=data.title.strip(),
        status="en_cours",
        share_token=uuid.uuid4().hex,
        company_info=json.dumps(data.company_info, ensure_ascii=False) if data.company_info else None,
    )
    db.add(diag)
    db.commit()
    db.refresh(diag)
    # Charger la relation client pour la sérialisation
    diag = db.query(Diagnostic).options(joinedload(Diagnostic.client)).filter(Diagnostic.id == diag.id).first()
    return _serialize_diagnostic(diag)


@app.put("/api/diagnostics/{diag_id}")
def update_diagnostic(diag_id: int, data: DiagnosticUpdate, db: Session = Depends(get_db)):
    diag = db.query(Diagnostic).options(joinedload(Diagnostic.client)).filter(Diagnostic.id == diag_id).first()
    if not diag:
        raise HTTPException(404, "Diagnostic non trouvé")
    if data.title is not None:
        diag.title = data.title.strip()
    if data.status is not None:
        diag.status = data.status.value
    if data.company_info is not None:
        diag.company_info = json.dumps(data.company_info, ensure_ascii=False)
    if data.answers is not None:
        diag.answers = json.dumps(data.answers, ensure_ascii=False)
    if data.results is not None:
        diag.results = json.dumps(data.results, ensure_ascii=False)
        diag.status = "termine"
        # Sauvegarder le rapport dans le dossier client
        try:
            client = diag.client
            if client and client.folder_path:
                import pathlib
                report_dir = pathlib.Path(client.folder_path) / "Diagnostics"
                report_dir.mkdir(parents=True, exist_ok=True)
                report_file = report_dir / f"diagnostic_{diag.type}_{diag.id}.json"
                report_file.write_text(json.dumps({
                    "type": diag.type,
                    "title": diag.title,
                    "company_info": data.company_info if data.company_info else json.loads(diag.company_info) if diag.company_info else None,
                    "results": data.results,
                    "date": _now().isoformat(),
                }, ensure_ascii=False, indent=2), encoding="utf-8")
                diag.report_path = str(report_file)
                log.info(f"Rapport diagnostic sauvegardé : {report_file}")
        except Exception as e:
            log.warning(f"Impossible de sauvegarder le rapport diagnostic : {e}")
    diag.updated_at = _now()
    db.commit()
    db.refresh(diag)
    diag = db.query(Diagnostic).options(joinedload(Diagnostic.client)).filter(Diagnostic.id == diag.id).first()
    return _serialize_diagnostic(diag)


@app.delete("/api/diagnostics/{diag_id}")
def delete_diagnostic(diag_id: int, db: Session = Depends(get_db)):
    d = db.query(Diagnostic).filter(Diagnostic.id == diag_id).first()
    if not d:
        raise HTTPException(404, "Diagnostic non trouvé")
    db.delete(d)
    db.commit()
    return {"message": "Diagnostic supprimé"}


@app.get("/api/diagnostics/share/{token}")
def get_shared_diagnostic(token: str, db: Session = Depends(get_db)):
    """Accès public à un diagnostic via son token de partage."""
    d = db.query(Diagnostic).options(joinedload(Diagnostic.client)).filter(Diagnostic.share_token == token).first()
    if not d:
        raise HTTPException(404, "Diagnostic non trouvé ou lien invalide")
    if d.status != "termine":
        raise HTTPException(403, "Ce diagnostic n'est pas encore finalisé")
    return _serialize_diagnostic(d)


@app.get("/api/diagnostics/{diag_id}/pdf")
def generate_diagnostic_pdf(diag_id: int, db: Session = Depends(get_db)):
    """Génère un PDF du diagnostic à partir des résultats."""
    d = db.query(Diagnostic).options(joinedload(Diagnostic.client)).filter(Diagnostic.id == diag_id).first()
    if not d:
        raise HTTPException(404, "Diagnostic non trouvé")
    if not d.results:
        raise HTTPException(400, "Aucun résultat disponible pour ce diagnostic")

    results = json.loads(d.results)
    company_info = json.loads(d.company_info) if d.company_info else {}
    client_name = d.client.name if d.client else "Client"
    diag_type_label = "Cybersécurité" if d.type == "cyber" else "Conformité RGPD" if d.type == "rgpd" else "Opportunités IA"
    now_str = _now().strftime("%d/%m/%Y")

    # Construire le HTML du rapport
    sections_html = ""
    for section in results.get("sections", []):
        score_pct = section.get("score_pct", 0)
        color = "#059669" if score_pct >= 70 else "#d97706" if score_pct >= 40 else "#dc2626"
        precos_html = ""
        for preco in section.get("preconisations", []):
            precos_html += f"<li style='margin-bottom:4px'>{preco}</li>"
        sections_html += f"""
        <div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <h3 style="margin:0;color:#1f2937">{section.get('title','')}</h3>
                <span style="background:{color};color:white;padding:2px 10px;border-radius:12px;font-size:13px;font-weight:600">{score_pct}%</span>
            </div>
            <div style="background:#f3f4f6;border-radius:4px;height:8px;margin-bottom:12px"><div style="background:{color};height:8px;border-radius:4px;width:{score_pct}%"></div></div>
            {'<h4 style="font-size:13px;color:#6b7280;margin:8px 0 4px">Préconisations</h4><ul style="margin:0;padding-left:20px;font-size:13px;color:#374151">' + precos_html + '</ul>' if precos_html else ''}
        </div>"""

    global_score = results.get("global_score", 0)
    global_color = "#059669" if global_score >= 70 else "#d97706" if global_score >= 40 else "#dc2626"

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{{font-family:'Segoe UI',Tahoma,sans-serif;max-width:800px;margin:0 auto;padding:40px 30px;color:#1f2937}}
    h1{{color:#2850ff;font-size:22px;margin-bottom:4px}}
    h2{{color:#374151;font-size:16px;border-bottom:2px solid #2850ff;padding-bottom:6px;margin-top:28px}}
    .meta{{color:#6b7280;font-size:13px;margin-bottom:24px}}
    .score-global{{text-align:center;margin:30px 0;padding:24px;background:linear-gradient(135deg,#f0f4ff,#ede9fe);border-radius:12px}}
    .score-global .num{{font-size:48px;font-weight:700;color:{global_color}}}
    .score-global .label{{font-size:14px;color:#6b7280}}
    </style></head><body>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <div style="width:40px;height:40px;background:#2850ff;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700">A</div>
        <div><h1 style="margin:0">ACCESSIA Pro</h1><p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:2px">Conseil IA · PME & Entrepreneurs</p></div>
    </div>
    <h1>Rapport de Diagnostic {diag_type_label}</h1>
    <div class="meta">
        <strong>Client :</strong> {client_name} &nbsp;|&nbsp;
        <strong>Date :</strong> {now_str} &nbsp;|&nbsp;
        <strong>Réf :</strong> DIAG-{d.id:04d}
    </div>
    <div class="score-global">
        <div class="label">Score Global</div>
        <div class="num">{global_score}%</div>
        <div class="label">{'Conforme' if global_score >= 70 else 'Amélioration nécessaire' if global_score >= 40 else 'Critique'}</div>
    </div>
    <h2>Résultats par Section</h2>
    {sections_html}
    <hr style="margin-top:40px;border:none;border-top:1px solid #e5e7eb">
    <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px">
        Rapport généré automatiquement par ACCESSIA Pro — {now_str}<br>
        Ce document est confidentiel.
    </p>
    </body></html>"""

    # Essayer de générer le PDF avec weasyprint, sinon renvoyer le HTML
    try:
        from weasyprint import HTML as WeasyHTML
        pdf_bytes = WeasyHTML(string=html).write_pdf()
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="diagnostic_{d.type}_{d.id}.pdf"'
            }
        )
    except ImportError:
        # Fallback: renvoyer le HTML directement si weasyprint n'est pas installé
        return Response(
            content=html.encode("utf-8"),
            media_type="text/html",
            headers={
                "Content-Disposition": f'attachment; filename="diagnostic_{d.type}_{d.id}.html"'
            }
        )


@app.post("/api/diagnostics/{diag_id}/regenerate-token")
def regenerate_share_token(diag_id: int, db: Session = Depends(get_db)):
    """Régénère le token de partage d'un diagnostic."""
    d = db.query(Diagnostic).filter(Diagnostic.id == diag_id).first()
    if not d:
        raise HTTPException(404, "Diagnostic non trouvé")
    d.share_token = uuid.uuid4().hex
    d.updated_at = _now()
    db.commit()
    return {"id": d.id, "share_token": d.share_token}


# ═══════════════════════════════════════════════════════════════
# ALERTES
# ═══════════════════════════════════════════════════════════════

@app.get("/api/alerts")
def get_alerts(db: Session = Depends(get_db)):
    now = _now()

    # Factures en retard
    overdue_invoices_q = (
        db.query(Invoice)
        .options(joinedload(Invoice.client))
        .filter(Invoice.status == "envoyee", Invoice.due_date < now)
        .all()
    )
    overdue_invoices = [
        {
            "id": inv.id,
            "number": inv.number,
            "client_name": inv.client.name if inv.client else "",
            "amount_ttc": round(inv.amount_ht * (1 + inv.tva_rate / 100), 2),
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "days_late": (now - inv.due_date).days if inv.due_date else 0,
        }
        for inv in overdue_invoices_q
    ]

    # Tâches en retard
    overdue_tasks_q = (
        db.query(Task)
        .options(joinedload(Task.client))
        .filter(Task.status != "fait", Task.due_date != None, Task.due_date < now)
        .all()
    )
    overdue_tasks = [
        {
            "id": t.id,
            "title": t.title,
            "client_name": t.client.name if t.client else "",
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "days_late": (now - t.due_date).days if t.due_date else 0,
            "priority": t.priority,
        }
        for t in overdue_tasks_q
    ]

    # Leads silencieux (pipeline actif, aucune activité depuis 21j)
    from datetime import timedelta
    cutoff = now - timedelta(days=21)
    pipeline_stages = ["nouveau", "contact", "qualification", "proposition", "negociation"]
    silent_clients_q = (
        db.query(Client)
        .filter(Client.pipeline_stage.in_(pipeline_stages))
        .all()
    )
    silent_clients = []
    for c in silent_clients_q:
        last_act = (
            db.query(func.max(Activity.date))
            .filter(Activity.client_id == c.id)
            .scalar()
        )
        if last_act is None or (last_act.replace(tzinfo=None) < cutoff.replace(tzinfo=None)):
            silent_clients.append({
                "id": c.id,
                "name": c.name,
                "pipeline_stage": c.pipeline_stage,
                "last_activity_date": last_act.isoformat() if last_act else None,
                "days_silent": (now.replace(tzinfo=None) - last_act.replace(tzinfo=None)).days if last_act else 999,
            })

    # Échéances à venir (7 prochains jours)
    horizon = now + timedelta(days=7)
    upcoming_tasks_q = (
        db.query(Task)
        .filter(Task.status != "fait", Task.due_date >= now, Task.due_date <= horizon)
        .all()
    )
    upcoming_deadlines = [
        {
            "type": "task",
            "id": t.id,
            "title": t.title,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "days_left": (t.due_date - now).days if t.due_date else 0,
        }
        for t in upcoming_tasks_q
    ]

    return {
        "overdue_invoices": overdue_invoices,
        "overdue_tasks": overdue_tasks,
        "silent_clients": silent_clients,
        "upcoming_deadlines": upcoming_deadlines,
    }


# ═══════════════════════════════════════════════════════════════
# REPORTING
# ═══════════════════════════════════════════════════════════════

@app.get("/api/reporting")
def get_reporting(
    period: str = Query("year", regex="^(month|quarter|year)$"),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    now = _now()
    target_year = year or now.year

    # CA par mois pour l'année cible
    paid_invoices = (
        db.query(Invoice)
        .options(joinedload(Invoice.client))
        .filter(Invoice.status == "payee")
        .all()
    )

    ca_by_month: dict = {}
    for inv in paid_invoices:
        d = inv.issued_date or inv.created_at
        if d and d.year == target_year:
            m = d.month
            if m not in ca_by_month:
                ca_by_month[m] = {"month": m, "ca_ht": 0.0, "ca_ttc": 0.0, "nb_invoices": 0}
            ca_by_month[m]["ca_ht"] += inv.amount_ht
            ca_by_month[m]["ca_ttc"] += inv.amount_ht * (1 + inv.tva_rate / 100)
            ca_by_month[m]["nb_invoices"] += 1

    ca_by_month_list = [
        {**v, "ca_ht": round(v["ca_ht"], 2), "ca_ttc": round(v["ca_ttc"], 2)}
        for v in sorted(ca_by_month.values(), key=lambda x: x["month"])
    ]

    # CA par client
    ca_by_client: dict = {}
    for inv in paid_invoices:
        cname = inv.client.name if inv.client else "Inconnu"
        if cname not in ca_by_client:
            ca_by_client[cname] = {"client_name": cname, "ca_ht": 0.0, "nb_projects": set()}
        ca_by_client[cname]["ca_ht"] += inv.amount_ht
        if inv.project_id:
            ca_by_client[cname]["nb_projects"].add(inv.project_id)

    ca_by_client_list = sorted(
        [{"client_name": k, "ca_ht": round(v["ca_ht"], 2), "nb_projects": len(v["nb_projects"])}
         for k, v in ca_by_client.items()],
        key=lambda x: x["ca_ht"],
        reverse=True,
    )[:10]

    # CA par type de mission (via projets)
    projects = db.query(Project).filter(Project.status == "termine").all()
    ca_by_type: dict = {}
    for p in projects:
        t = p.type or "autre"
        if t not in ca_by_type:
            ca_by_type[t] = {"type": t, "ca_ht": 0.0}
        ca_by_type[t]["ca_ht"] += p.budget or 0

    return {
        "ca_by_month": ca_by_month_list,
        "ca_by_client": ca_by_client_list,
        "ca_by_type": [{"type": k, "ca_ht": round(v["ca_ht"], 2)} for k, v in ca_by_type.items()],
        "top_clients": ca_by_client_list[:5],
    }


# ═══════════════════════════════════════════════════════════════
# DEVIS (QUOTES)
# ═══════════════════════════════════════════════════════════════

def _next_quote_number(db: Session) -> str:
    year = _now().year
    count = db.query(func.count(Quote.id)).filter(
        Quote.number.like(f"ACC-DEV-{year}-%")
    ).scalar() or 0
    return f"ACC-DEV-{year}-{count + 1:03d}"


class QuoteItemIn(BaseModel):
    name: str
    qty: float = 1
    unit_price: float
    description: Optional[str] = None


class QuoteCreate(BaseModel):
    client_id: int
    project_id: Optional[int] = None
    title: str
    items: List[QuoteItemIn] = []
    amount_ht: Optional[float] = None  # calculé depuis items si non fourni
    tva_rate: float = 20.0
    status: str = "brouillon"
    valid_until: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class QuoteUpdate(QuoteCreate):
    pass


@app.get("/api/quotes")
def list_quotes(
    client_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Quote).options(joinedload(Quote.client), joinedload(Quote.project))
    if client_id:
        q = q.filter(Quote.client_id == client_id)
    if status:
        q = q.filter(Quote.status == status)
    quotes = q.order_by(Quote.created_at.desc()).all()
    return [_serialize_quote(qt) for qt in quotes]


@app.post("/api/quotes", status_code=201)
def create_quote(body: QuoteCreate, db: Session = Depends(get_db)):
    valid_until = None
    if body.valid_until:
        try:
            valid_until = datetime.fromisoformat(body.valid_until.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(422, f"Format de date invalide : {body.valid_until!r}. Utilisez ISO 8601 (ex: 2026-12-31)")
    items_data = [i.model_dump() for i in body.items]
    amount_ht = body.amount_ht if body.amount_ht is not None else sum(
        i["qty"] * i["unit_price"] for i in items_data
    )
    qt = Quote(
        number=_next_quote_number(db),
        client_id=body.client_id,
        project_id=body.project_id,
        title=body.title,
        amount_ht=amount_ht,
        tva_rate=body.tva_rate,
        status=body.status,
        valid_until=valid_until,
        description=body.description,
        notes=body.notes,
        items_json=json.dumps(items_data, ensure_ascii=False),
        sign_token=uuid.uuid4().hex,
        created_at=_now(),
        updated_at=_now(),
    )
    try:
        db.add(qt)
        db.commit()
        db.refresh(qt)
    except IntegrityError:
        db.rollback()
        qt.number = _next_quote_number(db)
        db.add(qt)
        db.commit()
        db.refresh(qt)
    return _serialize_quote(qt)


@app.put("/api/quotes/{quote_id}")
def update_quote(quote_id: int, body: QuoteUpdate, db: Session = Depends(get_db)):
    qt = db.query(Quote).filter(Quote.id == quote_id).first()
    if not qt:
        raise HTTPException(404, "Devis non trouvé")
    valid_until = None
    if body.valid_until:
        try:
            valid_until = datetime.fromisoformat(body.valid_until.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(422, f"Format de date invalide : {body.valid_until!r}. Utilisez ISO 8601 (ex: 2026-12-31)")
    items_data = [i.model_dump() for i in body.items]
    amount_ht = body.amount_ht if body.amount_ht is not None else sum(
        i["qty"] * i["unit_price"] for i in items_data
    )
    qt.client_id = body.client_id
    qt.project_id = body.project_id
    qt.title = body.title
    qt.amount_ht = amount_ht
    qt.tva_rate = body.tva_rate
    qt.status = body.status
    qt.valid_until = valid_until
    qt.description = body.description
    qt.notes = body.notes
    qt.items_json = json.dumps(items_data, ensure_ascii=False)
    qt.updated_at = _now()
    db.commit()
    db.refresh(qt)
    return _serialize_quote(qt)


@app.patch("/api/quotes/{quote_id}/status")
def patch_quote_status(quote_id: int, body: dict, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    qt = db.query(Quote).filter(Quote.id == quote_id).first()
    if not qt:
        raise HTTPException(404, "Devis non trouvé")
    qt.status = body.get("status", qt.status)
    qt.updated_at = _now()
    db.commit()
    if qt.status == "accepte":
        background_tasks.add_task(_fire_webhooks_sync, db_url=os.getenv("DATABASE_URL", "sqlite:///./sensia.db"), event="quote.accepted", payload={"id": qt.id, "number": qt.number})
    return {"id": qt.id, "status": qt.status}


@app.post("/api/quotes/{quote_id}/convert")
def convert_quote_to_invoice(quote_id: int, db: Session = Depends(get_db)):
    qt = db.query(Quote).filter(Quote.id == quote_id).first()
    if not qt:
        raise HTTPException(404, "Devis non trouvé")
    inv = Invoice(
        number=_next_invoice_number(db),
        client_id=qt.client_id,
        project_id=qt.project_id,
        amount_ht=qt.amount_ht,
        tva_rate=qt.tva_rate,
        status="brouillon",
        issued_date=_now(),
        notes=f"Converti depuis le devis {qt.number}",
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(inv)
    qt.status = "accepte"
    qt.updated_at = _now()
    db.commit()
    db.refresh(inv)
    return {"invoice_id": inv.id, "invoice_number": inv.number}


@app.delete("/api/quotes/{quote_id}", status_code=204)
def delete_quote(quote_id: int, db: Session = Depends(get_db)):
    qt = db.query(Quote).filter(Quote.id == quote_id).first()
    if not qt:
        raise HTTPException(404, "Devis non trouvé")
    db.delete(qt)
    db.commit()


def _serialize_quote(qt: Quote) -> dict:
    items = _safe_json_loads(qt.items_json)
    return {
        "id": qt.id,
        "number": qt.number,
        "client_id": qt.client_id,
        "client_name": qt.client.name if qt.client else "",
        "client_address": qt.client.address if qt.client else "",
        "project_id": qt.project_id,
        "project_name": qt.project.name if qt.project else None,
        "title": qt.title,
        "items": items,
        "amount_ht": qt.amount_ht,
        "tva_rate": qt.tva_rate,
        "amount_ttc": round(qt.amount_ht * (1 + qt.tva_rate / 100), 2),
        "status": qt.status,
        "valid_until": qt.valid_until.isoformat() if qt.valid_until else None,
        "description": qt.description,
        "notes": qt.notes,
        "created_at": qt.created_at.isoformat() if qt.created_at else None,
        "updated_at": qt.updated_at.isoformat() if qt.updated_at else None,
        "sign_token": getattr(qt, "sign_token", None),
        "signed_at": qt.signed_at.isoformat() if getattr(qt, "signed_at", None) else None,
        "signed_by": getattr(qt, "signed_by", None),
        "is_template": getattr(qt, "is_template", False),
        "template_name": getattr(qt, "template_name", None),
    }


# ═══════════════════════════════════════════════════════════════
# SUIVI DU TEMPS (TIME ENTRIES)
# ═══════════════════════════════════════════════════════════════

class TimeEntryCreate(BaseModel):
    project_id: int
    client_id: int
    date: Optional[str] = None
    duration_minutes: int
    description: Optional[str] = None


@app.get("/api/time-entries")
def list_time_entries(
    project_id: Optional[int] = Query(None),
    client_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(TimeEntry).options(joinedload(TimeEntry.project), joinedload(TimeEntry.client))
    if project_id:
        q = q.filter(TimeEntry.project_id == project_id)
    if client_id:
        q = q.filter(TimeEntry.client_id == client_id)
    entries = q.order_by(TimeEntry.date.desc()).all()
    return [_serialize_time_entry(e) for e in entries]


@app.post("/api/time-entries", status_code=201)
def create_time_entry(body: TimeEntryCreate, db: Session = Depends(get_db)):
    entry_date = _now()
    if body.date:
        try:
            entry_date = datetime.fromisoformat(body.date.replace("Z", "+00:00"))
        except Exception:
            pass
    e = TimeEntry(
        project_id=body.project_id,
        client_id=body.client_id,
        date=entry_date,
        duration_minutes=body.duration_minutes,
        description=body.description,
        created_at=_now(),
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return _serialize_time_entry(e)


@app.delete("/api/time-entries/{entry_id}", status_code=204)
def delete_time_entry(entry_id: int, db: Session = Depends(get_db)):
    e = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not e:
        raise HTTPException(404, "Entrée non trouvée")
    db.delete(e)
    db.commit()


def _serialize_time_entry(e: TimeEntry) -> dict:
    return {
        "id": e.id,
        "project_id": e.project_id,
        "project_name": e.project.name if e.project else "",
        "client_id": e.client_id,
        "client_name": e.client.name if e.client else "",
        "date": e.date.isoformat() if e.date else None,
        "duration_minutes": e.duration_minutes,
        "description": e.description,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


# ═══════════════════════════════════════════════════════════════
# RECHERCHE ENTREPRISE + ÉLIGIBILITÉ AIDES IA
# ═══════════════════════════════════════════════════════════════

_NAF_SECTORS: dict[str, str] = {
    "01": "Agriculture", "02": "Sylviculture", "03": "Pêche",
    "05": "Extraction charbon", "06": "Extraction pétrole/gaz", "07": "Extraction minerais",
    "10": "Agroalimentaire", "11": "Boissons", "13": "Textile", "14": "Habillement",
    "16": "Bois / Papier", "17": "Papier / Carton", "18": "Imprimerie",
    "20": "Chimie", "21": "Pharmacie", "22": "Plastiques / Caoutchouc",
    "23": "Minéraux / Verre / Ciment", "24": "Métallurgie", "25": "Fabrication métallique",
    "26": "Électronique / Informatique", "27": "Équipements électriques",
    "28": "Machines industrielles", "29": "Automobile", "30": "Autres transports",
    "33": "Réparation machines", "35": "Énergie / Électricité / Gaz",
    "36": "Eau / Distribution", "37": "Assainissement", "38": "Déchets / Recyclage",
    "41": "Construction BTP", "42": "Génie civil", "43": "Travaux spécialisés",
    "45": "Commerce auto", "46": "Commerce de gros", "47": "Commerce de détail",
    "49": "Transport terrestre", "50": "Transport maritime", "51": "Transport aérien",
    "52": "Logistique / Entreposage", "55": "Hôtellerie", "56": "Restauration",
    "58": "Édition", "59": "Audiovisuel / Cinéma", "60": "Radio / TV",
    "61": "Télécommunications", "62": "Informatique / Développement",
    "63": "Services informatiques / Data", "64": "Finance / Banque",
    "65": "Assurance", "66": "Services financiers",
    "68": "Immobilier", "69": "Droit / Comptabilité",
    "70": "Conseil aux entreprises", "71": "Ingénierie / Architecture",
    "72": "Recherche & Développement", "73": "Publicité / Communication",
    "74": "Activités spécialisées", "75": "Vétérinaire",
    "77": "Location", "78": "Recrutement / RH", "79": "Tourisme",
    "80": "Sécurité / Surveillance", "81": "Services aux bâtiments",
    "82": "Services administratifs", "84": "Administration publique",
    "85": "Éducation / Formation", "86": "Santé / Médical",
    "87": "Hébergement médico-social", "88": "Services sociaux",
    "90": "Arts / Spectacle", "91": "Bibliothèques / Musées",
    "92": "Jeux / Paris", "93": "Sport / Loisirs",
    "94": "Associations", "95": "Réparation", "96": "Services personnels",
    "97": "Ménages employeurs", "99": "Organisations internationales",
}

_EFFECTIF_LABELS: dict[str, str] = {
    "NN": "Non employeuse",
    "00": "0 salarié",
    "01": "1 à 2",
    "02": "3 à 5",
    "03": "6 à 9",
    "11": "10 à 19",
    "12": "20 à 49",
    "21": "50 à 99",
    "22": "100 à 199",
    "31": "200 à 249",
    "32": "250 à 499",
    "41": "500 à 999",
    "42": "1 000 à 1 999",
    "51": "2 000 à 4 999",
    "52": "5 000 à 9 999",
    "53": "10 000 et plus",
}

# Ordre croissant des tranches d'effectif
_EFFECTIF_ORDER = ["NN", "00", "01", "02", "03", "11", "12", "21", "22", "31", "32", "41", "42", "51", "52", "53"]


def _naf_sector_label(naf_code: str) -> str:
    prefix = naf_code[:2] if naf_code and len(naf_code) >= 2 else ""
    return _NAF_SECTORS.get(prefix, f"Secteur NAF {naf_code}")


def _effectif_rank(code: str) -> int:
    try:
        return _EFFECTIF_ORDER.index(code)
    except ValueError:
        return 0


def _company_age_years(date_creation: Optional[str]) -> Optional[float]:
    if not date_creation:
        return None
    try:
        d = date_type.fromisoformat(date_creation)
        return (date_type.today() - d).days / 365.25
    except Exception:
        return None


def _compute_grants(company: dict) -> list:
    """Calcule l'éligibilité aux aides IA pour une entreprise donnée."""
    effectif_code = company.get("effectif_code") or "NN"
    categorie = company.get("categorie") or ""  # PME, ETI, GE
    date_creation = company.get("date_creation")
    region = company.get("region") or ""
    naf_code = company.get("naf_code") or ""

    age = _company_age_years(date_creation)
    age_ok = age is not None and age >= 1
    age_label = f"{age:.1f} an(s)" if age is not None else "inconnu"

    rank = _effectif_rank(effectif_code)
    has_10_plus = rank >= _EFFECTIF_ORDER.index("11")      # >= 10 salariés
    has_2000_or_less = rank <= _EFFECTIF_ORDER.index("42") # <= 1 999 salariés
    has_employees = rank > _EFFECTIF_ORDER.index("00")     # au moins 1 salarié
    is_pme = categorie in ("PME", "TPE") or (rank <= _EFFECTIF_ORDER.index("31"))  # < 250 salariés

    grants = []

    # ── Diag Data IA — BPI France ─────────────────────────────
    diag_ok = has_10_plus and has_2000_or_less and age_ok
    diag_missing = []
    diag_ok_list = []
    if has_10_plus:
        diag_ok_list.append(f"Effectif ≥ 10 ({_EFFECTIF_LABELS.get(effectif_code, effectif_code)})")
    else:
        diag_missing.append(f"Effectif < 10 ({_EFFECTIF_LABELS.get(effectif_code, effectif_code)})")
    if has_2000_or_less:
        diag_ok_list.append("Effectif ≤ 2 000")
    else:
        diag_missing.append("Effectif > 2 000 (ETI/GE exclu)")
    if age_ok:
        diag_ok_list.append(f"Société > 1 an ({age_label})")
    else:
        diag_missing.append(f"Ancienneté insuffisante ({age_label})")
    diag_missing.append("CA > 1M€ à vérifier")

    grants.append({
        "id": "diag_data_ia",
        "name": "Diag Data IA — BPI France",
        "description": "8 jours d'expert IA pour identifier vos cas d'usage et la valeur métier",
        "eligible": diag_ok,
        "confidence": "high" if diag_ok else ("medium" if (has_employees and age_ok) else "low"),
        "amount_label": "~7 500€ économisés (25% pris en charge)",
        "amount_max": 7500,
        "conditions_ok": diag_ok_list,
        "conditions_missing": diag_missing,
        "url": "https://diag.bpifrance.fr/diag-data-ia",
        "deadline": "Prochaine clôture : 28 avril 2026",
    })

    # ── IA Booster France 2030 — BPI France ──────────────────
    boost_ok = has_10_plus and has_2000_or_less and age_ok
    boost_ok_list = list(diag_ok_list)
    boost_missing = ["CA > 250 000€ à vérifier", "Projet IA structuré requis"]
    if not has_10_plus:
        boost_missing.insert(0, f"Effectif < 10 ({_EFFECTIF_LABELS.get(effectif_code, effectif_code)})")

    grants.append({
        "id": "ia_booster",
        "name": "IA Booster France 2030 — BPI France",
        "description": "Diagnostic + accompagnement + financement de projets IA (40 à 80% couverts)",
        "eligible": boost_ok,
        "confidence": "high" if boost_ok else ("medium" if has_employees else "low"),
        "amount_label": "Jusqu'à 80% du projet financé",
        "amount_max": 0,
        "conditions_ok": boost_ok_list,
        "conditions_missing": boost_missing,
        "url": "https://www.bpifrance.fr/catalogue-offres/ia-booster-france-2030",
        "deadline": "Prochaines clôtures : 28 avr. 2026 / 25 nov. 2026",
    })

    # ── Crédit d'Impôt Innovation (CII) ──────────────────────
    cii_ok = is_pme
    cii_ok_list = []
    cii_missing = []
    if is_pme:
        cii_ok_list.append(f"PME confirmée ({categorie or 'taille compatible'})")
    else:
        cii_missing.append(f"Réservé aux PME (< 250 salariés) — catégorie : {categorie}")
    cii_ok_list.append("Régime fiscal réel requis")
    cii_missing.append("Dépenses R&D/prototype à documenter")

    grants.append({
        "id": "cii",
        "name": "Crédit d'Impôt Innovation (CII)",
        "description": "20% des dépenses de prototype et pilote IA déductibles de l'IS",
        "eligible": cii_ok,
        "confidence": "medium",
        "amount_label": "20% des dépenses innovation",
        "amount_max": 0,
        "conditions_ok": cii_ok_list,
        "conditions_missing": cii_missing,
        "url": "https://www.bpifrance.fr/nos-solutions/financements/credits-impots/cii",
        "deadline": "Valable jusqu'au 31 décembre 2027",
    })

    # ── OPCO Formation IA ─────────────────────────────────────
    opco_ok = has_employees
    opco_ok_list = []
    opco_missing = []
    if has_employees:
        opco_ok_list.append(f"Effectif salarié ({_EFFECTIF_LABELS.get(effectif_code, effectif_code)})")
    else:
        opco_missing.append("Aucun salarié déclaré")
    opco_missing.append("Prestataire Qualiopi requis")
    opco_missing.append("OPCO sectoriel à identifier")

    grants.append({
        "id": "opco_formation",
        "name": "OPCO — Formation IA",
        "description": "Financement des formations IA par l'Opérateur de Compétences sectoriel",
        "eligible": opco_ok,
        "confidence": "medium" if opco_ok else "low",
        "amount_label": "Jusqu'à 3 500€/salarié/an",
        "amount_max": 3500,
        "conditions_ok": opco_ok_list,
        "conditions_missing": opco_missing,
        "url": "https://www.opco-atlas.fr",
        "deadline": None,
    })

    # ── Aide régionale ────────────────────────────────────────
    has_region = bool(region)
    region_ok_list = [f"Région identifiée : {region}"] if has_region else []
    region_missing = []
    if not has_region:
        region_missing.append("Région non identifiée")
    region_missing.append("Taux variable selon région (30–50%)")
    region_missing.append("Contacter votre Conseil Régional")

    grants.append({
        "id": "aide_regionale",
        "name": "Aide régionale — Conseil Régional",
        "description": "Subventions régionales pour la transformation numérique et IA des PME",
        "eligible": has_region and is_pme,
        "confidence": "low",
        "amount_label": "30 à 50% selon région",
        "amount_max": 0,
        "conditions_ok": region_ok_list,
        "conditions_missing": region_missing,
        "url": "https://www.regions-de-france.eu",
        "deadline": None,
    })

    # ── Chèque France Num ─────────────────────────────────────
    # Aide au numérique pour TPE/PME : 500€ de chèque numérique (cofinancement 50%)
    cheque_ok = is_pme and has_employees
    cheque_ok_list = []
    cheque_missing = []
    if is_pme:
        cheque_ok_list.append(f"TPE/PME éligible ({categorie or 'taille compatible'})")
    else:
        cheque_missing.append(f"Réservé aux TPE/PME — catégorie : {categorie}")
    if has_employees:
        cheque_ok_list.append("Entreprise avec salariés")
    else:
        cheque_missing.append("Statut salarié à vérifier")
    cheque_missing.append("Prestataire labelisé France Num requis")

    grants.append({
        "id": "cheque_france_num",
        "name": "Chèque France Num",
        "description": "500€ de cofinancement pour démarrer votre transformation numérique avec un prestataire labelisé",
        "eligible": cheque_ok,
        "confidence": "high" if cheque_ok else "low",
        "amount_label": "500€ (50% du projet, max 1 000€ HT)",
        "amount_max": 500,
        "conditions_ok": cheque_ok_list,
        "conditions_missing": cheque_missing,
        "url": "https://www.francenum.gouv.fr/cheque-numerique",
        "deadline": "Dispositif actif — dossier en ligne",
    })

    # ── CIR — Crédit d'Impôt Recherche ───────────────────────
    # 30% des dépenses R&D déductibles, plafonné à 100M€
    # Applicable aux secteurs tech/R&D/industrie
    naf_prefix = naf_code[:2] if naf_code else ""
    is_rd_sector = naf_prefix in ("62", "63", "72", "26", "21", "20", "28", "29", "30", "71", "70")
    cir_ok = is_rd_sector  # accessible à toutes tailles mais pertinent pour tech/R&D
    cir_ok_list = []
    cir_missing = []
    if is_rd_sector:
        cir_ok_list.append(f"Secteur R&D/Tech éligible ({_naf_sector_label(naf_code)})")
    else:
        cir_missing.append(f"Secteur peu concerné ({_naf_sector_label(naf_code) if naf_code else 'non renseigné'})")
    cir_missing.append("Dépenses R&D à documenter (chercheurs, prototypes)")
    cir_missing.append("Déclaration 2069-A-SD à joindre à la liasse fiscale")

    grants.append({
        "id": "cir",
        "name": "CIR — Crédit d'Impôt Recherche",
        "description": "30% des dépenses de R&D déductibles de l'IS — applicable projets IA si recherche documentée",
        "eligible": cir_ok,
        "confidence": "medium" if cir_ok else "low",
        "amount_label": "30% des dépenses R&D (plafond 100M€)",
        "amount_max": 0,
        "conditions_ok": cir_ok_list,
        "conditions_missing": cir_missing,
        "url": "https://www.enseignementsup-recherche.gouv.fr/fr/le-credit-d-impot-recherche-cir-46649",
        "deadline": "Valable jusqu'au 31 décembre 2027",
    })

    return grants


def _normalize_company(r: dict) -> dict:
    """Normalise un résultat de l'API gouvernementale."""
    siege = r.get("siege") or {}
    naf_code = (r.get("activite_principale") or siege.get("activite_principale") or "").strip()
    effectif_code = (r.get("tranche_effectif_salarie") or siege.get("tranche_effectif_salarie") or "NN").strip()
    categorie_raw = (r.get("categorie_entreprise") or "").strip().upper()
    # L'API retourne parfois "PME", "TPE", "ETI", "GE"
    if categorie_raw in ("PME", "TPE", "ETI", "GE"):
        categorie = categorie_raw
    elif effectif_code in ("NN", "00", "01", "02", "03"):
        categorie = "TPE"
    elif effectif_code in ("11", "12", "21", "22", "31"):
        categorie = "PME"
    elif effectif_code in ("32", "41", "42"):
        categorie = "ETI"
    else:
        categorie = "GE"

    postal_code = siege.get("code_postal") or ""
    region = siege.get("libelle_region") or ""

    address_parts = [p for p in [
        siege.get("numero_voie"), siege.get("type_voie"), siege.get("libelle_voie"),
    ] if p]
    address = " ".join(address_parts)

    date_creation = r.get("date_creation") or siege.get("date_creation")

    company = {
        "siren": r.get("siren") or "",
        "siret_siege": siege.get("siret") or r.get("siret_siege") or "",
        "name": r.get("nom_complet") or r.get("denomination") or "",
        "naf_code": naf_code,
        "naf_label": _naf_sector_label(naf_code),
        "effectif_code": effectif_code,
        "effectif_label": _EFFECTIF_LABELS.get(effectif_code, effectif_code),
        "categorie": categorie,
        "status": "actif" if (r.get("etat_administratif") or siege.get("etat_administratif")) == "A" else "cessé",
        "date_creation": date_creation,
        "address": address or siege.get("adresse") or "",
        "postal_code": postal_code,
        "city": siege.get("libelle_commune") or "",
        "region": region,
    }
    company["grants"] = _compute_grants(company)
    return company


@app.get("/api/search-company")
def search_company(q: str = Query(..., min_length=2)):
    """Recherche une entreprise française par nom, SIREN ou SIRET via l'API officielle."""
    import re
    q_clean = q.strip().replace(" ", "").replace("-", "")
    # Auto-détection SIREN (9 chiffres) ou SIRET (14 chiffres) pour recherche exacte
    if re.fullmatch(r"\d{9}", q_clean):
        search_q = q_clean  # SIREN exact
    elif re.fullmatch(r"\d{14}", q_clean):
        search_q = q_clean  # SIRET exact
    else:
        search_q = q.strip()
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(
                "https://recherche-entreprises.api.gouv.fr/search",
                params={"q": search_q, "per_page": 10, "page": 1},
                headers={"User-Agent": "ACCESSIA-Pro/1.0"},
            )
            resp.raise_for_status()
        data = resp.json()
        results = [_normalize_company(r) for r in data.get("results", [])]
        return {"results": results, "total": data.get("total_results", len(results))}
    except httpx.TimeoutException:
        raise HTTPException(504, "L'API entreprises n'a pas répondu (timeout)")
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Erreur d'accès à l'API entreprises : {str(e)}")


# ═══════════════════════════════════════════════════════════════
# DEVIS — PDF / HTML
# ═══════════════════════════════════════════════════════════════

@app.get("/api/quotes/{quote_id}/pdf")
def quote_pdf(quote_id: int, db: Session = Depends(get_db)):
    qt = db.query(Quote).options(joinedload(Quote.client)).filter(Quote.id == quote_id).first()
    if not qt:
        raise HTTPException(404, "Devis non trouvé")

    items = _safe_json_loads(qt.items_json)
    client = qt.client
    tva_amount = round(qt.amount_ht * qt.tva_rate / 100, 2)
    amount_ttc = round(qt.amount_ht + tva_amount, 2)

    valid_until_str = ""
    if qt.valid_until:
        try:
            valid_until_str = qt.valid_until.strftime("%d/%m/%Y")
        except Exception:
            valid_until_str = str(qt.valid_until)[:10]

    created_str = qt.created_at.strftime("%d/%m/%Y") if qt.created_at else datetime.now().strftime("%d/%m/%Y")
    valid_until_html = (
        f'<div class="meta-item"><div class="meta-label">Valide jusqu\'au</div>'
        f'<div class="meta-value">{valid_until_str}</div></div>'
        if valid_until_str else ""
    )

    # Tableau des lignes
    rows_html = ""
    for item in items:
        qty = item.get('qty', 1)
        unit = item.get('unit_price', 0)
        total = round(qty * unit, 2)
        desc = item.get('description') or ''
        rows_html += f"""
        <tr>
          <td class="item-name">
            <strong>{item.get('name', '')}</strong>
            {f'<br><span class="item-desc">{desc}</span>' if desc else ''}
          </td>
          <td class="center">{qty:g}</td>
          <td class="right">{unit:,.0f} €</td>
          <td class="right total-col">{total:,.0f} €</td>
        </tr>"""

    if not items:
        rows_html = f"""<tr><td colspan="4" class="center" style="color:#6b7280;padding:20px">
        Montant forfaitaire : {qt.amount_ht:,.0f} € HT</td></tr>"""

    notes_html = f'<div class="notes-box"><strong>Notes :</strong> {qt.notes}</div>' if qt.notes else ''
    desc_html = f'<p style="color:#374151;font-size:13px;margin-bottom:16px">{qt.description}</p>' if qt.description else ''

    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Devis {qt.number}</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: 'Helvetica Neue', Arial, sans-serif; color: #1f2937; background: #fff; padding: 40px; max-width: 860px; margin: 0 auto; }}
  .header {{ display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 3px solid #2850ff; }}
  .logo {{ display: flex; align-items: center; gap: 12px; }}
  .logo-badge {{ width: 48px; height: 48px; background: #2850ff; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; font-weight: 900; }}
  .logo-text {{ font-size: 22px; font-weight: 800; color: #1f2937; }}
  .logo-sub {{ font-size: 11px; color: #6b7280; margin-top: 2px; letter-spacing: 0.5px; text-transform: uppercase; }}
  .header-right {{ text-align: right; }}
  .devis-title {{ font-size: 28px; font-weight: 800; color: #2850ff; }}
  .devis-number {{ font-size: 13px; color: #6b7280; margin-top: 4px; }}
  .parties {{ display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }}
  .party-box {{ background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; }}
  .party-label {{ font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; font-weight: 700; margin-bottom: 8px; }}
  .party-name {{ font-size: 16px; font-weight: 700; color: #111827; }}
  .party-detail {{ font-size: 12px; color: #6b7280; margin-top: 4px; line-height: 1.6; }}
  .meta {{ display: flex; gap: 24px; margin-bottom: 24px; flex-wrap: wrap; }}
  .meta-item {{ background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 16px; }}
  .meta-label {{ font-size: 10px; text-transform: uppercase; color: #3b82f6; font-weight: 700; letter-spacing: 0.5px; }}
  .meta-value {{ font-size: 14px; font-weight: 700; color: #1e40af; margin-top: 2px; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 24px; }}
  thead th {{ background: #2850ff; color: white; padding: 12px 14px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }}
  thead th:first-child {{ text-align: left; border-radius: 6px 0 0 6px; }}
  thead th:last-child {{ border-radius: 0 6px 6px 0; }}
  tbody tr {{ border-bottom: 1px solid #f3f4f6; }}
  tbody tr:hover {{ background: #f9fafb; }}
  td {{ padding: 14px; font-size: 13px; vertical-align: top; }}
  .item-name {{ max-width: 400px; }}
  .item-desc {{ font-size: 11px; color: #6b7280; font-style: italic; }}
  .center {{ text-align: center; }}
  .right {{ text-align: right; }}
  .total-col {{ font-weight: 600; color: #111827; }}
  .totals {{ margin-left: auto; width: 280px; margin-bottom: 24px; }}
  .total-row {{ display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6; }}
  .total-row:last-child {{ border-bottom: none; font-size: 18px; font-weight: 800; color: #1e40af; padding: 14px 0 0; }}
  .notes-box {{ background: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 14px; font-size: 12px; color: #713f12; margin-bottom: 24px; }}
  .conditions {{ background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; font-size: 11px; color: #6b7280; line-height: 1.8; margin-bottom: 32px; }}
  .footer {{ text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; }}
  @media print {{
    body {{ padding: 20px; }}
    .no-print {{ display: none !important; }}
    thead th {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #2850ff !important; }}
    .logo-badge {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
  }}
</style>
</head>
<body>

<div class="header">
  <div class="logo">
    <div class="logo-badge">A</div>
    <div>
      <div class="logo-text">ACCESSIA Pro</div>
      <div class="logo-sub">Intelligence Artificielle & Transformation Digitale</div>
    </div>
  </div>
  <div class="header-right">
    <div class="devis-title">DEVIS</div>
    <div class="devis-number">{qt.number}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:6px">Émis le {created_str}</div>
  </div>
</div>

<div class="parties">
  <div class="party-box">
    <div class="party-label">Prestataire</div>
    <div class="party-name">ACCESSIA Pro</div>
    <div class="party-detail">
      Conseil & Intégration IA pour PME<br>
      contact@accessia.pro<br>
      www.accessia.pro
    </div>
  </div>
  <div class="party-box">
    <div class="party-label">Client</div>
    <div class="party-name">{client.name if client else '—'}</div>
    <div class="party-detail">
      {client.contact_name or '' if client else ''}<br>
      {client.contact_email or '' if client else ''}<br>
      {client.address or '' if client else ''}
    </div>
  </div>
</div>

<div class="meta">
  <div class="meta-item">
    <div class="meta-label">Référence</div>
    <div class="meta-value">{qt.number}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Date d'émission</div>
    <div class="meta-value">{created_str}</div>
  </div>
  {valid_until_html}
  <div class="meta-item">
    <div class="meta-label">TVA</div>
    <div class="meta-value">{qt.tva_rate:g}%</div>
  </div>
</div>

<h2 style="font-size:15px;font-weight:700;color:#1f2937;margin-bottom:12px">{qt.title}</h2>
{desc_html}

<table>
  <thead>
    <tr>
      <th style="text-align:left">Prestation / Description</th>
      <th class="center" style="width:70px">Qté</th>
      <th class="right" style="width:130px">Prix unitaire HT</th>
      <th class="right" style="width:130px">Total HT</th>
    </tr>
  </thead>
  <tbody>
    {rows_html}
  </tbody>
</table>

<div class="totals">
  <div class="total-row"><span>Sous-total HT</span><span>{qt.amount_ht:,.0f} €</span></div>
  <div class="total-row"><span>TVA ({qt.tva_rate:g}%)</span><span>{tva_amount:,.0f} €</span></div>
  <div class="total-row"><span>TOTAL TTC</span><span>{amount_ttc:,.0f} €</span></div>
</div>

{notes_html}

<div class="conditions">
  <strong>Conditions générales :</strong><br>
  • Tous les prix sont indiqués hors taxes (TVA applicable au taux en vigueur).<br>
  • Acompte de <strong>30% à la signature</strong>, solde à la livraison.<br>
  • Devis valable 30 jours à compter de la date d'émission.<br>
  • Propriété intellectuelle : le code développé est la propriété du client après règlement complet.<br>
  • Les missions peuvent être financées via OPCO, CPF, BPI France, aides régionales — ACCESSIA accompagne les démarches.<br>
  • Déplacements hors Île-de-France facturés au réel.
</div>

<div class="footer">
  ACCESSIA Pro — Conseil & Intégration IA · contact@accessia.pro · www.accessia.pro<br>
  Document généré le {datetime.now().strftime("%d/%m/%Y à %H:%M")} — Confidentiel
</div>

<div class="no-print" style="text-align:center;margin-top:32px">
  <button onclick="window.print()" style="background:#2850ff;color:white;border:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">
    🖨️ Imprimer / Télécharger en PDF
  </button>
</div>

</body>
</html>"""

    try:
        import weasyprint  # type: ignore
        pdf_bytes = weasyprint.HTML(string=html).write_pdf()
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="devis_{qt.number}.pdf"'},
        )
    except Exception:
        return Response(
            content=html.encode("utf-8"),
            media_type="text/html; charset=utf-8",
            headers={"Content-Disposition": f'inline; filename="devis_{qt.number}.html"'},
        )


# ═══════════════════════════════════════════════════════════════
# SAUVEGARDE (BACKUP)
# ═══════════════════════════════════════════════════════════════

_DB_PATH = Path(__file__).parent / "sensia.db"
_BACKUP_DIR = file_service.SENSIA_BASE / "07_ADMINISTRATIF" / "Sauvegardes"
_LAST_BACKUP_FILE = Path(__file__).parent / ".last_backup"


def _create_backup_now() -> dict:
    """Crée une sauvegarde horodatée de la BDD et du catalogue."""
    _BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    files = []

    if _DB_PATH.exists():
        dest = _BACKUP_DIR / f"sensia_{ts}.db"
        shutil.copy2(_DB_PATH, dest)
        files.append(str(dest))

    catalogue = file_service.CATALOGUE_PATH
    if catalogue.exists():
        dest = _BACKUP_DIR / f"catalogue_{ts}.md"
        shutil.copy2(catalogue, dest)
        files.append(str(dest))

    _LAST_BACKUP_FILE.write_text(ts)
    return {"timestamp": ts, "files": files, "count": len(files)}


def _auto_backup_if_needed():
    """Crée un backup automatique si le dernier date de plus de 24h."""
    try:
        if _LAST_BACKUP_FILE.exists():
            last_ts = _LAST_BACKUP_FILE.read_text().strip()
            last_dt = datetime.strptime(last_ts, "%Y%m%d_%H%M%S")
            if (datetime.now() - last_dt).total_seconds() < 86400:
                return
        _create_backup_now()
        log.info("Sauvegarde automatique créée")
    except Exception as e:
        log.warning(f"Sauvegarde automatique échouée : {e}")


_auto_backup_if_needed()


@app.post("/api/backup/create")
def backup_create():
    try:
        result = _create_backup_now()
        return result
    except Exception as e:
        raise HTTPException(500, f"Erreur de sauvegarde : {e}")


@app.get("/api/backup/list")
def backup_list():
    if not _BACKUP_DIR.exists():
        return {"backups": [], "last_backup": None}
    backups = []
    for f in sorted(_BACKUP_DIR.iterdir(), reverse=True):
        if f.suffix in (".db", ".md") and not f.name.startswith("."):
            backups.append({
                "name": f.name,
                "size": f.stat().st_size,
                "created_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            })
    last = None
    if _LAST_BACKUP_FILE.exists():
        last = _LAST_BACKUP_FILE.read_text().strip()
    return {"backups": backups[:20], "last_backup": last}


@app.post("/api/backup/restore/{filename}")
def backup_restore(filename: str):
    if not filename.endswith(".db") or "/" in filename or ".." in filename:
        raise HTTPException(400, "Nom de fichier invalide")
    src = _BACKUP_DIR / filename
    if not src.exists():
        raise HTTPException(404, "Fichier de sauvegarde introuvable")
    if _DB_PATH.exists():
        shutil.copy2(_DB_PATH, _DB_PATH.with_suffix(".db.before_restore"))
    shutil.copy2(src, _DB_PATH)
    return {"message": f"Base restaurée depuis {filename}. Redémarrez le serveur."}


# ═══════════════════════════════════════════════════════════════
# MISE À JOUR AUTOMATIQUE
# ═══════════════════════════════════════════════════════════════

_GIT_REPO = Path(__file__).parent.parent


@app.get("/api/update/check")
def update_check():
    try:
        subprocess.run(
            ["git", "fetch", "--quiet"],
            cwd=_GIT_REPO, capture_output=True, timeout=10, check=False
        )
        local = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=_GIT_REPO, capture_output=True, text=True, timeout=5
        ).stdout.strip()
        remote = subprocess.run(
            ["git", "rev-parse", "@{u}"],
            cwd=_GIT_REPO, capture_output=True, text=True, timeout=5
        ).stdout.strip()
        if not remote:
            return {"up_to_date": True, "commits_behind": 0, "latest_message": None, "error": "Pas de remote configuré"}
        behind_log = subprocess.run(
            ["git", "log", "--oneline", f"{local}..{remote}"],
            cwd=_GIT_REPO, capture_output=True, text=True, timeout=5
        ).stdout.strip()
        lines = [l for l in behind_log.splitlines() if l]
        return {
            "up_to_date": local == remote,
            "commits_behind": len(lines),
            "latest_message": lines[0] if lines else None,
        }
    except Exception as e:
        return {"up_to_date": True, "commits_behind": 0, "latest_message": None, "error": str(e)}


@app.post("/api/update/apply")
def update_apply():
    try:
        pull = subprocess.run(
            ["git", "pull", "--rebase"],
            cwd=_GIT_REPO, capture_output=True, text=True, timeout=60
        )
        if pull.returncode != 0:
            raise HTTPException(500, f"git pull échoué : {pull.stderr}")
        # pip install
        req = _GIT_REPO / "backend" / "requirements.txt"
        if req.exists():
            subprocess.run(["pip", "install", "-r", str(req), "-q"],
                           capture_output=True, timeout=120, check=False)
        return {
            "message": "Mise à jour appliquée. Redémarrez le serveur backend pour activer les changements.",
            "output": pull.stdout.strip(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Erreur de mise à jour : {e}")


# ═══════════════════════════════════════════════════════════════
# HEALTH CHECK
# ═══════════════════════════════════════════════════════════════

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "version": "1.2.0",
    }


# ═══════════════════════════════════════════════════════════════
# WEBHOOK HELPER
# ═══════════════════════════════════════════════════════════════

def _fire_webhooks_sync(db_url: str, event: str, payload: dict):
    """Appelé via BackgroundTasks pour ne pas bloquer la réponse."""
    import sqlite3 as _sqlite3
    db_path = db_url.replace("sqlite:////", "/").replace("sqlite:///", "")
    try:
        conn = _sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT url, secret FROM webhooks WHERE active=1")
        hooks = cursor.fetchall()
        conn.close()
    except Exception:
        return
    body = json.dumps({"event": event, "data": payload}).encode()
    with httpx.Client(timeout=5) as client:
        for url, secret in hooks:
            headers = {"Content-Type": "application/json"}
            if secret:
                sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
                headers["X-ACCESSIA-Signature"] = sig
            try:
                client.post(url, content=body, headers=headers)
            except Exception:
                pass


# ═══════════════════════════════════════════════════════════════
# SIGNATURE DE DEVIS (PUBLIC — sans auth)
# ═══════════════════════════════════════════════════════════════

@app.get("/api/quotes/sign/{token}")
def get_quote_for_sign(token: str, db: Session = Depends(get_db)):
    qt = db.query(Quote).options(joinedload(Quote.client)).filter(Quote.sign_token == token).first()
    if not qt:
        raise HTTPException(404, "Devis introuvable ou lien invalide")
    items = _safe_json_loads(qt.items_json)
    return {
        "id": qt.id,
        "number": qt.number,
        "title": qt.title,
        "client_name": qt.client.name if qt.client else "",
        "amount_ht": qt.amount_ht,
        "tva_rate": qt.tva_rate,
        "amount_ttc": round(qt.amount_ht * (1 + qt.tva_rate / 100), 2),
        "description": qt.description,
        "items": items,
        "status": qt.status,
        "valid_until": qt.valid_until.isoformat() if qt.valid_until else None,
        "signed_at": qt.signed_at.isoformat() if qt.signed_at else None,
        "signed_by": qt.signed_by,
        "already_signed": qt.signed_at is not None,
    }


class SignQuoteBody(BaseModel):
    signed_by: str = Field(..., min_length=1, max_length=200)


@app.post("/api/quotes/sign/{token}")
def sign_quote(token: str, body: SignQuoteBody, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    qt = db.query(Quote).filter(Quote.sign_token == token).first()
    if not qt:
        raise HTTPException(404, "Devis introuvable ou lien invalide")
    if qt.signed_at:
        raise HTTPException(409, "Ce devis a déjà été signé")
    qt.signed_at = _now()
    qt.signed_by = body.signed_by
    qt.sign_ip = request.client.host if request.client else None
    qt.status = "accepte"
    qt.updated_at = _now()
    db.commit()
    background_tasks.add_task(_fire_webhooks_sync, db_url=os.getenv("DATABASE_URL", "sqlite:///./sensia.db"), event="quote.accepted", payload={"id": qt.id, "number": qt.number, "signed_by": body.signed_by})
    return {"message": "Devis signé avec succès", "signed_by": qt.signed_by, "signed_at": qt.signed_at.isoformat()}


class SaveTemplateBody(BaseModel):
    template_name: str = Field(..., min_length=1, max_length=200)


@app.post("/api/quotes/{quote_id}/save-template")
def save_quote_as_template(quote_id: int, body: SaveTemplateBody, db: Session = Depends(get_db)):
    qt = db.query(Quote).filter(Quote.id == quote_id).first()
    if not qt:
        raise HTTPException(404, "Devis non trouvé")
    qt.is_template = True
    qt.template_name = body.template_name
    db.commit()
    return {"message": "Sauvegardé comme modèle", "template_name": qt.template_name}


@app.get("/api/quote-templates")
def list_quote_templates(db: Session = Depends(get_db)):
    templates = db.query(Quote).filter(Quote.is_template == True).options(joinedload(Quote.client)).all()
    return [_serialize_quote(qt) for qt in templates]


# ═══════════════════════════════════════════════════════════════
# FACTURATION RÉCURRENTE
# ═══════════════════════════════════════════════════════════════

class RecurringInvoiceCreate(BaseModel):
    client_id: int
    project_id: Optional[int] = None
    amount_ht: float
    tva_rate: float = 20.0
    frequency: str  # mensuel/trimestriel/annuel
    next_billing_date: str
    description: Optional[str] = None


@app.get("/api/recurring-invoices")
def list_recurring_invoices(db: Session = Depends(get_db)):
    items = db.query(RecurringInvoice).options(joinedload(RecurringInvoice.client)).order_by(RecurringInvoice.id.desc()).all()
    return [
        {
            "id": r.id,
            "client_id": r.client_id,
            "client_name": r.client.name if r.client else "",
            "project_id": r.project_id,
            "amount_ht": r.amount_ht,
            "tva_rate": r.tva_rate,
            "frequency": r.frequency,
            "next_billing_date": r.next_billing_date.isoformat() if r.next_billing_date else None,
            "active": r.active,
            "description": r.description,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in items
    ]


@app.post("/api/recurring-invoices", status_code=201)
def create_recurring_invoice(body: RecurringInvoiceCreate, db: Session = Depends(get_db)):
    try:
        nbd = datetime.fromisoformat(body.next_billing_date.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(422, "Format de date invalide pour next_billing_date")
    r = RecurringInvoice(
        client_id=body.client_id,
        project_id=body.project_id,
        amount_ht=body.amount_ht,
        tva_rate=body.tva_rate,
        frequency=body.frequency,
        next_billing_date=nbd,
        description=body.description,
        created_at=_now(),
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"id": r.id}


@app.patch("/api/recurring-invoices/{rid}")
def update_recurring_invoice(rid: int, body: dict, db: Session = Depends(get_db)):
    r = db.query(RecurringInvoice).filter(RecurringInvoice.id == rid).first()
    if not r:
        raise HTTPException(404, "Récurrent non trouvé")
    for k, v in body.items():
        if hasattr(r, k):
            setattr(r, k, v)
    db.commit()
    return {"id": r.id, "active": r.active}


@app.delete("/api/recurring-invoices/{rid}", status_code=204)
def delete_recurring_invoice(rid: int, db: Session = Depends(get_db)):
    r = db.query(RecurringInvoice).filter(RecurringInvoice.id == rid).first()
    if not r:
        raise HTTPException(404, "Récurrent non trouvé")
    db.delete(r)
    db.commit()


# ═══════════════════════════════════════════════════════════════
# RAPPORT DE MISSION PDF
# ═══════════════════════════════════════════════════════════════

@app.get("/api/projects/{project_id}/report-pdf")
def project_report_pdf(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).options(joinedload(Project.client)).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Projet non trouvé")
    invoices = db.query(Invoice).filter(Invoice.project_id == project_id).all()
    tasks_done = db.query(Task).filter(Task.project_id == project_id, Task.status == "fait").all()
    time_entries = db.query(TimeEntry).filter(TimeEntry.project_id == project_id).all()
    total_hours = sum(e.duration_minutes for e in time_entries) / 60.0
    total_ht = sum(inv.amount_ht for inv in invoices)

    html = f"""<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<style>
body{{font-family:Arial,sans-serif;margin:40px;color:#222}}
h1{{color:#2850ff}}h2{{color:#444;border-bottom:1px solid #ddd;padding-bottom:4px}}
table{{width:100%;border-collapse:collapse;margin:12px 0}}
th,td{{padding:8px 12px;border:1px solid #ddd;text-align:left}}
th{{background:#f4f4f4}}
.kpi{{display:inline-block;margin:8px 16px 8px 0;padding:12px 20px;background:#f0f4ff;border-radius:8px}}
</style></head><body>
<h1>Rapport de Mission — {project.name}</h1>
<p><strong>Client :</strong> {project.client.name if project.client else "—"} &nbsp;|&nbsp;
<strong>Code :</strong> {project.code} &nbsp;|&nbsp;
<strong>Statut :</strong> {project.status}</p>
<div>
<span class="kpi"><strong>Heures totales</strong><br>{total_hours:.1f} h</span>
<span class="kpi"><strong>CA HT généré</strong><br>{total_ht:,.0f} €</span>
<span class="kpi"><strong>Tâches réalisées</strong><br>{len(tasks_done)}</span>
</div>
<h2>Tâches réalisées</h2>
<table><tr><th>Titre</th><th>Complété le</th></tr>
{''.join(f"<tr><td>{t.title}</td><td>{t.completed_at.strftime('%d/%m/%Y') if t.completed_at else '—'}</td></tr>" for t in tasks_done)}
</table>
<h2>Factures émises</h2>
<table><tr><th>Numéro</th><th>Montant HT</th><th>Statut</th><th>Date</th></tr>
{''.join(f"<tr><td>{inv.number}</td><td>{inv.amount_ht:,.0f} €</td><td>{inv.status}</td><td>{inv.issued_date.strftime('%d/%m/%Y') if inv.issued_date else '—'}</td></tr>" for inv in invoices)}
</table>
<div style="margin-top:40px;font-size:12px;color:#999">
Document généré le {datetime.now().strftime("%d/%m/%Y à %H:%M")} — ACCESSIA Pro
</div></body></html>"""

    try:
        import weasyprint  # type: ignore
        pdf_bytes = weasyprint.HTML(string=html).write_pdf()
        return Response(content=pdf_bytes, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="rapport_{project.code}.pdf"'})
    except Exception:
        return Response(content=html.encode("utf-8"), media_type="text/html; charset=utf-8")


# ═══════════════════════════════════════════════════════════════
# NPS SURVEYS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/nps/average")
def nps_average_top(db: Session = Depends(get_db)):
    answered = db.query(NpsSurvey).filter(NpsSurvey.score.isnot(None)).all()
    if not answered:
        return {"average": None, "count": 0, "promoters": 0, "detractors": 0, "passives": 0}
    scores = [s.score for s in answered]
    promoters = sum(1 for s in scores if s >= 9)
    detractors = sum(1 for s in scores if s <= 6)
    passives = len(scores) - promoters - detractors
    nps_score = round((promoters - detractors) / len(scores) * 100)
    return {
        "average": round(sum(scores) / len(scores), 1),
        "nps_score": nps_score,
        "count": len(scores),
        "promoters": promoters,
        "detractors": detractors,
        "passives": passives,
    }


@app.get("/api/nps/{token}")
def get_nps_survey(token: str, db: Session = Depends(get_db)):
    nps = db.query(NpsSurvey).options(joinedload(NpsSurvey.project), joinedload(NpsSurvey.client)).filter(NpsSurvey.share_token == token).first()
    if not nps:
        raise HTTPException(404, "Enquête non trouvée")
    return {
        "id": nps.id,
        "project_name": nps.project.name if nps.project else "",
        "client_name": nps.client.name if nps.client else "",
        "score": nps.score,
        "comment": nps.comment,
        "answered_at": nps.answered_at.isoformat() if nps.answered_at else None,
        "already_answered": nps.answered_at is not None,
    }


class NpsSubmitBody(BaseModel):
    score: int = Field(..., ge=0, le=10)
    comment: Optional[str] = None


@app.post("/api/nps/{token}")
def submit_nps(token: str, body: NpsSubmitBody, db: Session = Depends(get_db)):
    nps = db.query(NpsSurvey).filter(NpsSurvey.share_token == token).first()
    if not nps:
        raise HTTPException(404, "Enquête non trouvée")
    if nps.answered_at:
        raise HTTPException(409, "Enquête déjà répondue")
    nps.score = body.score
    nps.comment = body.comment
    nps.answered_at = _now()
    db.commit()
    return {"message": "Merci pour votre retour !"}


@app.get("/api/nps")
def list_nps(db: Session = Depends(get_db)):
    surveys = db.query(NpsSurvey).options(joinedload(NpsSurvey.project), joinedload(NpsSurvey.client)).order_by(NpsSurvey.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "project_id": s.project_id,
            "project_name": s.project.name if s.project else "",
            "client_name": s.client.name if s.client else "",
            "score": s.score,
            "comment": s.comment,
            "share_token": s.share_token,
            "answered_at": s.answered_at.isoformat() if s.answered_at else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in surveys
    ]


@app.get("/api/nps/average")
def nps_average(db: Session = Depends(get_db)):
    answered = db.query(NpsSurvey).filter(NpsSurvey.score.isnot(None)).all()
    if not answered:
        return {"average": None, "count": 0, "promoters": 0, "detractors": 0, "passives": 0}
    scores = [s.score for s in answered]
    promoters = sum(1 for s in scores if s >= 9)
    detractors = sum(1 for s in scores if s <= 6)
    passives = len(scores) - promoters - detractors
    nps_score = round((promoters - detractors) / len(scores) * 100)
    return {
        "average": round(sum(scores) / len(scores), 1),
        "nps_score": nps_score,
        "count": len(scores),
        "promoters": promoters,
        "detractors": detractors,
        "passives": passives,
    }


# ═══════════════════════════════════════════════════════════════
# PORTAIL CLIENT ÉTENDU — Modifier endpoint existant
# ═══════════════════════════════════════════════════════════════
# Note: The portal endpoint is already defined earlier in main.py.
# We add a separate enhanced version:

@app.get("/api/portal-v2/{token}")
def get_client_portal_v2(token: str, db: Session = Depends(get_db)):
    """Extended portal including quotes and documents."""
    from models import Diagnostic as DiagModel
    client = db.query(Client).filter(Client.slug == token).first()
    if not client:
        # try to find by portal_token field if it exists
        raise HTTPException(404, "Portail introuvable")
    projects = db.query(Project).filter(Project.client_id == client.id).all()
    invoices = db.query(Invoice).filter(Invoice.client_id == client.id).all()
    quotes = db.query(Quote).filter(Quote.client_id == client.id, Quote.status.in_(["envoye", "accepte"])).all()
    diagnostics = db.query(DiagModel).filter(DiagModel.client_id == client.id).all()
    return {
        "client_name": client.name,
        "sector": client.sector,
        "projects": [{"code": p.code, "name": p.name, "status": p.status} for p in projects],
        "invoices": [{"number": i.number, "amount_ttc": round(i.amount_ht * (1 + i.tva_rate / 100), 2), "status": i.status, "issued_date": i.issued_date.isoformat() if i.issued_date else None} for i in invoices],
        "quotes": [{"number": qt.number, "title": qt.title, "amount_ttc": round(qt.amount_ht * (1 + qt.tva_rate / 100), 2), "status": qt.status, "sign_token": qt.sign_token} for qt in quotes],
        "diagnostics": [{"type": d.type, "title": d.title, "share_token": d.share_token} for d in diagnostics],
    }


# ═══════════════════════════════════════════════════════════════
# EXPORT CSV
# ═══════════════════════════════════════════════════════════════

@app.get("/api/export/clients")
def export_clients_csv(db: Session = Depends(get_db)):
    clients = db.query(Client).all()
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["id", "name", "type", "sector", "contact_name", "contact_email", "contact_phone", "status", "pipeline_stage", "created_at"])
    writer.writeheader()
    for c in clients:
        writer.writerow({"id": c.id, "name": c.name, "type": c.type, "sector": c.sector or "", "contact_name": c.contact_name or "", "contact_email": c.contact_email or "", "contact_phone": c.contact_phone or "", "status": c.status, "pipeline_stage": c.pipeline_stage or "", "created_at": c.created_at.isoformat() if c.created_at else ""})
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=clients.csv"})


@app.get("/api/export/invoices")
def export_invoices_csv(db: Session = Depends(get_db)):
    invoices = db.query(Invoice).options(joinedload(Invoice.client)).all()
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["id", "number", "client_name", "amount_ht", "tva_rate", "amount_ttc", "status", "issued_date", "due_date", "paid_date"])
    writer.writeheader()
    for inv in invoices:
        writer.writerow({"id": inv.id, "number": inv.number, "client_name": inv.client.name if inv.client else "", "amount_ht": inv.amount_ht, "tva_rate": inv.tva_rate, "amount_ttc": round(inv.amount_ht * (1 + inv.tva_rate / 100), 2), "status": inv.status, "issued_date": inv.issued_date.isoformat() if inv.issued_date else "", "due_date": inv.due_date.isoformat() if inv.due_date else "", "paid_date": inv.paid_date.isoformat() if inv.paid_date else ""})
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=invoices.csv"})


@app.get("/api/export/projects")
def export_projects_csv(db: Session = Depends(get_db)):
    projects = db.query(Project).options(joinedload(Project.client)).all()
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["id", "code", "name", "client_name", "type", "status", "budget", "start_date", "end_date"])
    writer.writeheader()
    for p in projects:
        writer.writerow({"id": p.id, "code": p.code, "name": p.name, "client_name": p.client.name if p.client else "", "type": p.type, "status": p.status, "budget": p.budget or "", "start_date": p.start_date.isoformat() if p.start_date else "", "end_date": p.end_date.isoformat() if p.end_date else ""})
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=projects.csv"})


# ═══════════════════════════════════════════════════════════════
# IMPORT CSV
# ═══════════════════════════════════════════════════════════════

@app.post("/api/import/clients", status_code=201)
async def import_clients_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    created = []
    errors = []
    for i, row in enumerate(reader):
        name = row.get("name", "").strip()
        if not name:
            errors.append(f"Ligne {i+2}: nom manquant")
            continue
        try:
            c = Client(
                name=name,
                slug=slugify(name) + "-" + uuid.uuid4().hex[:6],
                type=row.get("type", "pme"),
                sector=row.get("sector", ""),
                contact_name=row.get("contact_name", ""),
                contact_email=row.get("contact_email", ""),
                contact_phone=row.get("contact_phone", ""),
                status=row.get("status", "prospect"),
                created_at=_now(),
                updated_at=_now(),
            )
            db.add(c)
            db.commit()
            db.refresh(c)
            created.append(c.id)
        except Exception as e:
            db.rollback()
            errors.append(f"Ligne {i+2}: {str(e)}")
    return {"created": len(created), "errors": errors}


# ═══════════════════════════════════════════════════════════════
# RECHERCHE GLOBALE
# ═══════════════════════════════════════════════════════════════

@app.get("/api/search")
def global_search(q: str = Query(..., min_length=2), db: Session = Depends(get_db)):
    like = f"%{q}%"
    clients = db.query(Client).filter(
        (Client.name.ilike(like)) | (Client.contact_email.ilike(like)) | (Client.sector.ilike(like))
    ).limit(5).all()
    projects = db.query(Project).options(joinedload(Project.client)).filter(
        (Project.name.ilike(like)) | (Project.code.ilike(like))
    ).limit(5).all()
    quotes = db.query(Quote).options(joinedload(Quote.client)).filter(
        (Quote.title.ilike(like)) | (Quote.number.ilike(like))
    ).limit(5).all()
    tasks = db.query(Task).filter(Task.title.ilike(like)).limit(5).all()
    return {
        "clients": [{"id": c.id, "name": c.name, "sector": c.sector, "status": c.status} for c in clients],
        "projects": [{"id": p.id, "code": p.code, "name": p.name, "client_name": p.client.name if p.client else ""} for p in projects],
        "quotes": [{"id": qt.id, "number": qt.number, "title": qt.title, "client_name": qt.client.name if qt.client else "", "status": qt.status} for qt in quotes],
        "tasks": [{"id": t.id, "title": t.title, "status": t.status, "priority": t.priority} for t in tasks],
    }


# ═══════════════════════════════════════════════════════════════
# CASHFLOW / REPORTING AVANCÉ
# ═══════════════════════════════════════════════════════════════

@app.get("/api/reporting/cashflow")
def get_cashflow(db: Session = Depends(get_db)):
    from dateutil.relativedelta import relativedelta
    now = datetime.now(timezone.utc)
    months = []
    for i in range(11, -1, -1):
        month_start = (now - relativedelta(months=i)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_end = month_start + relativedelta(months=1)
        paid = db.query(func.sum(Invoice.amount_ht)).filter(
            Invoice.status == "payee",
            Invoice.paid_date >= month_start,
            Invoice.paid_date < month_end,
        ).scalar() or 0
        pending = db.query(func.sum(Invoice.amount_ht)).filter(
            Invoice.status == "envoyee",
            Invoice.due_date >= month_start,
            Invoice.due_date < month_end,
        ).scalar() or 0
        months.append({
            "month": month_start.strftime("%Y-%m"),
            "label": month_start.strftime("%b %Y"),
            "encaisse": round(paid, 2),
            "prevu": round(pending, 2),
        })
    # Margin by project type
    margin_by_category = []
    for ptype in ["diagnostic", "integration", "formation", "mco", "pack_pme"]:
        projects = db.query(Project).filter(Project.type == ptype).all()
        pids = [p.id for p in projects]
        ca = db.query(func.sum(Invoice.amount_ht)).filter(Invoice.project_id.in_(pids), Invoice.status == "payee").scalar() or 0
        margin_by_category.append({"type": ptype, "ca": round(ca, 2)})
    # Rolling 12m CA
    year_start = now - relativedelta(months=12)
    rolling_12m = db.query(func.sum(Invoice.amount_ht)).filter(
        Invoice.status == "payee",
        Invoice.paid_date >= year_start,
    ).scalar() or 0
    return {
        "monthly_forecast": months,
        "margin_by_category": margin_by_category,
        "rolling_12m_ca": round(rolling_12m, 2),
    }


# ═══════════════════════════════════════════════════════════════
# CALENDRIER ICS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/export/calendar")
def export_calendar(db: Session = Depends(get_db)):
    tasks = db.query(Task).filter(Task.due_date.isnot(None), Task.status != "fait").all()
    activities = db.query(Activity).order_by(Activity.date.desc()).limit(100).all()
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ACCESSIA Pro//FR",
        "CALSCALE:GREGORIAN",
    ]
    for t in tasks:
        dt = t.due_date.strftime("%Y%m%dT%H%M%SZ")
        lines += [
            "BEGIN:VEVENT",
            f"UID:task-{t.id}@accessia.pro",
            f"DTSTART:{dt}",
            f"DTEND:{dt}",
            f"SUMMARY:{t.title}",
            f"DESCRIPTION:{t.description or ''}",
            "END:VEVENT",
        ]
    for a in activities:
        dt = a.date.strftime("%Y%m%dT%H%M%SZ")
        lines += [
            "BEGIN:VEVENT",
            f"UID:activity-{a.id}@accessia.pro",
            f"DTSTART:{dt}",
            f"DTEND:{dt}",
            f"SUMMARY:{a.title}",
            f"DESCRIPTION:{a.description or ''}",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    ics_content = "\r\n".join(lines)
    return StreamingResponse(iter([ics_content]), media_type="text/calendar", headers={"Content-Disposition": "attachment; filename=accessia.ics"})


# ═══════════════════════════════════════════════════════════════
# WEBHOOKS (CRUD)
# ═══════════════════════════════════════════════════════════════

class WebhookCreate(BaseModel):
    url: str = Field(..., max_length=500)
    events: List[str]
    secret: Optional[str] = None


@app.get("/api/webhooks")
def list_webhooks(db: Session = Depends(get_db)):
    hooks = db.query(Webhook).order_by(Webhook.id.desc()).all()
    return [{"id": h.id, "url": h.url, "events": json.loads(h.events), "active": h.active, "created_at": h.created_at.isoformat() if h.created_at else None} for h in hooks]


@app.post("/api/webhooks", status_code=201)
def create_webhook(body: WebhookCreate, db: Session = Depends(get_db)):
    h = Webhook(url=body.url, events=json.dumps(body.events), active=True, secret=body.secret, created_at=_now())
    db.add(h)
    db.commit()
    db.refresh(h)
    return {"id": h.id}


@app.patch("/api/webhooks/{wid}")
def update_webhook(wid: int, body: dict, db: Session = Depends(get_db)):
    h = db.query(Webhook).filter(Webhook.id == wid).first()
    if not h:
        raise HTTPException(404, "Webhook non trouvé")
    if "active" in body:
        h.active = body["active"]
    if "events" in body:
        h.events = json.dumps(body["events"])
    db.commit()
    return {"id": h.id, "active": h.active}


@app.delete("/api/webhooks/{wid}", status_code=204)
def delete_webhook(wid: int, db: Session = Depends(get_db)):
    h = db.query(Webhook).filter(Webhook.id == wid).first()
    if not h:
        raise HTTPException(404, "Webhook non trouvé")
    db.delete(h)
    db.commit()


# ═══════════════════════════════════════════════════════════════
# PROJECT TEMPLATES
# ═══════════════════════════════════════════════════════════════

class ProjectTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    phases_json: Optional[str] = None


@app.get("/api/project-templates")
def list_project_templates(db: Session = Depends(get_db)):
    templates = db.query(ProjectTemplate).order_by(ProjectTemplate.id.desc()).all()
    return [{"id": t.id, "name": t.name, "description": t.description, "phases_json": t.phases_json, "created_at": t.created_at.isoformat() if t.created_at else None} for t in templates]


@app.post("/api/project-templates", status_code=201)
def create_project_template(body: ProjectTemplateCreate, db: Session = Depends(get_db)):
    t = ProjectTemplate(name=body.name, description=body.description, phases_json=body.phases_json, created_at=_now())
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": t.id}


@app.delete("/api/project-templates/{tid}", status_code=204)
def delete_project_template(tid: int, db: Session = Depends(get_db)):
    t = db.query(ProjectTemplate).filter(ProjectTemplate.id == tid).first()
    if not t:
        raise HTTPException(404, "Template non trouvé")
    db.delete(t)
    db.commit()
