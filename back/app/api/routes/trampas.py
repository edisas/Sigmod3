"""Endpoints de trampas V3 (recurso operativo).

Multi-tenant por estado. CRUD con auditoría doble. UNIQUE compuesta
(estado_id, numero_trampa) en BD evita duplicados.
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
    TrampaCreate,
    TrampaListResponse,
    TrampaResponse,
    TrampaUpdate,
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


def _to_response(row: dict[str, Any]) -> TrampaResponse:
    def _i(k: str) -> int | None:
        v = row.get(k)
        return int(v) if v is not None else None
    def _f(k: str) -> float | None:
        v = row.get(k)
        return float(v) if v is not None else None

    return TrampaResponse(
        id=int(row["id"]),
        numero_trampa=str(row["numero_trampa"]),
        numero_trampa_ref=row.get("numero_trampa_ref"),
        ruta_id=_i("ruta_id"),
        unidad_produccion_id=_i("unidad_produccion_id"),
        figura_cooperadora_id=_i("figura_cooperadora_id"),
        tecnico_id=_i("tecnico_id"),
        hospedero_id=_i("hospedero_id"),
        area_id=_i("area_id"),
        tipo_trampa_id=_i("tipo_trampa_id"),
        latitud=_f("latitud"),
        longitud=_f("longitud"),
        altitud=_i("altitud"),
        fecha_colocacion=row.get("fecha_colocacion"),
        fecha_ultima_revision=row.get("fecha_ultima_revision"),
        estado_id=_i("estado_id"),
        estatus_id=int(row.get("estatus_id") or 1),
        estado_nombre=row.get("estado_nombre"),
        ruta_nombre=row.get("ruta_nombre"),
        unidad_produccion_nombre=row.get("unidad_produccion_nombre"),
        unidad_produccion_ni=row.get("unidad_produccion_ni"),
        tipo_trampa_nombre=row.get("tipo_trampa_nombre"),
        tecnico_nombre=row.get("tecnico_nombre"),
        hospedero_nombre=row.get("hospedero_nombre"),
        figura_cooperadora_nombre=row.get("figura_cooperadora_nombre"),
    )


_BASE_SELECT = """
    SELECT t.id, t.numero_trampa, t.numero_trampa_ref,
           t.ruta_id, t.unidad_produccion_id, t.figura_cooperadora_id,
           t.tecnico_id, t.hospedero_id, t.area_id, t.tipo_trampa_id,
           t.latitud, t.longitud, t.altitud,
           t.fecha_colocacion, t.fecha_ultima_revision,
           t.estado_id, t.estatus_id,
           e.nombre AS estado_nombre,
           r.nombre AS ruta_nombre,
           u.nombre_unidad AS unidad_produccion_nombre,
           u.numero_inscripcion AS unidad_produccion_ni,
           tt.nombre AS tipo_trampa_nombre,
           tr.nombre AS tecnico_nombre,
           h.nombre AS hospedero_nombre,
           fc.nombre AS figura_cooperadora_nombre
    FROM trampas t
    LEFT JOIN estados e ON e.id = t.estado_id
    LEFT JOIN rutas r ON r.id = t.ruta_id
    LEFT JOIN unidades_produccion u ON u.id = t.unidad_produccion_id
    LEFT JOIN tipos_trampa tt ON tt.id = t.tipo_trampa_id
    LEFT JOIN tramperos tr ON tr.id = t.tecnico_id
    LEFT JOIN hospederos h ON h.id = t.hospedero_id
    LEFT JOIN figura_cooperadora fc ON fc.id = t.figura_cooperadora_id
