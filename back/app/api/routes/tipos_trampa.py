"""Endpoints de tipos_trampa V3 (catálogo nacional).

Tipos de trampa físicos: Jackson, McPhail, Multilure, etc. Catálogo
nacional sin estado_id; solo admin general / admin / senasica pueden
modificar. Estatales solo lectura.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.catalogos import audit_catalog_change
from app.core.senasica import audit_senasica
from app.db import get_db
from app.dependencies import get_current_state_id, get_current_user
from app.models import User
from app.schemas import (
    TipoTrampaCreate,
    TipoTrampaListResponse,
    TipoTrampaResponse,
    TipoTrampaUpdate,
)

router = APIRouter()

READ_ROLES = {"admin", "administrador general", "administrador estatal", "administrador senasica"}
WRITE_ROLES = {"admin", "administrador general", "administrador senasica"}


def _ensure_read(user: User) -> None:
    if (user.rol or "").strip().lower() not in READ_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


def _ensure_write(user: User) -> None:
    if (user.rol or "").strip().lower() not in WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo administrador general puede editar tipos de trampa")


def _to_response(row: dict[str, Any]) -> TipoTrampaResponse:
    return TipoTrampaResponse(
        id=int(row["id"]),
        nombre=str(row["nombre"]),
        descripcion=row.get("descripcion"),
        estatus_id=int(row.get("estatus_id") or 1),
    )


@router.get("/listado", response_model=TipoTrampaListResponse)
def list_tipos(
    q: str | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TipoTrampaListResponse:
    _ensure_read(current_user)
    offset = (page - 1) * page_size
    search = f"%{q.strip()}%" if q and q.strip() else None
    where = """
        WHERE (:estatus_id IS NULL OR estatus_id = :estatus_id)
          AND (:search IS NULL OR nombre LIKE :search OR descripcion LIKE :search)
    """
    params = {"estatus_id": estatus_id, "search": search, "limit": page_size, "offset": offset}
    total = int(db.execute(text(f"SELECT COUNT(*) FROM tipos_trampa {where}"), params).scalar_one())
    rows = db.execute(text(f"SELECT id, nombre, descripcion, estatus_id FROM tipos_trampa {where} ORDER BY nombre ASC LIMIT :limit OFFSET :offset"), params).mappings().all()
    return TipoTrampaListResponse(items=[_to_response(dict(r)) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/{tipo_id}", response_model=TipoTrampaResponse)
def get_tipo(
    tipo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TipoTrampaResponse:
    _ensure_read(current_user)
    row = db.execute(text("SELECT id, nombre, descripcion, estatus_id FROM tipos_trampa WHERE id = :id"), {"id": tipo_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tipo de trampa no encontrado")
    return _to_response(dict(row))


@router.post("", response_model=TipoTrampaResponse, status_code=status.HTTP_201_CREATED)
def create_tipo(
    payload: TipoTrampaCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TipoTrampaResponse:
    _ensure_write(current_user)
    if db.execute(text("SELECT id FROM tipos_trampa WHERE nombre = :n"), {"n": payload.nombre.strip()}).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe un tipo de trampa con ese nombre")
    r = db.execute(
        text(
            """
            INSERT INTO tipos_trampa (nombre, descripcion, estatus_id,
                created_by_user_id, updated_by_user_id, created_at, updated_at, created_date, edited_date)
            VALUES (:nombre, :descripcion, :estatus_id, :u, :u, NOW(), NOW(), CURDATE(), CURDATE())
            """
        ),
        {"nombre": payload.nombre.strip(), "descripcion": payload.descripcion, "estatus_id": payload.estatus_id, "u": current_user.id},
    )
    new_id = int(r.lastrowid)
    audit_catalog_change(db, catalogo="tipos_trampa", registro_id=new_id, accion="CREATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=None, datos_nuevos=payload.model_dump(),
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="create-tipo-trampa", metodo="POST", path="/tipos-trampa",
        recurso_tipo="tipos_trampa", recurso_id=str(new_id),
        datos_request=payload.model_dump(), sql_query="INSERT INTO tipos_trampa ...",
        resultado_status=201, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text("SELECT id, nombre, descripcion, estatus_id FROM tipos_trampa WHERE id = :id"), {"id": new_id}).mappings().first()
    return _to_response(dict(row))


@router.put("/{tipo_id}", response_model=TipoTrampaResponse)
def update_tipo(
    tipo_id: int,
    payload: TipoTrampaUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TipoTrampaResponse:
    _ensure_write(current_user)
    prev = db.execute(text("SELECT * FROM tipos_trampa WHERE id = :id"), {"id": tipo_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tipo no encontrado")
    if payload.nombre.strip() != prev["nombre"] and db.execute(
        text("SELECT id FROM tipos_trampa WHERE nombre = :n AND id <> :id"),
        {"n": payload.nombre.strip(), "id": tipo_id},
    ).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nombre ya existe")
    db.execute(
        text(
            """
            UPDATE tipos_trampa SET nombre=:nombre, descripcion=:descripcion, estatus_id=:estatus_id,
                updated_by_user_id=:u WHERE id=:id
            """
        ),
        {"nombre": payload.nombre.strip(), "descripcion": payload.descripcion,
         "estatus_id": payload.estatus_id, "u": current_user.id, "id": tipo_id},
    )
    audit_catalog_change(db, catalogo="tipos_trampa", registro_id=tipo_id, accion="UPDATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos=payload.model_dump(),
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="update-tipo-trampa", metodo="PUT",
        path=f"/tipos-trampa/{tipo_id}", recurso_tipo="tipos_trampa", recurso_id=str(tipo_id),
        datos_request=payload.model_dump(), sql_query="UPDATE tipos_trampa SET ... WHERE id = :id",
        resultado_status=200, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text("SELECT id, nombre, descripcion, estatus_id FROM tipos_trampa WHERE id = :id"), {"id": tipo_id}).mappings().first()
    return _to_response(dict(row))


@router.delete("/{tipo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tipo(
    tipo_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    _ensure_write(current_user)
    prev = db.execute(text("SELECT * FROM tipos_trampa WHERE id = :id"), {"id": tipo_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tipo no encontrado")
    db.execute(text("UPDATE tipos_trampa SET estatus_id=2, updated_by_user_id=:u WHERE id=:id"),
               {"u": current_user.id, "id": tipo_id})
    audit_catalog_change(db, catalogo="tipos_trampa", registro_id=tipo_id, accion="DELETE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="inactivate-tipo-trampa", metodo="DELETE",
        path=f"/tipos-trampa/{tipo_id}", recurso_tipo="tipos_trampa", recurso_id=str(tipo_id),
        datos_request={"estatus_id": 2}, sql_query="UPDATE tipos_trampa SET estatus_id = 2 WHERE id = :id",
        resultado_status=204, ip_origen=request.client.host if request.client else None)
    db.commit()
