from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.legacy.dependencies import get_current_legacy_claims, get_legacy_db
from app.core.legacy_db import get_session, list_available_bases
from app.core.legacy_security import create_legacy_token
from app.core.rate_limit import rate_limit

router = APIRouter()


class LegacyBaseOption(BaseModel):
    clave: str
    nombre_estado: str


class LegacyLoginRequest(BaseModel):
    legacy_db: str = Field(..., min_length=3, max_length=3)
    usuario: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=50)


class LegacyUserInfo(BaseModel):
    id: int
    usuario: str
    nombre: str | None = None
    nivel: int
    legacy_db: str
    nombre_estado: str


class LegacyLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: LegacyUserInfo


@router.get("/bases-disponibles", response_model=list[LegacyBaseOption])
def bases_disponibles() -> list[LegacyBaseOption]:
    return [LegacyBaseOption(**item) for item in list_available_bases()]


_LEGACY_USER_BY_NICK = text(
    "SELECT clave AS id, nick AS usuario, nombre, password, nivel, status "
    "FROM usuarios WHERE nick = :usuario LIMIT 1"
)
_LEGACY_USER_BY_ID = text(
    "SELECT clave AS id, nick AS usuario, nombre, nivel, status "
    "FROM usuarios WHERE clave = :id LIMIT 1"
)


def _fetch_user_by_nick(session: Session, usuario: str) -> dict | None:
    row = session.execute(_LEGACY_USER_BY_NICK, {"usuario": usuario}).mappings().first()
    return dict(row) if row else None


def _fetch_user_by_id(session: Session, user_id: int) -> dict | None:
    row = session.execute(_LEGACY_USER_BY_ID, {"id": user_id}).mappings().first()
    return dict(row) if row else None


@router.post(
    "/login",
    response_model=LegacyLoginResponse,
    dependencies=[Depends(rate_limit("legacy-login", max_attempts=10, window_seconds=900))],
)
def login(payload: LegacyLoginRequest) -> LegacyLoginResponse:
    clave = payload.legacy_db.upper().strip()
    try:
        session = get_session(clave)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        row = _fetch_user_by_nick(session, payload.usuario.strip())
    finally:
        session.close()

    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    stored_password = (row.get("password") or "").strip()
    if stored_password != payload.password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    if (row.get("status") or "A").upper() != "A":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario legacy inactivo")

    nivel = int(row.get("nivel") or 0)
    if nivel != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo usuarios nivel 1 pueden acceder al módulo legacy",
        )

    bases = {item["clave"]: item["nombre_estado"] for item in list_available_bases()}
    nombre_estado = bases.get(clave, clave)

    access_token = create_legacy_token(user_id=int(row["id"]), legacy_db=clave, nivel=nivel)
    return LegacyLoginResponse(
        access_token=access_token,
        user=LegacyUserInfo(
            id=int(row["id"]),
            usuario=str(row.get("usuario") or payload.usuario),
            nombre=row.get("nombre"),
            nivel=nivel,
            legacy_db=clave,
            nombre_estado=nombre_estado,
        ),
    )


@router.get("/me", response_model=LegacyUserInfo)
def me(
    claims: dict = Depends(get_current_legacy_claims),
    session: Session = Depends(get_legacy_db),
) -> LegacyUserInfo:
    user_id = int(claims["sub"])
    clave = claims["legacy_db"]

    row = _fetch_user_by_id(session, user_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario legacy no encontrado")

    bases = {item["clave"]: item["nombre_estado"] for item in list_available_bases()}
    return LegacyUserInfo(
        id=int(row["id"]),
        usuario=str(row.get("usuario") or ""),
        nombre=row.get("nombre"),
        nivel=int(row.get("nivel") or 0),
        legacy_db=clave,
        nombre_estado=bases.get(clave, clave),
    )
