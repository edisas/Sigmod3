import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models import User
from app.schemas import (
    CatalogCambioLogResponse,
    CatalogEstadoResponse,
    CatalogFiguraCooperadoraResponse,
    CatalogLocalidadResponse,
    CatalogMunicipioResponse,
    CatalogTipoFcoopResponse,
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
        participa_sigmod=int(row.get("participa_sigmod", 1)),
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


# ──────────────────────────────────────────────────────────────────────
# Sub-routers por recurso — montados al final para evitar ciclos de import
# (los módulos importan helpers de este archivo).
# ──────────────────────────────────────────────────────────────────────

from app.api.routes import (  # noqa: E402
    catalogos_auxiliares,
    catalogos_estados,
    catalogos_figuras,
    catalogos_localidades,
    catalogos_municipios,
    catalogos_tipos_fcoop,
)

router.include_router(catalogos_estados.router)
router.include_router(catalogos_municipios.router)
router.include_router(catalogos_localidades.router)
router.include_router(catalogos_tipos_fcoop.router)
router.include_router(catalogos_figuras.router)
router.include_router(catalogos_auxiliares.router, prefix="/auxiliares")
