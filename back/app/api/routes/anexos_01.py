"""Endpoints de Anexo 01 V3.

Documento que acompana al TMIMF con datos de origen del productor
(ubicacion, superficies, variedades, plagas objetivo, medidas).
Multi-tenant por estado_id directo.
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
    Anexo01Create,
    Anexo01ListResponse,
    Anexo01Response,
    Anexo01Update,
)

router = APIRouter()

ALLOWED_ROLES = {"admin", "administrador general", "administrador estatal", "administrador senasica"}


def _ensure_access(user: User) -> None:
    if (user.rol or "").strip().lower() not in ALLOWED_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


def _scope_state(user: User, current_state_id: int, requested: int) -> int:
    if not is_elevated(user) and requested != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    return requested


def _to_response(row: dict[str, Any]) -> Anexo01Response:
    def _i(k: str) -> int | None:
        v = row.get(k)
        return int(v) if v is not None else None

    return Anexo01Response(
        id=int(row["id"]),
        productor_id=int(row["productor_id"]),
        municipio_id=int(row["municipio_id"]),
        estado_id=int(row["estado_id"]),
        colonia_id=_i("colonia_id"),
        calle=row.get("calle"),
        numero=row.get("numero"),
        codigo_postal=row.get("codigo_postal") or "",
        destino=row.get("destino"),
        latitud=row.get("latitud"),
        longitud=row.get("longitud"),
        medidas_fitosanitarias=row.get("medidas_fitosanitarias"),
        numero_inscripcion=row.get("numero_inscripcion"),
        nombre_unidad=row.get("nombre_unidad"),
        origen_producto=row.get("origen_producto"),
        superficies=row.get("superficies"),
        variedades=row.get("variedades"),
        volumen_produccion=row.get("volumen_produccion"),
        temporada=row.get("temporada"),
        fecha_emision=row.get("fecha_emision"),
        lugar_emision=row.get("lugar_emision"),
        plagas_objetivo=row.get("plagas_objetivo"),
        ubicacion=row.get("ubicacion"),
        ruta=row.get("ruta"),
        estatus_id=int(row.get("estatus_id") or 1),
        productor_nombre=row.get("productor_nombre"),
        municipio_nombre=row.get("municipio_nombre"),
        estado_nombre=row.get("estado_nombre"),
    )


_BASE_SELECT = """
    SELECT a.id, a.productor_id, a.municipio_id, a.estado_id, a.colonia_id,
           a.calle, a.numero, a.codigo_postal, a.destino, a.latitud, a.longitud,
           a.medidas_fitosanitarias, a.numero_inscripcion, a.nombre_unidad,
           a.origen_producto, a.superficies, a.variedades, a.volumen_produccion,
           a.temporada, a.fecha_emision, a.lugar_emision, a.plagas_objetivo,
           a.ubicacion, a.ruta, a.estatus_id,
           p.razon_social AS productor_nombre,
           m.nombre AS municipio_nombre,
           e.nombre AS estado_nombre
    FROM anexos_01 a
    LEFT JOIN productores p ON p.id = a.productor_id
    LEFT JOIN municipios m ON m.id = a.municipio_id
    LEFT JOIN estados e ON e.id = a.estado_id
