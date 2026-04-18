"""
Router projets — /api/projects, /api/time-entries, /api/projects/{id}/report-pdf
"""
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from jinja2 import Environment, FileSystemLoader
from sqlalchemy.orm import Session, joinedload

_jinja = Environment(
    loader=FileSystemLoader(Path(__file__).parent.parent / "templates" / "pdf"),
    autoescape=False,
)

_pdf_executor = ThreadPoolExecutor(max_workers=2)

from database import get_db
from models import Client, Project, Invoice, Task, TimeEntry, NpsSurvey, ProjectTemplate
import file_service
from schemas import ProjectCreate, ProjectUpdate, ProjectTemplateCreate, TimeEntryCreate, ProjectStatus
from helpers import _now, _serialize_project, _next_project_code

log = logging.getLogger(__name__)

router = APIRouter()


# ═══════════════════════════════════════════════════════════════
# PROJETS
# ═══════════════════════════════════════════════════════════════

@router.get("/api/projects")
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


@router.get("/api/projects/{project_id}")
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


@router.post("/api/projects", status_code=201)
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


@router.put("/api/projects/{project_id}")
def update_project(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db)):
    import uuid
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


@router.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet non trouvé")
    db.delete(project)
    db.commit()
    return {"message": "Projet supprimé"}


# ═══════════════════════════════════════════════════════════════
# RAPPORT DE MISSION PDF
# ═══════════════════════════════════════════════════════════════

@router.get("/api/projects/{project_id}/report-pdf")
async def project_report_pdf(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).options(joinedload(Project.client)).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Projet non trouvé")
    invoices = db.query(Invoice).filter(Invoice.project_id == project_id).all()
    tasks_done = db.query(Task).filter(Task.project_id == project_id, Task.status == "fait").all()
    time_entries = db.query(TimeEntry).filter(TimeEntry.project_id == project_id).all()
    total_hours = sum(e.duration_minutes for e in time_entries) / 60.0
    total_ht = sum(inv.amount_ht for inv in invoices)

    tasks_ctx = [
        {
            "title": t.title,
            "completed_at_str": t.completed_at.strftime("%d/%m/%Y") if t.completed_at else "—",
        }
        for t in tasks_done
    ]
    invoices_ctx = [
        {
            "number": inv.number,
            "amount_ht_fmt": f"{inv.amount_ht:,.0f}",
            "status": inv.status,
            "issued_date_str": inv.issued_date.strftime("%d/%m/%Y") if inv.issued_date else "—",
        }
        for inv in invoices
    ]

    html = _jinja.get_template("rapport_projet.html.j2").render(
        project_name=project.name,
        client_name=project.client.name if project.client else "—",
        project_code=project.code,
        project_status=project.status,
        total_hours=f"{total_hours:.1f}",
        total_ht_fmt=f"{total_ht:,.0f}",
        tasks_count=len(tasks_done),
        tasks_done=tasks_ctx,
        invoices=invoices_ctx,
        generated_at=datetime.now().strftime("%d/%m/%Y à %H:%M"),
    )

    try:
        import weasyprint  # type: ignore
        def _render():
            return weasyprint.HTML(string=html).write_pdf()
        pdf_bytes = await asyncio.get_event_loop().run_in_executor(_pdf_executor, _render)
        return Response(content=pdf_bytes, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="rapport_{project.code}.pdf"'})
    except Exception:
        return Response(content=html.encode("utf-8"), media_type="text/html; charset=utf-8")


# ═══════════════════════════════════════════════════════════════
# SAISIE DE TEMPS (TIME ENTRIES)
# ═══════════════════════════════════════════════════════════════

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


@router.get("/api/time-entries")
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


@router.post("/api/time-entries", status_code=201)
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


@router.delete("/api/time-entries/{entry_id}", status_code=204)
def delete_time_entry(entry_id: int, db: Session = Depends(get_db)):
    e = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not e:
        raise HTTPException(404, "Entrée non trouvée")
    db.delete(e)
    db.commit()


@router.get("/api/time-entries/export")
def export_time_entries_csv(
    project_id: Optional[int] = Query(None),
    client_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    import csv
    import io
    q = db.query(TimeEntry).options(joinedload(TimeEntry.project), joinedload(TimeEntry.client))
    if project_id:
        q = q.filter(TimeEntry.project_id == project_id)
    if client_id:
        q = q.filter(TimeEntry.client_id == client_id)
    entries = q.order_by(TimeEntry.date.desc()).all()

    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(["Date", "Projet", "Client", "Durée (min)", "Durée (h)", "Description"])
    for e in entries:
        writer.writerow([
            e.date.strftime("%d/%m/%Y") if e.date else "",
            e.project.name if e.project else "",
            e.client.name if e.client else "",
            e.duration_minutes,
            round(e.duration_minutes / 60, 2),
            e.description or "",
        ])

    return Response(
        content=buf.getvalue().encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=\"saisies_temps.csv\""},
    )


# ═══════════════════════════════════════════════════════════════
# PROJECT TEMPLATES
# ═══════════════════════════════════════════════════════════════

@router.get("/api/project-templates")
def list_project_templates(db: Session = Depends(get_db)):
    templates = db.query(ProjectTemplate).order_by(ProjectTemplate.id.desc()).all()
    return [{"id": t.id, "name": t.name, "description": t.description, "phases_json": t.phases_json, "created_at": t.created_at.isoformat() if t.created_at else None} for t in templates]


@router.post("/api/project-templates", status_code=201)
def create_project_template(body: ProjectTemplateCreate, db: Session = Depends(get_db)):
    t = ProjectTemplate(name=body.name, description=body.description, phases_json=body.phases_json, created_at=_now())
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": t.id}


@router.delete("/api/project-templates/{tid}", status_code=204)
def delete_project_template(tid: int, db: Session = Depends(get_db)):
    t = db.query(ProjectTemplate).filter(ProjectTemplate.id == tid).first()
    if not t:
        raise HTTPException(404, "Template non trouvé")
    db.delete(t)
    db.commit()
