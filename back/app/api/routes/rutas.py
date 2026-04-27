"""Endpoints de rutas de trampeo V3.

Mismo patrón que productores/unidades: multi-tenant por estado_activo_id,
RBAC, soft-delete, auditoría doble. UNIQUE compuesta (estado_id, nombre)
en BD evita duplicados; el endpoint también valida antes para devolver 409
en lugar de un error 500 de constraint.
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
    RutaCreate,
    RutaListResponse,
    RutaResponse,
    RutaUpdate,
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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para gestionar rutas")


def _scope_state(current_user: User, current_state_id: int, requested_estado_id: int | None) -> int:
    target = requested_estado_id if requested_estado_id is not None else current_state_id
    if not is_elevated(current_user) and target != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes operar rutas fuera de tu estado activo")
    return target


def _to_response(row: dict[str, Any]) -> RutaResponse:
    def _i(k: str) -> int | None:
        v = row.get(k)
        return int(v) if v is not None else None

    return RutaResponse(
        id=int(row["id"]),
        nombre=str(row["nombre"]),
        modulo_id=_i("modulo_id"),
        pfa_id=_i("pfa_id"),
        fecha_primera_revision=row.get("fecha_primera_revision"),
        dia_revision=row.get("dia_revision"),
        tipo_folio=row.get("tipo_folio"),
        inicial_ruta=row.get("inicial_ruta"),
        descripcion=row.get("descripcion"),
        capturista_id=_i("capturista_id"),
        trampero_id=_i("trampero_id"),
        figura_cooperadora_id=_i("figura_cooperadora_id"),
        estado_id=_i("estado_id"),
        estatus_id=int(row.get("estatus_id") or 1),
        estado_nombre=row.get("estado_nombre"),
        modulo_nombre=row.get("modulo_nombre"),
        capturista_nombre=row.get("capturista_nombre"),
        trampero_nombre=row.get("trampero_nombre"),
        figura_cooperadora_nombre=row.get("figura_cooperadora_nombre"),
    )


_BASE_SELECT = """
    SELECT r.id, r.nombre, r.modulo_id, r.pfa_id, r.fecha_primera_revision,
           r.dia_revision, r.tipo_folio, r.inicial_ruta, r.descripcion,
           r.capturista_id, r.trampero_id, r.figura_cooperadora_id,
           r.estado_id, r.estatus_id,
           e.nombre AS estado_nombre,
           m.nombre AS modulo_nombre,
           cu.nombre AS capturista_nombre,
           tr.nombre AS trampero_nombre,
           fc.nombre AS figura_cooperadora_nombre
    FROM rutas r
    LEFT JOIN estados e ON e.id = r.estado_id
    LEFT JOIN modulos m ON m.id = r.modulo_id
    LEFT JOIN usuarios cu ON cu.id = r.capturista_id
    LEFT JOIN tramperos tr ON tr.id = r.trampero_id
    LEFT JOIN figura_cooperadora fc ON fc.id = r.figura_cooperadora_id
