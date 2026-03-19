"""
Gestion automatique des dossiers/fichiers ACCESSIA Pro.
Crée la structure de répertoires et génère les fichiers Markdown
à partir des données clients/projets.
"""
import shutil
import os
import logging
from pathlib import Path
from datetime import datetime

log = logging.getLogger(__name__)

# Répertoire racine ACCESSIA Pro (parent du dossier _ACCESSIA_APP)
SENSIA_BASE = Path(os.getenv("SENSIA_BASE_DIR", str(Path(__file__).parent.parent.parent)))

CLIENTS_DIR = SENSIA_BASE / "01_COMMERCIAL" / "Clients"
PROJECTS_DIR = SENSIA_BASE / "05_PROJETS"
TEMPLATE_DIR = PROJECTS_DIR / "_TEMPLATE_PROJET"
PROSPECTS_DIR = SENSIA_BASE / "01_COMMERCIAL" / "Prospects"

# Taille max des fichiers lisibles (1 Mo)
MAX_READ_SIZE = 1_048_576


def _safe_name(name: str) -> str:
    """Sanitise un nom pour l'utiliser comme dossier."""
    return "".join(c if c.isalnum() or c in " -_" else "_" for c in name).strip()[:100]


# ─── CLIENT ───────────────────────────────────────────────────────────────────

def create_client_folder(client_name: str, client_data: dict) -> str:
    """Crée la structure de dossiers pour un nouveau client."""
    safe = _safe_name(client_name)
    if not safe:
        raise ValueError("Nom de client invalide pour la création de dossier")

    client_dir = CLIENTS_DIR / safe
    client_dir.mkdir(parents=True, exist_ok=True)

    for sub in ("Contrats", "Factures", "Correspondances", "Documents_Client"):
        (client_dir / sub).mkdir(exist_ok=True)

    now = datetime.now().strftime("%d/%m/%Y")

    # Extraire les valeurs de façon sécurisée (éviter l'injection dans le Markdown)
    def _clean(val):
        if val is None:
            return "—"
        return str(val).replace("|", "\\|").replace("\n", " ")

    profile = f"""# Profil Client — {_clean(client_name)}

> Créé le {now} | Statut : **{_clean(client_data.get('status', 'prospect')).upper()}**

## Informations Générales

| Champ | Valeur |
|---|---|
| **Nom** | {_clean(client_name)} |
| **Type** | {_clean(client_data.get('type', 'PME')).upper()} |
| **Secteur** | {_clean(client_data.get('sector'))} |
| **SIRET** | {_clean(client_data.get('siret'))} |
| **Site Web** | {_clean(client_data.get('website'))} |
| **Source** | {_clean(client_data.get('source'))} |
| **Budget estimé** | {_clean(client_data.get('budget_range'))} |

## Contact Principal

| Champ | Valeur |
|---|---|
| **Nom** | {_clean(client_data.get('contact_name'))} |
| **Email** | {_clean(client_data.get('contact_email'))} |
| **Téléphone** | {_clean(client_data.get('contact_phone'))} |
| **Adresse** | {_clean(client_data.get('address'))} |

## Notes

{client_data.get('notes') or '_Aucune note._'}

---
*Géré automatiquement par ACCESSIA Pro*
"""
    (client_dir / "PROFIL_CLIENT.md").write_text(profile, encoding="utf-8")
    return str(client_dir)


# ─── PROJET ───────────────────────────────────────────────────────────────────

_PHASE_LABELS = [
    "Découverte & Qualification",
    "Diagnostic & Cadrage",
    "Proposition & Contractualisation",
    "Mise en place & RGPD",
    "Développement & Intégration",
    "Tests & Validation",
    "Déploiement & Formation",
    "MCO — Maintenance Continue",
]


def _phase_table(current: int) -> str:
    rows = []
    for i, label in enumerate(_PHASE_LABELS):
        if i < current:
            icon = "Terminée"
        elif i == current:
            icon = "En cours"
        else:
            icon = "A venir"
        rows.append(f"| {i} | {label} | {icon} |")
    return "\n".join(rows)


