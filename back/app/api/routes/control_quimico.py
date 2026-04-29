"""Endpoints de control quimico V3.

Aplicaciones de productos quimicos (proteina + malathion + agua) para
combate de moscas. Multi-tenant por estado_id directo.
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
    ControlQuimicoCreate,
    ControlQuimicoListResponse,
    ControlQuimicoResponse,
    ControlQuimicoUpdate,
)

router = APIRouter()

ALLOWED_ROLES = {"admin", "administrador general", "administrador estatal", "administrador senasica"}


def _ensure_access(user: User) -> None:
    if (user.rol or "").strip().lower() not in ALLOWED_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


def _scope_state(user: User, current_state_id: int, requested: int | None) -> int:
    target = requested if requested is not None else current_state_id
    if not is_elevated(user) and target != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    return target


def _to_response(row: dict[str, Any]) -> ControlQuimicoResponse:
    def _i(k: str) -> int | None:
        v = row.get(k)
        return int(v) if v is not None else None
    def _f(k: str) -> float:
        return float(row.get(k) or 0)

    hora = row.get("hora")
    if hora is not None and not isinstance(hora, str):
        hora = str(hora)

    return ControlQuimicoResponse(
        id=int(row["id"]),
        tecnico_id=_i("tecnico_id"),
        area_id=_i("area_id"),
        numero_semana=_i("numero_semana"),
        fecha_aplicacion=row.get("fecha_aplicacion"),
        unidad_produccion_id=_i("unidad_produccion_id"),
        tipo_aplicacion_id=_i("tipo_aplicacion_id"),
        superficie=_f("superficie"),
        estaciones_cebo=int(row.get("estaciones_cebo") or 0),
        proteina_litros=_f("proteina_litros"),
        malathion_litros=_f("malathion_litros"),
        agua_litros=_f("agua_litros"),
        observaciones=row.get("observaciones"),
        aplicador_id=_i("aplicador_id"),
        hora=hora,
        estado_id=_i("estado_id"),
        estatus_id=int(row.get("estatus_id") or 1),
        area_nombre=row.get("area_nombre"),
        unidad_nombre=row.get("unidad_nombre"),
        tipo_aplicacion_nombre=row.get("tipo_aplicacion_nombre"),
        aplicador_nombre=row.get("aplicador_nombre"),
        estado_nombre=row.get("estado_nombre"),
    )


_BASE_SELECT = """
    SELECT cq.id, cq.tecnico_id, cq.area_id, cq.numero_semana, cq.fecha_aplicacion,
           cq.unidad_produccion_id, cq.tipo_aplicacion_id, cq.superficie,
           cq.estaciones_cebo, cq.proteina_litros, cq.malathion_litros, cq.agua_litros,
           cq.observaciones, cq.aplicador_id, cq.hora,
           cq.estado_id, cq.estatus_id,
           a.nombre AS area_nombre,
           up.nombre AS unidad_nombre,
           ta.nombre AS tipo_aplicacion_nombre,
           ap.nombre AS aplicador_nombre,
           e.nombre AS estado_nombre
    FROM control_quimico cq
    LEFT JOIN areas a ON a.id = cq.area_id
    LEFT JOIN unidades_produccion up ON up.id = cq.unidad_produccion_id
    LEFT JOIN tipos_aplicacion ta ON ta.id = cq.tipo_aplicacion_id
    LEFT JOIN aplicadores ap ON ap.id = cq.aplicador_id
    LEFT JOIN estados e ON e.id = cq.estado_id
