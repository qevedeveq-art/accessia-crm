"""
Router clients — /api/clients, /api/contacts, /api/pipeline
"""
import logging
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Client, Contact
import file_service
from schemas import ClientCreate, ClientUpdate, ContactCreate, PipelineUpdate, ClientStatus
from helpers import _now, _serialize_client, _serialize_project

log = logging.getLogger(__name__)

router = APIRouter()


# ═══════════════════════════════════════════════════════════════
# CLIENTS
# ═══════════════════════════════════════════════════════════════

@router.get("/api/clients")
def list_clients(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    status: Optional[ClientStatus] = None,
    search: Optional[str] = Query(None, max_length=100),
    cursor: Optional[int] = Query(None, gt=0),
    db: Session = Depends(get_db),
):
    q = db.query(Client).options(joinedload(Client.projects))
    if status:
        q = q.filter(Client.status == status.value)
    if search:
        safe_search = search.replace("%", "\\%").replace("_", "\\_")
        q = q.filter(Client.name.ilike(f"%{safe_search}%"))
    if cursor is not None:
        q = q.filter(Client.id < cursor)
        clients = q.order_by(Client.id.desc()).limit(limit).all()
        next_cursor = clients[-1].id if len(clients) == limit else None
        return {"items": [_serialize_client(c) for c in clients], "next_cursor": next_cursor}
    clients = q.order_by(Client.name).offset(skip).limit(limit).all()
    return [_serialize_client(c) for c in clients]


@router.get("/api/clients/{client_id}")
def get_client(client_id: int, db: Session = Depends(get_db)):
    c = (
        db.query(Client)
        .options(joinedload(Client.projects), joinedload(Client.contacts))
        .filter(Client.id == client_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    data = _serialize_client(c)
    data["projects"] = [_serialize_project(p) for p in c.projects]
    data["contacts"] = [
        {
            "id": ct.id,
            "name": ct.name,
            "email": ct.email,
            "phone": ct.phone,
            "role": ct.role,
            "is_primary": ct.is_primary,
        }
        for ct in c.contacts
    ]
    return data


@router.post("/api/clients", status_code=201)
def create_client(data: ClientCreate, db: Session = Depends(get_db)):
    from slugify import slugify

    if data.siret:
        existing_siret = db.query(Client).filter(Client.siret == data.siret).first()
        if existing_siret:
            raise HTTPException(status_code=409, detail=f"Un client existe déjà pour ce SIRET (ID {existing_siret.id})")
    base_slug = slugify(data.name)
    if not base_slug:
        raise HTTPException(status_code=400, detail="Nom de client invalide")
    slug, n = base_slug, 1
    while db.query(Client).filter(Client.slug == slug).first():
        slug = f"{base_slug}-{n}"
        n += 1

    client = Client(
        name=data.name.strip(),
        slug=slug,
        type=data.type.value if data.type else "pme",
        sector=data.sector,
        contact_name=data.contact_name,
        contact_email=data.contact_email,
        contact_phone=data.contact_phone,
        address=data.address,
        website=data.website,
        siret=data.siret,
        status=data.status.value if data.status else "prospect",
        source=data.source,
        budget_range=data.budget_range,
        notes=data.notes,
        pipeline_stage=data.pipeline_stage.value if data.pipeline_stage else "nouveau",
    )
    db.add(client)
    db.commit()
    db.refresh(client)

    try:
        folder = file_service.create_client_folder(data.name.strip(), data.model_dump())
        client.folder_path = folder
    except Exception as e:
        log.warning(f"Dossier client non créé : {e}")

    db.commit()
    db.refresh(client)
    return _serialize_client(client)


@router.put("/api/clients/{client_id}")
def update_client(client_id: int, data: ClientUpdate, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")

    update_data = data.model_dump(exclude_unset=True)
    if update_data.get("siret"):
        existing_siret = db.query(Client).filter(Client.siret == update_data["siret"], Client.id != client_id).first()
        if existing_siret:
            raise HTTPException(status_code=409, detail=f"Ce SIRET est déjà utilisé par le client {existing_siret.name}")
    for field_name, value in update_data.items():
        if isinstance(value, Enum):
            value = value.value
        setattr(client, field_name, value)

    client.updated_at = _now()
    db.commit()
    db.refresh(client)
    return _serialize_client(client)


@router.delete("/api/clients/{client_id}")
def delete_client(client_id: int, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    db.delete(client)
    db.commit()
    return {"message": "Client supprimé"}


# ═══════════════════════════════════════════════════════════════
# CONTACTS
# ═══════════════════════════════════════════════════════════════

@router.post("/api/contacts", status_code=201)
def create_contact(data: ContactCreate, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == data.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")

    contact = Contact(**data.model_dump())
    db.add(contact)
    db.commit()
    db.refresh(contact)

    return {"id": contact.id, "name": contact.name}


# ═══════════════════════════════════════════════════════════════
# PIPELINE
# ═══════════════════════════════════════════════════════════════

@router.get("/api/pipeline")
def get_pipeline(db: Session = Depends(get_db)):
    clients = db.query(Client).filter(Client.status != "inactive").order_by(Client.name).all()
    stages = ["nouveau", "qualifie", "proposition", "negociation", "gagne", "perdu"]
    result = {s: [] for s in stages}
    for c in clients:
        stage = c.pipeline_stage or "nouveau"
        if stage in result:
            result[stage].append(_serialize_client(c))
    return result


@router.patch("/api/clients/{client_id}/pipeline")
def update_pipeline_stage(client_id: int, data: PipelineUpdate, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(404, "Client non trouvé")
    client.pipeline_stage = data.pipeline_stage.value
    client.updated_at = _now()
    db.commit()
    return {"id": client.id, "pipeline_stage": client.pipeline_stage}
