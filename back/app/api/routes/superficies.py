"""Endpoints de superficies registradas V3.

Una fila por (unidad_produccion, variedad). Hectáreas + estado fenológico
+ facturación. Multi-tenant indirecto vía unidad.
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
    SuperficieRegistradaCreate,
    SuperficieRegistradaListResponse,
    SuperficieRegistradaResponse,
    SuperficieRegistradaUpdate,
)

router = APIRouter()

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


def _to_response(row: dict[str, Any]) -> SuperficieRegistradaResponse:
    def _i(k: str) -> int | None:
        v = row.get(k)
        return int(v) if v is not None else None
    def _f(k: str) -> float | None:
        v = row.get(k)
        return float(v) if v is not None else None

    return SuperficieRegistradaResponse(
        id=int(row["id"]),
        unidad_produccion_id=int(row.get("unidad_produccion_id") or 0),
        variedad_id=int(row.get("variedad_id") or 0),
        superficie=_f("superficie"),
        fenologia_id=_i("fenologia_id"),
        facturado=int(row.get("facturado") or 0),
        folio_factura=row.get("folio_factura"),
        ejercicio_fiscal=row.get("ejercicio_fiscal"),
        estatus_id=int(row.get("estatus_id") or 1),
        unidad_produccion_ni=row.get("unidad_produccion_ni"),
        unidad_produccion_nombre=row.get("unidad_produccion_nombre"),
        variedad_nombre=row.get("variedad_nombre"),
        fenologia_descripcion=row.get("fenologia_descripcion"),
    )


_BASE_SELECT = """
    SELECT s.id, s.unidad_produccion_id, s.variedad_id,
           s.superficie, s.fenologia_id, s.facturado,
           s.folio_factura, s.ejercicio_fiscal, s.estatus_id,
           u.numero_inscripcion AS unidad_produccion_ni,
           u.nombre_unidad AS unidad_produccion_nombre,
           v.nombre AS variedad_nombre,
           f.descripcion AS fenologia_descripcion
    FROM superficies_registradas s
    LEFT JOIN unidades_produccion u ON u.id = s.unidad_produccion_id
    LEFT JOIN variedades v ON v.id = s.variedad_id
    LEFT JOIN estados_fenologicos f ON f.id = s.fenologia_id
