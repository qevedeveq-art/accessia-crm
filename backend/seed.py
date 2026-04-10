"""
ACCESSIA Pro — Seed de données initiales
Inséré au premier démarrage uniquement (si la base est vide)
"""
import uuid
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from database import SessionLocal, engine, Base
from models import Client, Diagnostic

log = logging.getLogger(__name__)


def _utcnow():
    return datetime.now(timezone.utc)


DEMO_CLIENTS = [
    {
        "name": "TechVision SAS",
        "slug": "techvision-sas",
        "type": "pme",
        "sector": "Technologie",
        "contact_name": "Marc Dubois",
        "contact_email": "m.dubois@techvision.fr",
        "contact_phone": "06 12 34 56 78",
        "address": "15 rue de l'Innovation, 75001 Paris",
        "status": "client",
        "source": "linkedin",
        "budget_range": "10000-50000",
        "pipeline_stage": "client",
        "notes": "Client historique ACCESSIA — Projet IA en cours",
    },
    {
        "name": "Cabinet Dupont & Associés",
        "slug": "cabinet-dupont-associes",
        "type": "pme",
        "sector": "Conseil & Expertise",
        "contact_name": "Sophie Dupont",
        "contact_email": "s.dupont@cabinetdupont.fr",
        "contact_phone": "06 98 76 54 32",
        "address": "8 avenue des Affaires, 69002 Lyon",
        "status": "prospect",
        "source": "recommandation",
        "budget_range": "5000-20000",
        "pipeline_stage": "proposition",
        "notes": "Intéressé par le diagnostic cybersécurité",
    },
    {
        "name": "Artisans du Numérique",
        "slug": "artisans-du-numerique",
        "type": "tpe",
        "sector": "Artisanat",
        "contact_name": "Pierre Martin",
        "contact_email": "p.martin@artisans-numerique.fr",
        "contact_phone": "07 45 67 89 01",
        "address": "3 rue du Savoir-Faire, 44000 Nantes",
        "status": "prospect",
        "source": "site_web",
        "budget_range": "2000-8000",
        "pipeline_stage": "nouveau",
        "notes": "Premier contact — formation IA souhaitée",
    },
]

DEMO_DIAGNOSTICS = [
    {
        "type": "ia",
        "title": "Diagnostic Maturité IA — TechVision SAS",
        "status": "termine",
        "share_token": f"ia-techvision-{uuid.uuid4().hex[:16]}",
        "results": '{"score": 72, "niveau": "Intermédiaire", "recommandations": ["Automatiser les processus RH", "Déployer un chatbot client", "Former les équipes aux outils IA"]}',
        "client_slug": "techvision-sas",
    },
    {
        "type": "cyber",
        "title": "Audit Cybersécurité — Cabinet Dupont",
        "status": "en_cours",
        "share_token": f"cyber-dupont-{uuid.uuid4().hex[:16]}",
        "results": None,
        "client_slug": "cabinet-dupont-associes",
    },
]


def run_seed():
    """Peuple la base avec des données initiales si elle est vide."""
    db: Session = SessionLocal()
    try:
        # Ne seeder que si aucun client n'existe
        existing = db.query(Client).count()
        if existing > 0:
            log.info("Seed ignoré : base de données déjà peuplée (%d clients)", existing)
            return

        log.info("Première initialisation — insertion des données de démo...")

        # Créer les clients
        created_clients = {}
        for data in DEMO_CLIENTS:
            client = Client(
                name=data["name"],
                slug=data["slug"],
                type=data["type"],
                sector=data["sector"],
                contact_name=data["contact_name"],
                contact_email=data["contact_email"],
                contact_phone=data.get("contact_phone"),
                address=data.get("address"),
                status=data["status"],
                source=data.get("source"),
                budget_range=data.get("budget_range"),
                pipeline_stage=data["pipeline_stage"],
                notes=data.get("notes"),
                created_at=_utcnow(),
                updated_at=_utcnow(),
            )
            db.add(client)
            db.flush()  # Pour obtenir l'id
            created_clients[data["slug"]] = client
            log.info("  ✔ Client : %s", data["name"])

        # Créer les diagnostics liés aux clients
        for data in DEMO_DIAGNOSTICS:
            client = created_clients.get(data["client_slug"])
            if not client:
                continue
            diag = Diagnostic(
                client_id=client.id,
                type=data["type"],
                title=data["title"],
                status=data["status"],
                share_token=data["share_token"],
                results=data.get("results"),
                created_at=_utcnow(),
                updated_at=_utcnow(),
            )
            db.add(diag)
            log.info("  ✔ Diagnostic : %s", data["title"])

        db.commit()
        log.info("Seed terminé — %d clients, %d diagnostics créés.", len(DEMO_CLIENTS), len(DEMO_DIAGNOSTICS))

    except Exception as e:
        db.rollback()
        log.error("Erreur lors du seed : %s", e)
    finally:
        db.close()


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)
    Base.metadata.create_all(bind=engine)
    run_seed()
    print("Seed terminé.")
