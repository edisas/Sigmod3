"""Endpoints del catálogo de figuras.

Extraído de `catalogos.py` como parte de la división por recurso. Helpers
compartidos viven en `catalogos.py` y se importan para no duplicar lógica.
"""

from typing import Any  # noqa: F401

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.catalogos import (
    _figura_cooperadora_columns,
    audit_catalog_change,
    ensure_catalog_access,
    to_figura_cooperadora_response,
)
from app.db import get_db
from app.dependencies import get_current_state_id, get_current_user
from app.models import User
from app.schemas import (
    CatalogFiguraCooperadoraCreate,
    CatalogFiguraCooperadoraListResponse,
    CatalogFiguraCooperadoraResponse,
    CatalogFiguraCooperadoraUpdate,
    CatalogFuncionarioOptionResponse,
)

router = APIRouter()



@router.get("/funcionarios-options", response_model=list[CatalogFuncionarioOptionResponse])
def list_funcionarios_options(
    q: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CatalogFuncionarioOptionResponse]:
    ensure_catalog_access(current_user)
    search = f"%{q.strip()}%" if q and q.strip() else None
    rows = db.execute(
        text(
            """
            SELECT id, nombre
            FROM funcionarios
            WHERE estatus_id = 1
              AND (:search IS NULL OR nombre LIKE :search)
            ORDER BY nombre ASC
            LIMIT :limit
            """
        ),
        {"search": search, "limit": limit},
    ).mappings()
    return [CatalogFuncionarioOptionResponse(id=int(r["id"]), nombre=str(r["nombre"])) for r in rows]


@router.get("/figuras-cooperadoras", response_model=list[CatalogFiguraCooperadoraResponse])
def list_figuras_cooperadoras(
    estado_id: int | None = Query(default=None),
    tipo_figura_id: int | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CatalogFiguraCooperadoraResponse]:
    ensure_catalog_access(current_user)
    domicilio_column, has_celular_contacto = _figura_cooperadora_columns(db)
    domicilio_select = f"IFNULL(f.{domicilio_column}, '') AS domicilio" if domicilio_column else "'' AS domicilio"
    celular_select = "f.celular_contacto" if has_celular_contacto else "''"
    rows = db.execute(
        text(
            f"""
            SELECT
              f.id, f.nombre, f.nombre_corto, f.tipo_figura_id, {domicilio_select},
              f.localidad_id, f.municipio_id, f.estado_id, f.correo_electronico, f.telefono, {celular_select} AS celular_contacto, f.contacto_id, f.estatus_id,
              t.nombre AS tipo_figura_nombre, e.nombre AS estado_nombre, m.nombre AS municipio_nombre,
              l.nombre AS localidad_nombre, fu.nombre AS contacto_nombre
            FROM figura_cooperadora f
            LEFT JOIN figura_cooperadora_tipo t ON t.id = f.tipo_figura_id
            LEFT JOIN estados e ON e.id = f.estado_id
            LEFT JOIN municipios m ON m.id = f.municipio_id
            LEFT JOIN localidades l ON l.id = f.localidad_id
            LEFT JOIN funcionarios fu ON fu.id = f.contacto_id
            WHERE (:estado_id IS NULL OR f.estado_id = :estado_id)
              AND (:tipo_figura_id IS NULL OR f.tipo_figura_id = :tipo_figura_id)
              AND (:estatus_id IS NULL OR f.estatus_id = :estatus_id)
            ORDER BY f.nombre ASC
            LIMIT :limit OFFSET :offset
            """
        ),
        {
            "estado_id": estado_id,
            "tipo_figura_id": tipo_figura_id,
            "estatus_id": estatus_id,
            "limit": limit,
            "offset": offset,
        },
    ).mappings()
    return [to_figura_cooperadora_response(dict(r)) for r in rows]


