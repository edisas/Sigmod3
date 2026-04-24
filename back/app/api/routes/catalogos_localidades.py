"""Endpoints del catálogo de localidades.

Extraído de `catalogos.py` como parte de la división por recurso. Helpers
compartidos viven en `catalogos.py` y se importan para no duplicar lógica.
"""

from typing import Any  # noqa: F401

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.catalogos import audit_catalog_change, ensure_catalog_access, to_localidad_response
from app.db import get_db
from app.dependencies import get_current_state_id, get_current_user
from app.models import User
from app.schemas import (
    CatalogLocalidadCreate,
    CatalogLocalidadListResponse,
    CatalogLocalidadResponse,
    CatalogLocalidadUpdate,
)

router = APIRouter()



@router.get("/localidades", response_model=list[CatalogLocalidadResponse])
def list_localidades(
    estado_id: int | None = Query(default=None),
    municipio_id: int | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CatalogLocalidadResponse]:
    ensure_catalog_access(current_user)
    rows = db.execute(
        text(
            """
            SELECT
              l.id, l.municipio_id, l.estado_id, l.nombre, l.clave_geo, l.latitud, l.longitud, l.altitud, l.estatus_id,
              m.nombre AS municipio_nombre, e.nombre AS estado_nombre
            FROM localidades l
            LEFT JOIN municipios m ON m.id = l.municipio_id
            JOIN estados e ON e.id = l.estado_id
            WHERE (:estado_id IS NULL OR l.estado_id = :estado_id)
              AND (:municipio_id IS NULL OR l.municipio_id = :municipio_id)
              AND (:estatus_id IS NULL OR l.estatus_id = :estatus_id)
            ORDER BY l.id DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        {
            "estado_id": estado_id,
            "municipio_id": municipio_id,
            "estatus_id": estatus_id,
            "limit": limit,
            "offset": offset,
        },
    ).mappings()
    return [to_localidad_response(dict(r)) for r in rows]


@router.get("/localidades/listado", response_model=CatalogLocalidadListResponse)
def list_localidades_paginado(
    q: str | None = Query(default=None),
    estado_id: int | None = Query(default=None),
    municipio_id: int | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CatalogLocalidadListResponse:
    ensure_catalog_access(current_user)
    offset = (page - 1) * page_size
    search = f"%{q.strip()}%" if q and q.strip() else None

    total = int(
        db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM localidades l
                LEFT JOIN municipios m ON m.id = l.municipio_id
                JOIN estados e ON e.id = l.estado_id
                WHERE (:estado_id IS NULL OR l.estado_id = :estado_id)
                  AND (:municipio_id IS NULL OR l.municipio_id = :municipio_id)
                  AND (:estatus_id IS NULL OR l.estatus_id = :estatus_id)
                  AND (
                    :search IS NULL
                    OR l.nombre LIKE :search
                    OR CAST(l.clave_geo AS CHAR) LIKE :search
                    OR m.nombre LIKE :search
                    OR e.nombre LIKE :search
                  )
                """
            ),
            {
                "estado_id": estado_id,
                "municipio_id": municipio_id,
                "estatus_id": estatus_id,
                "search": search,
            },
        ).scalar_one()
    )

    rows = db.execute(
        text(
            """
            SELECT
              l.id, l.municipio_id, l.estado_id, l.nombre, l.clave_geo, l.latitud, l.longitud, l.altitud, l.estatus_id,
              m.nombre AS municipio_nombre, e.nombre AS estado_nombre
            FROM localidades l
            LEFT JOIN municipios m ON m.id = l.municipio_id
            JOIN estados e ON e.id = l.estado_id
            WHERE (:estado_id IS NULL OR l.estado_id = :estado_id)
              AND (:municipio_id IS NULL OR l.municipio_id = :municipio_id)
              AND (:estatus_id IS NULL OR l.estatus_id = :estatus_id)
              AND (
                :search IS NULL
                OR l.nombre LIKE :search
                OR CAST(l.clave_geo AS CHAR) LIKE :search
                OR m.nombre LIKE :search
                OR e.nombre LIKE :search
              )
            ORDER BY l.id DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        {
            "estado_id": estado_id,
            "municipio_id": municipio_id,
            "estatus_id": estatus_id,
            "search": search,
            "limit": page_size,
            "offset": offset,
        },
    ).mappings()

    return CatalogLocalidadListResponse(
        items=[to_localidad_response(dict(r)) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/localidades/{localidad_id}", response_model=CatalogLocalidadResponse)
def get_localidad(
    localidad_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CatalogLocalidadResponse:
    ensure_catalog_access(current_user)
    row = db.execute(
        text(
            """
            SELECT
              l.id, l.municipio_id, l.estado_id, l.nombre, l.clave_geo, l.latitud, l.longitud, l.altitud, l.estatus_id,
              m.nombre AS municipio_nombre, e.nombre AS estado_nombre
            FROM localidades l
            LEFT JOIN municipios m ON m.id = l.municipio_id
            JOIN estados e ON e.id = l.estado_id
            WHERE l.id = :id
            """
        ),
        {"id": localidad_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Localidad no encontrada")
    return to_localidad_response(dict(row))


@router.post("/localidades", response_model=CatalogLocalidadResponse, status_code=status.HTTP_201_CREATED)
def create_localidad(
    payload: CatalogLocalidadCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> CatalogLocalidadResponse:
    ensure_catalog_access(current_user)
    result = db.execute(
        text(
            """
            INSERT INTO localidades (municipio_id, estado_id, nombre, clave_geo, latitud, longitud, altitud, estatus_id)
            VALUES (:municipio_id, :estado_id, :nombre, :clave_geo, :latitud, :longitud, :altitud, :estatus_id)
            """
        ),
        payload.model_dump(),
    )
    localidad_id = int(result.lastrowid)
    municipio_nombre = None
    if payload.municipio_id:
        municipio_nombre = db.execute(text("SELECT nombre FROM municipios WHERE id = :id"), {"id": payload.municipio_id}).scalar_one_or_none()
    estado_nombre = db.execute(text("SELECT nombre FROM estados WHERE id = :id"), {"id": payload.estado_id}).scalar_one_or_none()
    audit_catalog_change(
        db,
        catalogo="localidades",
        registro_id=localidad_id,
        accion="CREATE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=None,
        datos_nuevos=payload.model_dump(),
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()
    return CatalogLocalidadResponse(
        id=localidad_id,
        municipio_nombre=str(municipio_nombre) if municipio_nombre else None,
        estado_nombre=str(estado_nombre) if estado_nombre else None,
        **payload.model_dump(),
    )


@router.put("/localidades/{localidad_id}", response_model=CatalogLocalidadResponse)
def update_localidad(
    localidad_id: int,
    payload: CatalogLocalidadUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> CatalogLocalidadResponse:
    ensure_catalog_access(current_user)
    previous = db.execute(
        text(
            """
            SELECT id, municipio_id, estado_id, nombre, clave_geo, latitud, longitud, altitud, estatus_id
            FROM localidades
            WHERE id = :id
            """
        ),
        {"id": localidad_id},
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Localidad no encontrada")

    db.execute(
        text(
            """
            UPDATE localidades
            SET municipio_id = :municipio_id, estado_id = :estado_id, nombre = :nombre,
                clave_geo = :clave_geo, latitud = :latitud, longitud = :longitud, altitud = :altitud,
                estatus_id = :estatus_id
            WHERE id = :id
            """
        ),
        {**payload.model_dump(), "id": localidad_id},
    )
    municipio_nombre = None
    if payload.municipio_id:
        municipio_nombre = db.execute(text("SELECT nombre FROM municipios WHERE id = :id"), {"id": payload.municipio_id}).scalar_one_or_none()
    estado_nombre = db.execute(text("SELECT nombre FROM estados WHERE id = :id"), {"id": payload.estado_id}).scalar_one_or_none()
    audit_catalog_change(
        db,
        catalogo="localidades",
        registro_id=localidad_id,
        accion="UPDATE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=dict(previous),
        datos_nuevos=payload.model_dump(),
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()
    return CatalogLocalidadResponse(
        id=localidad_id,
        municipio_nombre=str(municipio_nombre) if municipio_nombre else None,
        estado_nombre=str(estado_nombre) if estado_nombre else None,
        **payload.model_dump(),
    )


@router.delete("/localidades/{localidad_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_localidad(
    localidad_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    ensure_catalog_access(current_user)
    previous = db.execute(
        text(
            """
            SELECT id, municipio_id, estado_id, nombre, clave_geo, latitud, longitud, altitud, estatus_id
            FROM localidades
            WHERE id = :id
            """
        ),
        {"id": localidad_id},
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Localidad no encontrada")
    db.execute(text("UPDATE localidades SET estatus_id = 2 WHERE id = :id"), {"id": localidad_id})
    audit_catalog_change(
        db,
        catalogo="localidades",
        registro_id=localidad_id,
        accion="DELETE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=dict(previous),
        datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()

