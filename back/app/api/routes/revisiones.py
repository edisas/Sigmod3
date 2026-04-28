"""Endpoints de revisiones de trampas V3.

Multi-tenant indirecto: la revisión hereda el estado de su trampa.
Estatales solo ven/editan revisiones de trampas de su estado activo;
elevados (admin general/admin/senasica) ven todo según su estado activo
(senasica alterna con switch-state).
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
    RevisionCreate,
    RevisionListResponse,
    RevisionResponse,
    RevisionUpdate,
)

router = APIRouter()

ALLOWED_ROLES = {"admin", "administrador general", "administrador estatal", "administrador senasica"}


def _ensure_access(user: User) -> None:
    if (user.rol or "").strip().lower() not in ALLOWED_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


def _ensure_trampa_in_scope(db: Session, trampa_id: int, user: User, current_state_id: int) -> dict:
    row = db.execute(text("SELECT id, estado_id FROM trampas WHERE id = :id"), {"id": trampa_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trampa no encontrada")
    if not is_elevated(user) and row.get("estado_id") not in (current_state_id, None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Trampa fuera de tu estado activo")
    return dict(row)


def _to_response(row: dict[str, Any]) -> RevisionResponse:
    def _i(k: str) -> int | None:
        v = row.get(k)
        return int(v) if v is not None else None

    return RevisionResponse(
        id=int(row["id"]),
        trampa_id=int(row["trampa_id"]),
        numero_semana=_i("numero_semana"),
        fecha_revision=row.get("fecha_revision"),
        status_revision_id=_i("status_revision_id"),
        tipo_producto=_i("tipo_producto"),
        dias_exposicion=_i("dias_exposicion"),
        observaciones=row.get("observaciones"),
        validado=int(row.get("validado") or 0),
        estatus_id=int(row.get("estatus_id") or 1),
        trampa_numero=row.get("trampa_numero"),
        trampa_estado_id=_i("trampa_estado_id"),
        status_revision_nombre=row.get("status_revision_nombre"),
    )


_BASE_SELECT = """
    SELECT r.id, r.trampa_id, r.numero_semana, r.fecha_revision,
           r.status_revision_id, r.tipo_producto, r.dias_exposicion,
           r.observaciones, r.validado, r.estatus_id,
           t.numero_trampa AS trampa_numero,
           t.estado_id AS trampa_estado_id,
           sr.nombre AS status_revision_nombre
    FROM trampas_revisiones r
    LEFT JOIN trampas t ON t.id = r.trampa_id
    LEFT JOIN status_revision sr ON sr.id = r.status_revision_id