"""


@router.get("/listado", response_model=ControlQuimicoListResponse)
def list_control_quimico(
    estatus_id: int | None = Query(default=None),
    unidad_produccion_id: int | None = Query(default=None),
    numero_semana: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> ControlQuimicoListResponse:
    _ensure_access(current_user)
    offset = (page - 1) * page_size
    where = """
        WHERE cq.estado_id = :estado_id
          AND (:estatus_id IS NULL OR cq.estatus_id = :estatus_id)
          AND (:unidad_id IS NULL OR cq.unidad_produccion_id = :unidad_id)
          AND (:semana IS NULL OR cq.numero_semana = :semana)
    """
    params = {"estado_id": current_state_id, "estatus_id": estatus_id,
              "unidad_id": unidad_produccion_id, "semana": numero_semana,
              "limit": page_size, "offset": offset}
    total = int(db.execute(text(f"SELECT COUNT(*) FROM control_quimico cq {where}"), params).scalar_one())
    rows = db.execute(
        text(f"{_BASE_SELECT} {where} ORDER BY cq.fecha_aplicacion DESC, cq.id DESC LIMIT :limit OFFSET :offset"),
        params,
    ).mappings().all()
    return ControlQuimicoListResponse(items=[_to_response(dict(r)) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/{cq_id}", response_model=ControlQuimicoResponse)
def get_control_quimico(
    cq_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> ControlQuimicoResponse:
    _ensure_access(current_user)
    row = db.execute(text(f"{_BASE_SELECT} WHERE cq.id = :id"), {"id": cq_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Control quimico no encontrado")
    if not is_elevated(current_user) and row.get("estado_id") not in (current_state_id, None):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Control quimico no encontrado")
    return _to_response(dict(row))


def _payload_to_params(payload: ControlQuimicoCreate | ControlQuimicoUpdate, target: int) -> dict[str, Any]:
    return {
        "tecnico_id": payload.tecnico_id,
        "area_id": payload.area_id,
        "numero_semana": payload.numero_semana,
        "fecha_aplicacion": payload.fecha_aplicacion,
        "unidad_produccion_id": payload.unidad_produccion_id,
        "tipo_aplicacion_id": payload.tipo_aplicacion_id,
        "superficie": payload.superficie,
        "estaciones_cebo": payload.estaciones_cebo,
        "proteina_litros": payload.proteina_litros,
        "malathion_litros": payload.malathion_litros,
        "agua_litros": payload.agua_litros,
        "observaciones": payload.observaciones,
        "aplicador_id": payload.aplicador_id,
        "hora": payload.hora,
        "estado_id": target,
        "estatus_id": payload.estatus_id,
    }


@router.post("", response_model=ControlQuimicoResponse, status_code=status.HTTP_201_CREATED)
def create_control_quimico(
    payload: ControlQuimicoCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> ControlQuimicoResponse:
    _ensure_access(current_user)
    target = _scope_state(current_user, current_state_id, payload.estado_id)
    params = _payload_to_params(payload, target)
    params["user_id"] = current_user.id
    r = db.execute(
        text(
            """
            INSERT INTO control_quimico (
                tecnico_id, area_id, numero_semana, fecha_aplicacion,
                unidad_produccion_id, tipo_aplicacion_id, superficie,
                estaciones_cebo, proteina_litros, malathion_litros, agua_litros,
                observaciones, aplicador_id, hora,
                estado_id, estatus_id, usuario_id,
                created_by_user_id, updated_by_user_id,
                fecha_captura, created_at, edited_at, created_date, edited_date
            ) VALUES (
                :tecnico_id, :area_id, :numero_semana, :fecha_aplicacion,
                :unidad_produccion_id, :tipo_aplicacion_id, :superficie,
                :estaciones_cebo, :proteina_litros, :malathion_litros, :agua_litros,
                :observaciones, :aplicador_id, :hora,
                :estado_id, :estatus_id, :user_id,
                :user_id, :user_id,
                CURDATE(), NOW(), NOW(), CURDATE(), CURDATE()
            )
            """
        ),
        params,
    )
    new_id = int(r.lastrowid)
    audit_catalog_change(db, catalogo="control_quimico", registro_id=new_id, accion="CREATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=None, datos_nuevos={**payload.model_dump(mode="json"), "estado_id": target},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="create-control-quimico",
        metodo="POST", path="/control-quimico", estado_afectado_id=target,
        recurso_tipo="control_quimico", recurso_id=str(new_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="INSERT INTO control_quimico (...)",
        resultado_status=201, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE cq.id = :id"), {"id": new_id}).mappings().first()
    return _to_response(dict(row))


@router.put("/{cq_id}", response_model=ControlQuimicoResponse)
def update_control_quimico(
    cq_id: int,
    payload: ControlQuimicoUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> ControlQuimicoResponse:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM control_quimico WHERE id = :id"), {"id": cq_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No encontrado")
    if not is_elevated(current_user) and prev.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    target = _scope_state(current_user, current_state_id, payload.estado_id)
    params = _payload_to_params(payload, target)
    params["user_id"] = current_user.id
    params["id"] = cq_id
    db.execute(
        text(
            """
            UPDATE control_quimico SET
                tecnico_id=:tecnico_id, area_id=:area_id, numero_semana=:numero_semana,
                fecha_aplicacion=:fecha_aplicacion, unidad_produccion_id=:unidad_produccion_id,
                tipo_aplicacion_id=:tipo_aplicacion_id, superficie=:superficie,
                estaciones_cebo=:estaciones_cebo, proteina_litros=:proteina_litros,
                malathion_litros=:malathion_litros, agua_litros=:agua_litros,
                observaciones=:observaciones, aplicador_id=:aplicador_id, hora=:hora,
                estado_id=:estado_id, estatus_id=:estatus_id,
                updated_by_user_id=:user_id
            WHERE id=:id
            """
        ),
        params,
    )
    audit_catalog_change(db, catalogo="control_quimico", registro_id=cq_id, accion="UPDATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos=payload.model_dump(mode="json"),
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="update-control-quimico",
        metodo="PUT", path=f"/control-quimico/{cq_id}",
        recurso_tipo="control_quimico", recurso_id=str(cq_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="UPDATE control_quimico SET ... WHERE id = :id",
        resultado_status=200, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE cq.id = :id"), {"id": cq_id}).mappings().first()
    return _to_response(dict(row))


@router.delete("/{cq_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_control_quimico(
    cq_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM control_quimico WHERE id = :id"), {"id": cq_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No encontrado")
    if not is_elevated(current_user) and prev.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    db.execute(text("UPDATE control_quimico SET estatus_id=2, updated_by_user_id=:u WHERE id=:id"),
               {"u": current_user.id, "id": cq_id})
    audit_catalog_change(db, catalogo="control_quimico", registro_id=cq_id, accion="DELETE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="inactivate-control-quimico",
        metodo="DELETE", path=f"/control-quimico/{cq_id}",
        recurso_tipo="control_quimico", recurso_id=str(cq_id),
        datos_request={"estatus_id": 2},
        sql_query="UPDATE control_quimico SET estatus_id = 2 WHERE id = :id",
        resultado_status=204, ip_origen=request.client.host if request.client else None)
    db.commit()
