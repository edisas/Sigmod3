"""Endpoints del catálogo de estados.

Extraído de `catalogos.py` (1,512 líneas) como parte de la división por
recurso. Los helpers compartidos (`ensure_catalog_access`,
`audit_catalog_change`, `to_estado_response`) siguen viviendo en
`catalogos.py` y se importan de ahí para no duplicar lógica.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.catalogos import audit_catalog_change, ensure_catalog_access, to_estado_response
from app.db import get_db
from app.dependencies import get_current_state_id, get_current_user
from app.models import User
from app.schemas import (
    CatalogEstadoCreate,
    CatalogEstadoListResponse,
    CatalogEstadoResponse,
    CatalogEstadoUpdate,
)

router = APIRouter()


@router.get("/estados", response_model=list[CatalogEstadoResponse])
def list_estados(
    estatus_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CatalogEstadoResponse]:
    ensure_catalog_access(current_user)
    rows = db.execute(
        text(
            """
            SELECT id, clave, nombre, abreviatura, estatus_id, participa_sigmod
            FROM estados
            WHERE (:estatus_id IS NULL OR estatus_id = :estatus_id)
            ORDER BY nombre ASC
            """
        ),
        {"estatus_id": estatus_id},
    ).mappings()
    return [to_estado_response(dict(r)) for r in rows]


@router.get("/estados/listado", response_model=CatalogEstadoListResponse)
def list_estados_paginado(
    q: str | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CatalogEstadoListResponse:
    ensure_catalog_access(current_user)
    offset = (page - 1) * page_size
    search = f"%{q.strip()}%" if q and q.strip() else None

    total = int(
        db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM estados
                WHERE (:estatus_id IS NULL OR estatus_id = :estatus_id)
                  AND (
                    :search IS NULL
                    OR nombre LIKE :search
                    OR clave LIKE :search
                    OR abreviatura LIKE :search
                  )
                """
            ),
            {"estatus_id": estatus_id, "search": search},
        ).scalar_one()
    )

    rows = db.execute(
        text(
            """
            SELECT id, clave, nombre, abreviatura, estatus_id, participa_sigmod
            FROM estados
            WHERE (:estatus_id IS NULL OR estatus_id = :estatus_id)
              AND (
                :search IS NULL
                OR nombre LIKE :search
                OR clave LIKE :search
                OR abreviatura LIKE :search
              )
            ORDER BY nombre ASC
            LIMIT :limit OFFSET :offset
            """
        ),
        {"estatus_id": estatus_id, "search": search, "limit": page_size, "offset": offset},
    ).mappings()

    return CatalogEstadoListResponse(
        items=[to_estado_response(dict(r)) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/estados/{estado_id}", response_model=CatalogEstadoResponse)
def get_estado(
    estado_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CatalogEstadoResponse:
    ensure_catalog_access(current_user)
    row = db.execute(
        text("SELECT id, clave, nombre, abreviatura, estatus_id, participa_sigmod FROM estados WHERE id = :id"),
        {"id": estado_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estado no encontrado")
    return to_estado_response(dict(row))


@router.post("/estados", response_model=CatalogEstadoResponse, status_code=status.HTTP_201_CREATED)
def create_estado(
    payload: CatalogEstadoCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> CatalogEstadoResponse:
    ensure_catalog_access(current_user)
    result = db.execute(
        text(
            """
            INSERT INTO estados (clave, nombre, abreviatura, estatus_id, participa_sigmod)
            VALUES (:clave, :nombre, :abreviatura, :estatus_id, :participa_sigmod)
            """
        ),
        payload.model_dump(),
    )
    estado_id = int(result.lastrowid)
    audit_catalog_change(
        db,
        catalogo="estados",
        registro_id=estado_id,
        accion="CREATE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=None,
        datos_nuevos=payload.model_dump(),
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()
    return CatalogEstadoResponse(id=estado_id, **payload.model_dump())


@router.put("/estados/{estado_id}", response_model=CatalogEstadoResponse)
def update_estado(
    estado_id: int,
    payload: CatalogEstadoUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> CatalogEstadoResponse:
    ensure_catalog_access(current_user)
    previous = db.execute(
        text("SELECT id, clave, nombre, abreviatura, estatus_id, participa_sigmod FROM estados WHERE id = :id"),
        {"id": estado_id},
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estado no encontrado")

    db.execute(
        text(
            """
            UPDATE estados
            SET clave = :clave, nombre = :nombre, abreviatura = :abreviatura,
                estatus_id = :estatus_id, participa_sigmod = :participa_sigmod
            WHERE id = :id
            """
        ),
        {**payload.model_dump(), "id": estado_id},
    )
    audit_catalog_change(
        db,
        catalogo="estados",
        registro_id=estado_id,
        accion="UPDATE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=dict(previous),
        datos_nuevos=payload.model_dump(),
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()
    return CatalogEstadoResponse(id=estado_id, **payload.model_dump())


@router.delete("/estados/{estado_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_estado(
    estado_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    ensure_catalog_access(current_user)
    previous = db.execute(
        text("SELECT id, clave, nombre, abreviatura, estatus_id FROM estados WHERE id = :id"),
        {"id": estado_id},
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estado no encontrado")
    db.execute(text("UPDATE estados SET estatus_id = 2 WHERE id = :id"), {"id": estado_id})
    audit_catalog_change(
        db,
        catalogo="estados",
        registro_id=estado_id,
        accion="DELETE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=dict(previous),
        datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()
