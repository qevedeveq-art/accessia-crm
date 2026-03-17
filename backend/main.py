"""
SENSIA Manager — API Backend
FastAPI + SQLAlchemy + SQLite
"""
import os
import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
# TrustedHostMiddleware retiré — bloquait les requêtes Docker
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from pydantic import BaseModel, Field, field_validator
from slugify import slugify

from database import engine, get_db, Base
from models import Client, Project, Contact, Invoice, Activity, Task
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
        # Supprimer les colonnes Twenty obsolètes n'est pas possible en SQLite (pas de DROP COLUMN avant 3.35)
        conn.commit()
        conn.close()
        log.info("Migrations terminées avec succès")
    except Exception as e:
        log.warning(f"Migration automatique échouée (non critique) : {e}")

_run_migrations()

app = FastAPI(
    title="SENSIA Manager API",
    version="1.1.0",
    description="Gestion clients, projets et fichiers — SENSIA DVZ",
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
        Invoice.number.like(f"SENSIA-{year}-%")
    ).scalar() or 0
    return f"SENSIA-{year}-{count + 1:03d}"


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
# HEALTH CHECK
# ═══════════════════════════════════════════════════════════════

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "version": "1.1.0",
    }
