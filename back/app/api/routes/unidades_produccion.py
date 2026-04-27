"""Endpoints de unidades de producción V3 nativas (huertos).

Análogo a productores: multi-tenant por estado_activo_id, RBAC, soft-delete,
auditoría doble (catalogos_cambios_log + senasica_audit_log si aplica).

La tabla legacy (sv01_sv02 en SIGMOD 2 → unidades_produccion en V3) tiene 60+
columnas. Este endpoint expone únicamente los campos esenciales de captura
inicial; columnas adicionales conservan sus defaults o NULL hasta que se
incorporen flujos específicos (anexos, fenología, facturación, etc.).
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
    UnidadProduccionCreate,
    UnidadProduccionListResponse,
    UnidadProduccionResponse,
    UnidadProduccionUpdate,
)

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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para gestionar unidades de producción")


def _scope_state(current_user: User, current_state_id: int, requested_estado_id: int | None) -> int:
    target = requested_estado_id if requested_estado_id is not None else current_state_id
    if not is_elevated(current_user) and target != current_state_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No puedes operar unidades fuera de tu estado activo",
        )
    return target


def _to_response(row: dict[str, Any]) -> UnidadProduccionResponse:
    def _i(k: str) -> int | None:
        v = row.get(k)
        return int(v) if v is not None else None

    return UnidadProduccionResponse(
        id=int(row["id"]),
        numero_inscripcion=str(row["numero_inscripcion"]),
        nombre_unidad=row.get("nombre_unidad"),
        productor_id=_i("productor_id"),
        figura_cooperadora_id=_i("figura_cooperadora_id"),
        nombre_propietario=row.get("nombre_propietario"),
        direccion=row.get("direccion"),
        telefono=row.get("telefono"),
        ubicacion=row.get("ubicacion"),
        municipio=row.get("municipio"),
        zona=row.get("zona"),
        estado_id=_i("estado_id"),
        municipio_id=_i("municipio_id"),
        especie_id=_i("especie_id"),
        tipo_unidad_id=_i("tipo_unidad_id"),
        ruta_id=_i("ruta_id"),
        mercado_id=_i("mercado_id"),
        aprobado_exportacion=int(row.get("aprobado_exportacion") or 0),
        htl=int(row.get("htl") or 0),
        activo=int(row.get("activo") or 0),
        observaciones_sv02=row.get("observaciones_sv02"),
        estatus_id=int(row.get("estatus_id") or 1),
        productor_nombre=row.get("productor_nombre"),
        figura_cooperadora_nombre=row.get("figura_cooperadora_nombre"),
        estado_nombre=row.get("estado_nombre"),
        municipio_nombre=row.get("municipio_nombre"),
    )


_BASE_SELECT = """
    SELECT u.id, u.numero_inscripcion, u.nombre_unidad,
           u.productor_id, u.figura_cooperadora_id,
           u.nombre_propietario, u.direccion, u.telefono,
           u.ubicacion, u.municipio, u.zona,
           u.estado_id, u.municipio_id, u.especie_id, u.tipo_unidad_id,
           u.ruta_id, u.mercado_id,
           u.aprobado_exportacion, u.htl, u.activo,
           u.observaciones_sv02, u.estatus_id,
           p.razon_social AS productor_nombre,
           fc.nombre AS figura_cooperadora_nombre,
           e.nombre AS estado_nombre,
           m.nombre AS municipio_nombre
    FROM unidades_produccion u
    LEFT JOIN productores p ON p.id = u.productor_id
    LEFT JOIN figura_cooperadora fc ON fc.id = u.figura_cooperadora_id
    LEFT JOIN estados e ON e.id = u.estado_id
    LEFT JOIN municipios m ON m.id = u.municipio_id
