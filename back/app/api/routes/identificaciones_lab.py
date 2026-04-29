"""Endpoints de identificaciones de laboratorio V3.

Disección de muestras de fruta con conteo de larvas por estadio
(1er, 2do, 3er instar). Independientes de las identificaciones de
trampa (no requieren revisión previa).

Multi-tenant por estado_id directo en la tabla.
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
    IdentificacionLabCreate,
    IdentificacionLabListResponse,
    IdentificacionLabResponse,
    IdentificacionLabUpdate,
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


def _to_response(row: dict[str, Any]) -> IdentificacionLabResponse:
    def _i(k: str) -> int | None:
        v = row.get(k)
        return int(v) if v is not None else None

    hora = row.get("hora")
    if hora is not None and not isinstance(hora, str):
        hora = str(hora)

    return IdentificacionLabResponse(
        id=int(row["id"]),
        numero_muestra=row.get("numero_muestra"),
        fecha_diseccion=row.get("fecha_diseccion"),
        especie_mosca_id=_i("especie_mosca_id"),
        numero_larvas=int(row.get("numero_larvas") or 0),
        larvas_1e=int(row.get("larvas_1e") or 0),
        larvas_2e=int(row.get("larvas_2e") or 0),
        larvas_3e=int(row.get("larvas_3e") or 0),
        observaciones=row.get("observaciones"),
        numero_semana=_i("numero_semana"),
        fecha=row.get("fecha"),
        hora=hora,
        area_id=_i("area_id"),
        estado_id=_i("estado_id"),
        estatus_id=int(row.get("estatus_id") or 1),
        especie_mosca_nombre=row.get("especie_mosca_nombre"),
        area_nombre=row.get("area_nombre"),
        estado_nombre=row.get("estado_nombre"),
    )


_BASE_SELECT = """
    SELECT i.id, i.numero_muestra, i.fecha_diseccion, i.especie_mosca_id,
           i.numero_larvas, i.larvas_1e, i.larvas_2e, i.larvas_3e,
           i.observaciones, i.numero_semana, i.fecha, i.hora,
           i.area_id, i.estado_id, i.estatus_id,
           em.nombre AS especie_mosca_nombre,
           a.nombre AS area_nombre,
           e.nombre AS estado_nombre
    FROM identificaciones_laboratorio i
    LEFT JOIN especies_mosca em ON em.id = i.especie_mosca_id
    LEFT JOIN areas a ON a.id = i.area_id
    LEFT JOIN estados e ON e.id = i.estado_id
