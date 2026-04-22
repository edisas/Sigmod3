import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_state_id, get_current_user
from app.models import User
from app.schemas import (
    CatalogCambioLogResponse,
    CatalogEstadoCreate,
    CatalogEstadoListResponse,
    CatalogEstadoResponse,
    CatalogEstadoUpdate,
    CatalogFiguraCooperadoraCreate,
    CatalogFiguraCooperadoraListResponse,
    CatalogFiguraCooperadoraResponse,
    CatalogFiguraCooperadoraUpdate,
    CatalogFuncionarioOptionResponse,
    CatalogLocalidadCreate,
    CatalogLocalidadListResponse,
    CatalogLocalidadResponse,
    CatalogLocalidadUpdate,
    CatalogMunicipioCreate,
    CatalogMunicipioListResponse,
    CatalogMunicipioResponse,
    CatalogMunicipioUpdate,
    CatalogTipoFcoopCreate,
    CatalogTipoFcoopListResponse,
    CatalogTipoFcoopResponse,
    CatalogTipoFcoopUpdate,
)

router = APIRouter()

ALLOWED_ROLES = {"administrador general", "administrador estatal", "admin"}


def ensure_catalog_access(current_user: User) -> None:
    role = (current_user.rol or "").strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para administrar catálogos",
        )


def audit_catalog_change(
    db: Session,
    *,
    catalogo: str,
    registro_id: int,
    accion: str,
    usuario_id: int,
    estado_activo_id: int | None,
    datos_anteriores: dict[str, Any] | None,
    datos_nuevos: dict[str, Any] | None,
    ip_origen: str | None,
) -> None:
    db.execute(
        text(
            """
            INSERT INTO catalogos_cambios_log (
              catalogo, registro_id, accion, usuario_id, estado_activo_id,
              datos_anteriores, datos_nuevos, ip_origen
            )
            VALUES (
              :catalogo, :registro_id, :accion, :usuario_id, :estado_activo_id,
              :datos_anteriores, :datos_nuevos, :ip_origen
            )
            """
        ),
        {
            "catalogo": catalogo,
            "registro_id": registro_id,
            "accion": accion,
            "usuario_id": usuario_id,
            "estado_activo_id": estado_activo_id,
            "datos_anteriores": json.dumps(datos_anteriores, ensure_ascii=False) if datos_anteriores else None,
            "datos_nuevos": json.dumps(datos_nuevos, ensure_ascii=False) if datos_nuevos else None,
            "ip_origen": ip_origen,
        },
    )


def to_estado_response(row: dict[str, Any]) -> CatalogEstadoResponse:
    return CatalogEstadoResponse(
        id=int(row["id"]),
        clave=str(row["clave"]),
        nombre=str(row["nombre"]),
        abreviatura=str(row["abreviatura"]),
        estatus_id=int(row["estatus_id"]),
    )


def to_municipio_response(row: dict[str, Any]) -> CatalogMunicipioResponse:
    return CatalogMunicipioResponse(
        id=int(row["id"]),
        estado_id=int(row["estado_id"]),
        clave=str(row["clave"]),
        nombre=str(row["nombre"]),
        clave_geo=str(row["clave_geo"]),
        estatus_id=int(row["estatus_id"]),
        estado_nombre=str(row["estado_nombre"]) if row.get("estado_nombre") is not None else None,
    )


def to_localidad_response(row: dict[str, Any]) -> CatalogLocalidadResponse:
    return CatalogLocalidadResponse(
        id=int(row["id"]),
        municipio_id=int(row["municipio_id"]) if row["municipio_id"] is not None else None,
        estado_id=int(row["estado_id"]),
        nombre=str(row["nombre"]),
        clave_geo=int(row["clave_geo"]),
        latitud=float(row["latitud"]) if row["latitud"] is not None else None,
        longitud=float(row["longitud"]) if row["longitud"] is not None else None,
        altitud=float(row["altitud"]) if row["altitud"] is not None else None,
        estatus_id=int(row["estatus_id"]),
        municipio_nombre=str(row["municipio_nombre"]) if row.get("municipio_nombre") else None,
        estado_nombre=str(row["estado_nombre"]) if row.get("estado_nombre") else None,
    )


def to_tipo_fcoop_response(row: dict[str, Any]) -> CatalogTipoFcoopResponse:
    return CatalogTipoFcoopResponse(
        id=int(row["id"]),
        nombre=str(row["nombre"]),
        descripcion=str(row["descripcion"]),
        estatus_id=int(row["estatus_id"]),
    )