"""


@router.get("/listado", response_model=RutaListResponse)
def list_rutas(
    q: str | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    modulo_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> RutaListResponse:
    _ensure_access(current_user)
    offset = (page - 1) * page_size
    search = f"%{q.strip()}%" if q and q.strip() else None

    where_clause = """
        WHERE r.estado_id = :estado_id
          AND (:estatus_id IS NULL OR r.estatus_id = :estatus_id)
          AND (:modulo_id IS NULL OR r.modulo_id = :modulo_id)
          AND (
              :search IS NULL
              OR r.nombre LIKE :search
              OR r.tipo_folio LIKE :search
              OR r.descripcion LIKE :search
          )
    """
    params = {
        "estado_id": current_state_id,
        "estatus_id": estatus_id,
        "modulo_id": modulo_id,
        "search": search,
        "limit": page_size,
        "offset": offset,
    }

    total = int(db.execute(text(f"SELECT COUNT(*) FROM rutas r {where_clause}"), params).scalar_one())

    rows = db.execute(
        text(f"{_BASE_SELECT} {where_clause} ORDER BY r.nombre ASC LIMIT :limit OFFSET :offset"),
        params,
    ).mappings().all()

    return RutaListResponse(
        items=[_to_response(dict(r)) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{ruta_id}", response_model=RutaResponse)
def get_ruta(
    ruta_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> RutaResponse:
    _ensure_access(current_user)
    row = db.execute(text(f"{_BASE_SELECT} WHERE r.id = :id"), {"id": ruta_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ruta no encontrada")
    if not is_elevated(current_user) and row.get("estado_id") not in (current_state_id, None):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ruta no encontrada")
    return _to_response(dict(row))


def _payload_to_params(payload: RutaCreate | RutaUpdate, target_estado_id: int) -> dict[str, Any]:
    return {
        "nombre": payload.nombre.strip(),
        "modulo_id": payload.modulo_id,
        "pfa_id": payload.pfa_id,
        "fecha_primera_revision": payload.fecha_primera_revision,
        "dia_revision": payload.dia_revision,
        "tipo_folio": payload.tipo_folio,
        "inicial_ruta": payload.inicial_ruta,
        "descripcion": payload.descripcion,
        "capturista_id": payload.capturista_id,
        "trampero_id": payload.trampero_id,
        "figura_cooperadora_id": payload.figura_cooperadora_id,
        "estado_id": target_estado_id,
        "estatus_id": payload.estatus_id,
    }


@router.post("", response_model=RutaResponse, status_code=status.HTTP_201_CREATED)
def create_ruta(
    payload: RutaCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> RutaResponse:
    _ensure_access(current_user)
    target_estado_id = _scope_state(current_user, current_state_id, payload.estado_id)

    dup = db.execute(
        text("SELECT id FROM rutas WHERE estado_id = :e AND nombre = :n"),
        {"e": target_estado_id, "n": payload.nombre.strip()},
    ).first()
    if dup:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe una ruta con ese nombre en el estado")

    params = _payload_to_params(payload, target_estado_id)
    params["user_id"] = current_user.id

    insert = db.execute(
        text(
            """
            INSERT INTO rutas (
                nombre, modulo_id, pfa_id, fecha_primera_revision,
                dia_revision, tipo_folio, inicial_ruta, descripcion,
                capturista_id, trampero_id, figura_cooperadora_id,
                estado_id, estatus_id,
                created_by, updated_by_user_id, fecha_int,
                created_at, updated_at, created_date, edited_date
            ) VALUES (
                :nombre, :modulo_id, :pfa_id, :fecha_primera_revision,
                :dia_revision, :tipo_folio, :inicial_ruta, :descripcion,
                :capturista_id, :trampero_id, :figura_cooperadora_id,
                :estado_id, :estatus_id,
                :user_id, :user_id, UNIX_TIMESTAMP(),
                NOW(), NOW(), CURDATE(), CURDATE()
            )
            """
        ),
        params,
    )
    new_id = int(insert.lastrowid)

    audit_catalog_change(
        db, catalogo="rutas", registro_id=new_id, accion="CREATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=None,
        datos_nuevos={**payload.model_dump(mode="json"), "estado_id": target_estado_id},
        ip_origen=request.client.host if request.client else None,
    )
    audit_senasica(
        db, user=current_user, accion="create-ruta",
        metodo="POST", path="/rutas",
        estado_afectado_id=target_estado_id,
        recurso_tipo="rutas", recurso_id=str(new_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="INSERT INTO rutas (...) VALUES (...)",
        resultado_status=201, ip_origen=request.client.host if request.client else None,
    )
    db.commit()

    row = db.execute(text(f"{_BASE_SELECT} WHERE r.id = :id"), {"id": new_id}).mappings().first()
    return _to_response(dict(row))


@router.put("/{ruta_id}", response_model=RutaResponse)
def update_ruta(
    ruta_id: int,
    payload: RutaUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> RutaResponse:
    _ensure_access(current_user)

    previous = db.execute(text("SELECT * FROM rutas WHERE id = :id"), {"id": ruta_id}).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ruta no encontrada")
    if not is_elevated(current_user) and previous.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes editar rutas fuera de tu estado activo")

    target_estado_id = _scope_state(current_user, current_state_id, payload.estado_id)

    if payload.nombre.strip() != previous["nombre"] or target_estado_id != previous["estado_id"]:
        dup = db.execute(
            text("SELECT id FROM rutas WHERE estado_id = :e AND nombre = :n AND id <> :id"),
            {"e": target_estado_id, "n": payload.nombre.strip(), "id": ruta_id},
        ).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe otra ruta con ese nombre en el estado")

    params = _payload_to_params(payload, target_estado_id)
    params["user_id"] = current_user.id
    params["id"] = ruta_id

    db.execute(
        text(
            """
            UPDATE rutas SET
                nombre = :nombre,
                modulo_id = :modulo_id,
                pfa_id = :pfa_id,
                fecha_primera_revision = :fecha_primera_revision,
                dia_revision = :dia_revision,
                tipo_folio = :tipo_folio,
                inicial_ruta = :inicial_ruta,
                descripcion = :descripcion,
                capturista_id = :capturista_id,
                trampero_id = :trampero_id,
                figura_cooperadora_id = :figura_cooperadora_id,
                estado_id = :estado_id,
                estatus_id = :estatus_id,
                updated_by_user_id = :user_id
            WHERE id = :id
            """
        ),
        params,
    )

    audit_catalog_change(
        db, catalogo="rutas", registro_id=ruta_id, accion="UPDATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(previous),
        datos_nuevos={**payload.model_dump(mode="json"), "estado_id": target_estado_id},
        ip_origen=request.client.host if request.client else None,
    )
    audit_senasica(
        db, user=current_user, accion="update-ruta",
        metodo="PUT", path=f"/rutas/{ruta_id}",
        estado_afectado_id=target_estado_id,
        recurso_tipo="rutas", recurso_id=str(ruta_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="UPDATE rutas SET ... WHERE id = :id",
        resultado_status=200, ip_origen=request.client.host if request.client else None,
    )
    db.commit()

    row = db.execute(text(f"{_BASE_SELECT} WHERE r.id = :id"), {"id": ruta_id}).mappings().first()
    return _to_response(dict(row))


@router.delete("/{ruta_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ruta(
    ruta_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    _ensure_access(current_user)
    previous = db.execute(text("SELECT * FROM rutas WHERE id = :id"), {"id": ruta_id}).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ruta no encontrada")
    if not is_elevated(current_user) and previous.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes inactivar rutas fuera de tu estado activo")

    db.execute(
        text("UPDATE rutas SET estatus_id = 2, updated_by_user_id = :u WHERE id = :id"),
        {"u": current_user.id, "id": ruta_id},
    )
    audit_catalog_change(
        db, catalogo="rutas", registro_id=ruta_id, accion="DELETE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(previous), datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None,
    )
    audit_senasica(
        db, user=current_user, accion="inactivate-ruta",
        metodo="DELETE", path=f"/rutas/{ruta_id}",
        estado_afectado_id=int(previous.get("estado_id")) if previous.get("estado_id") is not None else None,
        recurso_tipo="rutas", recurso_id=str(ruta_id),
        datos_request={"estatus_id": 2},
        sql_query="UPDATE rutas SET estatus_id = 2 WHERE id = :id",
        resultado_status=204, ip_origen=request.client.host if request.client else None,
    )
    db.commit()