def create_project_folder(project_data: dict, client_name: str) -> str:
    """Crée la structure de dossiers projet à partir du template."""
    code = project_data.get("code", f"{datetime.now().year}-001")
    safe_client = _safe_name(client_name)
    safe_name = _safe_name(project_data.get("name", "Projet"))
    folder_name = f"{code}_{safe_client}_{safe_name}"
    project_dir = PROJECTS_DIR / folder_name

    # Copier le template si disponible
    if TEMPLATE_DIR.exists():
        shutil.copytree(TEMPLATE_DIR, project_dir, dirs_exist_ok=True)
    else:
        project_dir.mkdir(parents=True, exist_ok=True)
        for sub in ("06_LIVRAISONS", "07_FACTURATION", "Securite"):
            (project_dir / sub).mkdir(exist_ok=True)

    phase = min(max(project_data.get("phase", 0), 0), 7)
    now = datetime.now().strftime("%d/%m/%Y à %H:%M")

    readme = f"""# {project_data.get('name')} — {client_name}

| | |
|---|---|
| **Code** | `{code}` |
| **Client** | {client_name} |
| **Type** | {project_data.get('type', '—')} |
| **Phase actuelle** | {phase} — {_PHASE_LABELS[phase]} |
| **Budget** | {project_data.get('budget') or '—'} EUR HT |
| **Début** | {project_data.get('start_date') or '—'} |
| **Fin prévue** | {project_data.get('end_date') or '—'} |
| **Contrat signé** | {'Oui' if project_data.get('contract_signed') else 'Non'} |
| **RGPD validé** | {'Oui' if project_data.get('gdpr_done') else 'Non'} |

## Description

{project_data.get('description') or '_Aucune description._'}

## Avancement des Phases

| Phase | Description | Statut |
|---|---|---|
{_phase_table(phase)}

---
*Généré par ACCESSIA Pro le {now}*
"""
    (project_dir / "README.md").write_text(readme, encoding="utf-8")

    # Pré-remplir le brief client si le template existe
    brief_path = project_dir / "00_BRIEF_CLIENT.md"
    if brief_path.exists():
        content = brief_path.read_text(encoding="utf-8")
        replacements = {
            "[CLIENT]": client_name,
            "[PROJET]": project_data.get("name", ""),
            "[DATE]": datetime.now().strftime("%d/%m/%Y"),
            "[CODE]": code,
            "[TYPE]": project_data.get("type", ""),
        }
        for k, v in replacements.items():
            content = content.replace(k, str(v))
        brief_path.write_text(content, encoding="utf-8")

    return str(project_dir)


# ─── EXPLORATEUR DE FICHIERS ───────────────────────────────────────────────────

# Extensions autorisées pour la lecture de fichiers texte
_READABLE_EXTENSIONS = {".md", ".txt", ".json", ".yml", ".yaml", ".csv", ".xml", ".html", ".css", ".js", ".py", ".env.example"}


def list_directory(path: str) -> list:
    target = Path(path)
    if not target.exists() or not target.is_dir():
        return []

    # Ne pas lister les dossiers cachés ou sensibles
    items = []
    for item in sorted(target.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
        # Ignorer les fichiers/dossiers cachés et sensibles
        if item.name.startswith(".") or item.name in ("__pycache__", "venv", "node_modules", ".git"):
            continue
        try:
            items.append({
                "name": item.name,
                "path": str(item),
                "is_dir": item.is_dir(),
                "size": item.stat().st_size if item.is_file() else None,
                "modified": datetime.fromtimestamp(item.stat().st_mtime).isoformat(),
                "extension": item.suffix.lower() if item.is_file() else None,
            })
        except (PermissionError, OSError):
            continue
    return items


def read_file(path: str) -> str:
    target = Path(path)
    if not target.exists() or not target.is_file():
        raise FileNotFoundError(f"Fichier introuvable : {path}")

    # Vérifier la taille
    if target.stat().st_size > MAX_READ_SIZE:
        raise ValueError(f"Fichier trop volumineux (max {MAX_READ_SIZE // 1024} Ko)")

    return target.read_text(encoding="utf-8", errors="replace")


def is_safe_path(path: str) -> bool:
    """Vérifie que le chemin est bien à l'intérieur de SENSIA_BASE et ne contient pas de traversal."""
    try:
        resolved = Path(path).resolve()
        base_resolved = SENSIA_BASE.resolve()
        # Vérifier que le chemin résolu est dans SENSIA_BASE
        resolved.relative_to(base_resolved)
        # Bloquer l'accès aux fichiers sensibles
        if resolved.name in (".env", ".env.local", ".git", "sensia.db"):
            return False
        return True
    except (ValueError, OSError):
        return False
