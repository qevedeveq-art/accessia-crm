"""
ACCESSIA Pro — Fonctions utilitaires partagées
Helpers réutilisés par plusieurs routers.
"""
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db  # noqa: F401 — réexporté pour commodité
from models import (
    Client, Invoice, Task, Activity, Notification, Project, Quote
)

log = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# UTILITAIRES TEMPORELS
# ═══════════════════════════════════════════════════════════════

def _now() -> datetime:
    """Retourne l'heure UTC courante (timezone-aware)."""
    return datetime.now(timezone.utc)


# ═══════════════════════════════════════════════════════════════
# NUMÉROTATION AUTOMATIQUE
# ═══════════════════════════════════════════════════════════════

def _next_invoice_number(db: Session) -> str:
    year = _now().year
    count = db.query(func.count(Invoice.id)).filter(
        Invoice.number.like(f"ACC-{year}-%")
    ).scalar() or 0
    return f"ACC-{year}-{count + 1:03d}"


def _next_quote_number(db: Session) -> str:
    year = _now().year
    count = db.query(func.count(Quote.id)).filter(
        Quote.number.like(f"ACC-DEV-{year}-%")
    ).scalar() or 0
    return f"ACC-DEV-{year}-{count + 1:03d}"


def _next_project_code(db: Session) -> str:
    year = _now().year
    count = db.query(func.count(Project.id)).filter(
        Project.code.like(f"{year}-%")
    ).scalar() or 0
    return f"{year}-{count + 1:03d}"


# ═══════════════════════════════════════════════════════════════
# SÉRIALISATION
# ═══════════════════════════════════════════════════════════════

def _safe_json_loads(raw: Optional[str], default=None) -> list:
    """Désérialise du JSON en tolérant les données corrompues."""
    if not raw:
        return default if default is not None else []
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError) as e:
        log.warning("JSON malformé ignoré (%.100s…) : %s", raw, e)
        return default if default is not None else []


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


def _serialize_notification(n: Notification) -> dict:
    return {
        "id": n.id,
        "type": n.type,
        "severity": n.severity,
        "entity_type": n.entity_type,
        "entity_id": n.entity_id,
        "title": n.title,
        "message": n.message,
        "is_read": n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
        "read_at": n.read_at.isoformat() if n.read_at else None,
    }


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
# ALERTES & NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════

def _collect_alerts(db: Session) -> dict:
    now = _now()
    # SQLite stocke les datetimes sans timezone — on utilise une version naive pour l'arithmétique Python
    now_naive = now.replace(tzinfo=None)

    from sqlalchemy.orm import joinedload

    overdue_invoices_q = (
        db.query(Invoice)
        .options(joinedload(Invoice.client))
        .filter(Invoice.status == "envoyee", Invoice.due_date < now_naive)
        .all()
    )
    overdue_invoices = [
        {
            "id": inv.id,
            "number": inv.number,
            "client_name": inv.client.name if inv.client else "",
            "amount_ttc": round(inv.amount_ht * (1 + inv.tva_rate / 100), 2),
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "days_late": (now_naive - inv.due_date.replace(tzinfo=None)).days if inv.due_date else 0,
        }
        for inv in overdue_invoices_q
    ]

    overdue_tasks_q = (
        db.query(Task)
        .options(joinedload(Task.client))
        .filter(Task.status != "fait", Task.due_date != None, Task.due_date < now_naive)
        .all()
    )
    overdue_tasks = [
        {
            "id": t.id,
            "title": t.title,
            "client_name": t.client.name if t.client else "",
            "client_id": t.client_id,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "days_late": (now_naive - t.due_date.replace(tzinfo=None)).days if t.due_date else 0,
            "priority": t.priority,
        }
        for t in overdue_tasks_q
    ]

    cutoff = now_naive - timedelta(days=21)
    pipeline_stages = ["nouveau", "qualifie", "proposition", "negociation"]
    silent_clients_q = db.query(Client).filter(Client.pipeline_stage.in_(pipeline_stages)).all()
    silent_clients = []
    for c in silent_clients_q:
        last_act = db.query(func.max(Activity.date)).filter(Activity.client_id == c.id).scalar()
        last_act_naive = last_act.replace(tzinfo=None) if last_act else None
        if last_act_naive is None or last_act_naive < cutoff:
            silent_clients.append({
                "id": c.id,
                "name": c.name,
                "pipeline_stage": c.pipeline_stage,
                "last_activity_date": last_act.isoformat() if last_act else None,
                "days_silent": (now_naive - last_act_naive).days if last_act_naive else 999,
            })

    horizon = now_naive + timedelta(days=7)
    upcoming_tasks_q = (
        db.query(Task)
        .filter(Task.status != "fait", Task.due_date >= now_naive, Task.due_date <= horizon)
        .all()
    )
    upcoming_deadlines = [
        {
            "type": "task",
            "id": t.id,
            "title": t.title,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "days_left": (t.due_date.replace(tzinfo=None) - now_naive).days if t.due_date else 0,
        }
        for t in upcoming_tasks_q
    ]

    return {
        "overdue_invoices": overdue_invoices,
        "overdue_tasks": overdue_tasks,
        "silent_clients": silent_clients,
        "upcoming_deadlines": upcoming_deadlines,
    }


