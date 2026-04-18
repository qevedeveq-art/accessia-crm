"""
Router devis — /api/quotes, /api/quotes/sign, /api/quote-templates
"""
import asyncio
import json
import logging
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from fastapi.responses import Response
from jinja2 import Environment, FileSystemLoader
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError

_jinja = Environment(
    loader=FileSystemLoader(Path(__file__).parent.parent / "templates" / "pdf"),
    autoescape=False,
)

_pdf_executor = ThreadPoolExecutor(max_workers=2)

from database import get_db
from models import Quote, Invoice
from schemas import QuoteCreate, QuoteUpdate, SignQuoteBody, SaveTemplateBody
from helpers import _now, _serialize_quote, _next_quote_number, _next_invoice_number, _safe_json_loads, _fire_webhooks_sync

log = logging.getLogger(__name__)

router = APIRouter()


# ═══════════════════════════════════════════════════════════════
# DEVIS CRUD
# ═══════════════════════════════════════════════════════════════

@router.get("/api/quotes")
def list_quotes(
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Quote).options(joinedload(Quote.client), joinedload(Quote.project))
    if client_id:
        q = q.filter(Quote.client_id == client_id)
    if status:
        q = q.filter(Quote.status == status)
    quotes = q.order_by(Quote.created_at.desc()).all()
    return [_serialize_quote(qt) for qt in quotes]


@router.post("/api/quotes", status_code=201)
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


@router.put("/api/quotes/{quote_id}")
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


@router.patch("/api/quotes/{quote_id}/status")
def patch_quote_status(quote_id: int, body: dict, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    qt = db.query(Quote).filter(Quote.id == quote_id).first()
    if not qt:
        raise HTTPException(404, "Devis non trouvé")
    qt.status = body.get("status", qt.status)
    qt.updated_at = _now()
    db.commit()
    if qt.status == "accepte":
        background_tasks.add_task(
            _fire_webhooks_sync,
            db_url=os.getenv("DATABASE_URL", "sqlite:///./sensia.db"),
            event="quote.accepted",
            payload={"id": qt.id, "number": qt.number},
        )
    return {"id": qt.id, "status": qt.status}


@router.post("/api/quotes/{quote_id}/convert")
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


@router.delete("/api/quotes/{quote_id}", status_code=204)
def delete_quote(quote_id: int, db: Session = Depends(get_db)):
    qt = db.query(Quote).filter(Quote.id == quote_id).first()
    if not qt:
        raise HTTPException(404, "Devis non trouvé")
    db.delete(qt)
    db.commit()


# ═══════════════════════════════════════════════════════════════
# DEVIS — PDF
# ═══════════════════════════════════════════════════════════════

@router.get("/api/quotes/{quote_id}/pdf")
async def quote_pdf(quote_id: int, db: Session = Depends(get_db)):
    qt = db.query(Quote).options(joinedload(Quote.client)).filter(Quote.id == quote_id).first()
    if not qt:
        raise HTTPException(404, "Devis non trouvé")

    items_raw = _safe_json_loads(qt.items_json)
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

    items_ctx = []
    for item in items_raw:
        qty = item.get("qty", 1)
        unit = item.get("unit_price", 0)
        total = round(qty * unit, 2)
        items_ctx.append({
            "name": item.get("name", ""),
            "description": item.get("description") or "",
            "qty": f"{qty:g}",
            "unit_price_fmt": f"{unit:,.0f}",
            "total_fmt": f"{total:,.0f}",
        })

    html = _jinja.get_template("devis.html.j2").render(
        qt_number=qt.number,
        qt_title=qt.title,
        created_str=created_str,
        valid_until_str=valid_until_str,
        tva_rate=f"{qt.tva_rate:g}",
        amount_ht_fmt=f"{qt.amount_ht:,.0f}",
        tva_amount_fmt=f"{tva_amount:,.0f}",
        amount_ttc_fmt=f"{amount_ttc:,.0f}",
        description=qt.description or "",
        notes=qt.notes or "",
        client_name=client.name if client else "—",
        client_contact_name=client.contact_name or "" if client else "",
        client_contact_email=client.contact_email or "" if client else "",
        client_address=client.address or "" if client else "",
        items=items_ctx,
        generated_at=datetime.now().strftime("%d/%m/%Y à %H:%M"),
    )

    try:
        import weasyprint  # type: ignore
        def _render():
            return weasyprint.HTML(string=html).write_pdf()
        pdf_bytes = await asyncio.get_event_loop().run_in_executor(_pdf_executor, _render)
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
# SIGNATURE DE DEVIS (PUBLIC — sans auth)
# ═══════════════════════════════════════════════════════════════

@router.get("/api/quotes/sign/{token}")
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


@router.post("/api/quotes/sign/{token}")
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
    background_tasks.add_task(
        _fire_webhooks_sync,
        db_url=os.getenv("DATABASE_URL", "sqlite:///./sensia.db"),
        event="quote.accepted",
        payload={"id": qt.id, "number": qt.number, "signed_by": body.signed_by},
    )
    return {"message": "Devis signé avec succès", "signed_by": qt.signed_by, "signed_at": qt.signed_at.isoformat()}


# ═══════════════════════════════════════════════════════════════
# TEMPLATES DE DEVIS
# ═══════════════════════════════════════════════════════════════

@router.post("/api/quotes/{quote_id}/save-template")
def save_quote_as_template(quote_id: int, body: SaveTemplateBody, db: Session = Depends(get_db)):
    qt = db.query(Quote).filter(Quote.id == quote_id).first()
    if not qt:
        raise HTTPException(404, "Devis non trouvé")
    qt.is_template = True
    qt.template_name = body.template_name
    db.commit()
    return {"message": "Sauvegardé comme modèle", "template_name": qt.template_name}


@router.get("/api/quote-templates")
def list_quote_templates(db: Session = Depends(get_db)):
    templates = db.query(Quote).filter(Quote.is_template == True).options(joinedload(Quote.client)).all()
    return [_serialize_quote(qt) for qt in templates]
