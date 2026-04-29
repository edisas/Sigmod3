"""Endpoints de muestreos de frutos V3.

Corte directo de frutos en campo + diseccion para detectar infestacion.
A diferencia de identificaciones_lab (disecciones aisladas), aqui se
muestrea de forma sistematica una unidad de produccion con conteo
de frutos infestados sobre frutos muestreados.
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
    MuestreoFrutoCreate,
    MuestreoFrutoListResponse,
    MuestreoFrutoResponse,
    MuestreoFrutoUpdate,
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


def _to_response(row: dict[str, Any]) -> MuestreoFrutoResponse:
    def _i(k: str) -> int | None:
        v = row.get(k)
        return int(v) if v is not None else None
    def _f(k: str) -> float:
        return float(row.get(k) or 0)

    hora = row.get("hora")
    if hora is not None and not isinstance(hora, str):
        hora = str(hora)

    return MuestreoFrutoResponse(
        id=int(row["id"]),
        numero_muestra=row.get("numero_muestra"),
        fecha_muestreo=row.get("fecha_muestreo"),
        fecha_diseccion=row.get("fecha_diseccion"),
        unidad_produccion_id=_i("unidad_produccion_id"),
        numero_frutos=int(row.get("numero_frutos") or 0),
        kgs_muestreados=_f("kgs_muestreados"),
        kgs_disectados=_f("kgs_disectados"),
        frutos_infestados=int(row.get("frutos_infestados") or 0),
        tipo_colecta_id=_i("tipo_colecta_id"),
        tecnico_id=_i("tecnico_id"),
        area_id=_i("area_id"),
        numero_semana=_i("numero_semana"),
        hora=hora,
        muestreador_id=_i("muestreador_id"),
        variedad_id=_i("variedad_id"),
        camara_maduracion=int(row.get("camara_maduracion") or 0),
        estado_id=_i("estado_id"),
        estatus_id=int(row.get("estatus_id") or 1),
        unidad_nombre=row.get("unidad_nombre"),
        tipo_colecta_nombre=row.get("tipo_colecta_nombre"),
        area_nombre=row.get("area_nombre"),
        variedad_nombre=row.get("variedad_nombre"),
        muestreador_nombre=row.get("muestreador_nombre"),
        estado_nombre=row.get("estado_nombre"),
    )


_BASE_SELECT = """
    SELECT mf.id, mf.numero_muestra, mf.fecha_muestreo, mf.fecha_diseccion,
           mf.unidad_produccion_id, mf.numero_frutos, mf.kgs_muestreados,
           mf.kgs_disectados, mf.frutos_infestados,
           mf.tipo_colecta_id, mf.tecnico_id, mf.area_id, mf.numero_semana,
           mf.hora, mf.muestreador_id, mf.variedad_id, mf.camara_maduracion,
           mf.estado_id, mf.estatus_id,
           up.nombre AS unidad_nombre,
           tc.nombre AS tipo_colecta_nombre,
           a.nombre AS area_nombre,
           v.nombre AS variedad_nombre,
           t.nombre AS muestreador_nombre,
           e.nombre AS estado_nombre
    FROM muestreos_frutos mf
    LEFT JOIN unidades_produccion up ON up.id = mf.unidad_produccion_id
    LEFT JOIN tipos_colecta tc ON tc.id = mf.tipo_colecta_id
    LEFT JOIN areas a ON a.id = mf.area_id
    LEFT JOIN variedades v ON v.id = mf.variedad_id
    LEFT JOIN tramperos t ON t.id = mf.muestreador_id
    LEFT JOIN estados e ON e.id = mf.estado_id
