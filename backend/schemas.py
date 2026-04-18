"""
ACCESSIA Pro — Schémas Pydantic & Enums
Tous les modèles de validation des requêtes/réponses.
"""
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator


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


class DiagnosticType(str, Enum):
    cyber = "cyber"
    ia = "ia"
    rgpd = "rgpd"


class DiagnosticStatus(str, Enum):
    en_cours = "en_cours"
    termine = "termine"


# ═══════════════════════════════════════════════════════════════
# SCHÉMAS CLIENTS
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
            return clean
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

    @field_validator("siret")
    @classmethod
    def validate_siret(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.replace(" ", "").replace("-", "")
            if clean and (not clean.isdigit() or len(clean) != 14):
                raise ValueError("Le SIRET doit contenir exactement 14 chiffres")
            return clean
        return v


class PipelineUpdate(BaseModel):
    pipeline_stage: PipelineStage


# ═══════════════════════════════════════════════════════════════
# SCHÉMAS CONTACTS
# ═══════════════════════════════════════════════════════════════

class ContactCreate(BaseModel):
    client_id: int = Field(..., gt=0)
    name: str = Field(..., min_length=1, max_length=200)
    email: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=30)
    role: Optional[str] = Field(None, max_length=100)
    is_primary: Optional[bool] = False


# ═══════════════════════════════════════════════════════════════
# SCHÉMAS PROJETS
# ═══════════════════════════════════════════════════════════════

from datetime import datetime


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


class ProjectTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    phases_json: Optional[str] = None


# ═══════════════════════════════════════════════════════════════
# SCHÉMAS FACTURES
# ═══════════════════════════════════════════════════════════════

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


class RecurringInvoiceCreate(BaseModel):
    client_id: int
    project_id: Optional[int] = None
    amount_ht: float
    tva_rate: float = 20.0
    frequency: str  # mensuel/trimestriel/annuel
    next_billing_date: str
    description: Optional[str] = None


# ═══════════════════════════════════════════════════════════════
# SCHÉMAS ACTIVITÉS & TÂCHES
# ═══════════════════════════════════════════════════════════════

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


# ═══════════════════════════════════════════════════════════════
# SCHÉMAS DIAGNOSTICS
# ═══════════════════════════════════════════════════════════════

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


# ═══════════════════════════════════════════════════════════════
# SCHÉMAS DEVIS
# ═══════════════════════════════════════════════════════════════

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


class SignQuoteBody(BaseModel):
    signed_by: str = Field(..., min_length=1, max_length=200)


class SaveTemplateBody(BaseModel):
    template_name: str = Field(..., min_length=1, max_length=200)


# ═══════════════════════════════════════════════════════════════
# SCHÉMAS SAISIE DE TEMPS
# ═══════════════════════════════════════════════════════════════

class TimeEntryCreate(BaseModel):
    project_id: int
    client_id: int
    date: Optional[str] = None
    duration_minutes: int
    description: Optional[str] = None


# ═══════════════════════════════════════════════════════════════
# SCHÉMAS FICHIERS
# ═══════════════════════════════════════════════════════════════

class FileWriteRequest(BaseModel):
    path: str
    content: str


class FileCreateFolderRequest(BaseModel):
    path: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=120)


class FileRenameRequest(BaseModel):
    path: str
    new_name: str = Field(..., min_length=1, max_length=120)


class FileDeleteRequest(BaseModel):
    path: str


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


# ═══════════════════════════════════════════════════════════════
# SCHÉMAS NPS
# ═══════════════════════════════════════════════════════════════

class NpsSubmitBody(BaseModel):
    score: int = Field(..., ge=0, le=10)
    comment: Optional[str] = None


# ═══════════════════════════════════════════════════════════════
# SCHÉMAS WEBHOOKS
# ═══════════════════════════════════════════════════════════════

class WebhookCreate(BaseModel):
    url: str = Field(..., max_length=500)
    events: List[str]
    secret: Optional[str] = None