def _notification_candidates(alerts: dict) -> list[dict]:
    candidates: list[dict] = []

    for inv in alerts["overdue_invoices"]:
        severity = "critical" if inv["days_late"] >= 30 else "warning"
        candidates.append({
            "type": "facture_retard",
            "severity": severity,
            "entity_type": "invoice",
            "entity_id": inv["id"],
            "title": f"Facture {inv['number']} en retard",
            "message": f"{inv['client_name']} a une facture en retard de {inv['days_late']} jour(s) pour {inv['amount_ttc']:,.0f} € TTC.",
            "dedupe_key": f"invoice-overdue-{inv['id']}",
        })

    for task in alerts["overdue_tasks"]:
        severity = "critical" if task["priority"] in ("haute", "urgente") else "warning"
        candidates.append({
            "type": "tache_retard",
            "severity": severity,
            "entity_type": "task",
            "entity_id": task["id"],
            "title": f"Tâche en retard : {task['title']}",
            "message": f"{task['client_name'] or 'Sans client'} · {task['days_late']} jour(s) de retard · priorité {task['priority']}.",
            "dedupe_key": f"task-overdue-{task['id']}",
        })

    for client in alerts["silent_clients"]:
        severity = "warning" if client["days_silent"] >= 30 else "info"
        candidates.append({
            "type": "prospect_inactif",
            "severity": severity,
            "entity_type": "client",
            "entity_id": client["id"],
            "title": f"Prospect silencieux : {client['name']}",
            "message": f"Aucune activité récente détectée depuis {client['days_silent']} jour(s). Étape pipeline : {client['pipeline_stage']}.",
            "dedupe_key": f"client-silent-{client['id']}",
        })

    for deadline in alerts["upcoming_deadlines"]:
        candidates.append({
            "type": "phase_echeance",
            "severity": "info" if deadline["days_left"] > 2 else "warning",
            "entity_type": deadline["type"],
            "entity_id": deadline["id"],
            "title": f"Échéance à venir : {deadline['title']}",
            "message": f"Échéance prévue dans {deadline['days_left']} jour(s).",
            "dedupe_key": f"deadline-{deadline['type']}-{deadline['id']}",
        })

    return candidates


def _sync_notifications(db: Session) -> int:
    alerts = _collect_alerts(db)
    candidates = _notification_candidates(alerts)
    existing = {n.dedupe_key: n for n in db.query(Notification).all()}
    active_keys = {c["dedupe_key"] for c in candidates}
    new_count = 0

    for candidate in candidates:
        current = existing.get(candidate["dedupe_key"])
        if current:
            current.type = candidate["type"]
            current.severity = candidate["severity"]
            current.entity_type = candidate["entity_type"]
            current.entity_id = candidate["entity_id"]
            current.title = candidate["title"]
            current.message = candidate["message"]
            current.updated_at = _now()
        else:
            db.add(Notification(**candidate, created_at=_now(), updated_at=_now()))
            new_count += 1

    stale_notifications = db.query(Notification).filter(~Notification.dedupe_key.in_(active_keys)).all()
    for stale in stale_notifications:
        db.delete(stale)

    db.commit()
    return new_count


# ═══════════════════════════════════════════════════════════════
# WEBHOOK
# ═══════════════════════════════════════════════════════════════

def _fire_webhooks_sync(db_url: str, event: str, payload: dict):
    """Appelé via BackgroundTasks pour ne pas bloquer la réponse."""
    import sqlite3 as _sqlite3
    import hmac
    import hashlib
    import json as _json
    import httpx

    db_path = db_url.replace("sqlite:////", "/").replace("sqlite:///", "")
    try:
        conn = _sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT url, secret FROM webhooks WHERE active=1 AND events LIKE ?",
            [f'%"{event}"%'],
        )
        hooks = cursor.fetchall()
        conn.close()
    except Exception:
        return
    body = _json.dumps({"event": event, "data": payload}).encode()
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
