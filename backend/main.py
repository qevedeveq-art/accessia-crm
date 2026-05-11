"""
ACCESSIA Pro — API Backend
FastAPI + SQLAlchemy + SQLite
Point d'entrée principal : configuration, DB, scheduler, middlewares, routeurs.
"""
import os
import logging
import json
import logging.config
from apscheduler.schedulers.background import BackgroundScheduler

_LOG_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "logging.Formatter",
            "fmt": '{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":%(message)s}',
            "datefmt": "%Y-%m-%dT%H:%M:%S",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        }
    },
    "root": {"handlers": ["console"], "level": os.getenv("LOG_LEVEL", "INFO")},
}

# Utilise python-json-logger si disponible, sinon format basique
try:
    from pythonjsonlogger import jsonlogger  # type: ignore
    _handler = logging.StreamHandler()
    _handler.setFormatter(jsonlogger.JsonFormatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s"
    ))
    logging.root.handlers = [_handler]
    logging.root.setLevel(os.getenv("LOG_LEVEL", "INFO"))
except ImportError:
    logging.config.dictConfig(_LOG_CONFIG)

from dateutil.relativedelta import relativedelta
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from database import engine, get_db, Base
from models import Invoice, Task, Quote, RecurringInvoice, Notification
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

# ═══════════════════════════════════════════════════════════════
# INITIALISATION DB + MIGRATIONS
# ═══════════════════════════════════════════════════════════════

# Crée les tables au démarrage + migration automatique
Base.metadata.create_all(bind=engine)


def _run_migrations():
    """Ajoute les colonnes/tables manquantes pour compatibilité avec l'ancien schéma."""
    import sqlite3
    db_url = os.getenv("DATABASE_URL", "sqlite:///./sensia.db")
    if "sqlite" not in db_url:
        return
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
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type VARCHAR(50) NOT NULL,
                severity VARCHAR(20) NOT NULL DEFAULT 'info',
                entity_type VARCHAR(50),
                entity_id INTEGER,
                title VARCHAR(300) NOT NULL,
                message TEXT,
                dedupe_key VARCHAR(120) UNIQUE NOT NULL,
                is_read BOOLEAN DEFAULT 0,
                read_at DATETIME,
                created_at DATETIME,
                updated_at DATETIME
            )
        """)
        conn.commit()
        conn.close()
        log.info("Migrations terminées avec succès")
    except Exception as e:
        log.warning(f"Migration automatique échouée (non critique) : {e}")


_run_migrations()

# Seed des données initiales (uniquement si la base est vide)
try:
    from seed import run_seed
    run_seed()
except Exception as _seed_err:
    log.warning(f"Seed ignoré (non critique) : {_seed_err}")

# ═══════════════════════════════════════════════════════════════
# SCHEDULER — Relances + Facturation récurrente
# ═══════════════════════════════════════════════════════════════

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore  # type: ignore

_db_url_for_scheduler = os.getenv("DATABASE_URL", "sqlite:///./sensia.db")
try:
    _jobstores = {"default": SQLAlchemyJobStore(url=_db_url_for_scheduler)}
    _scheduler = BackgroundScheduler(daemon=True, jobstores=_jobstores)
except Exception as _sched_store_err:
    log.warning("APScheduler SQLAlchemy jobstore indisponible, fallback mémoire : %s", _sched_store_err)
    _scheduler = BackgroundScheduler(daemon=True)


def _job_relances_automatiques():
    """Factures en retard & devis expirés → créer tâche relance."""
    from database import SessionLocal  # évite import circulaire
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive pour SQLite
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
        now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive pour SQLite
        due = db.query(RecurringInvoice).filter(
            RecurringInvoice.active == True,
            RecurringInvoice.next_billing_date <= now,
        ).all()
        for rec in due:
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

# ─── Backup automatique au démarrage ──────────────────────────
_db_url = os.getenv("DATABASE_URL", "sqlite:///./sensia.db")
_DB_PATH = Path(_db_url.replace("sqlite:////", "/").replace("sqlite:///", "")) \
    if "sqlite" in _db_url else Path(__file__).parent / "sensia.db"
if not _DB_PATH.is_absolute():
    _DB_PATH = Path(__file__).parent / _DB_PATH
_BACKUP_DIR = file_service.SENSIA_BASE / "07_ADMINISTRATIF" / "Sauvegardes"
_LAST_BACKUP_FILE = Path(__file__).parent / ".last_backup"


def _auto_backup_if_needed():
    """Crée un backup automatique si le dernier date de plus de 24h."""
    import shutil
    try:
        if _LAST_BACKUP_FILE.exists():
            last_ts = _LAST_BACKUP_FILE.read_text().strip()
            last_dt = datetime.strptime(last_ts, "%Y%m%d_%H%M%S")
            if (datetime.now() - last_dt).total_seconds() < 86400:
                return
        _BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        if _DB_PATH.exists():
            shutil.copy2(_DB_PATH, _BACKUP_DIR / f"sensia_{ts}.db")
        _LAST_BACKUP_FILE.write_text(ts)
        log.info("Sauvegarde automatique créée")
    except Exception as e:
        log.warning(f"Sauvegarde automatique échouée : {e}")


_auto_backup_if_needed()

# ═══════════════════════════════════════════════════════════════
# APPLICATION FASTAPI
# ═══════════════════════════════════════════════════════════════

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

app = FastAPI(
    title="ACCESSIA Pro API",
    version="1.2.0",
    description="Gestion clients, projets et fichiers — ACCESSIA Pro",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.get("/", include_in_schema=False)
def root_redirect():
    return RedirectResponse(url="/api/docs", status_code=308)


# ── Middleware CORS ──────────────────────────────────────────
# SECURITY FIX: origines lues depuis l'env var ALLOWED_ORIGINS
# Dev  : defaults localhost
# Prod : docker-compose.override.yml injecte "https://domain.tld"
_default_origins = (
    "http://localhost:3001,http://localhost:3000,"
    "http://127.0.0.1:3001,http://127.0.0.1:3000"
)
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",")
    if o.strip()
]

app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept"],
)

# ═══════════════════════════════════════════════════════════════
# INCLUSION DES ROUTERS
# ═══════════════════════════════════════════════════════════════

from routers.auth import router as auth_router
from routers.clients import router as clients_router
from routers.projects import router as projects_router
from routers.invoices import router as invoices_router
from routers.files import router as files_router
from routers.quotes import router as quotes_router
from routers.diagnostics import router as diagnostics_router
from routers.notifications import router as notifications_router
from routers.reporting import router as reporting_router
from routers.misc import router as misc_router

app.include_router(auth_router)
app.include_router(clients_router)
app.include_router(projects_router)
app.include_router(invoices_router)
app.include_router(files_router)
app.include_router(quotes_router)
app.include_router(diagnostics_router)
app.include_router(notifications_router)
app.include_router(reporting_router)
app.include_router(misc_router)
