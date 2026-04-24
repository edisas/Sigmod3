"""Endpoints del catálogo de municipios.

Extraído de `catalogos.py` como parte de la división por recurso. Helpers
compartidos viven en `catalogos.py` y se importan para no duplicar lógica.
"""

from typing import Any  # noqa: F401

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.catalogos import audit_catalog_change, ensure_catalog_access, to_municipio_response
from app.db import get_db
from app.dependencies import get_current_state_id, get_current_user
from app.models import User
from app.schemas import (
    CatalogMunicipioCreate,
    CatalogMunicipioListResponse,
    CatalogMunicipioResponse,
    CatalogMunicipioUpdate,
)

router = APIRouter()



@router.get("/municipios", response_model=list[CatalogMunicipioResponse])
def list_municipios(
    estado_id: int | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CatalogMunicipioResponse]:
    ensure_catalog_access(current_user)
    rows = db.execute(
        text(
            """
            SELECT m.id, m.estado_id, m.clave, m.nombre, m.clave_geo, m.estatus_id, e.nombre AS estado_nombre
            FROM municipios m
            JOIN estados e ON e.id = m.estado_id
            WHERE (:estado_id IS NULL OR m.estado_id = :estado_id)
              AND (:estatus_id IS NULL OR m.estatus_id = :estatus_id)
            ORDER BY e.nombre ASC, m.nombre ASC
            """
        ),
        {"estado_id": estado_id, "estatus_id": estatus_id},
    ).mappings()
    return [to_municipio_response(dict(r)) for r in rows]


@router.get("/municipios/listado", response_model=CatalogMunicipioListResponse)
def list_municipios_paginado(
    q: str | None = Query(default=None),
    estado_id: int | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CatalogMunicipioListResponse:
    ensure_catalog_access(current_user)
    offset = (page - 1) * page_size
    search = f"%{q.strip()}%" if q and q.strip() else None

    total = int(
        db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM municipios m
                JOIN estados e ON e.id = m.estado_id
                WHERE (:estado_id IS NULL OR m.estado_id = :estado_id)
                  AND (:estatus_id IS NULL OR m.estatus_id = :estatus_id)
                  AND (
                    :search IS NULL
                    OR m.nombre LIKE :search
                    OR m.clave LIKE :search
                    OR m.clave_geo LIKE :search
                    OR e.nombre LIKE :search
                  )
                """
            ),
            {"estado_id": estado_id, "estatus_id": estatus_id, "search": search},
        ).scalar_one()
    )

    rows = db.execute(
        text(
            """
            SELECT m.id, m.estado_id, m.clave, m.nombre, m.clave_geo, m.estatus_id, e.nombre AS estado_nombre
            FROM municipios m
            JOIN estados e ON e.id = m.estado_id
            WHERE (:estado_id IS NULL OR m.estado_id = :estado_id)
              AND (:estatus_id IS NULL OR m.estatus_id = :estatus_id)
              AND (
                :search IS NULL
                OR m.nombre LIKE :search
                OR m.clave LIKE :search
                OR m.clave_geo LIKE :search
                OR e.nombre LIKE :search
              )
            ORDER BY e.nombre ASC, m.nombre ASC
            LIMIT :limit OFFSET :offset
            """
        ),
        {
            "estado_id": estado_id,
            "estatus_id": estatus_id,
            "search": search,
            "limit": page_size,
            "offset": offset,
        },
    ).mappings()

    return CatalogMunicipioListResponse(
        items=[to_municipio_response(dict(r)) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/municipios/{municipio_id}", response_model=CatalogMunicipioResponse)
def get_municipio(
    municipio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CatalogMunicipioResponse:
    ensure_catalog_access(current_user)
    row = db.execute(
        text(
            """
            SELECT m.id, m.estado_id, m.clave, m.nombre, m.clave_geo, m.estatus_id, e.nombre AS estado_nombre
            FROM municipios m
            JOIN estados e ON e.id = m.estado_id
            WHERE m.id = :id
            """
        ),
        {"id": municipio_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Municipio no encontrado")
    return to_municipio_response(dict(row))


@router.post("/municipios", response_model=CatalogMunicipioResponse, status_code=status.HTTP_201_CREATED)
def create_municipio(
    payload: CatalogMunicipioCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> CatalogMunicipioResponse:
    ensure_catalog_access(current_user)
    result = db.execute(
        text(
            """
            INSERT INTO municipios (estado_id, clave, nombre, clave_geo, estatus_id)
            VALUES (:estado_id, :clave, :nombre, :clave_geo, :estatus_id)
            """
        ),
        payload.model_dump(),
    )
    municipio_id = int(result.lastrowid)
    estado_nombre = db.execute(
        text("SELECT nombre FROM estados WHERE id = :id"),
        {"id": payload.estado_id},
    ).scalar_one_or_none()
    audit_catalog_change(
        db,
        catalogo="municipios",
        registro_id=municipio_id,
        accion="CREATE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=None,
        datos_nuevos=payload.model_dump(),
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()
    return CatalogMunicipioResponse(id=municipio_id, estado_nombre=str(estado_nombre or ""), **payload.model_dump())


@router.put("/municipios/{municipio_id}", response_model=CatalogMunicipioResponse)
def update_municipio(
    municipio_id: int,
    payload: CatalogMunicipioUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> CatalogMunicipioResponse:
    ensure_catalog_access(current_user)
    previous = db.execute(
        text("SELECT id, estado_id, clave, nombre, clave_geo, estatus_id FROM municipios WHERE id = :id"),
        {"id": municipio_id},
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Municipio no encontrado")

    db.execute(
        text(
            """
            UPDATE municipios
            SET estado_id = :estado_id, clave = :clave, nombre = :nombre, clave_geo = :clave_geo, estatus_id = :estatus_id
            WHERE id = :id
            """
        ),
        {**payload.model_dump(), "id": municipio_id},
    )
    estado_nombre = db.execute(
        text("SELECT nombre FROM estados WHERE id = :id"),
        {"id": payload.estado_id},
    ).scalar_one_or_none()
    audit_catalog_change(
        db,
        catalogo="municipios",
        registro_id=municipio_id,
        accion="UPDATE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=dict(previous),
        datos_nuevos=payload.model_dump(),
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()
    return CatalogMunicipioResponse(id=municipio_id, estado_nombre=str(estado_nombre or ""), **payload.model_dump())


@router.delete("/municipios/{municipio_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_municipio(
    municipio_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    ensure_catalog_access(current_user)
    previous = db.execute(
        text("SELECT id, estado_id, clave, nombre, clave_geo, estatus_id FROM municipios WHERE id = :id"),
        {"id": municipio_id},
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Municipio no encontrado")
    db.execute(text("UPDATE municipios SET estatus_id = 2 WHERE id = :id"), {"id": municipio_id})
    audit_catalog_change(
        db,
        catalogo="municipios",
        registro_id=municipio_id,
        accion="DELETE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=dict(previous),
        datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()