"""


@router.get("/listado", response_model=TrampaListResponse)
def list_trampas(
    q: str | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    ruta_id: int | None = Query(default=None),
    unidad_produccion_id: int | None = Query(default=None),
    tipo_trampa_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TrampaListResponse:
    _ensure_access(current_user)
    offset = (page - 1) * page_size
    search = f"%{q.strip()}%" if q and q.strip() else None
    where = """
        WHERE t.estado_id = :estado_id
          AND (:estatus_id IS NULL OR t.estatus_id = :estatus_id)
          AND (:ruta_id IS NULL OR t.ruta_id = :ruta_id)
          AND (:up_id IS NULL OR t.unidad_produccion_id = :up_id)
          AND (:tipo_id IS NULL OR t.tipo_trampa_id = :tipo_id)
          AND (
              :search IS NULL
              OR t.numero_trampa LIKE :search
              OR t.numero_trampa_ref LIKE :search
          )
    """
    params = {
        "estado_id": current_state_id, "estatus_id": estatus_id, "ruta_id": ruta_id,
        "up_id": unidad_produccion_id, "tipo_id": tipo_trampa_id,
        "search": search, "limit": page_size, "offset": offset,
    }
    total = int(db.execute(text(f"SELECT COUNT(*) FROM trampas t {where}"), params).scalar_one())
    rows = db.execute(
        text(f"{_BASE_SELECT} {where} ORDER BY t.numero_trampa ASC LIMIT :limit OFFSET :offset"),
        params,
    ).mappings().all()
    return TrampaListResponse(items=[_to_response(dict(r)) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/{trampa_id}", response_model=TrampaResponse)
def get_trampa(
    trampa_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TrampaResponse:
    _ensure_access(current_user)
    row = db.execute(text(f"{_BASE_SELECT} WHERE t.id = :id"), {"id": trampa_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trampa no encontrada")
    if not is_elevated(current_user) and row.get("estado_id") not in (current_state_id, None):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trampa no encontrada")
    return _to_response(dict(row))


def _payload_to_params(payload: TrampaCreate | TrampaUpdate, target_estado_id: int) -> dict[str, Any]:
    return {
        "numero_trampa": payload.numero_trampa.strip(),
        "numero_trampa_ref": payload.numero_trampa_ref,
        "ruta_id": payload.ruta_id,
        "unidad_produccion_id": payload.unidad_produccion_id,
        "figura_cooperadora_id": payload.figura_cooperadora_id,
        "tecnico_id": payload.tecnico_id,
        "hospedero_id": payload.hospedero_id,
        "area_id": payload.area_id,
        "tipo_trampa_id": payload.tipo_trampa_id,
        "latitud": payload.latitud,
        "longitud": payload.longitud,
        "altitud": payload.altitud,
        "fecha_colocacion": payload.fecha_colocacion,
        "fecha_ultima_revision": payload.fecha_ultima_revision,
        "estado_id": target_estado_id,
        "estatus_id": payload.estatus_id,
    }


@router.post("", response_model=TrampaResponse, status_code=status.HTTP_201_CREATED)
def create_trampa(
    payload: TrampaCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TrampaResponse:
    _ensure_access(current_user)
    target = _scope_state(current_user, current_state_id, payload.estado_id)
    if db.execute(text("SELECT id FROM trampas WHERE estado_id = :e AND numero_trampa = :n"),
                  {"e": target, "n": payload.numero_trampa.strip()}).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe una trampa con ese número en el estado")
    params = _payload_to_params(payload, target)
    params["user_id"] = current_user.id
    r = db.execute(
        text(
            """
            INSERT INTO trampas (
                numero_trampa, numero_trampa_ref, ruta_id, unidad_produccion_id,
                figura_cooperadora_id, tecnico_id, hospedero_id, area_id, tipo_trampa_id,
                latitud, longitud, altitud, fecha_colocacion, fecha_ultima_revision,
                estado_id, estatus_id, usuario_id, created_by_user_id, updated_by_user_id,
                created_at, updated_at, created_date, edited_date
            ) VALUES (
                :numero_trampa, :numero_trampa_ref, :ruta_id, :unidad_produccion_id,
                :figura_cooperadora_id, :tecnico_id, :hospedero_id, :area_id, :tipo_trampa_id,
                :latitud, :longitud, :altitud, :fecha_colocacion, :fecha_ultima_revision,
                :estado_id, :estatus_id, :user_id, :user_id, :user_id,
                NOW(), NOW(), CURDATE(), CURDATE()
            )
            """
        ),
        params,
    )
    new_id = int(r.lastrowid)
    audit_catalog_change(db, catalogo="trampas", registro_id=new_id, accion="CREATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=None, datos_nuevos={**payload.model_dump(mode="json"), "estado_id": target},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="create-trampa", metodo="POST", path="/trampas",
        estado_afectado_id=target, recurso_tipo="trampas", recurso_id=str(new_id),
        datos_request=payload.model_dump(mode="json"), sql_query="INSERT INTO trampas (...) VALUES (...)",
        resultado_status=201, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE t.id = :id"), {"id": new_id}).mappings().first()
    return _to_response(dict(row))


@router.put("/{trampa_id}", response_model=TrampaResponse)
def update_trampa(
    trampa_id: int,
    payload: TrampaUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TrampaResponse:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM trampas WHERE id = :id"), {"id": trampa_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trampa no encontrada")
    if not is_elevated(current_user) and prev.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    target = _scope_state(current_user, current_state_id, payload.estado_id)
    num_or_state_changed = (payload.numero_trampa.strip() != prev["numero_trampa"]) or (target != prev["estado_id"])
    if num_or_state_changed and db.execute(
        text("SELECT id FROM trampas WHERE estado_id = :e AND numero_trampa = :n AND id <> :id"),
        {"e": target, "n": payload.numero_trampa.strip(), "id": trampa_id},
    ).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Número ya existe en el estado")
    params = _payload_to_params(payload, target)
    params["user_id"] = current_user.id
    params["id"] = trampa_id
    db.execute(
        text(
            """
            UPDATE trampas SET
                numero_trampa=:numero_trampa, numero_trampa_ref=:numero_trampa_ref,
                ruta_id=:ruta_id, unidad_produccion_id=:unidad_produccion_id,
                figura_cooperadora_id=:figura_cooperadora_id, tecnico_id=:tecnico_id,
                hospedero_id=:hospedero_id, area_id=:area_id, tipo_trampa_id=:tipo_trampa_id,
                latitud=:latitud, longitud=:longitud, altitud=:altitud,
                fecha_colocacion=:fecha_colocacion, fecha_ultima_revision=:fecha_ultima_revision,
                estado_id=:estado_id, estatus_id=:estatus_id,
                updated_by_user_id=:user_id
            WHERE id=:id
            """
        ),
        params,
    )
    audit_catalog_change(db, catalogo="trampas", registro_id=trampa_id, accion="UPDATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos={**payload.model_dump(mode="json"), "estado_id": target},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="update-trampa", metodo="PUT",
        path=f"/trampas/{trampa_id}", estado_afectado_id=target,
        recurso_tipo="trampas", recurso_id=str(trampa_id),
        datos_request=payload.model_dump(mode="json"), sql_query="UPDATE trampas SET ... WHERE id = :id",
        resultado_status=200, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE t.id = :id"), {"id": trampa_id}).mappings().first()
    return _to_response(dict(row))


@router.delete("/{trampa_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trampa(
    trampa_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM trampas WHERE id = :id"), {"id": trampa_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trampa no encontrada")
    if not is_elevated(current_user) and prev.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    db.execute(text("UPDATE trampas SET estatus_id=2, updated_by_user_id=:u WHERE id=:id"),
               {"u": current_user.id, "id": trampa_id})
    audit_catalog_change(db, catalogo="trampas", registro_id=trampa_id, accion="DELETE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="inactivate-trampa", metodo="DELETE",
        path=f"/trampas/{trampa_id}",
        estado_afectado_id=int(prev.get("estado_id")) if prev.get("estado_id") is not None else None,
        recurso_tipo="trampas", recurso_id=str(trampa_id),
        datos_request={"estatus_id": 2}, sql_query="UPDATE trampas SET estatus_id = 2 WHERE id = :id",
        resultado_status=204, ip_origen=request.client.host if request.client else None)
    db.commit()
