"""
Auth JWT — /api/auth/login, /api/auth/status, /api/auth/verify
Mot de passe unique via env var ACCESSIA_PASSWORD.
Si ACCESSIA_PASSWORD n'est pas défini → auth désactivée (dev mode).
"""
import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel

log = logging.getLogger(__name__)
router = APIRouter()

_security = HTTPBearer(auto_error=False)

SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-insecure-key-do-not-use-in-prod")
ALGORITHM  = "HS256"
TOKEN_TTL  = int(os.getenv("AUTH_TOKEN_TTL_HOURS", "24"))


def _auth_enabled() -> bool:
    return bool(os.getenv("ACCESSIA_PASSWORD", "").strip())


def _create_token() -> str:
    payload = {
        "sub": "accessia",
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _verify_token(token: str) -> bool:
    try:
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return True
    except JWTError:
        return False


def require_auth(
    creds: Optional[HTTPAuthorizationCredentials] = Security(_security),
) -> None:
    """Dependency : no-op si auth désactivée, sinon valide le Bearer token."""
    if not _auth_enabled():
        return
    if not creds or not _verify_token(creds.credentials):
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")


# ── Routes ──────────────────────────────────────────────────────

class LoginBody(BaseModel):
    password: str


@router.get("/api/auth/status")
def auth_status():
    """Public — indique si l'auth est activée."""
    return {"auth_enabled": _auth_enabled()}


@router.post("/api/auth/login")
def login(body: LoginBody):
    expected = os.getenv("ACCESSIA_PASSWORD", "")
    if not expected:
        # Auth désactivée → renvoie un token bidon
        return {"access_token": _create_token(), "token_type": "bearer",
                "expires_in": TOKEN_TTL * 3600, "auth_enabled": False}
    if body.password != expected:
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    return {"access_token": _create_token(), "token_type": "bearer",
            "expires_in": TOKEN_TTL * 3600, "auth_enabled": True}


@router.get("/api/auth/sso")
def sso_login(request: Request):
    """YunoHost SSO bridge — lit X-Remote-User injecté par SSOwat et émet un JWT.
    N'est atteignable qu'après authentification SSOwat (header absent → 401).
    Jamais exposé sans protection nginx (port 8001 lié à 127.0.0.1).
    """
    remote_user = request.headers.get("X-Remote-User", "").strip()
    if not remote_user:
        raise HTTPException(
            status_code=401,
            detail="SSO non disponible — X-Remote-User absent (hors contexte YunoHost ?)"
        )
    log.info("SSO login: user=%s", remote_user)
    return {
        "access_token": _create_token(),
        "token_type": "bearer",
        "expires_in": TOKEN_TTL * 3600,
        "sso_user": remote_user,
        "auth_enabled": True,
    }


@router.get("/api/auth/verify")
def verify(creds: Optional[HTTPAuthorizationCredentials] = Security(_security)):
    """Vérifie un token existant. Retourne 200 si valide ou si auth désactivée."""
    if not _auth_enabled():
        return {"valid": True, "auth_enabled": False}
    if not creds or not _verify_token(creds.credentials):
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")
    return {"valid": True, "auth_enabled": True}