"""


@router.get("/listado", response_model=MuestreoFrutoListResponse)
def list_muestreos(
    estatus_id: int | None = Query(default=None),
    unidad_produccion_id: int | None = Query(default=None),
    numero_semana: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> MuestreoFrutoListResponse:
    _ensure_access(current_user)
    offset = (page - 1) * page_size
    where = """
        WHERE mf.estado_id = :estado_id
          AND (:estatus_id IS NULL OR mf.estatus_id = :estatus_id)
          AND (:unidad_id IS NULL OR mf.unidad_produccion_id = :unidad_id)
          AND (:semana IS NULL OR mf.numero_semana = :semana)
    """
    params = {"estado_id": current_state_id, "estatus_id": estatus_id,
              "unidad_id": unidad_produccion_id, "semana": numero_semana,
              "limit": page_size, "offset": offset}
    total = int(db.execute(text(f"SELECT COUNT(*) FROM muestreos_frutos mf {where}"), params).scalar_one())
    rows = db.execute(
        text(f"{_BASE_SELECT} {where} ORDER BY mf.fecha_muestreo DESC, mf.id DESC LIMIT :limit OFFSET :offset"),
        params,
    ).mappings().all()
    return MuestreoFrutoListResponse(items=[_to_response(dict(r)) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/{m_id}", response_model=MuestreoFrutoResponse)
def get_muestreo(
    m_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> MuestreoFrutoResponse:
    _ensure_access(current_user)
    row = db.execute(text(f"{_BASE_SELECT} WHERE mf.id = :id"), {"id": m_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Muestreo no encontrado")
    if not is_elevated(current_user) and row.get("estado_id") not in (current_state_id, None):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Muestreo no encontrado")
    return _to_response(dict(row))


def _payload_to_params(payload: MuestreoFrutoCreate | MuestreoFrutoUpdate, target: int) -> dict[str, Any]:
    return {
        "numero_muestra": payload.numero_muestra,
        "fecha_muestreo": payload.fecha_muestreo,
        "fecha_diseccion": payload.fecha_diseccion,
        "unidad_produccion_id": payload.unidad_produccion_id,
        "numero_frutos": payload.numero_frutos,
        "kgs_muestreados": payload.kgs_muestreados,
        "kgs_disectados": payload.kgs_disectados,
        "frutos_infestados": payload.frutos_infestados,
        "tipo_colecta_id": payload.tipo_colecta_id,
        "tecnico_id": payload.tecnico_id,
        "area_id": payload.area_id,
        "numero_semana": payload.numero_semana,
        "hora": payload.hora,
        "muestreador_id": payload.muestreador_id,
        "variedad_id": payload.variedad_id,
        "camara_maduracion": payload.camara_maduracion,
        "estado_id": target,
        "estatus_id": payload.estatus_id,
    }


@router.post("", response_model=MuestreoFrutoResponse, status_code=status.HTTP_201_CREATED)
def create_muestreo(
    payload: MuestreoFrutoCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> MuestreoFrutoResponse:
    _ensure_access(current_user)
    target = _scope_state(current_user, current_state_id, payload.estado_id)
    params = _payload_to_params(payload, target)
    params["user_id"] = current_user.id
    r = db.execute(
        text(
            """
            INSERT INTO muestreos_frutos (
                numero_muestra, fecha_muestreo, fecha_diseccion,
                unidad_produccion_id, numero_frutos, kgs_muestreados,
                kgs_disectados, frutos_infestados,
                tipo_colecta_id, tecnico_id, area_id, numero_semana,
                hora, muestreador_id, variedad_id, camara_maduracion,
                estado_id, estatus_id, usuario_id,
                created_by_user_id, updated_by_user_id,
                fecha_captura, created_at, edited_at, created_date, edited_date
            ) VALUES (
                :numero_muestra, :fecha_muestreo, :fecha_diseccion,
                :unidad_produccion_id, :numero_frutos, :kgs_muestreados,
                :kgs_disectados, :frutos_infestados,
                :tipo_colecta_id, :tecnico_id, :area_id, :numero_semana,
                :hora, :muestreador_id, :variedad_id, :camara_maduracion,
                :estado_id, :estatus_id, :user_id,
                :user_id, :user_id,
                CURDATE(), NOW(), NOW(), CURDATE(), CURDATE()
            )
            """
        ),
        params,
    )
    new_id = int(r.lastrowid)
    audit_catalog_change(db, catalogo="muestreos_frutos", registro_id=new_id, accion="CREATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=None, datos_nuevos={**payload.model_dump(mode="json"), "estado_id": target},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="create-muestreo-fruto",
        metodo="POST", path="/muestreos-frutos", estado_afectado_id=target,
        recurso_tipo="muestreos_frutos", recurso_id=str(new_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="INSERT INTO muestreos_frutos (...)",
        resultado_status=201, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE mf.id = :id"), {"id": new_id}).mappings().first()
    return _to_response(dict(row))


@router.put("/{m_id}", response_model=MuestreoFrutoResponse)
def update_muestreo(
    m_id: int,
    payload: MuestreoFrutoUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> MuestreoFrutoResponse:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM muestreos_frutos WHERE id = :id"), {"id": m_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No encontrado")
    if not is_elevated(current_user) and prev.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    target = _scope_state(current_user, current_state_id, payload.estado_id)
    params = _payload_to_params(payload, target)
    params["user_id"] = current_user.id
    params["id"] = m_id
    db.execute(
        text(
            """
            UPDATE muestreos_frutos SET
                numero_muestra=:numero_muestra, fecha_muestreo=:fecha_muestreo,
                fecha_diseccion=:fecha_diseccion, unidad_produccion_id=:unidad_produccion_id,
                numero_frutos=:numero_frutos, kgs_muestreados=:kgs_muestreados,
                kgs_disectados=:kgs_disectados, frutos_infestados=:frutos_infestados,
                tipo_colecta_id=:tipo_colecta_id, tecnico_id=:tecnico_id,
                area_id=:area_id, numero_semana=:numero_semana,
                hora=:hora, muestreador_id=:muestreador_id, variedad_id=:variedad_id,
                camara_maduracion=:camara_maduracion,
                estado_id=:estado_id, estatus_id=:estatus_id,
                updated_by_user_id=:user_id
            WHERE id=:id
            """
        ),
        params,
    )
    audit_catalog_change(db, catalogo="muestreos_frutos", registro_id=m_id, accion="UPDATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos=payload.model_dump(mode="json"),
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="update-muestreo-fruto",
        metodo="PUT", path=f"/muestreos-frutos/{m_id}",
        recurso_tipo="muestreos_frutos", recurso_id=str(m_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="UPDATE muestreos_frutos SET ... WHERE id = :id",
        resultado_status=200, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE mf.id = :id"), {"id": m_id}).mappings().first()
    return _to_response(dict(row))


@router.delete("/{m_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_muestreo(
    m_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM muestreos_frutos WHERE id = :id"), {"id": m_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No encontrado")
    if not is_elevated(current_user) and prev.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    db.execute(text("UPDATE muestreos_frutos SET estatus_id=2, updated_by_user_id=:u WHERE id=:id"),
               {"u": current_user.id, "id": m_id})
    audit_catalog_change(db, catalogo="muestreos_frutos", registro_id=m_id, accion="DELETE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="inactivate-muestreo-fruto",
        metodo="DELETE", path=f"/muestreos-frutos/{m_id}",
        recurso_tipo="muestreos_frutos", recurso_id=str(m_id),
        datos_request={"estatus_id": 2},
        sql_query="UPDATE muestreos_frutos SET estatus_id = 2 WHERE id = :id",
        resultado_status=204, ip_origen=request.client.host if request.client else None)
    db.commit()
