"""
Router fichiers — /api/files/*, /api/prestations
"""
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form

import file_service
from schemas import FileWriteRequest, FileCreateFolderRequest, FileRenameRequest, FileDeleteRequest, PrestationItem

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
    try:
        item = file_service.save_upload(path, upload.filename or "fichier", content)
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
