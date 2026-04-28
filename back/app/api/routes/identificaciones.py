"""Endpoints de identificaciones de trampa V3.

Una identificación = registro de cuántos especímenes de una especie de mosca
se detectaron en una revisión específica. UNIQUE (revision_id, especie_mosca_id)
asegura que no haya doble conteo de la misma especie en una revisión.

Multi-tenant indirecto: hereda el estado de la trampa de su revisión.
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
    IdentificacionCreate,
    IdentificacionListResponse,
    IdentificacionResponse,
    IdentificacionUpdate,
)

router = APIRouter()

ALLOWED_ROLES = {"admin", "administrador general", "administrador estatal", "administrador senasica"}


def _ensure_access(user: User) -> None:
    if (user.rol or "").strip().lower() not in ALLOWED_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


def _ensure_revision_in_scope(db: Session, revision_id: int, user: User, current_state_id: int) -> dict:
    row = db.execute(
        text(
            """
            SELECT r.id AS revision_id, r.trampa_id, t.estado_id AS trampa_estado_id
            FROM trampas_revisiones r
            LEFT JOIN trampas t ON t.id = r.trampa_id
            WHERE r.id = :id
            """
        ),
        {"id": revision_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Revisión no encontrada")
    if not is_elevated(user) and row.get("trampa_estado_id") not in (current_state_id, None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Revisión fuera de tu estado activo")
    return dict(row)


def _to_response(row: dict[str, Any]) -> IdentificacionResponse:
    def _i(k: str) -> int | None:
        v = row.get(k)
        return int(v) if v is not None else None

    hora = row.get("hora")
    if hora is not None and not isinstance(hora, str):
        hora = str(hora)

    return IdentificacionResponse(
        id=int(row["id"]),
        revision_id=int(row["revision_id"]),
        trampa_id=_i("trampa_id"),
        numero_semana=_i("numero_semana"),
        especie_mosca_id=_i("especie_mosca_id"),
        hembras_silvestre=int(row.get("hembras_silvestre") or 0),
        machos_silvestre=int(row.get("machos_silvestre") or 0),
        hembras_esteril=int(row.get("hembras_esteril") or 0),
        machos_esteril=int(row.get("machos_esteril") or 0),
        tecnico_id=_i("tecnico_id"),
        fecha=row.get("fecha"),
        hora=hora,
        estatus_id=int(row.get("estatus_id") or 1),
        trampa_numero=row.get("trampa_numero"),
        trampa_estado_id=_i("trampa_estado_id"),
        especie_mosca_nombre=row.get("especie_mosca_nombre"),
        tecnico_nombre=row.get("tecnico_nombre"),
    )


_BASE_SELECT = """
    SELECT i.id, i.revision_id, i.trampa_id, i.numero_semana, i.especie_mosca_id,
           i.hembras_silvestre, i.machos_silvestre, i.hembras_esteril, i.machos_esteril,
           i.tecnico_id, i.fecha, i.hora, i.estatus_id,
           t.numero_trampa AS trampa_numero,
           t.estado_id AS trampa_estado_id,
           em.nombre AS especie_mosca_nombre,
           tr.nombre AS tecnico_nombre
    FROM identificaciones_trampa i
    LEFT JOIN trampas t ON t.id = i.trampa_id
    LEFT JOIN especies_mosca em ON em.id = i.especie_mosca_id
    LEFT JOIN tramperos tr ON tr.id = i.tecnico_id
