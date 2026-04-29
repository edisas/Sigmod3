"""Endpoints de estimados de cosecha V3.

Una fila por (unidad_produccion, variedad). Cada actualización registra
snapshot en bitacora_estimados_cosecha. Multi-tenant indirecto vía
unidad_produccion.estado_id.

Estados fenológicos (read-only) para popular selects de superficies.
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
    EstadoFenologicoListResponse,
    EstadoFenologicoOption,
    EstimadoCosechaCreate,
    EstimadoCosechaListResponse,
    EstimadoCosechaResponse,
    EstimadoCosechaUpdate,
)

router = APIRouter()
fenologia_router = APIRouter()

ALLOWED_ROLES = {"admin", "administrador general", "administrador estatal", "administrador senasica"}


def _ensure_access(user: User) -> None:
    if (user.rol or "").strip().lower() not in ALLOWED_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


def _ensure_unidad_in_scope(db: Session, unidad_id: int, user: User, current_state_id: int) -> int:
    row = db.execute(text("SELECT id, estado_id FROM unidades_produccion WHERE id = :id"), {"id": unidad_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unidad de producción no encontrada")
    if not is_elevated(user) and row.get("estado_id") not in (current_state_id, None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unidad fuera de tu estado activo")
    return int(row.get("estado_id") or current_state_id)


def _to_response(row: dict[str, Any]) -> EstimadoCosechaResponse:
    def _i(k: str) -> int | None:
        v = row.get(k)
        return int(v) if v is not None else None
    def _f(k: str) -> float | None:
        v = row.get(k)
        return float(v) if v is not None else None

    return EstimadoCosechaResponse(
        id=int(row["id"]),
        unidad_produccion_id=int(row.get("unidad_produccion_id") or 0),
        variedad_id=int(row.get("variedad_id") or 0),
        superficie=_f("superficie"),
        estimado=_f("estimado"),
        kg_estimados=float(row.get("kg_estimados") or 0),
        saldo=_f("saldo"),
        fecha_estimacion=row.get("fecha_estimacion"),
        progresivo=_i("progresivo"),
        estatus_id=int(row.get("estatus_id") or 1),
        unidad_produccion_ni=row.get("unidad_produccion_ni"),
        unidad_produccion_nombre=row.get("unidad_produccion_nombre"),
        variedad_nombre=row.get("variedad_nombre"),
    )


_BASE_SELECT = """
    SELECT ec.id, ec.unidad_produccion_id, ec.variedad_id,
           ec.superficie, ec.estimado, ec.kg_estimados, ec.saldo,
           ec.fecha_estimacion, ec.progresivo, ec.estatus_id,
           u.numero_inscripcion AS unidad_produccion_ni,
           u.nombre_unidad AS unidad_produccion_nombre,
           v.nombre AS variedad_nombre
    FROM estimados_cosecha ec
    LEFT JOIN unidades_produccion u ON u.id = ec.unidad_produccion_id
    LEFT JOIN variedades v ON v.id = ec.variedad_id
