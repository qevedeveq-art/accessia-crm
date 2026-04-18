"""
Router reporting — /api/reporting, /api/reporting/cashflow
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from dateutil.relativedelta import relativedelta

from database import get_db
from models import Invoice, Project
from helpers import _now

router = APIRouter()


@router.get("/api/reporting")
def get_reporting(
    period: str = Query("year", regex="^(month|quarter|year)$"),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    now = _now()
    target_year = year or now.year

    paid_invoices = (
        db.query(Invoice)
        .options(joinedload(Invoice.client))
        .filter(Invoice.status == "payee")
        .all()
    )

    ca_by_month: dict = {}
    for inv in paid_invoices:
        d = inv.issued_date or inv.created_at
        if d and d.year == target_year:
            m = d.month
            if m not in ca_by_month:
                ca_by_month[m] = {"month": m, "ca_ht": 0.0, "ca_ttc": 0.0, "nb_invoices": 0}
            ca_by_month[m]["ca_ht"] += inv.amount_ht
            ca_by_month[m]["ca_ttc"] += inv.amount_ht * (1 + inv.tva_rate / 100)
            ca_by_month[m]["nb_invoices"] += 1

    ca_by_month_list = [
        {**v, "ca_ht": round(v["ca_ht"], 2), "ca_ttc": round(v["ca_ttc"], 2)}
        for v in sorted(ca_by_month.values(), key=lambda x: x["month"])
    ]

    ca_by_client: dict = {}
    for inv in paid_invoices:
        cname = inv.client.name if inv.client else "Inconnu"
        if cname not in ca_by_client:
            ca_by_client[cname] = {"client_name": cname, "ca_ht": 0.0, "nb_projects": set()}
        ca_by_client[cname]["ca_ht"] += inv.amount_ht
        if inv.project_id:
            ca_by_client[cname]["nb_projects"].add(inv.project_id)

    ca_by_client_list = sorted(
        [{"client_name": k, "ca_ht": round(v["ca_ht"], 2), "nb_projects": len(v["nb_projects"])}
         for k, v in ca_by_client.items()],
        key=lambda x: x["ca_ht"],
        reverse=True,
    )[:10]

    projects = db.query(Project).filter(Project.status == "termine").all()
    ca_by_type: dict = {}
    for p in projects:
        t = p.type or "autre"
        if t not in ca_by_type:
            ca_by_type[t] = {"type": t, "ca_ht": 0.0}
        ca_by_type[t]["ca_ht"] += p.budget or 0

    return {
        "ca_by_month": ca_by_month_list,
        "ca_by_client": ca_by_client_list,
        "ca_by_type": [{"type": k, "ca_ht": round(v["ca_ht"], 2)} for k, v in ca_by_type.items()],
        "top_clients": ca_by_client_list[:5],
    }


@router.get("/api/reporting/cashflow")
def get_cashflow(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    months = []
    for i in range(11, -1, -1):
        month_start = (now - relativedelta(months=i)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_end = month_start + relativedelta(months=1)
        paid = db.query(func.sum(Invoice.amount_ht)).filter(
            Invoice.status == "payee",
            Invoice.paid_date >= month_start,
            Invoice.paid_date < month_end,
        ).scalar() or 0
        pending = db.query(func.sum(Invoice.amount_ht)).filter(
            Invoice.status == "envoyee",
            Invoice.due_date >= month_start,
            Invoice.due_date < month_end,
        ).scalar() or 0
        months.append({
            "month": month_start.strftime("%Y-%m"),
            "label": month_start.strftime("%b %Y"),
            "encaisse": round(paid, 2),
            "prevu": round(pending, 2),
        })

    margin_by_category = []
    for ptype in ["diagnostic", "integration", "formation", "mco", "pack_pme"]:
        projects = db.query(Project).filter(Project.type == ptype).all()
        pids = [p.id for p in projects]
        ca = db.query(func.sum(Invoice.amount_ht)).filter(Invoice.project_id.in_(pids), Invoice.status == "payee").scalar() or 0
        margin_by_category.append({"type": ptype, "ca": round(ca, 2)})

    year_start = now - relativedelta(months=12)
    rolling_12m = db.query(func.sum(Invoice.amount_ht)).filter(
        Invoice.status == "payee",
        Invoice.paid_date >= year_start,
    ).scalar() or 0

    return {
        "monthly_forecast": months,
        "margin_by_category": margin_by_category,
        "rolling_12m_ca": round(rolling_12m, 2),
    }