"""


@router.get("/listado", response_model=UnidadProduccionListResponse)
def list_unidades(
    q: str | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    productor_id: int | None = Query(default=None),
    figura_cooperadora_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> UnidadProduccionListResponse:
    _ensure_access(current_user)
    offset = (page - 1) * page_size
    search = f"%{q.strip()}%" if q and q.strip() else None

    where_clause = """
        WHERE u.estado_id = :estado_id
          AND (:estatus_id IS NULL OR u.estatus_id = :estatus_id)
          AND (:productor_id IS NULL OR u.productor_id = :productor_id)
          AND (:figura_id IS NULL OR u.figura_cooperadora_id = :figura_id)
          AND (
              :search IS NULL
              OR u.numero_inscripcion LIKE :search
              OR u.nombre_unidad LIKE :search
              OR u.nombre_propietario LIKE :search
          )
    """
    params = {
        "estado_id": current_state_id,
        "estatus_id": estatus_id,
        "productor_id": productor_id,
        "figura_id": figura_cooperadora_id,
        "search": search,
        "limit": page_size,
        "offset": offset,
    }

    total = int(
        db.execute(
            text(f"SELECT COUNT(*) FROM unidades_produccion u {where_clause}"),
            params,
        ).scalar_one()
    )

    rows = db.execute(
        text(
            f"""
            {_BASE_SELECT}
            {where_clause}
            ORDER BY u.numero_inscripcion ASC
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    ).mappings().all()

    return UnidadProduccionListResponse(
        items=[_to_response(dict(r)) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{unidad_id}", response_model=UnidadProduccionResponse)
def get_unidad(
    unidad_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> UnidadProduccionResponse:
    _ensure_access(current_user)
    row = db.execute(
        text(f"{_BASE_SELECT} WHERE u.id = :id"),
        {"id": unidad_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unidad no encontrada")
    if not is_elevated(current_user) and row.get("estado_id") not in (current_state_id, None):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unidad no encontrada")
    return _to_response(dict(row))


def _payload_to_params(payload: UnidadProduccionCreate | UnidadProduccionUpdate, target_estado_id: int) -> dict[str, Any]:
    return {
        "numero_inscripcion": payload.numero_inscripcion.strip(),
        "nombre_unidad": payload.nombre_unidad,
        "productor_id": payload.productor_id,
        "figura_cooperadora_id": payload.figura_cooperadora_id,
        "nombre_propietario": payload.nombre_propietario,
        "direccion": payload.direccion,
        "telefono": payload.telefono,
        "ubicacion": payload.ubicacion,
        "municipio": payload.municipio,
        "zona": payload.zona,
        "estado_id": target_estado_id,
        "municipio_id": payload.municipio_id,
        "especie_id": payload.especie_id,
        "tipo_unidad_id": payload.tipo_unidad_id,
        "ruta_id": payload.ruta_id,
        "mercado_id": payload.mercado_id,
        "aprobado_exportacion": payload.aprobado_exportacion,
        "htl": payload.htl,
        "activo": payload.activo,
        "observaciones_sv02": payload.observaciones_sv02,
        "estatus_id": payload.estatus_id,
    }


@router.post("", response_model=UnidadProduccionResponse, status_code=status.HTTP_201_CREATED)
def create_unidad(
    payload: UnidadProduccionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> UnidadProduccionResponse:
    _ensure_access(current_user)
    target_estado_id = _scope_state(current_user, current_state_id, payload.estado_id)

    if db.execute(text("SELECT id FROM unidades_produccion WHERE numero_inscripcion = :ni"), {"ni": payload.numero_inscripcion.strip()}).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe una unidad con ese número de inscripción")

    params = _payload_to_params(payload, target_estado_id)
    params["user_id"] = current_user.id

    insert = db.execute(
        text(
            """
            INSERT INTO unidades_produccion (
                numero_inscripcion, nombre_unidad,
                productor_id, figura_cooperadora_id,
                nombre_propietario, direccion, telefono,
                ubicacion, municipio, zona,
                estado_id, municipio_id, especie_id, tipo_unidad_id,
                ruta_id, mercado_id,
                aprobado_exportacion, htl, activo,
                observaciones_sv02, estatus_id,
                ddr_sv01, ddr_sv02, lugar_llenado_sv01, verificado, aplica_cuota,
                created_by_user_id, updated_by_user_id,
                created_at, updated_at, created_date, edited_date
            ) VALUES (
                :numero_inscripcion, :nombre_unidad,
                :productor_id, :figura_cooperadora_id,
                :nombre_propietario, :direccion, :telefono,
                :ubicacion, :municipio, :zona,
                :estado_id, :municipio_id, :especie_id, :tipo_unidad_id,
                :ruta_id, :mercado_id,
                :aprobado_exportacion, :htl, :activo,
                :observaciones_sv02, :estatus_id,
                0, 0, 0, 0, 0,
                :user_id, :user_id,
                NOW(), NOW(), CURDATE(), CURDATE()
            )
            """
        ),
        params,
    )
    new_id = int(insert.lastrowid)

    audit_catalog_change(
        db, catalogo="unidades_produccion", registro_id=new_id, accion="CREATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=None, datos_nuevos={**payload.model_dump(), "estado_id": target_estado_id},
        ip_origen=request.client.host if request.client else None,
    )
    audit_senasica(
        db, user=current_user, accion="create-unidad-produccion",
        metodo="POST", path="/unidades-produccion",
        estado_afectado_id=target_estado_id,
        recurso_tipo="unidades_produccion", recurso_id=str(new_id),
        datos_request=payload.model_dump(),
        sql_query="INSERT INTO unidades_produccion (...) VALUES (...)",
        resultado_status=201, ip_origen=request.client.host if request.client else None,
    )
    db.commit()

    row = db.execute(text(f"{_BASE_SELECT} WHERE u.id = :id"), {"id": new_id}).mappings().first()
    return _to_response(dict(row))


@router.put("/{unidad_id}", response_model=UnidadProduccionResponse)
def update_unidad(
    unidad_id: int,
    payload: UnidadProduccionUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> UnidadProduccionResponse:
    _ensure_access(current_user)

    previous = db.execute(text("SELECT * FROM unidades_produccion WHERE id = :id"), {"id": unidad_id}).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unidad no encontrada")
    if not is_elevated(current_user) and previous.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes editar unidades fuera de tu estado activo")

    target_estado_id = _scope_state(current_user, current_state_id, payload.estado_id)

    if payload.numero_inscripcion.strip() != previous["numero_inscripcion"]:
        dup = db.execute(text("SELECT id FROM unidades_produccion WHERE numero_inscripcion = :ni AND id <> :id"),
                         {"ni": payload.numero_inscripcion.strip(), "id": unidad_id}).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe otra unidad con ese número de inscripción")

    params = _payload_to_params(payload, target_estado_id)
    params["user_id"] = current_user.id
    params["id"] = unidad_id

    db.execute(
        text(
            """
            UPDATE unidades_produccion SET
                numero_inscripcion = :numero_inscripcion,
                nombre_unidad = :nombre_unidad,
                productor_id = :productor_id,
                figura_cooperadora_id = :figura_cooperadora_id,
                nombre_propietario = :nombre_propietario,
                direccion = :direccion,
                telefono = :telefono,
                ubicacion = :ubicacion,
                municipio = :municipio,
                zona = :zona,
                estado_id = :estado_id,
                municipio_id = :municipio_id,
                especie_id = :especie_id,
                tipo_unidad_id = :tipo_unidad_id,
                ruta_id = :ruta_id,
                mercado_id = :mercado_id,
                aprobado_exportacion = :aprobado_exportacion,
                htl = :htl,
                activo = :activo,
                observaciones_sv02 = :observaciones_sv02,
                estatus_id = :estatus_id,
                updated_by_user_id = :user_id
            WHERE id = :id
            """
        ),
        params,
    )

    audit_catalog_change(
        db, catalogo="unidades_produccion", registro_id=unidad_id, accion="UPDATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(previous), datos_nuevos={**payload.model_dump(), "estado_id": target_estado_id},
        ip_origen=request.client.host if request.client else None,
    )
    audit_senasica(
        db, user=current_user, accion="update-unidad-produccion",
        metodo="PUT", path=f"/unidades-produccion/{unidad_id}",
        estado_afectado_id=target_estado_id,
        recurso_tipo="unidades_produccion", recurso_id=str(unidad_id),
        datos_request=payload.model_dump(),
        sql_query="UPDATE unidades_produccion SET ... WHERE id = :id",
        resultado_status=200, ip_origen=request.client.host if request.client else None,
    )
    db.commit()

    row = db.execute(text(f"{_BASE_SELECT} WHERE u.id = :id"), {"id": unidad_id}).mappings().first()
    return _to_response(dict(row))


@router.delete("/{unidad_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_unidad(
    unidad_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    _ensure_access(current_user)
    previous = db.execute(text("SELECT * FROM unidades_produccion WHERE id = :id"), {"id": unidad_id}).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unidad no encontrada")
    if not is_elevated(current_user) and previous.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes inactivar unidades fuera de tu estado activo")

    db.execute(
        text("UPDATE unidades_produccion SET estatus_id = 2, updated_by_user_id = :u WHERE id = :id"),
        {"u": current_user.id, "id": unidad_id},
    )
    audit_catalog_change(
        db, catalogo="unidades_produccion", registro_id=unidad_id, accion="DELETE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(previous), datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None,
    )
    audit_senasica(
        db, user=current_user, accion="inactivate-unidad-produccion",
        metodo="DELETE", path=f"/unidades-produccion/{unidad_id}",
        estado_afectado_id=int(previous.get("estado_id")) if previous.get("estado_id") is not None else None,
        recurso_tipo="unidades_produccion", recurso_id=str(unidad_id),
        datos_request={"estatus_id": 2},
        sql_query="UPDATE unidades_produccion SET estatus_id = 2 WHERE id = :id",
        resultado_status=204, ip_origen=request.client.host if request.client else None,
    )
    db.commit()
