"""Endpoint read-only de módulos administrativos.

Por ahora solo expone listado/detalle para que la UI de rutas y otros
recursos puedan poblar selects. CRUD completo (crear/editar módulo)
se hará en una iteración posterior — actualmente la tabla `modulos`
ya tiene 1 registro y se administra fuera del flujo V3 nativo.

Multi-tenant: filtrado por `estado_activo_id` para roles no elevados.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.senasica import is_elevated
from app.db import get_db
from app.dependencies import get_current_state_id, get_current_user
from app.models import User
from app.schemas import ModuloListResponse, ModuloOptionResponse

router = APIRouter()

ALLOWED_ROLES = {
    "admin",
    "administrador general",
    "administrador estatal",
    "administrador senasica",
}


def _ensure_access(current_user: User) -> None:
    role = (current_user.rol or "").strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para consultar módulos")


def _to_response(row: dict) -> ModuloOptionResponse:
    return ModuloOptionResponse(
        id=int(row["id"]),
        nombre=str(row["nombre"]),
        estado_id=int(row["estado_id"]) if row.get("estado_id") is not None else None,
        municipio_id=int(row["municipio_id"]) if row.get("municipio_id") is not None else None,
        estatus_id=int(row.get("estatus_id") or 1),
        estado_nombre=row.get("estado_nombre"),
    )


@router.get("/listado", response_model=ModuloListResponse)
def list_modulos(
    estatus_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> ModuloListResponse:
    _ensure_access(current_user)
    offset = (page - 1) * page_size

    if is_elevated(current_user):
        where_state = "(:estado_id IS NULL OR m.estado_id = :estado_id OR m.estado_id IS NULL)"
    else:
        where_state = "(m.estado_id = :estado_id OR m.estado_id IS NULL)"

    where_clause = f"""
        WHERE {where_state}
          AND (:estatus_id IS NULL OR m.estatus_id = :estatus_id)
    """
    params = {"estado_id": current_state_id, "estatus_id": estatus_id, "limit": page_size, "offset": offset}

    total = int(db.execute(text(f"SELECT COUNT(*) FROM modulos m {where_clause}"), params).scalar_one())

    rows = db.execute(
        text(
            f"""
            SELECT m.id, m.nombre, m.estado_id, m.municipio_id, m.estatus_id,
                   e.nombre AS estado_nombre
            FROM modulos m
            LEFT JOIN estados e ON e.id = m.estado_id
            {where_clause}
            ORDER BY m.nombre ASC
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    ).mappings().all()

    return ModuloListResponse(
        items=[_to_response(dict(r)) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{modulo_id}", response_model=ModuloOptionResponse)
def get_modulo(
    modulo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ModuloOptionResponse:
    _ensure_access(current_user)
    row = db.execute(
        text(
            """
            SELECT m.id, m.nombre, m.estado_id, m.municipio_id, m.estatus_id,
                   e.nombre AS estado_nombre
            FROM modulos m
            LEFT JOIN estados e ON e.id = m.estado_id
            WHERE m.id = :id
            """
        ),
        {"id": modulo_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Módulo no encontrado")
    return _to_response(dict(row))