"""


@router.get("/listado", response_model=EstimadoCosechaListResponse)
def list_estimados(
    estatus_id: int | None = Query(default=None),
    unidad_produccion_id: int | None = Query(default=None),
    variedad_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> EstimadoCosechaListResponse:
    _ensure_access(current_user)
    offset = (page - 1) * page_size
    where = """
        WHERE u.estado_id = :estado_id
          AND (:estatus_id IS NULL OR ec.estatus_id = :estatus_id)
          AND (:up_id IS NULL OR ec.unidad_produccion_id = :up_id)
          AND (:variedad_id IS NULL OR ec.variedad_id = :variedad_id)
    """
    params = {
        "estado_id": current_state_id, "estatus_id": estatus_id,
        "up_id": unidad_produccion_id, "variedad_id": variedad_id,
        "limit": page_size, "offset": offset,
    }
    total = int(db.execute(
        text(f"SELECT COUNT(*) FROM estimados_cosecha ec LEFT JOIN unidades_produccion u ON u.id = ec.unidad_produccion_id {where}"),
        params,
    ).scalar_one())
    rows = db.execute(
        text(f"{_BASE_SELECT} {where} ORDER BY u.numero_inscripcion ASC, v.nombre ASC LIMIT :limit OFFSET :offset"),
        params,
    ).mappings().all()
    return EstimadoCosechaListResponse(items=[_to_response(dict(r)) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/{estimado_id}", response_model=EstimadoCosechaResponse)
def get_estimado(
    estimado_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> EstimadoCosechaResponse:
    _ensure_access(current_user)
    row = db.execute(text(f"{_BASE_SELECT} WHERE ec.id = :id"), {"id": estimado_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estimado no encontrado")
    if not is_elevated(current_user):
        unidad = db.execute(text("SELECT estado_id FROM unidades_produccion WHERE id = :id"), {"id": row["unidad_produccion_id"]}).mappings().first()
        if unidad and unidad.get("estado_id") not in (current_state_id, None):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estimado no encontrado")
    return _to_response(dict(row))


def _snapshot_to_bitacora(db: Session, prev: dict, motivo: str | None, user_id: int) -> None:
    """Inserta snapshot del estimado anterior en bitacora_estimados_cosecha."""
    db.execute(
        text(
            """
            INSERT INTO bitacora_estimados_cosecha (
                estimado_id, unidad_produccion_id, variedad_id,
                superficie, estimado, fecha_estimacion, progresivo,
                usuario_estimo_id, saldo, kg_estimados, motivo,
                created_by_user_id, created_at, created_date
            ) VALUES (
                :estimado_id, :unidad_produccion_id, :variedad_id,
                :superficie, :estimado, :fecha_estimacion, :progresivo,
                :usuario_estimo_id, :saldo, :kg_estimados, :motivo,
                :user_id, NOW(), CURDATE()
            )
            """
        ),
        {
            "estimado_id": prev["id"],
            "unidad_produccion_id": prev["unidad_produccion_id"],
            "variedad_id": prev["variedad_id"],
            "superficie": prev.get("superficie"),
            "estimado": prev.get("estimado"),
            "fecha_estimacion": prev.get("fecha_estimacion"),
            "progresivo": prev.get("progresivo"),
            "usuario_estimo_id": prev.get("usuario_estimo_id"),
            "saldo": prev.get("saldo"),
            "kg_estimados": prev.get("kg_estimados") or 0,
            "motivo": motivo,
            "user_id": user_id,
        },
    )


@router.post("", response_model=EstimadoCosechaResponse, status_code=status.HTTP_201_CREATED)
def create_or_update_estimado(
    payload: EstimadoCosechaCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> EstimadoCosechaResponse:
    """POST sirve para crear nuevo o actualizar existente (upsert) por
    (unidad_produccion, variedad). Si existe, registra bitácora con el
    valor anterior + motivo del cambio."""
    _ensure_access(current_user)
    target_estado = _ensure_unidad_in_scope(db, payload.unidad_produccion_id, current_user, current_state_id)

    existing = db.execute(
        text("SELECT * FROM estimados_cosecha WHERE unidad_produccion_id = :u AND variedad_id = :v"),
        {"u": payload.unidad_produccion_id, "v": payload.variedad_id},
    ).mappings().first()

    if existing:
        # Snapshot a bitácora antes de actualizar
        _snapshot_to_bitacora(db, dict(existing), payload.motivo, current_user.id)
        new_progresivo = (int(existing.get("progresivo") or 0)) + 1
        db.execute(
            text(
                """
                UPDATE estimados_cosecha SET
                    superficie=:superficie, estimado=:estimado,
                    kg_estimados=:kg_estimados, saldo=:saldo,
                    fecha_estimacion=:fecha_estimacion,
                    progresivo=:progresivo,
                    usuario_estimo_id=:user_id,
                    estatus_id=:estatus_id,
                    updated_by_user_id=:user_id
                WHERE id=:id
                """
            ),
            {
                "superficie": payload.superficie, "estimado": payload.estimado,
                "kg_estimados": payload.kg_estimados, "saldo": payload.saldo,
                "fecha_estimacion": payload.fecha_estimacion,
                "progresivo": new_progresivo,
                "user_id": current_user.id,
                "estatus_id": payload.estatus_id,
                "id": existing["id"],
            },
        )
        new_id = int(existing["id"])
        accion = "UPDATE-PROG"
    else:
        r = db.execute(
            text(
                """
                INSERT INTO estimados_cosecha (
                    unidad_produccion_id, variedad_id, superficie, estimado,
                    kg_estimados, saldo, fecha_estimacion, progresivo,
                    usuario_estimo_id, estatus_id,
                    created_by_user_id, updated_by_user_id,
                    created_at, updated_at, created_date, edited_date
                ) VALUES (
                    :u, :v, :superficie, :estimado,
                    :kg_estimados, :saldo, :fecha_estimacion, 1,
                    :user_id, :estatus_id,
                    :user_id, :user_id,
                    NOW(), NOW(), CURDATE(), CURDATE()
                )
                """
            ),
            {
                "u": payload.unidad_produccion_id, "v": payload.variedad_id,
                "superficie": payload.superficie, "estimado": payload.estimado,
                "kg_estimados": payload.kg_estimados, "saldo": payload.saldo,
                "fecha_estimacion": payload.fecha_estimacion,
                "user_id": current_user.id,
                "estatus_id": payload.estatus_id,
            },
        )
        new_id = int(r.lastrowid)
        accion = "CREATE"

    audit_catalog_change(db, catalogo="estimados_cosecha", registro_id=new_id, accion=accion,
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(existing) if existing else None,
        datos_nuevos={**payload.model_dump(mode="json"), "estado_id": target_estado},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion=f"{accion.lower()}-estimado-cosecha",
        metodo="POST", path="/estimados-cosecha",
        estado_afectado_id=target_estado,
        recurso_tipo="estimados_cosecha", recurso_id=str(new_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query=("UPDATE estimados_cosecha + INSERT bitacora" if existing else "INSERT INTO estimados_cosecha"),
        resultado_status=201, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE ec.id = :id"), {"id": new_id}).mappings().first()
    return _to_response(dict(row))


@router.put("/{estimado_id}", response_model=EstimadoCosechaResponse)
def update_estimado(
    estimado_id: int,
    payload: EstimadoCosechaUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> EstimadoCosechaResponse:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM estimados_cosecha WHERE id = :id"), {"id": estimado_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estimado no encontrado")
    _ensure_unidad_in_scope(db, int(prev["unidad_produccion_id"]), current_user, current_state_id)

    _snapshot_to_bitacora(db, dict(prev), payload.motivo, current_user.id)
    new_progresivo = (int(prev.get("progresivo") or 0)) + 1
    db.execute(
        text(
            """
            UPDATE estimados_cosecha SET
                superficie=:superficie, estimado=:estimado,
                kg_estimados=:kg_estimados, saldo=:saldo,
                fecha_estimacion=:fecha_estimacion,
                progresivo=:progresivo,
                usuario_estimo_id=:user_id,
                estatus_id=:estatus_id,
                updated_by_user_id=:user_id
            WHERE id=:id
            """
        ),
        {
            "superficie": payload.superficie, "estimado": payload.estimado,
            "kg_estimados": payload.kg_estimados, "saldo": payload.saldo,
            "fecha_estimacion": payload.fecha_estimacion,
            "progresivo": new_progresivo,
            "user_id": current_user.id,
            "estatus_id": payload.estatus_id,
            "id": estimado_id,
        },
    )
    audit_catalog_change(db, catalogo="estimados_cosecha", registro_id=estimado_id, accion="UPDATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos=payload.model_dump(mode="json"),
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="update-estimado-cosecha",
        metodo="PUT", path=f"/estimados-cosecha/{estimado_id}",
        recurso_tipo="estimados_cosecha", recurso_id=str(estimado_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="UPDATE estimados_cosecha + INSERT bitacora",
        resultado_status=200, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE ec.id = :id"), {"id": estimado_id}).mappings().first()
    return _to_response(dict(row))


# =========================================================
# Catálogo de estados fenológicos (read-only)
# =========================================================


@fenologia_router.get("/listado", response_model=EstadoFenologicoListResponse)
def list_fenologicos(
    estatus_id: int | None = Query(default=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EstadoFenologicoListResponse:
    _ensure_access(current_user)
    rows = db.execute(
        text(
            """
            SELECT id, descripcion, clave, estatus_id
            FROM estados_fenologicos
            WHERE (:estatus_id IS NULL OR estatus_id = :estatus_id)
            ORDER BY descripcion ASC
            """
        ),
        {"estatus_id": estatus_id},
    ).mappings().all()
    items = [
        EstadoFenologicoOption(
            id=int(r["id"]),
            descripcion=str(r["descripcion"]),
            clave=r.get("clave"),
            estatus_id=int(r.get("estatus_id") or 1),
        )
        for r in rows
    ]
    return EstadoFenologicoListResponse(items=items, total=len(items))
