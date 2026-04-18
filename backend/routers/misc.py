"""
Router divers — /api/dashboard, /api/activities, /api/tasks, /api/search,
/api/search-company, /api/nps, /api/webhooks, /api/backup,
/api/maintenance, /api/update, /api/health, /api/export/*, /api/import/*,
/api/portal-v2, /api/export/calendar
"""
import csv
import io
import json
import logging
import os
import re
import shutil
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from slugify import slugify

_limiter = Limiter(key_func=get_remote_address)

import file_service
from database import get_db
from models import (
    Client, Project, Invoice, Task, Activity, Quote, Diagnostic,
    NpsSurvey, Notification, Webhook, TimeEntry
)
from schemas import (
    ActivityCreate, TaskCreate, TaskStatusUpdate, TaskStatus,
    NpsSubmitBody, WebhookCreate
)
from helpers import (
    _now, _serialize_client, _serialize_project, _serialize_invoice,
    _serialize_activity, _serialize_task, _next_invoice_number,
)

log = logging.getLogger(__name__)

import time as _time
_dashboard_cache: dict = {}
_DASHBOARD_TTL = 30  # secondes

router = APIRouter()

# ─── Chemins backup ──────────────────────────────────────────
_DB_PATH = Path(__file__).parent.parent / "sensia.db"
_BACKUP_DIR = file_service.SENSIA_BASE / "07_ADMINISTRATIF" / "Sauvegardes"
_LAST_BACKUP_FILE = Path(__file__).parent.parent / ".last_backup"
_GIT_REPO = Path(os.getenv("GIT_REPO_PATH", str(Path(__file__).parent.parent.parent)))


# ═══════════════════════════════════════════════════════════════
# DASHBOARD
# ═══════════════════════════════════════════════════════════════