def to_figura_cooperadora_response(row: dict[str, Any]) -> CatalogFiguraCooperadoraResponse:
    domicilio = str(row.get("domicilio") or "").strip() or "N/D"
    celular_contacto = str(row.get("celular_contacto") or "").strip() or "N/D"
    return CatalogFiguraCooperadoraResponse(
        id=int(row["id"]),
        nombre=str(row["nombre"]),
        nombre_corto=str(row["nombre_corto"]),
        tipo_figura_id=int(row["tipo_figura_id"]),
        domicilio=domicilio,
        localidad_id=int(row["localidad_id"]),
        municipio_id=int(row["municipio_id"]),
        estado_id=int(row["estado_id"]),
        correo_electronico=str(row["correo_electronico"]),
        telefono=str(row["telefono"]),
        celular_contacto=celular_contacto,
        contacto_id=int(row["contacto_id"]),
        estatus_id=int(row["estatus_id"]),
        tipo_figura_nombre=str(row["tipo_figura_nombre"]) if row.get("tipo_figura_nombre") else None,
        estado_nombre=str(row["estado_nombre"]) if row.get("estado_nombre") else None,
        municipio_nombre=str(row["municipio_nombre"]) if row.get("municipio_nombre") else None,
        localidad_nombre=str(row["localidad_nombre"]) if row.get("localidad_nombre") else None,
        contacto_nombre=str(row["contacto_nombre"]) if row.get("contacto_nombre") else None,
    )


def _table_has_column(db: Session, table_name: str, column_name: str) -> bool:
    return (
        db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = :table_name
                  AND column_name = :column_name
                """
            ),
            {"table_name": table_name, "column_name": column_name},
        ).scalar_one()
        > 0
    )


def _figura_cooperadora_columns(db: Session) -> tuple[str | None, bool]:
    if _table_has_column(db, "figura_cooperadora", "domicilio"):
        domicilio_column: str | None = "domicilio"
    elif _table_has_column(db, "figura_cooperadora", "domiclio"):
        domicilio_column = "domiclio"
    else:
        domicilio_column = None
    has_celular_contacto = _table_has_column(db, "figura_cooperadora", "celular_contacto")
    return domicilio_column, has_celular_contacto


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
            SELECT id, clave, nombre, abreviatura, estatus_id
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
            SELECT id, clave, nombre, abreviatura, estatus_id
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
        text("SELECT id, clave, nombre, abreviatura, estatus_id FROM estados WHERE id = :id"),
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
            INSERT INTO estados (clave, nombre, abreviatura, estatus_id)
            VALUES (:clave, :nombre, :abreviatura, :estatus_id)
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
        text("SELECT id, clave, nombre, abreviatura, estatus_id FROM estados WHERE id = :id"),
        {"id": estado_id},
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estado no encontrado")

    db.execute(
        text(
            """
            UPDATE estados
            SET clave = :clave, nombre = :nombre, abreviatura = :abreviatura, estatus_id = :estatus_id
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


@router.get("/cambios", response_model=list[CatalogCambioLogResponse])
def list_cambios(
    catalogo: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CatalogCambioLogResponse]:
    ensure_catalog_access(current_user)
    rows = db.execute(
        text(
            """
            SELECT
              l.id, l.catalogo, l.registro_id, l.accion, l.usuario_id, u.nombre AS usuario_nombre,
              l.estado_activo_id, l.datos_anteriores, l.datos_nuevos, l.ip_origen, l.created_at
            FROM catalogos_cambios_log l
            LEFT JOIN usuarios u ON u.id = l.usuario_id
            WHERE (:catalogo IS NULL OR l.catalogo = :catalogo)
            ORDER BY l.id DESC
            LIMIT :limit
            """
        ),
        {"catalogo": catalogo, "limit": limit},
    ).mappings()

    output: list[CatalogCambioLogResponse] = []
    for r in rows:
        output.append(
            CatalogCambioLogResponse(
                id=int(r["id"]),
                catalogo=str(r["catalogo"]),
                registro_id=int(r["registro_id"]),
                accion=str(r["accion"]),
                usuario_id=int(r["usuario_id"]),
                usuario_nombre=str(r["usuario_nombre"]) if r["usuario_nombre"] else None,
                estado_activo_id=int(r["estado_activo_id"]) if r["estado_activo_id"] is not None else None,
                datos_anteriores=json.loads(r["datos_anteriores"]) if r["datos_anteriores"] else None,
                datos_nuevos=json.loads(r["datos_nuevos"]) if r["datos_nuevos"] else None,
                ip_origen=str(r["ip_origen"]) if r["ip_origen"] else None,
                created_at=r["created_at"],
            )
        )
    return output
