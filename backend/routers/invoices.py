"""
Router factures — /api/invoices, /api/recurring-invoices
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import Client, Project, Invoice, RecurringInvoice
from schemas import InvoiceCreate, InvoiceStatusUpdate, InvoiceStatus, RecurringInvoiceCreate
from helpers import _now, _serialize_invoice, _next_invoice_number, _fire_webhooks_sync
import os

log = logging.getLogger(__name__)

router = APIRouter()


# ═══════════════════════════════════════════════════════════════
# FACTURES
# ═══════════════════════════════════════════════════════════════

@router.get("/api/invoices")
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


@router.post("/api/invoices", status_code=201)
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

    invoice = Invoice(
        number=_next_invoice_number(db),
        client_id=data.client_id,
        project_id=data.project_id,
        amount_ht=data.amount_ht,
        tva_rate=data.tva_rate,
        status=data.status.value if data.status else "brouillon",
        issued_date=data.issued_date,
        due_date=data.due_date,
        notes=data.notes,
    )
    try:
        db.add(invoice)
        db.commit()
        db.refresh(invoice)
    except IntegrityError:
        db.rollback()
        invoice.number = _next_invoice_number(db)
        db.add(invoice)
        db.commit()
        db.refresh(invoice)
    return {"id": invoice.id, "number": invoice.number}


@router.patch("/api/invoices/{invoice_id}/status")
def update_invoice_status(
    invoice_id: int,
    data: InvoiceStatusUpdate,
    background_tasks: BackgroundTasks,
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
    if data.status == InvoiceStatus.payee:
        background_tasks.add_task(
            _fire_webhooks_sync,
            db_url=os.getenv("DATABASE_URL", "sqlite:///./sensia.db"),
            event="invoice.paid",
            payload={"id": invoice.id, "number": invoice.number},
        )
    return {"id": invoice.id, "status": invoice.status}


# ═══════════════════════════════════════════════════════════════
# FACTURATION RÉCURRENTE
# ═══════════════════════════════════════════════════════════════

@router.get("/api/recurring-invoices")
def list_recurring_invoices(db: Session = Depends(get_db)):
    items = db.query(RecurringInvoice).options(joinedload(RecurringInvoice.client)).order_by(RecurringInvoice.id.desc()).all()
    return [
        {
            "id": r.id,
            "client_id": r.client_id,
            "client_name": r.client.name if r.client else "",
            "project_id": r.project_id,
            "amount_ht": r.amount_ht,
            "tva_rate": r.tva_rate,
            "frequency": r.frequency,
            "next_billing_date": r.next_billing_date.isoformat() if r.next_billing_date else None,
            "active": r.active,
            "description": r.description,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in items
    ]


@router.post("/api/recurring-invoices", status_code=201)
def create_recurring_invoice(body: RecurringInvoiceCreate, db: Session = Depends(get_db)):
    try:
        nbd = datetime.fromisoformat(body.next_billing_date.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(422, "Format de date invalide pour next_billing_date")
    r = RecurringInvoice(
        client_id=body.client_id,
        project_id=body.project_id,
        amount_ht=body.amount_ht,
        tva_rate=body.tva_rate,
        frequency=body.frequency,
        next_billing_date=nbd,
        description=body.description,
        created_at=_now(),
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"id": r.id}


@router.patch("/api/recurring-invoices/{rid}")
def update_recurring_invoice(rid: int, body: dict, db: Session = Depends(get_db)):
    r = db.query(RecurringInvoice).filter(RecurringInvoice.id == rid).first()
    if not r:
        raise HTTPException(404, "Récurrent non trouvé")
    for k, v in body.items():
        if hasattr(r, k):
            setattr(r, k, v)
    db.commit()
    return {"id": r.id, "active": r.active}


@router.delete("/api/recurring-invoices/{rid}", status_code=204)
def delete_recurring_invoice(rid: int, db: Session = Depends(get_db)):
    r = db.query(RecurringInvoice).filter(RecurringInvoice.id == rid).first()
    if not r:
        raise HTTPException(404, "Récurrent non trouvé")
    db.delete(r)
    db.commit()
