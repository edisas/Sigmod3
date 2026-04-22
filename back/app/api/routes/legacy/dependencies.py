from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.legacy_db import get_session
from app.core.legacy_security import decode_legacy_token

settings = get_settings()
legacy_oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_prefix}/legacy/auth/login")


def get_current_legacy_claims(token: str = Depends(legacy_oauth2_scheme)) -> dict:
    claims = decode_legacy_token(token)
    if not claims:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token legacy inválido")
    if int(claims.get("nivel", 0)) != 1:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nivel de usuario insuficiente")
    return claims


def get_legacy_db(claims: dict = Depends(get_current_legacy_claims)) -> Session:
    clave = claims.get("legacy_db")
    if not clave:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token legacy sin base asignada")
    try:
        session = get_session(clave)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    try:
        yield session
    finally:
        session.close()
