"""
ACCESSIA Pro — API Backend
FastAPI + SQLAlchemy + SQLite
"""
import os
import json
import uuid
import logging
import httpx
from datetime import datetime, timezone, date as date_type
from enum import Enum
from typing import Optional, List

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
# TrustedHostMiddleware retiré — bloquait les requêtes Docker
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from pydantic import BaseModel, Field, field_validator
from slugify import slugify

from database import engine, get_db, Base
from models import Client, Project, Contact, Invoice, Activity, Task, Diagnostic, Quote, TimeEntry
import file_service

log = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════

SECRET_KEY = os.getenv("SECRET_KEY", "CHANGEZ_MOI_cle_secrete_32_chars_min")
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
        conn.commit()
        conn.close()
        log.info("Migrations terminées avec succès")
    except Exception as e:
        log.warning(f"Migration automatique échouée (non critique) : {e}")

_run_migrations()
file_service.ensure_standard_dirs()

app = FastAPI(
    title="ACCESSIA Pro API",
    version="1.1.0",
    description="Gestion clients, projets et fichiers — ACCESSIA Pro",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

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
    allow_origins=["*"],
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
    duration: str = ""
    target: str = ""
    active: bool = True
    description: str = ""


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


class QuoteCreate(BaseModel):
    client_id: int
    project_id: Optional[int] = None
    title: str
    amount_ht: float
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
        except Exception:
            pass
    qt = Quote(
        number=_next_quote_number(db),
        client_id=body.client_id,
        project_id=body.project_id,
        title=body.title,
        amount_ht=body.amount_ht,
        tva_rate=body.tva_rate,
        status=body.status,
        valid_until=valid_until,
        description=body.description,
        notes=body.notes,
        created_at=_now(),
        updated_at=_now(),
    )
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
        except Exception:
            pass
    qt.client_id = body.client_id
    qt.project_id = body.project_id
    qt.title = body.title
    qt.amount_ht = body.amount_ht
    qt.tva_rate = body.tva_rate
    qt.status = body.status
    qt.valid_until = valid_until
    qt.description = body.description
    qt.notes = body.notes
    qt.updated_at = _now()
    db.commit()
    db.refresh(qt)
    return _serialize_quote(qt)


@app.patch("/api/quotes/{quote_id}/status")
def patch_quote_status(quote_id: int, body: dict, db: Session = Depends(get_db)):
    qt = db.query(Quote).filter(Quote.id == quote_id).first()
    if not qt:
        raise HTTPException(404, "Devis non trouvé")
    qt.status = body.get("status", qt.status)
    qt.updated_at = _now()
    db.commit()
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
    return {
        "id": qt.id,
        "number": qt.number,
        "client_id": qt.client_id,
        "client_name": qt.client.name if qt.client else "",
        "project_id": qt.project_id,
        "project_name": qt.project.name if qt.project else None,
        "title": qt.title,
        "amount_ht": qt.amount_ht,
        "tva_rate": qt.tva_rate,
        "amount_ttc": round(qt.amount_ht * (1 + qt.tva_rate / 100), 2),
        "status": qt.status,
        "valid_until": qt.valid_until.isoformat() if qt.valid_until else None,
        "description": qt.description,
        "notes": qt.notes,
        "created_at": qt.created_at.isoformat() if qt.created_at else None,
        "updated_at": qt.updated_at.isoformat() if qt.updated_at else None,
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
# HEALTH CHECK
# ═══════════════════════════════════════════════════════════════

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "version": "1.1.0",
    }
