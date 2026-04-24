"""Endpoints del catálogo de tipos_fcoop.

Extraído de `catalogos.py` como parte de la división por recurso. Helpers
compartidos viven en `catalogos.py` y se importan para no duplicar lógica.
"""

from typing import Any  # noqa: F401

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.catalogos import audit_catalog_change, ensure_catalog_access, to_tipo_fcoop_response
from app.db import get_db
from app.dependencies import get_current_state_id, get_current_user
from app.models import User
from app.schemas import (
    CatalogTipoFcoopCreate,
    CatalogTipoFcoopListResponse,
    CatalogTipoFcoopResponse,
    CatalogTipoFcoopUpdate,
)

router = APIRouter()



@router.get("/tipos-fcoop", response_model=list[CatalogTipoFcoopResponse])
def list_tipos_fcoop(
    estatus_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CatalogTipoFcoopResponse]:
    ensure_catalog_access(current_user)
    rows = db.execute(
        text(
            """
            SELECT id, nombre, descripcion, estatus_id
            FROM figura_cooperadora_tipo
            WHERE (:estatus_id IS NULL OR estatus_id = :estatus_id)
            ORDER BY nombre ASC
            """
        ),
        {"estatus_id": estatus_id},
    ).mappings()
    return [to_tipo_fcoop_response(dict(r)) for r in rows]


@router.get("/tipos-fcoop/listado", response_model=CatalogTipoFcoopListResponse)
def list_tipos_fcoop_paginado(
    q: str | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CatalogTipoFcoopListResponse:
    ensure_catalog_access(current_user)
    offset = (page - 1) * page_size
    search = f"%{q.strip()}%" if q and q.strip() else None

    total = int(
        db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM figura_cooperadora_tipo
                WHERE (:estatus_id IS NULL OR estatus_id = :estatus_id)
                  AND (
                    :search IS NULL
                    OR nombre LIKE :search
                    OR descripcion LIKE :search
                  )
                """
            ),
            {"estatus_id": estatus_id, "search": search},
        ).scalar_one()
    )

    rows = db.execute(
        text(
            """
            SELECT id, nombre, descripcion, estatus_id
            FROM figura_cooperadora_tipo
            WHERE (:estatus_id IS NULL OR estatus_id = :estatus_id)
              AND (
                :search IS NULL
                OR nombre LIKE :search
                OR descripcion LIKE :search
              )
            ORDER BY nombre ASC
            LIMIT :limit OFFSET :offset
            """
        ),
        {
            "estatus_id": estatus_id,
            "search": search,
            "limit": page_size,
            "offset": offset,
        },
    ).mappings()

    return CatalogTipoFcoopListResponse(
        items=[to_tipo_fcoop_response(dict(r)) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/tipos-fcoop/{tipo_id}", response_model=CatalogTipoFcoopResponse)
def get_tipo_fcoop(
    tipo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CatalogTipoFcoopResponse:
    ensure_catalog_access(current_user)
    row = db.execute(
        text("SELECT id, nombre, descripcion, estatus_id FROM figura_cooperadora_tipo WHERE id = :id"),
        {"id": tipo_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tipo de FCOOP no encontrado")
    return to_tipo_fcoop_response(dict(row))


@router.post("/tipos-fcoop", response_model=CatalogTipoFcoopResponse, status_code=status.HTTP_201_CREATED)
def create_tipo_fcoop(
    payload: CatalogTipoFcoopCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> CatalogTipoFcoopResponse:
    ensure_catalog_access(current_user)
    result = db.execute(
        text(
            """
            INSERT INTO figura_cooperadora_tipo (nombre, descripcion, estatus_id)
            VALUES (:nombre, :descripcion, :estatus_id)
            """
        ),
        payload.model_dump(),
    )
    tipo_id = int(result.lastrowid)
    audit_catalog_change(
        db,
        catalogo="figura_cooperadora_tipo",
        registro_id=tipo_id,
        accion="CREATE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=None,
        datos_nuevos=payload.model_dump(),
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()
    return CatalogTipoFcoopResponse(id=tipo_id, **payload.model_dump())


@router.put("/tipos-fcoop/{tipo_id}", response_model=CatalogTipoFcoopResponse)
def update_tipo_fcoop(
    tipo_id: int,
    payload: CatalogTipoFcoopUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> CatalogTipoFcoopResponse:
    ensure_catalog_access(current_user)
    previous = db.execute(
        text("SELECT id, nombre, descripcion, estatus_id FROM figura_cooperadora_tipo WHERE id = :id"),
        {"id": tipo_id},
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tipo de FCOOP no encontrado")

    db.execute(
        text(
            """
            UPDATE figura_cooperadora_tipo
            SET nombre = :nombre, descripcion = :descripcion, estatus_id = :estatus_id
            WHERE id = :id
            """
        ),
        {**payload.model_dump(), "id": tipo_id},
    )
    audit_catalog_change(
        db,
        catalogo="figura_cooperadora_tipo",
        registro_id=tipo_id,
        accion="UPDATE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=dict(previous),
        datos_nuevos=payload.model_dump(),
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()
    return CatalogTipoFcoopResponse(id=tipo_id, **payload.model_dump())


@router.delete("/tipos-fcoop/{tipo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tipo_fcoop(
    tipo_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    ensure_catalog_access(current_user)
    previous = db.execute(
        text("SELECT id, nombre, descripcion, estatus_id FROM figura_cooperadora_tipo WHERE id = :id"),
        {"id": tipo_id},
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tipo de FCOOP no encontrado")
    db.execute(text("UPDATE figura_cooperadora_tipo SET estatus_id = 2 WHERE id = :id"), {"id": tipo_id})
    audit_catalog_change(
        db,
        catalogo="figura_cooperadora_tipo",
        registro_id=tipo_id,
        accion="DELETE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=dict(previous),
        datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()