@router.get("/api/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    cache_key = "dashboard"
    now_ts = _time.monotonic()
    if cache_key in _dashboard_cache:
        cached_val, cached_ts = _dashboard_cache[cache_key]
        if now_ts - cached_ts < _DASHBOARD_TTL:
            return cached_val

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

    phase_counts = (
        db.query(Project.phase, func.count(Project.id))
        .filter(Project.status == "en_cours")
        .group_by(Project.phase)
        .all()
    )
    phase_map = dict(phase_counts)
    phase_dist = [{"phase": i, "count": phase_map.get(i, 0)} for i in range(8)]

    result = {
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
    _dashboard_cache[cache_key] = (result, _time.monotonic())
    return result


# ═══════════════════════════════════════════════════════════════
# ACTIVITÉS
# ═══════════════════════════════════════════════════════════════

@router.get("/api/activities")
def list_activities(client_id: Optional[int] = None, limit: int = Query(50, ge=1, le=200), db=Depends(get_db)):
    q = db.query(Activity)
    if client_id:
        q = q.filter(Activity.client_id == client_id)
    return [_serialize_activity(a) for a in q.order_by(Activity.date.desc()).limit(limit).all()]


@router.post("/api/activities", status_code=201)
def create_activity(data: ActivityCreate, db=Depends(get_db)):
    client = db.query(Client).filter(Client.id == data.client_id).first()
    if not client:
        raise HTTPException(404, "Client non trouvé")
    activity = Activity(**data.model_dump())
    if not activity.date:
        activity.date = _now()
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return _serialize_activity(activity)


@router.delete("/api/activities/{activity_id}")
def delete_activity(activity_id: int, db=Depends(get_db)):
    a = db.query(Activity).filter(Activity.id == activity_id).first()
    if not a:
        raise HTTPException(404, "Activité non trouvée")
    db.delete(a)
    db.commit()
    return {"message": "Activité supprimée"}


# ═══════════════════════════════════════════════════════════════
# TÂCHES
# ═══════════════════════════════════════════════════════════════

@router.get("/api/tasks")
def list_tasks(status: Optional[TaskStatus] = None, client_id: Optional[int] = None, db=Depends(get_db)):
    q = db.query(Task)
    if status:
        q = q.filter(Task.status == status.value)
    if client_id:
        q = q.filter(Task.client_id == client_id)
    return [_serialize_task(t) for t in q.order_by(Task.due_date.asc().nullslast(), Task.created_at.desc()).all()]


@router.post("/api/tasks", status_code=201)
def create_task(data: TaskCreate, db=Depends(get_db)):
    task = Task(**data.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return _serialize_task(task)


@router.patch("/api/tasks/{task_id}/status")
def update_task_status(task_id: int, data: TaskStatusUpdate, db=Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Tâche non trouvée")
    task.status = data.status.value
    if data.status == TaskStatus.fait:
        task.completed_at = _now()
    db.commit()
    return _serialize_task(task)


@router.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, db=Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(404, "Tâche non trouvée")
    db.delete(t)
    db.commit()
    return {"message": "Tâche supprimée"}


# ═══════════════════════════════════════════════════════════════
# RECHERCHE GLOBALE
# ═══════════════════════════════════════════════════════════════

@router.get("/api/search")
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
    diagnostics = db.query(Diagnostic).options(joinedload(Diagnostic.client)).filter(
        (Diagnostic.title.ilike(like)) | (Diagnostic.type.ilike(like))
    ).limit(5).all()
    time_entries = db.query(TimeEntry).options(
        joinedload(TimeEntry.project), joinedload(TimeEntry.client)
    ).filter(TimeEntry.description.ilike(like)).limit(5).all()
    files = file_service.search_files(q, limit=6)
    return {
        "clients": [{"id": c.id, "name": c.name, "sector": c.sector, "status": c.status} for c in clients],
        "projects": [{"id": p.id, "code": p.code, "name": p.name, "client_name": p.client.name if p.client else ""} for p in projects],
        "quotes": [{"id": qt.id, "number": qt.number, "title": qt.title, "client_name": qt.client.name if qt.client else "", "status": qt.status, "amount_ht": qt.amount_ht} for qt in quotes],
        "tasks": [{"id": t.id, "title": t.title, "status": t.status, "priority": t.priority, "client_id": t.client_id, "project_id": t.project_id} for t in tasks],
        "diagnostics": [{"id": d.id, "title": d.title, "type": d.type, "status": d.status, "client_name": d.client.name if d.client else ""} for d in diagnostics],
        "time_entries": [
            {
                "id": e.id,
                "project_name": e.project.name if e.project else "",
                "client_name": e.client.name if e.client else "",
                "date": e.date.isoformat() if e.date else None,
                "duration_minutes": e.duration_minutes,
                "description": e.description,
            }
            for e in time_entries
        ],
        "files": files,
    }


# ═══════════════════════════════════════════════════════════════
# RECHERCHE ENTREPRISE (API GOUVERNEMENTALE)
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
    "NN": "Non employeuse", "00": "0 salarié", "01": "1 à 2",
    "02": "3 à 5", "03": "6 à 9", "11": "10 à 19", "12": "20 à 49",
    "21": "50 à 99", "22": "100 à 199", "31": "200 à 249", "32": "250 à 499",
    "41": "500 à 999", "42": "1 000 à 1 999", "51": "2 000 à 4 999",
    "52": "5 000 à 9 999", "53": "10 000 et plus",
}

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
    from datetime import date as date_type
    if not date_creation:
        return None
    try:
        d = date_type.fromisoformat(date_creation)
        return (date_type.today() - d).days / 365.25
    except Exception:
        return None


def _compute_grants(company: dict) -> list:
    effectif_code = company.get("effectif_code") or "NN"
    categorie = company.get("categorie") or ""
    date_creation = company.get("date_creation")
    region = company.get("region") or ""
    naf_code = company.get("naf_code") or ""

    age = _company_age_years(date_creation)
    age_ok = age is not None and age >= 1
    age_label = f"{age:.1f} an(s)" if age is not None else "inconnu"

    rank = _effectif_rank(effectif_code)
    has_10_plus = rank >= _EFFECTIF_ORDER.index("11")
    has_2000_or_less = rank <= _EFFECTIF_ORDER.index("42")
    has_employees = rank > _EFFECTIF_ORDER.index("00")
    is_pme = categorie in ("PME", "TPE") or (rank <= _EFFECTIF_ORDER.index("31"))

    grants = []

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

    naf_prefix = naf_code[:2] if naf_code else ""
    is_rd_sector = naf_prefix in ("62", "63", "72", "26", "21", "20", "28", "29", "30", "71", "70")
    cir_ok = is_rd_sector
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
    siege = r.get("siege") or {}
    naf_code = (r.get("activite_principale") or siege.get("activite_principale") or "").strip()
    effectif_code = (r.get("tranche_effectif_salarie") or siege.get("tranche_effectif_salarie") or "NN").strip()
    categorie_raw = (r.get("categorie_entreprise") or "").strip().upper()
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


@router.get("/api/search-company")
@_limiter.limit("20/minute")
async def search_company(request: Request, q: str = Query(..., min_length=2)):
    """Recherche une entreprise française par nom, SIREN ou SIRET via l'API officielle."""
    q_clean = q.strip().replace(" ", "").replace("-", "")
    if re.fullmatch(r"\d{9}", q_clean):
        search_q = q_clean
    elif re.fullmatch(r"\d{14}", q_clean):
        search_q = q_clean
    else:
        search_q = q.strip()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
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
# NPS SURVEYS
# ═══════════════════════════════════════════════════════════════

@router.get("/api/nps/average")
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


@router.get("/api/nps")
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


@router.get("/api/nps/{token}")
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


@router.post("/api/nps/{token}")
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


# ═══════════════════════════════════════════════════════════════
# WEBHOOKS (CRUD)
# ═══════════════════════════════════════════════════════════════

@router.get("/api/webhooks")
def list_webhooks(db: Session = Depends(get_db)):
    hooks = db.query(Webhook).order_by(Webhook.id.desc()).all()
    return [{"id": h.id, "url": h.url, "events": json.loads(h.events), "active": h.active, "created_at": h.created_at.isoformat() if h.created_at else None} for h in hooks]


@router.post("/api/webhooks", status_code=201)
def create_webhook(body: WebhookCreate, db: Session = Depends(get_db)):
    h = Webhook(url=body.url, events=json.dumps(body.events), active=True, secret=body.secret, created_at=_now())
    db.add(h)
    db.commit()
    db.refresh(h)
    return {"id": h.id}


@router.patch("/api/webhooks/{wid}")
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


@router.delete("/api/webhooks/{wid}", status_code=204)
def delete_webhook(wid: int, db: Session = Depends(get_db)):
    h = db.query(Webhook).filter(Webhook.id == wid).first()
    if not h:
        raise HTTPException(404, "Webhook non trouvé")
    db.delete(h)
    db.commit()


# ═══════════════════════════════════════════════════════════════
# SAUVEGARDE (BACKUP)
# ═══════════════════════════════════════════════════════════════

def _create_backup_now() -> dict:
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


@router.post("/api/backup/create")
def backup_create():
    try:
        result = _create_backup_now()
        return result
    except Exception as e:
        raise HTTPException(500, f"Erreur de sauvegarde : {e}")


@router.get("/api/backup/list")
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


@router.post("/api/backup/restore/{filename}")
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

@router.get("/api/update/check")
def update_check():
    try:
        if not (_GIT_REPO / ".git").exists():
            return {"up_to_date": True, "commits_behind": 0, "latest_message": None, "error": "Depot Git introuvable"}
        subprocess.run(["git", "fetch", "--quiet"], cwd=_GIT_REPO, capture_output=True, timeout=10, check=False)
        local = subprocess.run(["git", "rev-parse", "HEAD"], cwd=_GIT_REPO, capture_output=True, text=True, timeout=5).stdout.strip()
        remote = subprocess.run(["git", "rev-parse", "@{u}"], cwd=_GIT_REPO, capture_output=True, text=True, timeout=5).stdout.strip()
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


@router.post("/api/update/apply")
def update_apply():
    try:
        if not (_GIT_REPO / ".git").exists():
            raise HTTPException(500, "Depot Git introuvable pour appliquer la mise a jour")
        pull = subprocess.run(["git", "pull", "--rebase"], cwd=_GIT_REPO, capture_output=True, text=True, timeout=60)
        if pull.returncode != 0:
            raise HTTPException(500, f"git pull échoué : {pull.stderr}")
        req = _GIT_REPO / "backend" / "requirements.txt"
        if req.exists():
            subprocess.run(["pip", "install", "-r", str(req), "-q"], capture_output=True, timeout=120, check=False)
        return {
            "message": "Mise à jour appliquée. Redémarrez ACCESSIA Pro pour reconstruire les services et activer tous les changements.",
            "output": pull.stdout.strip(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Erreur de mise à jour : {e}")


# ═══════════════════════════════════════════════════════════════
# MAINTENANCE / CENTRE DE CONTROLE
# ═══════════════════════════════════════════════════════════════

@router.get("/api/maintenance/overview")
def maintenance_overview(db: Session = Depends(get_db)):
    db_url = os.getenv("DATABASE_URL", "sqlite:///./sensia.db")
    db_path = db_url.replace("sqlite:////", "/").replace("sqlite:///", "")
    backup_dir = _BACKUP_DIR
    backup_files = sorted(backup_dir.glob("*.db"), key=lambda p: p.stat().st_mtime, reverse=True) if backup_dir.exists() else []
    notifications = db.query(Notification).filter(Notification.is_read == False).all()

    return {
        "version": "1.2.0",
        "paths": {
            "base_dir": str(file_service.SENSIA_BASE),
            "repo_dir": str(_GIT_REPO),
            "db_path": db_path,
            "catalogue_path": str(file_service.CATALOGUE_PATH),
            "backup_dir": str(backup_dir),
        },
        "counts": {
            "clients": db.query(func.count(Client.id)).scalar() or 0,
            "projects": db.query(func.count(Project.id)).scalar() or 0,
            "quotes": db.query(func.count(Quote.id)).scalar() or 0,
            "invoices": db.query(func.count(Invoice.id)).scalar() or 0,
            "tasks_open": db.query(func.count(Task.id)).filter(Task.status != "fait").scalar() or 0,
            "notifications_unread": len(notifications),
            "backups": len(backup_files),
        },
        "last_backup": backup_files[0].name if backup_files else None,
        "last_backup_at": datetime.fromtimestamp(backup_files[0].stat().st_mtime, tz=timezone.utc).isoformat() if backup_files else None,
        "git_repo_available": (_GIT_REPO / ".git").exists(),
    }


# ═══════════════════════════════════════════════════════════════
# HEALTH CHECK
# ═══════════════════════════════════════════════════════════════

@router.get("/api/health")
def health():
    return {
        "status": "ok",
        "version": "1.2.0",
    }


# ═══════════════════════════════════════════════════════════════
# PORTAIL CLIENT V2
# ═══════════════════════════════════════════════════════════════

@router.get("/api/portal-v2/{token}")
def get_client_portal_v2(token: str, db: Session = Depends(get_db)):
    """Extended portal including quotes and documents."""
    client = db.query(Client).filter(Client.slug == token).first()
    if not client:
        raise HTTPException(404, "Portail introuvable")
    projects = db.query(Project).filter(Project.client_id == client.id).all()
    invoices = db.query(Invoice).filter(Invoice.client_id == client.id).all()
    quotes = db.query(Quote).filter(Quote.client_id == client.id, Quote.status.in_(["envoye", "accepte"])).all()
    diagnostics = db.query(Diagnostic).filter(Diagnostic.client_id == client.id).all()
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

@router.get("/api/export/clients")
def export_clients_csv(db: Session = Depends(get_db)):
    clients = db.query(Client).all()
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["id", "name", "type", "sector", "contact_name", "contact_email", "contact_phone", "status", "pipeline_stage", "created_at"])
    writer.writeheader()
    for c in clients:
        writer.writerow({"id": c.id, "name": c.name, "type": c.type, "sector": c.sector or "", "contact_name": c.contact_name or "", "contact_email": c.contact_email or "", "contact_phone": c.contact_phone or "", "status": c.status, "pipeline_stage": c.pipeline_stage or "", "created_at": c.created_at.isoformat() if c.created_at else ""})
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=clients.csv"})


@router.get("/api/export/invoices")
def export_invoices_csv(db: Session = Depends(get_db)):
    invoices = db.query(Invoice).options(joinedload(Invoice.client)).all()
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["id", "number", "client_name", "amount_ht", "tva_rate", "amount_ttc", "status", "issued_date", "due_date", "paid_date"])
    writer.writeheader()
    for inv in invoices:
        writer.writerow({"id": inv.id, "number": inv.number, "client_name": inv.client.name if inv.client else "", "amount_ht": inv.amount_ht, "tva_rate": inv.tva_rate, "amount_ttc": round(inv.amount_ht * (1 + inv.tva_rate / 100), 2), "status": inv.status, "issued_date": inv.issued_date.isoformat() if inv.issued_date else "", "due_date": inv.due_date.isoformat() if inv.due_date else "", "paid_date": inv.paid_date.isoformat() if inv.paid_date else ""})
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=invoices.csv"})


@router.get("/api/export/projects")
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

@router.post("/api/import/clients", status_code=201)
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
# EXPORT CALENDRIER ICS
# ═══════════════════════════════════════════════════════════════

@router.get("/api/export/calendar")
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