"""


@router.get("/listado", response_model=IdentificacionLabListResponse)
def list_identificaciones_lab(
    estatus_id: int | None = Query(default=None),
    especie_mosca_id: int | None = Query(default=None),
    numero_semana: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> IdentificacionLabListResponse:
    _ensure_access(current_user)
    offset = (page - 1) * page_size
    where = """
        WHERE i.estado_id = :estado_id
          AND (:estatus_id IS NULL OR i.estatus_id = :estatus_id)
          AND (:especie_id IS NULL OR i.especie_mosca_id = :especie_id)
          AND (:semana IS NULL OR i.numero_semana = :semana)
    """
    params = {"estado_id": current_state_id, "estatus_id": estatus_id,
              "especie_id": especie_mosca_id, "semana": numero_semana,
              "limit": page_size, "offset": offset}
    total = int(db.execute(text(f"SELECT COUNT(*) FROM identificaciones_laboratorio i {where}"), params).scalar_one())
    rows = db.execute(
        text(f"{_BASE_SELECT} {where} ORDER BY i.fecha_diseccion DESC, i.id DESC LIMIT :limit OFFSET :offset"),
        params,
    ).mappings().all()
    return IdentificacionLabListResponse(items=[_to_response(dict(r)) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/{ident_id}", response_model=IdentificacionLabResponse)
def get_identificacion_lab(
    ident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> IdentificacionLabResponse:
    _ensure_access(current_user)
    row = db.execute(text(f"{_BASE_SELECT} WHERE i.id = :id"), {"id": ident_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Identificación de laboratorio no encontrada")
    if not is_elevated(current_user) and row.get("estado_id") not in (current_state_id, None):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Identificación de laboratorio no encontrada")
    return _to_response(dict(row))


def _payload_to_params(payload: IdentificacionLabCreate | IdentificacionLabUpdate, target_estado_id: int) -> dict[str, Any]:
    return {
        "numero_muestra": payload.numero_muestra,
        "fecha_diseccion": payload.fecha_diseccion,
        "especie_mosca_id": payload.especie_mosca_id,
        "numero_larvas": payload.numero_larvas,
        "larvas_1e": payload.larvas_1e,
        "larvas_2e": payload.larvas_2e,
        "larvas_3e": payload.larvas_3e,
        "observaciones": payload.observaciones,
        "numero_semana": payload.numero_semana,
        "fecha": payload.fecha,
        "hora": payload.hora,
        "area_id": payload.area_id,
        "estado_id": target_estado_id,
        "estatus_id": payload.estatus_id,
    }


@router.post("", response_model=IdentificacionLabResponse, status_code=status.HTTP_201_CREATED)
def create_identificacion_lab(
    payload: IdentificacionLabCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> IdentificacionLabResponse:
    _ensure_access(current_user)
    target = _scope_state(current_user, current_state_id, payload.estado_id)
    params = _payload_to_params(payload, target)
    params["user_id"] = current_user.id
    r = db.execute(
        text(
            """
            INSERT INTO identificaciones_laboratorio (
                numero_muestra, fecha_diseccion, especie_mosca_id,
                numero_larvas, larvas_1e, larvas_2e, larvas_3e,
                observaciones, numero_semana, fecha, hora,
                area_id, estado_id, usuario_id, estatus_id,
                created_by_user_id, updated_by_user_id,
                created_at, updated_at, created_date, edited_date
            ) VALUES (
                :numero_muestra, :fecha_diseccion, :especie_mosca_id,
                :numero_larvas, :larvas_1e, :larvas_2e, :larvas_3e,
                :observaciones, :numero_semana, :fecha, :hora,
                :area_id, :estado_id, :user_id, :estatus_id,
                :user_id, :user_id,
                NOW(), NOW(), CURDATE(), CURDATE()
            )
            """
        ),
        params,
    )
    new_id = int(r.lastrowid)
    audit_catalog_change(db, catalogo="identificaciones_laboratorio", registro_id=new_id, accion="CREATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=None, datos_nuevos={**payload.model_dump(mode="json"), "estado_id": target},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="create-identificacion-lab",
        metodo="POST", path="/identificaciones-lab", estado_afectado_id=target,
        recurso_tipo="identificaciones_laboratorio", recurso_id=str(new_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="INSERT INTO identificaciones_laboratorio (...)",
        resultado_status=201, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE i.id = :id"), {"id": new_id}).mappings().first()
    return _to_response(dict(row))


@router.put("/{ident_id}", response_model=IdentificacionLabResponse)
def update_identificacion_lab(
    ident_id: int,
    payload: IdentificacionLabUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> IdentificacionLabResponse:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM identificaciones_laboratorio WHERE id = :id"), {"id": ident_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No encontrada")
    if not is_elevated(current_user) and prev.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    target = _scope_state(current_user, current_state_id, payload.estado_id)
    params = _payload_to_params(payload, target)
    params["user_id"] = current_user.id
    params["id"] = ident_id
    db.execute(
        text(
            """
            UPDATE identificaciones_laboratorio SET
                numero_muestra=:numero_muestra, fecha_diseccion=:fecha_diseccion,
                especie_mosca_id=:especie_mosca_id,
                numero_larvas=:numero_larvas, larvas_1e=:larvas_1e,
                larvas_2e=:larvas_2e, larvas_3e=:larvas_3e,
                observaciones=:observaciones, numero_semana=:numero_semana,
                fecha=:fecha, hora=:hora,
                area_id=:area_id, estado_id=:estado_id, estatus_id=:estatus_id,
                updated_by_user_id=:user_id
            WHERE id=:id
            """
        ),
        params,
    )
    audit_catalog_change(db, catalogo="identificaciones_laboratorio", registro_id=ident_id, accion="UPDATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos=payload.model_dump(mode="json"),
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="update-identificacion-lab",
        metodo="PUT", path=f"/identificaciones-lab/{ident_id}",
        recurso_tipo="identificaciones_laboratorio", recurso_id=str(ident_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="UPDATE identificaciones_laboratorio SET ... WHERE id = :id",
        resultado_status=200, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE i.id = :id"), {"id": ident_id}).mappings().first()
    return _to_response(dict(row))


@router.delete("/{ident_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_identificacion_lab(
    ident_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM identificaciones_laboratorio WHERE id = :id"), {"id": ident_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No encontrada")
    if not is_elevated(current_user) and prev.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    db.execute(text("UPDATE identificaciones_laboratorio SET estatus_id=2, updated_by_user_id=:u WHERE id=:id"),
               {"u": current_user.id, "id": ident_id})
    audit_catalog_change(db, catalogo="identificaciones_laboratorio", registro_id=ident_id, accion="DELETE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="inactivate-identificacion-lab",
        metodo="DELETE", path=f"/identificaciones-lab/{ident_id}",
        recurso_tipo="identificaciones_laboratorio", recurso_id=str(ident_id),
        datos_request={"estatus_id": 2},
        sql_query="UPDATE identificaciones_laboratorio SET estatus_id = 2 WHERE id = :id",
        resultado_status=204, ip_origen=request.client.host if request.client else None)
    db.commit()