"""


@router.get("/listado", response_model=SuperficieRegistradaListResponse)
def list_superficies(
    estatus_id: int | None = Query(default=None),
    unidad_produccion_id: int | None = Query(default=None),
    variedad_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> SuperficieRegistradaListResponse:
    _ensure_access(current_user)
    offset = (page - 1) * page_size
    where = """
        WHERE u.estado_id = :estado_id
          AND (:estatus_id IS NULL OR s.estatus_id = :estatus_id)
          AND (:up_id IS NULL OR s.unidad_produccion_id = :up_id)
          AND (:variedad_id IS NULL OR s.variedad_id = :variedad_id)
    """
    params = {
        "estado_id": current_state_id, "estatus_id": estatus_id,
        "up_id": unidad_produccion_id, "variedad_id": variedad_id,
        "limit": page_size, "offset": offset,
    }
    total = int(db.execute(
        text(f"SELECT COUNT(*) FROM superficies_registradas s LEFT JOIN unidades_produccion u ON u.id = s.unidad_produccion_id {where}"),
        params,
    ).scalar_one())
    rows = db.execute(
        text(f"{_BASE_SELECT} {where} ORDER BY u.numero_inscripcion ASC, v.nombre ASC LIMIT :limit OFFSET :offset"),
        params,
    ).mappings().all()
    return SuperficieRegistradaListResponse(items=[_to_response(dict(r)) for r in rows], total=total, page=page, page_size=page_size)


@router.post("", response_model=SuperficieRegistradaResponse, status_code=status.HTTP_201_CREATED)
def create_superficie(
    payload: SuperficieRegistradaCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> SuperficieRegistradaResponse:
    _ensure_access(current_user)
    target_estado = _ensure_unidad_in_scope(db, payload.unidad_produccion_id, current_user, current_state_id)

    if db.execute(
        text("SELECT id FROM superficies_registradas WHERE unidad_produccion_id = :u AND variedad_id = :v"),
        {"u": payload.unidad_produccion_id, "v": payload.variedad_id},
    ).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe registro de superficie para esa unidad y variedad")

    r = db.execute(
        text(
            """
            INSERT INTO superficies_registradas (
                unidad_produccion_id, variedad_id, superficie, fenologia_id,
                facturado, folio_factura, ejercicio_fiscal, estatus_id,
                created_by_user_id, updated_by_user_id,
                created_at, updated_at, created_date, edited_date
            ) VALUES (
                :u, :v, :superficie, :fenologia_id,
                :facturado, :folio_factura, :ejercicio_fiscal, :estatus_id,
                :user_id, :user_id,
                NOW(), NOW(), CURDATE(), CURDATE()
            )
            """
        ),
        {
            "u": payload.unidad_produccion_id, "v": payload.variedad_id,
            "superficie": payload.superficie, "fenologia_id": payload.fenologia_id,
            "facturado": payload.facturado, "folio_factura": payload.folio_factura,
            "ejercicio_fiscal": payload.ejercicio_fiscal,
            "estatus_id": payload.estatus_id, "user_id": current_user.id,
        },
    )
    new_id = int(r.lastrowid)
    audit_catalog_change(db, catalogo="superficies_registradas", registro_id=new_id, accion="CREATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=None, datos_nuevos={**payload.model_dump(mode="json"), "estado_id": target_estado},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="create-superficie",
        metodo="POST", path="/superficies", estado_afectado_id=target_estado,
        recurso_tipo="superficies_registradas", recurso_id=str(new_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="INSERT INTO superficies_registradas (...)",
        resultado_status=201, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE s.id = :id"), {"id": new_id}).mappings().first()
    return _to_response(dict(row))


@router.put("/{superficie_id}", response_model=SuperficieRegistradaResponse)
def update_superficie(
    superficie_id: int,
    payload: SuperficieRegistradaUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> SuperficieRegistradaResponse:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM superficies_registradas WHERE id = :id"), {"id": superficie_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Superficie no encontrada")
    _ensure_unidad_in_scope(db, int(prev["unidad_produccion_id"]), current_user, current_state_id)

    db.execute(
        text(
            """
            UPDATE superficies_registradas SET
                superficie=:superficie, fenologia_id=:fenologia_id,
                facturado=:facturado, folio_factura=:folio_factura,
                ejercicio_fiscal=:ejercicio_fiscal, estatus_id=:estatus_id,
                updated_by_user_id=:user_id
            WHERE id=:id
            """
        ),
        {
            "superficie": payload.superficie, "fenologia_id": payload.fenologia_id,
            "facturado": payload.facturado, "folio_factura": payload.folio_factura,
            "ejercicio_fiscal": payload.ejercicio_fiscal,
            "estatus_id": payload.estatus_id,
            "user_id": current_user.id, "id": superficie_id,
        },
    )
    audit_catalog_change(db, catalogo="superficies_registradas", registro_id=superficie_id, accion="UPDATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos=payload.model_dump(mode="json"),
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="update-superficie",
        metodo="PUT", path=f"/superficies/{superficie_id}",
        recurso_tipo="superficies_registradas", recurso_id=str(superficie_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="UPDATE superficies_registradas SET ... WHERE id = :id",
        resultado_status=200, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE s.id = :id"), {"id": superficie_id}).mappings().first()
    return _to_response(dict(row))


@router.delete("/{superficie_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_superficie(
    superficie_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM superficies_registradas WHERE id = :id"), {"id": superficie_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Superficie no encontrada")
    _ensure_unidad_in_scope(db, int(prev["unidad_produccion_id"]), current_user, current_state_id)
    db.execute(text("UPDATE superficies_registradas SET estatus_id=2, updated_by_user_id=:u WHERE id=:id"),
               {"u": current_user.id, "id": superficie_id})
    audit_catalog_change(db, catalogo="superficies_registradas", registro_id=superficie_id, accion="DELETE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="inactivate-superficie",
        metodo="DELETE", path=f"/superficies/{superficie_id}",
        recurso_tipo="superficies_registradas", recurso_id=str(superficie_id),
        datos_request={"estatus_id": 2},
        sql_query="UPDATE superficies_registradas SET estatus_id = 2 WHERE id = :id",
        resultado_status=204, ip_origen=request.client.host if request.client else None)
    db.commit()