"""


@router.get("/listado", response_model=Anexo01ListResponse)
def list_anexos(
    estatus_id: int | None = Query(default=None),
    productor_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> Anexo01ListResponse:
    _ensure_access(current_user)
    offset = (page - 1) * page_size
    where = """
        WHERE a.estado_id = :estado_id
          AND (:estatus_id IS NULL OR a.estatus_id = :estatus_id)
          AND (:productor_id IS NULL OR a.productor_id = :productor_id)
    """
    params = {"estado_id": current_state_id, "estatus_id": estatus_id,
              "productor_id": productor_id, "limit": page_size, "offset": offset}
    total = int(db.execute(text(f"SELECT COUNT(*) FROM anexos_01 a {where}"), params).scalar_one())
    rows = db.execute(
        text(f"{_BASE_SELECT} {where} ORDER BY a.fecha_emision DESC, a.id DESC LIMIT :limit OFFSET :offset"),
        params,
    ).mappings().all()
    return Anexo01ListResponse(items=[_to_response(dict(r)) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/{a_id}", response_model=Anexo01Response)
def get_anexo(
    a_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> Anexo01Response:
    _ensure_access(current_user)
    row = db.execute(text(f"{_BASE_SELECT} WHERE a.id = :id"), {"id": a_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anexo no encontrado")
    if not is_elevated(current_user) and row.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anexo no encontrado")
    return _to_response(dict(row))


def _payload_to_params(payload: Anexo01Create | Anexo01Update, target: int) -> dict[str, Any]:
    return {
        "productor_id": payload.productor_id,
        "municipio_id": payload.municipio_id,
        "estado_id": target,
        "colonia_id": payload.colonia_id,
        "calle": payload.calle,
        "numero": payload.numero,
        "codigo_postal": payload.codigo_postal,
        "destino": payload.destino,
        "latitud": payload.latitud,
        "longitud": payload.longitud,
        "medidas_fitosanitarias": payload.medidas_fitosanitarias,
        "numero_inscripcion": payload.numero_inscripcion,
        "nombre_unidad": payload.nombre_unidad,
        "origen_producto": payload.origen_producto,
        "superficies": payload.superficies,
        "variedades": payload.variedades,
        "volumen_produccion": payload.volumen_produccion,
        "temporada": payload.temporada,
        "fecha_emision": payload.fecha_emision,
        "lugar_emision": payload.lugar_emision,
        "plagas_objetivo": payload.plagas_objetivo,
        "ubicacion": payload.ubicacion,
        "ruta": payload.ruta,
        "estatus_id": payload.estatus_id,
    }


@router.post("", response_model=Anexo01Response, status_code=status.HTTP_201_CREATED)
def create_anexo(
    payload: Anexo01Create,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> Anexo01Response:
    _ensure_access(current_user)
    target = _scope_state(current_user, current_state_id, payload.estado_id)
    params = _payload_to_params(payload, target)
    params["user_id"] = current_user.id
    r = db.execute(
        text(
            """
            INSERT INTO anexos_01 (
                productor_id, municipio_id, estado_id, colonia_id,
                calle, numero, codigo_postal, destino, latitud, longitud,
                medidas_fitosanitarias, numero_inscripcion, nombre_unidad,
                origen_producto, superficies, variedades, volumen_produccion,
                temporada, fecha_emision, lugar_emision,
                plagas_objetivo, ubicacion, ruta, estatus_id,
                created_by_user_id, updated_by_user_id,
                created_at, edited_at, created_date, edited_date
            ) VALUES (
                :productor_id, :municipio_id, :estado_id, :colonia_id,
                :calle, :numero, :codigo_postal, :destino, :latitud, :longitud,
                :medidas_fitosanitarias, :numero_inscripcion, :nombre_unidad,
                :origen_producto, :superficies, :variedades, :volumen_produccion,
                :temporada, :fecha_emision, :lugar_emision,
                :plagas_objetivo, :ubicacion, :ruta, :estatus_id,
                :user_id, :user_id,
                NOW(), NOW(), CURDATE(), CURDATE()
            )
            """
        ),
        params,
    )
    new_id = int(r.lastrowid)
    audit_catalog_change(db, catalogo="anexos_01", registro_id=new_id, accion="CREATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=None, datos_nuevos={**payload.model_dump(mode="json"), "estado_id": target},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="create-anexo-01",
        metodo="POST", path="/anexos-01", estado_afectado_id=target,
        recurso_tipo="anexos_01", recurso_id=str(new_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="INSERT INTO anexos_01 (...)",
        resultado_status=201, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE a.id = :id"), {"id": new_id}).mappings().first()
    return _to_response(dict(row))


@router.put("/{a_id}", response_model=Anexo01Response)
def update_anexo(
    a_id: int,
    payload: Anexo01Update,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> Anexo01Response:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM anexos_01 WHERE id = :id"), {"id": a_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No encontrado")
    if not is_elevated(current_user) and prev.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    target = _scope_state(current_user, current_state_id, payload.estado_id)
    params = _payload_to_params(payload, target)
    params["user_id"] = current_user.id
    params["id"] = a_id
    db.execute(
        text(
            """
            UPDATE anexos_01 SET
                productor_id=:productor_id, municipio_id=:municipio_id, estado_id=:estado_id,
                colonia_id=:colonia_id, calle=:calle, numero=:numero,
                codigo_postal=:codigo_postal, destino=:destino,
                latitud=:latitud, longitud=:longitud,
                medidas_fitosanitarias=:medidas_fitosanitarias,
                numero_inscripcion=:numero_inscripcion, nombre_unidad=:nombre_unidad,
                origen_producto=:origen_producto, superficies=:superficies,
                variedades=:variedades, volumen_produccion=:volumen_produccion,
                temporada=:temporada, fecha_emision=:fecha_emision,
                lugar_emision=:lugar_emision, plagas_objetivo=:plagas_objetivo,
                ubicacion=:ubicacion, ruta=:ruta, estatus_id=:estatus_id,
                updated_by_user_id=:user_id
            WHERE id=:id
            """
        ),
        params,
    )
    audit_catalog_change(db, catalogo="anexos_01", registro_id=a_id, accion="UPDATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos=payload.model_dump(mode="json"),
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="update-anexo-01",
        metodo="PUT", path=f"/anexos-01/{a_id}",
        recurso_tipo="anexos_01", recurso_id=str(a_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="UPDATE anexos_01 SET ... WHERE id = :id",
        resultado_status=200, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE a.id = :id"), {"id": a_id}).mappings().first()
    return _to_response(dict(row))


@router.delete("/{a_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_anexo(
    a_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM anexos_01 WHERE id = :id"), {"id": a_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No encontrado")
    if not is_elevated(current_user) and prev.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    db.execute(text("UPDATE anexos_01 SET estatus_id=2, updated_by_user_id=:u WHERE id=:id"),
               {"u": current_user.id, "id": a_id})
    audit_catalog_change(db, catalogo="anexos_01", registro_id=a_id, accion="DELETE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="inactivate-anexo-01",
        metodo="DELETE", path=f"/anexos-01/{a_id}",
        recurso_tipo="anexos_01", recurso_id=str(a_id),
        datos_request={"estatus_id": 2},
        sql_query="UPDATE anexos_01 SET estatus_id = 2 WHERE id = :id",
        resultado_status=204, ip_origen=request.client.host if request.client else None)
    db.commit()
