"""Endpoints de tramperos V3 (catálogo de personas operadoras).

Catálogo por estado (cada estado mantiene su lista). Multi-tenant igual
que productores/unidades/rutas.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.catalogos import audit_catalog_change
from app.core.senasica import audit_senasica, is_elevated
from app.db import get_db
from app.dependencies import get_current_state_id, get_current_user
from app.models import User
from app.schemas import (
    TramperoCreate,
    TramperoListResponse,
    TramperoResponse,
    TramperoUpdate,
)

router = APIRouter()

ALLOWED_ROLES = {"admin", "administrador general", "administrador estatal", "administrador senasica"}


def _ensure_access(user: User) -> None:
    if (user.rol or "").strip().lower() not in ALLOWED_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


def _scope_state(user: User, current_state_id: int, requested: int | None) -> int:
    target = requested if requested is not None else current_state_id
    if not is_elevated(user) and target != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    return target


def _to_response(row: dict[str, Any]) -> TramperoResponse:
    return TramperoResponse(
        id=int(row["id"]),
        nombre=str(row["nombre"]),
        estado_id=int(row["estado_id"]) if row.get("estado_id") is not None else None,
        figura_cooperadora_id=int(row["figura_cooperadora_id"]) if row.get("figura_cooperadora_id") is not None else None,
        estatus_id=int(row.get("estatus_id") or 1),
        estado_nombre=row.get("estado_nombre"),
        figura_cooperadora_nombre=row.get("figura_cooperadora_nombre"),
    )


_BASE_SELECT = """
    SELECT t.id, t.nombre, t.estado_id, t.figura_cooperadora_id, t.estatus_id,
           e.nombre AS estado_nombre, fc.nombre AS figura_cooperadora_nombre
    FROM tramperos t
    LEFT JOIN estados e ON e.id = t.estado_id
    LEFT JOIN figura_cooperadora fc ON fc.id = t.figura_cooperadora_id
"""


@router.get("/listado", response_model=TramperoListResponse)
def list_tramperos(
    q: str | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TramperoListResponse:
    _ensure_access(current_user)
    offset = (page - 1) * page_size
    search = f"%{q.strip()}%" if q and q.strip() else None
    where = """
        WHERE (t.estado_id = :estado_id OR t.estado_id IS NULL)
          AND (:estatus_id IS NULL OR t.estatus_id = :estatus_id)
          AND (:search IS NULL OR t.nombre LIKE :search)
    """
    params = {"estado_id": current_state_id, "estatus_id": estatus_id, "search": search, "limit": page_size, "offset": offset}
    total = int(db.execute(text(f"SELECT COUNT(*) FROM tramperos t {where}"), params).scalar_one())
    rows = db.execute(text(f"{_BASE_SELECT} {where} ORDER BY t.nombre ASC LIMIT :limit OFFSET :offset"), params).mappings().all()
    return TramperoListResponse(items=[_to_response(dict(r)) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/{trampero_id}", response_model=TramperoResponse)
def get_trampero(
    trampero_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TramperoResponse:
    _ensure_access(current_user)
    row = db.execute(text(f"{_BASE_SELECT} WHERE t.id = :id"), {"id": trampero_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trampero no encontrado")
    return _to_response(dict(row))


@router.post("", response_model=TramperoResponse, status_code=status.HTTP_201_CREATED)
def create_trampero(
    payload: TramperoCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TramperoResponse:
    _ensure_access(current_user)
    target = _scope_state(current_user, current_state_id, payload.estado_id)
    if db.execute(text("SELECT id FROM tramperos WHERE estado_id = :e AND nombre = :n"), {"e": target, "n": payload.nombre.strip()}).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe un trampero con ese nombre en el estado")
    r = db.execute(
        text(
            """
            INSERT INTO tramperos (nombre, estado_id, figura_cooperadora_id, estatus_id,
                created_by_user_id, updated_by_user_id, created_at, updated_at, created_date, edited_date)
            VALUES (:nombre, :estado_id, :figura_id, :estatus_id, :u, :u, NOW(), NOW(), CURDATE(), CURDATE())
            """
        ),
        {"nombre": payload.nombre.strip(), "estado_id": target, "figura_id": payload.figura_cooperadora_id, "estatus_id": payload.estatus_id, "u": current_user.id},
    )
    new_id = int(r.lastrowid)
    audit_catalog_change(db, catalogo="tramperos", registro_id=new_id, accion="CREATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=None, datos_nuevos={**payload.model_dump(), "estado_id": target},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="create-trampero", metodo="POST", path="/tramperos",
        estado_afectado_id=target, recurso_tipo="tramperos", recurso_id=str(new_id),
        datos_request=payload.model_dump(), sql_query="INSERT INTO tramperos ...",
        resultado_status=201, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE t.id = :id"), {"id": new_id}).mappings().first()
    return _to_response(dict(row))


@router.put("/{trampero_id}", response_model=TramperoResponse)
def update_trampero(
    trampero_id: int,
    payload: TramperoUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TramperoResponse:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM tramperos WHERE id = :id"), {"id": trampero_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trampero no encontrado")
    if not is_elevated(current_user) and prev.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    target = _scope_state(current_user, current_state_id, payload.estado_id)
    name_or_state_changed = (payload.nombre.strip() != prev["nombre"]) or (target != prev["estado_id"])
    if name_or_state_changed and db.execute(
        text("SELECT id FROM tramperos WHERE estado_id = :e AND nombre = :n AND id <> :id"),
        {"e": target, "n": payload.nombre.strip(), "id": trampero_id},
    ).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nombre ya existe en el estado")
    db.execute(
        text(
            """
            UPDATE tramperos SET nombre=:nombre, estado_id=:estado_id, figura_cooperadora_id=:figura_id,
                estatus_id=:estatus_id, updated_by_user_id=:u WHERE id=:id
            """
        ),
        {"nombre": payload.nombre.strip(), "estado_id": target, "figura_id": payload.figura_cooperadora_id,
         "estatus_id": payload.estatus_id, "u": current_user.id, "id": trampero_id},
    )
    audit_catalog_change(db, catalogo="tramperos", registro_id=trampero_id, accion="UPDATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos={**payload.model_dump(), "estado_id": target},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="update-trampero", metodo="PUT", path=f"/tramperos/{trampero_id}",
        estado_afectado_id=target, recurso_tipo="tramperos", recurso_id=str(trampero_id),
        datos_request=payload.model_dump(), sql_query="UPDATE tramperos SET ... WHERE id = :id",
        resultado_status=200, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE t.id = :id"), {"id": trampero_id}).mappings().first()
    return _to_response(dict(row))


@router.delete("/{trampero_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trampero(
    trampero_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM tramperos WHERE id = :id"), {"id": trampero_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trampero no encontrado")
    if not is_elevated(current_user) and prev.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    db.execute(text("UPDATE tramperos SET estatus_id=2, updated_by_user_id=:u WHERE id=:id"),
               {"u": current_user.id, "id": trampero_id})
    audit_catalog_change(db, catalogo="tramperos", registro_id=trampero_id, accion="DELETE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="inactivate-trampero", metodo="DELETE",
        path=f"/tramperos/{trampero_id}",
        estado_afectado_id=int(prev.get("estado_id")) if prev.get("estado_id") is not None else None,
        recurso_tipo="tramperos", recurso_id=str(trampero_id),
        datos_request={"estatus_id": 2}, sql_query="UPDATE tramperos SET estatus_id = 2 WHERE id = :id",
        resultado_status=204, ip_origen=request.client.host if request.client else None)
    db.commit()