"""


@router.get("/listado", response_model=IdentificacionListResponse)
def list_identificaciones(
    revision_id: int | None = Query(default=None),
    trampa_id: int | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    especie_mosca_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> IdentificacionListResponse:
    _ensure_access(current_user)
    offset = (page - 1) * page_size
    where = """
        WHERE t.estado_id = :estado_id
          AND (:revision_id IS NULL OR i.revision_id = :revision_id)
          AND (:trampa_id IS NULL OR i.trampa_id = :trampa_id)
          AND (:estatus_id IS NULL OR i.estatus_id = :estatus_id)
          AND (:especie_id IS NULL OR i.especie_mosca_id = :especie_id)
    """
    params = {
        "estado_id": current_state_id, "revision_id": revision_id, "trampa_id": trampa_id,
        "estatus_id": estatus_id, "especie_id": especie_mosca_id,
        "limit": page_size, "offset": offset,
    }
    total = int(db.execute(
        text(f"SELECT COUNT(*) FROM identificaciones_trampa i LEFT JOIN trampas t ON t.id = i.trampa_id {where}"),
        params,
    ).scalar_one())
    rows = db.execute(
        text(f"{_BASE_SELECT} {where} ORDER BY i.fecha DESC, i.id DESC LIMIT :limit OFFSET :offset"),
        params,
    ).mappings().all()
    return IdentificacionListResponse(items=[_to_response(dict(r)) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/{ident_id}", response_model=IdentificacionResponse)
def get_identificacion(
    ident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> IdentificacionResponse:
    _ensure_access(current_user)
    row = db.execute(text(f"{_BASE_SELECT} WHERE i.id = :id"), {"id": ident_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Identificación no encontrada")
    if not is_elevated(current_user) and row.get("trampa_estado_id") not in (current_state_id, None):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Identificación no encontrada")
    return _to_response(dict(row))


def _payload_to_params(payload: IdentificacionCreate | IdentificacionUpdate) -> dict[str, Any]:
    return {
        "revision_id": payload.revision_id,
        "trampa_id": payload.trampa_id,
        "numero_semana": payload.numero_semana,
        "especie_mosca_id": payload.especie_mosca_id,
        "hembras_silvestre": payload.hembras_silvestre,
        "machos_silvestre": payload.machos_silvestre,
        "hembras_esteril": payload.hembras_esteril,
        "machos_esteril": payload.machos_esteril,
        "tecnico_id": payload.tecnico_id,
        "fecha": payload.fecha,
        "hora": payload.hora,
        "estatus_id": payload.estatus_id,
    }


@router.post("", response_model=IdentificacionResponse, status_code=status.HTTP_201_CREATED)
def create_identificacion(
    payload: IdentificacionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> IdentificacionResponse:
    _ensure_access(current_user)
    rev = _ensure_revision_in_scope(db, payload.revision_id, current_user, current_state_id)

    if payload.especie_mosca_id is not None:
        dup = db.execute(
            text("SELECT id FROM identificaciones_trampa WHERE revision_id = :r AND especie_mosca_id = :e"),
            {"r": payload.revision_id, "e": payload.especie_mosca_id},
        ).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe identificación de esa especie en esta revisión")

    params = _payload_to_params(payload)
    if params.get("trampa_id") is None:
        params["trampa_id"] = rev.get("trampa_id")
    params["user_id"] = current_user.id

    r = db.execute(
        text(
            """
            INSERT INTO identificaciones_trampa (
                revision_id, trampa_id, numero_semana, especie_mosca_id,
                hembras_silvestre, machos_silvestre, hembras_esteril, machos_esteril,
                tecnico_id, fecha, hora, usuario_id, estatus_id,
                created_by_user_id, updated_by_user_id,
                created_at, updated_at, created_date, edited_date
            ) VALUES (
                :revision_id, :trampa_id, :numero_semana, :especie_mosca_id,
                :hembras_silvestre, :machos_silvestre, :hembras_esteril, :machos_esteril,
                :tecnico_id, :fecha, :hora, :user_id, :estatus_id,
                :user_id, :user_id,
                NOW(), NOW(), CURDATE(), CURDATE()
            )
            """
        ),
        params,
    )
    new_id = int(r.lastrowid)
    audit_catalog_change(db, catalogo="identificaciones_trampa", registro_id=new_id, accion="CREATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=None, datos_nuevos=payload.model_dump(mode="json"),
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="create-identificacion", metodo="POST",
        path="/identificaciones", estado_afectado_id=rev.get("trampa_estado_id"),
        recurso_tipo="identificaciones_trampa", recurso_id=str(new_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="INSERT INTO identificaciones_trampa (...) VALUES (...)",
        resultado_status=201, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE i.id = :id"), {"id": new_id}).mappings().first()
    return _to_response(dict(row))


@router.put("/{ident_id}", response_model=IdentificacionResponse)
def update_identificacion(
    ident_id: int,
    payload: IdentificacionUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> IdentificacionResponse:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM identificaciones_trampa WHERE id = :id"), {"id": ident_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Identificación no encontrada")
    _ensure_revision_in_scope(db, int(prev["revision_id"]), current_user, current_state_id)

    if payload.revision_id != prev["revision_id"]:
        _ensure_revision_in_scope(db, payload.revision_id, current_user, current_state_id)

    rev_or_especie_changed = (
        payload.revision_id != prev["revision_id"]
        or payload.especie_mosca_id != prev["especie_mosca_id"]
    )
    if rev_or_especie_changed and payload.especie_mosca_id is not None:
        dup = db.execute(
            text("SELECT id FROM identificaciones_trampa WHERE revision_id = :r AND especie_mosca_id = :e AND id <> :id"),
            {"r": payload.revision_id, "e": payload.especie_mosca_id, "id": ident_id},
        ).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe esa especie en esa revisión")

    params = _payload_to_params(payload)
    params["user_id"] = current_user.id
    params["id"] = ident_id
    db.execute(
        text(
            """
            UPDATE identificaciones_trampa SET
                revision_id=:revision_id, trampa_id=:trampa_id,
                numero_semana=:numero_semana, especie_mosca_id=:especie_mosca_id,
                hembras_silvestre=:hembras_silvestre, machos_silvestre=:machos_silvestre,
                hembras_esteril=:hembras_esteril, machos_esteril=:machos_esteril,
                tecnico_id=:tecnico_id, fecha=:fecha, hora=:hora,
                estatus_id=:estatus_id, updated_by_user_id=:user_id
            WHERE id=:id
            """
        ),
        params,
    )
    audit_catalog_change(db, catalogo="identificaciones_trampa", registro_id=ident_id, accion="UPDATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos=payload.model_dump(mode="json"),
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="update-identificacion", metodo="PUT",
        path=f"/identificaciones/{ident_id}", recurso_tipo="identificaciones_trampa",
        recurso_id=str(ident_id), datos_request=payload.model_dump(mode="json"),
        sql_query="UPDATE identificaciones_trampa SET ... WHERE id = :id",
        resultado_status=200, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE i.id = :id"), {"id": ident_id}).mappings().first()
    return _to_response(dict(row))


@router.delete("/{ident_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_identificacion(
    ident_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM identificaciones_trampa WHERE id = :id"), {"id": ident_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Identificación no encontrada")
    _ensure_revision_in_scope(db, int(prev["revision_id"]), current_user, current_state_id)

    db.execute(text("UPDATE identificaciones_trampa SET estatus_id=2, updated_by_user_id=:u WHERE id=:id"),
               {"u": current_user.id, "id": ident_id})
    audit_catalog_change(db, catalogo="identificaciones_trampa", registro_id=ident_id, accion="DELETE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="inactivate-identificacion", metodo="DELETE",
        path=f"/identificaciones/{ident_id}", recurso_tipo="identificaciones_trampa",
        recurso_id=str(ident_id), datos_request={"estatus_id": 2},
        sql_query="UPDATE identificaciones_trampa SET estatus_id = 2 WHERE id = :id",
        resultado_status=204, ip_origen=request.client.host if request.client else None)
    db.commit()