"""


@router.get("/listado", response_model=RevisionListResponse)
def list_revisiones(
    estatus_id: int | None = Query(default=None),
    trampa_id: int | None = Query(default=None),
    numero_semana: int | None = Query(default=None),
    validado: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> RevisionListResponse:
    _ensure_access(current_user)
    offset = (page - 1) * page_size
    where = """
        WHERE t.estado_id = :estado_id
          AND (:estatus_id IS NULL OR r.estatus_id = :estatus_id)
          AND (:trampa_id IS NULL OR r.trampa_id = :trampa_id)
          AND (:numero_semana IS NULL OR r.numero_semana = :numero_semana)
          AND (:validado IS NULL OR r.validado = :validado)
    """
    params = {
        "estado_id": current_state_id, "estatus_id": estatus_id,
        "trampa_id": trampa_id, "numero_semana": numero_semana, "validado": validado,
        "limit": page_size, "offset": offset,
    }
    total = int(db.execute(
        text(f"SELECT COUNT(*) FROM trampas_revisiones r LEFT JOIN trampas t ON t.id = r.trampa_id {where}"),
        params,
    ).scalar_one())
    rows = db.execute(
        text(f"{_BASE_SELECT} {where} ORDER BY r.fecha_revision DESC, r.id DESC LIMIT :limit OFFSET :offset"),
        params,
    ).mappings().all()
    return RevisionListResponse(items=[_to_response(dict(r)) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/{revision_id}", response_model=RevisionResponse)
def get_revision(
    revision_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> RevisionResponse:
    _ensure_access(current_user)
    row = db.execute(text(f"{_BASE_SELECT} WHERE r.id = :id"), {"id": revision_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Revisión no encontrada")
    if not is_elevated(current_user) and row.get("trampa_estado_id") not in (current_state_id, None):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Revisión no encontrada")
    return _to_response(dict(row))


def _payload_to_params(payload: RevisionCreate | RevisionUpdate) -> dict[str, Any]:
    return {
        "trampa_id": payload.trampa_id,
        "numero_semana": payload.numero_semana,
        "fecha_revision": payload.fecha_revision,
        "status_revision_id": payload.status_revision_id,
        "tipo_producto": payload.tipo_producto,
        "dias_exposicion": payload.dias_exposicion,
        "observaciones": payload.observaciones,
        "validado": payload.validado,
        "estatus_id": payload.estatus_id,
    }


@router.post("", response_model=RevisionResponse, status_code=status.HTTP_201_CREATED)
def create_revision(
    payload: RevisionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> RevisionResponse:
    _ensure_access(current_user)
    trampa = _ensure_trampa_in_scope(db, payload.trampa_id, current_user, current_state_id)
    if payload.numero_semana is not None:
        dup = db.execute(
            text("SELECT id FROM trampas_revisiones WHERE trampa_id = :t AND numero_semana = :s"),
            {"t": payload.trampa_id, "s": payload.numero_semana},
        ).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe una revisión de esa trampa para esa semana")

    params = _payload_to_params(payload)
    params["user_id"] = current_user.id
    r = db.execute(
        text(
            """
            INSERT INTO trampas_revisiones (
                trampa_id, numero_semana, fecha_revision, status_revision_id,
                tipo_producto, dias_exposicion, observaciones,
                usuario_id, validado, estatus_id,
                created_by_user_id, updated_by_user_id,
                created_at, updated_at, created_date, edited_date
            ) VALUES (
                :trampa_id, :numero_semana, :fecha_revision, :status_revision_id,
                :tipo_producto, :dias_exposicion, :observaciones,
                :user_id, :validado, :estatus_id,
                :user_id, :user_id,
                NOW(), NOW(), CURDATE(), CURDATE()
            )
            """
        ),
        params,
    )
    new_id = int(r.lastrowid)
    audit_catalog_change(db, catalogo="trampas_revisiones", registro_id=new_id, accion="CREATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=None, datos_nuevos=payload.model_dump(mode="json"),
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="create-revision", metodo="POST", path="/revisiones",
        estado_afectado_id=trampa.get("estado_id"),
        recurso_tipo="trampas_revisiones", recurso_id=str(new_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="INSERT INTO trampas_revisiones (...) VALUES (...)",
        resultado_status=201, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE r.id = :id"), {"id": new_id}).mappings().first()
    return _to_response(dict(row))


@router.put("/{revision_id}", response_model=RevisionResponse)
def update_revision(
    revision_id: int,
    payload: RevisionUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> RevisionResponse:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM trampas_revisiones WHERE id = :id"), {"id": revision_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Revisión no encontrada")
    _ensure_trampa_in_scope(db, int(prev["trampa_id"]), current_user, current_state_id)

    if payload.trampa_id != prev["trampa_id"]:
        _ensure_trampa_in_scope(db, payload.trampa_id, current_user, current_state_id)
    semana_changed = payload.numero_semana != prev["numero_semana"] or payload.trampa_id != prev["trampa_id"]
    if payload.numero_semana is not None and semana_changed:
        dup = db.execute(
            text("SELECT id FROM trampas_revisiones WHERE trampa_id = :t AND numero_semana = :s AND id <> :id"),
            {"t": payload.trampa_id, "s": payload.numero_semana, "id": revision_id},
        ).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe revisión de esa trampa para esa semana")

    params = _payload_to_params(payload)
    params["user_id"] = current_user.id
    params["id"] = revision_id
    db.execute(
        text(
            """
            UPDATE trampas_revisiones SET
                trampa_id=:trampa_id, numero_semana=:numero_semana,
                fecha_revision=:fecha_revision, status_revision_id=:status_revision_id,
                tipo_producto=:tipo_producto, dias_exposicion=:dias_exposicion,
                observaciones=:observaciones, validado=:validado,
                estatus_id=:estatus_id, updated_by_user_id=:user_id
            WHERE id=:id
            """
        ),
        params,
    )
    audit_catalog_change(db, catalogo="trampas_revisiones", registro_id=revision_id, accion="UPDATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos=payload.model_dump(mode="json"),
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="update-revision", metodo="PUT", path=f"/revisiones/{revision_id}",
        recurso_tipo="trampas_revisiones", recurso_id=str(revision_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="UPDATE trampas_revisiones SET ... WHERE id = :id",
        resultado_status=200, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE r.id = :id"), {"id": revision_id}).mappings().first()
    return _to_response(dict(row))


@router.delete("/{revision_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_revision(
    revision_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM trampas_revisiones WHERE id = :id"), {"id": revision_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Revisión no encontrada")
    _ensure_trampa_in_scope(db, int(prev["trampa_id"]), current_user, current_state_id)

    db.execute(text("UPDATE trampas_revisiones SET estatus_id=2, updated_by_user_id=:u WHERE id=:id"),
               {"u": current_user.id, "id": revision_id})
    audit_catalog_change(db, catalogo="trampas_revisiones", registro_id=revision_id, accion="DELETE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="inactivate-revision", metodo="DELETE",
        path=f"/revisiones/{revision_id}", recurso_tipo="trampas_revisiones", recurso_id=str(revision_id),
        datos_request={"estatus_id": 2},
        sql_query="UPDATE trampas_revisiones SET estatus_id = 2 WHERE id = :id",
        resultado_status=204, ip_origen=request.client.host if request.client else None)
    db.commit()