@router.get("/figuras-cooperadoras/listado", response_model=CatalogFiguraCooperadoraListResponse)
def list_figuras_cooperadoras_paginado(
    q: str | None = Query(default=None),
    estado_id: int | None = Query(default=None),
    tipo_figura_id: int | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CatalogFiguraCooperadoraListResponse:
    ensure_catalog_access(current_user)
    offset = (page - 1) * page_size
    search = f"%{q.strip()}%" if q and q.strip() else None
    domicilio_column, has_celular_contacto = _figura_cooperadora_columns(db)
    domicilio_select = f"IFNULL(f.{domicilio_column}, '') AS domicilio" if domicilio_column else "'' AS domicilio"
    celular_select = "f.celular_contacto" if has_celular_contacto else "''"
    celular_search = "OR f.celular_contacto LIKE :search" if has_celular_contacto else ""

    params = {
        "search": search,
        "estado_id": estado_id,
        "tipo_figura_id": tipo_figura_id,
        "estatus_id": estatus_id,
    }
    total = int(
        db.execute(
            text(
                f"""
                SELECT COUNT(*)
                FROM figura_cooperadora f
                LEFT JOIN figura_cooperadora_tipo t ON t.id = f.tipo_figura_id
                LEFT JOIN estados e ON e.id = f.estado_id
                WHERE (:estado_id IS NULL OR f.estado_id = :estado_id)
                  AND (:tipo_figura_id IS NULL OR f.tipo_figura_id = :tipo_figura_id)
                  AND (:estatus_id IS NULL OR f.estatus_id = :estatus_id)
                  AND (
                    :search IS NULL
                    OR f.nombre LIKE :search
                    OR f.nombre_corto LIKE :search
                    OR f.correo_electronico LIKE :search
                    OR f.telefono LIKE :search
                    {celular_search}
                    OR t.nombre LIKE :search
                    OR e.nombre LIKE :search
                  )
                """
            ),
            params,
        ).scalar_one()
    )

    rows = db.execute(
        text(
            f"""
            SELECT
              f.id, f.nombre, f.nombre_corto, f.tipo_figura_id, {domicilio_select},
              f.localidad_id, f.municipio_id, f.estado_id, f.correo_electronico, f.telefono, {celular_select} AS celular_contacto, f.contacto_id, f.estatus_id,
              t.nombre AS tipo_figura_nombre, e.nombre AS estado_nombre, m.nombre AS municipio_nombre,
              l.nombre AS localidad_nombre, fu.nombre AS contacto_nombre
            FROM figura_cooperadora f
            LEFT JOIN figura_cooperadora_tipo t ON t.id = f.tipo_figura_id
            LEFT JOIN estados e ON e.id = f.estado_id
            LEFT JOIN municipios m ON m.id = f.municipio_id
            LEFT JOIN localidades l ON l.id = f.localidad_id
            LEFT JOIN funcionarios fu ON fu.id = f.contacto_id
            WHERE (:estado_id IS NULL OR f.estado_id = :estado_id)
              AND (:tipo_figura_id IS NULL OR f.tipo_figura_id = :tipo_figura_id)
              AND (:estatus_id IS NULL OR f.estatus_id = :estatus_id)
              AND (
                :search IS NULL
                OR f.nombre LIKE :search
                OR f.nombre_corto LIKE :search
                OR f.correo_electronico LIKE :search
                OR f.telefono LIKE :search
                {celular_search}
                OR t.nombre LIKE :search
                OR e.nombre LIKE :search
              )
            ORDER BY f.nombre ASC
            LIMIT :limit OFFSET :offset
            """
        ),
        {
            **params,
            "limit": page_size,
            "offset": offset,
        },
    ).mappings()

    return CatalogFiguraCooperadoraListResponse(
        items=[to_figura_cooperadora_response(dict(r)) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/figuras-cooperadoras/{figura_id}", response_model=CatalogFiguraCooperadoraResponse)
def get_figura_cooperadora(
    figura_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CatalogFiguraCooperadoraResponse:
    ensure_catalog_access(current_user)
    domicilio_column, has_celular_contacto = _figura_cooperadora_columns(db)
    domicilio_select = f"IFNULL(f.{domicilio_column}, '') AS domicilio" if domicilio_column else "'' AS domicilio"
    celular_select = "f.celular_contacto" if has_celular_contacto else "''"
    row = db.execute(
        text(
            f"""
            SELECT
              f.id, f.nombre, f.nombre_corto, f.tipo_figura_id, {domicilio_select},
              f.localidad_id, f.municipio_id, f.estado_id, f.correo_electronico, f.telefono, {celular_select} AS celular_contacto, f.contacto_id, f.estatus_id,
              t.nombre AS tipo_figura_nombre, e.nombre AS estado_nombre, m.nombre AS municipio_nombre,
              l.nombre AS localidad_nombre, fu.nombre AS contacto_nombre
            FROM figura_cooperadora f
            LEFT JOIN figura_cooperadora_tipo t ON t.id = f.tipo_figura_id
            LEFT JOIN estados e ON e.id = f.estado_id
            LEFT JOIN municipios m ON m.id = f.municipio_id
            LEFT JOIN localidades l ON l.id = f.localidad_id
            LEFT JOIN funcionarios fu ON fu.id = f.contacto_id
            WHERE f.id = :id
            """
        ),
        {"id": figura_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Figura cooperadora no encontrada")
    return to_figura_cooperadora_response(dict(row))


@router.post("/figuras-cooperadoras", response_model=CatalogFiguraCooperadoraResponse, status_code=status.HTTP_201_CREATED)
def create_figura_cooperadora(
    payload: CatalogFiguraCooperadoraCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> CatalogFiguraCooperadoraResponse:
    ensure_catalog_access(current_user)
    domicilio_column, has_celular_contacto = _figura_cooperadora_columns(db)
    if domicilio_column is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="No existe columna de domicilio en figura_cooperadora")
    insert_celular_col = ", celular_contacto" if has_celular_contacto else ""
    insert_celular_param = ", :celular_contacto" if has_celular_contacto else ""
    result = db.execute(
        text(
            f"""
            INSERT INTO figura_cooperadora (
              nombre, nombre_corto, tipo_figura_id, {domicilio_column}, localidad_id, municipio_id, estado_id,
              correo_electronico, telefono{insert_celular_col}, contacto_id, estatus_id
            )
            VALUES (
              :nombre, :nombre_corto, :tipo_figura_id, :domicilio, :localidad_id, :municipio_id, :estado_id,
              :correo_electronico, :telefono{insert_celular_param}, :contacto_id, :estatus_id
            )
            """
        ),
        payload.model_dump(),
    )
    figura_id = int(result.lastrowid)
    audit_catalog_change(
        db,
        catalogo="figura_cooperadora",
        registro_id=figura_id,
        accion="CREATE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=None,
        datos_nuevos=payload.model_dump(),
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()
    return get_figura_cooperadora(figura_id, db, current_user)


@router.put("/figuras-cooperadoras/{figura_id}", response_model=CatalogFiguraCooperadoraResponse)
def update_figura_cooperadora(
    figura_id: int,
    payload: CatalogFiguraCooperadoraUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> CatalogFiguraCooperadoraResponse:
    ensure_catalog_access(current_user)
    domicilio_column, has_celular_contacto = _figura_cooperadora_columns(db)
    if domicilio_column is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="No existe columna de domicilio en figura_cooperadora")
    select_celular = ", celular_contacto" if has_celular_contacto else ", '' AS celular_contacto"
    update_celular = ", celular_contacto = :celular_contacto" if has_celular_contacto else ""
    previous = db.execute(
        text(
            f"""
            SELECT
              id, nombre, nombre_corto, tipo_figura_id, IFNULL({domicilio_column}, '') AS domicilio, localidad_id,
              municipio_id, estado_id, correo_electronico, telefono{select_celular}, contacto_id, estatus_id
            FROM figura_cooperadora
            WHERE id = :id
            """
        ),
        {"id": figura_id},
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Figura cooperadora no encontrada")

    db.execute(
        text(
            f"""
            UPDATE figura_cooperadora
            SET nombre = :nombre,
                nombre_corto = :nombre_corto,
                tipo_figura_id = :tipo_figura_id,
                {domicilio_column} = :domicilio,
                localidad_id = :localidad_id,
                municipio_id = :municipio_id,
                estado_id = :estado_id,
                correo_electronico = :correo_electronico,
                telefono = :telefono{update_celular},
                contacto_id = :contacto_id,
                estatus_id = :estatus_id
            WHERE id = :id
            """
        ),
        {**payload.model_dump(), "id": figura_id},
    )
    audit_catalog_change(
        db,
        catalogo="figura_cooperadora",
        registro_id=figura_id,
        accion="UPDATE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=dict(previous),
        datos_nuevos=payload.model_dump(),
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()
    return get_figura_cooperadora(figura_id, db, current_user)


@router.delete("/figuras-cooperadoras/{figura_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_figura_cooperadora(
    figura_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    ensure_catalog_access(current_user)
    domicilio_column, has_celular_contacto = _figura_cooperadora_columns(db)
    if domicilio_column is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="No existe columna de domicilio en figura_cooperadora")
    select_celular = ", celular_contacto" if has_celular_contacto else ", '' AS celular_contacto"
    previous = db.execute(
        text(
            f"""
            SELECT
              id, nombre, nombre_corto, tipo_figura_id, IFNULL({domicilio_column}, '') AS domicilio, localidad_id,
              municipio_id, estado_id, correo_electronico, telefono{select_celular}, contacto_id, estatus_id
            FROM figura_cooperadora
            WHERE id = :id
            """
        ),
        {"id": figura_id},
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Figura cooperadora no encontrada")
    db.execute(text("UPDATE figura_cooperadora SET estatus_id = 2 WHERE id = :id"), {"id": figura_id})
    audit_catalog_change(
        db,
        catalogo="figura_cooperadora",
        registro_id=figura_id,
        accion="DELETE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=dict(previous),
        datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()


