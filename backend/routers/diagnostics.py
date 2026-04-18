"""
Router diagnostics — /api/diagnostics
"""
import asyncio
import json
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
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
from models import Client, Diagnostic
from schemas import DiagnosticCreate, DiagnosticUpdate, DiagnosticType, DiagnosticStatus
from helpers import _now

log = logging.getLogger(__name__)

router = APIRouter()


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


@router.get("/api/diagnostics")
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


@router.get("/api/diagnostics/share/{token}")
def get_shared_diagnostic(token: str, db: Session = Depends(get_db)):
    """Accès public à un diagnostic via son token de partage."""
    d = db.query(Diagnostic).options(joinedload(Diagnostic.client)).filter(Diagnostic.share_token == token).first()
    if not d:
        raise HTTPException(404, "Diagnostic non trouvé ou lien invalide")
    if d.status != "termine":
        raise HTTPException(403, "Ce diagnostic n'est pas encore finalisé")
    return _serialize_diagnostic(d)


@router.get("/api/diagnostics/{diag_id}")
def get_diagnostic(diag_id: int, db: Session = Depends(get_db)):
    d = db.query(Diagnostic).options(joinedload(Diagnostic.client)).filter(Diagnostic.id == diag_id).first()
    if not d:
        raise HTTPException(404, "Diagnostic non trouvé")
    return _serialize_diagnostic(d)


@router.post("/api/diagnostics", status_code=201)
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
    diag = db.query(Diagnostic).options(joinedload(Diagnostic.client)).filter(Diagnostic.id == diag.id).first()
    return _serialize_diagnostic(diag)


@router.put("/api/diagnostics/{diag_id}")
def update_diagnostic(diag_id: int, data: DiagnosticUpdate, db: Session = Depends(get_db)):
    import pathlib
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
        try:
            client = diag.client
            if client and client.folder_path:
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


@router.delete("/api/diagnostics/{diag_id}")
def delete_diagnostic(diag_id: int, db: Session = Depends(get_db)):
    d = db.query(Diagnostic).filter(Diagnostic.id == diag_id).first()
    if not d:
        raise HTTPException(404, "Diagnostic non trouvé")
    db.delete(d)
    db.commit()
    return {"message": "Diagnostic supprimé"}


@router.post("/api/diagnostics/{diag_id}/regenerate-token")
def regenerate_share_token(diag_id: int, db: Session = Depends(get_db)):
    """Régénère le token de partage d'un diagnostic."""
    d = db.query(Diagnostic).filter(Diagnostic.id == diag_id).first()
    if not d:
        raise HTTPException(404, "Diagnostic non trouvé")
    d.share_token = uuid.uuid4().hex
    d.updated_at = _now()
    db.commit()
    return {"id": d.id, "share_token": d.share_token}


@router.get("/api/diagnostics/{diag_id}/pdf")
async def generate_diagnostic_pdf(diag_id: int, db: Session = Depends(get_db)):
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

    global_score = results.get("global_score", 0)
    global_color = "#059669" if global_score >= 70 else "#d97706" if global_score >= 40 else "#dc2626"
    global_label = "Conforme" if global_score >= 70 else "Amélioration nécessaire" if global_score >= 40 else "Critique"

    sections_ctx = []
    for section in results.get("sections", []):
        score_pct = section.get("score_pct", 0)
        color = "#059669" if score_pct >= 70 else "#d97706" if score_pct >= 40 else "#dc2626"
        sections_ctx.append({
            "title": section.get("title", ""),
            "score_pct": score_pct,
            "color": color,
            "preconisations": section.get("preconisations", []),
        })

    html = _jinja.get_template("diagnostic.html.j2").render(
        diag_type_label=diag_type_label,
        client_name=client_name,
        now_str=now_str,
        diag_ref=f"{d.id:04d}",
        global_score=global_score,
        global_color=global_color,
        global_label=global_label,
        sections=sections_ctx,
    )

    try:
        from weasyprint import HTML as WeasyHTML
        def _render():
            return WeasyHTML(string=html).write_pdf()
        pdf_bytes = await asyncio.get_event_loop().run_in_executor(_pdf_executor, _render)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="diagnostic_{d.type}_{d.id}.pdf"'
            }
        )
    except ImportError:
        return Response(
            content=html.encode("utf-8"),
            media_type="text/html",
            headers={
                "Content-Disposition": f'attachment; filename="diagnostic_{d.type}_{d.id}.html"'
            }
        )
