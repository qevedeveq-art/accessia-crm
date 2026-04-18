"""
Router fichiers — /api/files/*, /api/prestations
"""
from pathlib import Path
from typing import Optional, List

import mimetypes
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form

import file_service
from schemas import FileWriteRequest, FileCreateFolderRequest, FileRenameRequest, FileDeleteRequest, PrestationItem

_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB

_ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv",
    ".txt", ".md", ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".zip", ".tar", ".gz", ".json", ".xml",
}


def _safe_filename(name: str) -> str:
    """Sanitise le nom de fichier : retire les path traversal et caractères dangereux."""
    import re, unicodedata
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    name = re.sub(r"[^\w\s\-.]", "_", name)
    name = name.replace("..", "_").replace("/", "_").replace("\\", "_")
    return name.strip("_. ") or "fichier"


def _validate_upload(file: UploadFile, content: bytes) -> None:
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Fichier trop volumineux (max 50 Mo)")
    ext = Path(file.filename or "").suffix.lower()
    if ext and ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(415, f"Extension non autorisée : {ext}")

router = APIRouter()


# ═══════════════════════════════════════════════════════════════
# EXPLORATEUR DE FICHIERS
# ═══════════════════════════════════════════════════════════════

@router.get("/api/files")
def browse_root():
    return file_service.list_directory(str(file_service.SENSIA_BASE))


@router.get("/api/files/search")
def search_files(
    q: str = Query(..., min_length=2, max_length=100),
    path: Optional[str] = Query(None, max_length=500),
):
    if path and not file_service.is_safe_path(path):
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    return file_service.search_files(q, path)


@router.get("/api/files/browse")
def browse_directory(path: str = Query(..., max_length=500)):
    if not file_service.is_safe_path(path):
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    return file_service.list_directory(path)


@router.get("/api/files/read")
def read_file(path: str = Query(..., max_length=500)):
    if not file_service.is_safe_path(path):
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    try:
        content = file_service.read_file(path)
        return {"content": content, "path": path}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fichier non trouvé")
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))


@router.post("/api/files/write")
def write_file(data: FileWriteRequest):
    if not file_service.is_safe_path(data.path):
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    try:
        file_service.write_file(data.path, data.content)
        return {"ok": True}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/files/mkdir")
def create_folder(data: FileCreateFolderRequest):
    if data.path and not file_service.is_safe_path(data.path):
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    try:
        item = file_service.create_directory(data.path, data.name)
        return {"ok": True, "item": item}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/api/files/rename")
def rename_file_or_directory(data: FileRenameRequest):
    if not file_service.is_safe_path(data.path):
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    try:
        item = file_service.rename_path(data.path, data.new_name)
        return {"ok": True, "item": item}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/api/files/delete")
def delete_file_or_directory(data: FileDeleteRequest):
    if not file_service.is_safe_path(data.path):
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    try:
        file_service.delete_path(data.path)
        return {"ok": True}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/api/files/upload")
async def upload_file(path: Optional[str] = Form(None), upload: UploadFile = File(...)):
    if path and not file_service.is_safe_path(path):
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    content = await upload.read()
    _validate_upload(upload, content)
    # Sanitise le nom de fichier et reconstitue avec l'extension d'origine
    original_ext = Path(upload.filename or "fichier").suffix.lower()
    safe_name = _safe_filename(Path(upload.filename or "fichier").stem) + original_ext
    # Vérification anti path-traversal sur le répertoire cible
    base_dir = Path(path) if path else file_service.SENSIA_BASE
    target_path = base_dir / safe_name
    if not str(target_path.resolve()).startswith(str(base_dir.resolve())):
        raise HTTPException(400, "Chemin invalide")
    try:
        item = file_service.save_upload(path, safe_name, content)
        return {"ok": True, "item": item}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ═══════════════════════════════════════════════════════════════
# PRESTATIONS (catalogue)
# ═══════════════════════════════════════════════════════════════

@router.get("/api/prestations")
def get_prestations():
    return file_service.parse_catalogue()


@router.put("/api/prestations")
def save_prestations(items: List[PrestationItem]):
    content = file_service.generate_catalogue([p.model_dump() for p in items])
    file_service.CATALOGUE_PATH.write_text(content, encoding="utf-8")
    return {"ok": True, "count": len(items)}
