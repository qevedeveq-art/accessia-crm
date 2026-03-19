from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
from database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(250), unique=True, nullable=False, index=True)
    type = Column(String(20), default="pme")
    sector = Column(String(100))
    contact_name = Column(String(200))
    contact_email = Column(String(200))
    contact_phone = Column(String(30))
    address = Column(Text)
    website = Column(String(300))
    siret = Column(String(20))
    status = Column(String(20), default="prospect", index=True)
    source = Column(String(100))
    budget_range = Column(String(50))
    notes = Column(Text)
    folder_path = Column(String(500))
    pipeline_stage = Column(String(30), default="nouveau", index=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    projects = relationship("Project", back_populates="client", cascade="all, delete-orphan")
    contacts = relationship("Contact", back_populates="client", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="client", cascade="all, delete-orphan")
    activities = relationship("Activity", back_populates="client", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="client", cascade="all, delete-orphan")
    diagnostics = relationship("Diagnostic", back_populates="client", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    type = Column(String(20), default="integration")
    status = Column(String(20), default="en_cours", index=True)
    phase = Column(Integer, default=0)
    description = Column(Text)
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    budget = Column(Float)
    contract_signed = Column(Boolean, default=False)
    gdpr_done = Column(Boolean, default=False)
    folder_path = Column(String(500))
    notes = Column(Text)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    client = relationship("Client", back_populates="projects")


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    email = Column(String(200))
    phone = Column(String(30))
    role = Column(String(100))
    is_primary = Column(Boolean, default=False)
    created_at = Column(DateTime, default=_utcnow)

    client = relationship("Client", back_populates="contacts")


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    number = Column(String(30), unique=True, nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), index=True)
    amount_ht = Column(Float, nullable=False)
    tva_rate = Column(Float, default=20.0)
    status = Column(String(20), default="brouillon", index=True)
    issued_date = Column(DateTime)
    due_date = Column(DateTime)
    paid_date = Column(DateTime)
    notes = Column(Text)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    client = relationship("Client", back_populates="invoices")
    project = relationship("Project")


class Activity(Base):
    __tablename__ = "activities"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    contact_id = Column(Integer, ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)
    type = Column(String(30), nullable=False, index=True)  # appel, email, reunion, note
    title = Column(String(300), nullable=False)
    description = Column(String(5000), nullable=True)
    date = Column(DateTime, default=_utcnow)
    duration_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    client = relationship("Client", back_populates="activities")
    project = relationship("Project")
    contact = relationship("Contact")


class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(300), nullable=False)
    description = Column(String(5000), nullable=True)
    type = Column(String(30), default="relance")  # relance, rappel, tache, suivi
    priority = Column(String(20), default="normal")  # basse, normal, haute, urgente
    status = Column(String(20), default="a_faire", index=True)  # a_faire, en_cours, fait
    due_date = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    client = relationship("Client", back_populates="tasks")
    project = relationship("Project")


class Diagnostic(Base):
    __tablename__ = "diagnostics"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(30), nullable=False, index=True)  # cyber, ia
    title = Column(String(300), nullable=False)
    status = Column(String(20), default="en_cours", index=True)  # en_cours, termine
    share_token = Column(String(64), unique=True, nullable=False, index=True, default=lambda: uuid.uuid4().hex)
    company_info = Column(Text, nullable=True)  # JSON: nom, secteur, effectif, etc.
    answers = Column(Text, nullable=True)  # JSON: réponses au questionnaire
    results = Column(Text, nullable=True)  # JSON: scores, préconisations calculées
    report_path = Column(String(500), nullable=True)  # chemin vers le PDF sauvegardé
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    client = relationship("Client", back_populates="diagnostics")


class Quote(Base):
    __tablename__ = "quotes"
    id = Column(Integer, primary_key=True, index=True)
    number = Column(String(40), unique=True, nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(300), nullable=False)
    amount_ht = Column(Float, nullable=False)
    tva_rate = Column(Float, default=20.0)
    status = Column(String(20), default="brouillon", index=True)  # brouillon, envoye, accepte, refuse, expire
    valid_until = Column(DateTime, nullable=True)
    description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    client = relationship("Client")
    project = relationship("Project")


class TimeEntry(Base):
    __tablename__ = "time_entries"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(DateTime, default=_utcnow)
    duration_minutes = Column(Integer, nullable=False)
    description = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    project = relationship("Project")
    client = relationship("Client")
