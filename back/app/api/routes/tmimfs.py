"""Endpoints de TMIMF V3 (Tarjeta de Movimiento Interestatal).

Recurso central del sistema: cada TMIMF emite una tarjeta para movilizar
mercancías fitosanitarias entre estados. Tiene N detallados (sub-folios)
y opcionalmente un registro en `cancelaciones` cuando se invalida.

Multi-tenant por estado_activo_id. Cancelar requiere motivo y registra
en `cancelaciones` + audit_senasica.
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
    TmimfCancelRequest,
    TmimfCreate,
    TmimfDetalleCreate,
    TmimfDetalleListResponse,
    TmimfDetalleResponse,
    TmimfDetalleUpdate,
    TmimfListResponse,
    TmimfResponse,
    TmimfUpdate,
)

router = APIRouter()

ALLOWED_ROLES = {"admin", "administrador general", "administrador estatal", "administrador senasica"}
VALID_TIPOS_TARJETA = {"M", "O"}  # I=Inválidas se evita por convención


def _ensure_access(user: User) -> None:
    if (user.rol or "").strip().lower() not in ALLOWED_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


def _scope_state(user: User, current_state_id: int, requested: int | None) -> int:
    target = requested if requested is not None else current_state_id
    if not is_elevated(user) and target != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    return target


def _to_tmimf_response(row: dict[str, Any]) -> TmimfResponse:
    def _i(k: str) -> int | None:
        v = row.get(k)
        return int(v) if v is not None else None

    return TmimfResponse(
        id=int(row["id"]),
        folio_tmimf=str(row["folio_tmimf"]),
        subfolio=_i("subfolio"),
        folio_original=row.get("folio_original"),
        unidad_produccion_id=_i("unidad_produccion_id"),
        tipo_tarjeta=str(row.get("tipo_tarjeta") or "M"),
        pais=str(row.get("pais") or "MEX"),
        ruta_id=_i("ruta_id"),
        modulo_emisor_id=_i("modulo_emisor_id"),
        mercado_id=_i("mercado_id"),
        tipo_transporte_id=_i("tipo_transporte_id"),
        placas_transporte=row.get("placas_transporte"),
        funcionario_aprobo_id=_i("funcionario_aprobo_id"),
        semana=row.get("semana"),
        fecha_emision=row.get("fecha_emision"),
        hora_emision=str(row["hora_emision"]) if row.get("hora_emision") is not None else None,
        vigencia_tarjeta=_i("vigencia_tarjeta"),
        fecha_vencimiento=row.get("fecha_vencimiento"),
        clave_movilizacion=str(row.get("clave_movilizacion") or ""),
        nombre_pfa=row.get("nombre_pfa"),
        cfmn=row.get("cfmn"),
        estado_id=_i("estado_id"),
        estatus_bloqueo=str(row.get("estatus_bloqueo") or "N"),
        resuelto=int(row.get("resuelto") or 0),
        facturado=int(row.get("facturado") or 0),
        estatus_id=int(row.get("estatus_id") or 1),
        fecha_cancelacion=row.get("fecha_cancelacion"),
        motivo_cancelacion=row.get("motivo_cancelacion"),
        estado_nombre=row.get("estado_nombre"),
        unidad_produccion_ni=row.get("unidad_produccion_ni"),
        unidad_produccion_nombre=row.get("unidad_produccion_nombre"),
        ruta_nombre=row.get("ruta_nombre"),
        modulo_emisor_nombre=row.get("modulo_emisor_nombre"),
        mercado_nombre=row.get("mercado_nombre"),
        tipo_transporte_nombre=row.get("tipo_transporte_nombre"),
        funcionario_aprobo_nombre=row.get("funcionario_aprobo_nombre"),
    )


def _to_det_response(row: dict[str, Any]) -> TmimfDetalleResponse:
    def _i(k: str) -> int | None:
        v = row.get(k)
        return int(v) if v is not None else None
    def _f(k: str) -> float | None:
        v = row.get(k)
        return float(v) if v is not None else None

    return TmimfDetalleResponse(
        id=int(row["id"]),
        tmimf_id=int(row["tmimf_id"]),
        sub_folio=int(row.get("sub_folio") or 0),
        unidad_produccion_id=_i("unidad_produccion_id"),
        variedad_id=_i("variedad_id"),
        cantidad_movilizada=_f("cantidad_movilizada"),
        saldo=float(row.get("saldo") or 0),
        cajas_14=_i("cajas_14"), cajas_15=_i("cajas_15"), cajas_16=_i("cajas_16"),
        cajas_18=_i("cajas_18"), cajas_20=_i("cajas_20"), cajas_25=_i("cajas_25"),
        cajas_30=_i("cajas_30"), granel=_i("granel"),
        tipo_vehiculo_id=_i("tipo_vehiculo_id"),
        placas=row.get("placas"),
        semana=_i("semana"),
        estado_id=_i("estado_id"),
        estatus_id=int(row.get("estatus_id") or 1),
        variedad_nombre=row.get("variedad_nombre"),
        unidad_produccion_ni=row.get("unidad_produccion_ni"),
        tipo_vehiculo_nombre=row.get("tipo_vehiculo_nombre"),
    )


_BASE_SELECT = """
    SELECT t.id, t.folio_tmimf, t.subfolio, t.folio_original,
           t.unidad_produccion_id, t.tipo_tarjeta, t.pais,
           t.ruta_id, t.modulo_emisor_id, t.mercado_id,
           t.tipo_transporte_id, t.placas_transporte,
           t.funcionario_aprobo_id, t.semana,
           t.fecha_emision, t.hora_emision,
           t.vigencia_tarjeta, t.fecha_vencimiento,
           t.clave_movilizacion, t.nombre_pfa, t.cfmn,
           t.estado_id, t.estatus_bloqueo, t.resuelto, t.facturado, t.estatus_id,
           e.nombre AS estado_nombre,
           u.numero_inscripcion AS unidad_produccion_ni,
           u.nombre_unidad AS unidad_produccion_nombre,
           r.nombre AS ruta_nombre,
           mo.nombre AS modulo_emisor_nombre,
           mk.nombre AS mercado_nombre,
           v.nombre AS tipo_transporte_nombre,
           f.nombre AS funcionario_aprobo_nombre,
           c.fecha_cancelacion AS fecha_cancelacion,
           c.motivo AS motivo_cancelacion
    FROM tmimf t
    LEFT JOIN estados e ON e.id = t.estado_id
    LEFT JOIN unidades_produccion u ON u.id = t.unidad_produccion_id
    LEFT JOIN rutas r ON r.id = t.ruta_id
    LEFT JOIN modulos mo ON mo.id = t.modulo_emisor_id
    LEFT JOIN mercados mk ON mk.id = t.mercado_id
    LEFT JOIN vehiculos v ON v.id = t.tipo_transporte_id
    LEFT JOIN funcionarios f ON f.id = t.funcionario_aprobo_id
    LEFT JOIN cancelaciones c ON c.tipo_documento = 'TMIMF' AND c.folio_documento = t.folio_tmimf
"""


@router.get("/listado", response_model=TmimfListResponse)
def list_tmimfs(
    q: str | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    tipo_tarjeta: str | None = Query(default=None),
    estatus_bloqueo: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TmimfListResponse:
    _ensure_access(current_user)
    offset = (page - 1) * page_size
    search = f"%{q.strip()}%" if q and q.strip() else None
    where = """
        WHERE t.estado_id = :estado_id
          AND (t.tipo_tarjeta <> 'I')
          AND (:estatus_id IS NULL OR t.estatus_id = :estatus_id)
          AND (:tipo_tarjeta IS NULL OR t.tipo_tarjeta = :tipo_tarjeta)
          AND (:estatus_bloqueo IS NULL OR t.estatus_bloqueo = :estatus_bloqueo)
          AND (
              :search IS NULL
              OR t.folio_tmimf LIKE :search
              OR t.folio_original LIKE :search
              OR t.clave_movilizacion LIKE :search
              OR t.placas_transporte LIKE :search
          )
    """
    params = {
        "estado_id": current_state_id, "estatus_id": estatus_id,
        "tipo_tarjeta": tipo_tarjeta, "estatus_bloqueo": estatus_bloqueo,
        "search": search, "limit": page_size, "offset": offset,
    }
    total = int(db.execute(text(f"SELECT COUNT(*) FROM tmimf t {where}"), params).scalar_one())
    rows = db.execute(
        text(f"{_BASE_SELECT} {where} ORDER BY t.fecha_emision DESC, t.id DESC LIMIT :limit OFFSET :offset"),
        params,
    ).mappings().all()
    return TmimfListResponse(items=[_to_tmimf_response(dict(r)) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/{tmimf_id}", response_model=TmimfResponse)
def get_tmimf(
    tmimf_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TmimfResponse:
    _ensure_access(current_user)
    row = db.execute(text(f"{_BASE_SELECT} WHERE t.id = :id"), {"id": tmimf_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TMIMF no encontrada")
    if not is_elevated(current_user) and row.get("estado_id") not in (current_state_id, None):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TMIMF no encontrada")
    return _to_tmimf_response(dict(row))


def _payload_to_params(payload: TmimfCreate | TmimfUpdate, target_estado_id: int) -> dict[str, Any]:
    return {
        "folio_tmimf": payload.folio_tmimf.strip(),
        "subfolio": payload.subfolio,
        "folio_original": payload.folio_original,
        "unidad_produccion_id": payload.unidad_produccion_id,
        "tipo_tarjeta": payload.tipo_tarjeta.upper(),
        "pais": payload.pais.upper(),
        "ruta_id": payload.ruta_id,
        "modulo_emisor_id": payload.modulo_emisor_id,
        "mercado_id": payload.mercado_id,
        "tipo_transporte_id": payload.tipo_transporte_id,
        "placas_transporte": payload.placas_transporte,
        "funcionario_aprobo_id": payload.funcionario_aprobo_id,
        "semana": payload.semana,
        "fecha_emision": payload.fecha_emision,
        "hora_emision": payload.hora_emision,
        "vigencia_tarjeta": payload.vigencia_tarjeta,
        "fecha_vencimiento": payload.fecha_vencimiento,
        "clave_movilizacion": payload.clave_movilizacion.strip(),
        "nombre_pfa": payload.nombre_pfa,
        "cfmn": payload.cfmn,
        "estado_id": target_estado_id,
        "estatus_bloqueo": payload.estatus_bloqueo,
        "resuelto": payload.resuelto,
        "facturado": payload.facturado,
        "estatus_id": payload.estatus_id,
    }


@router.post("", response_model=TmimfResponse, status_code=status.HTTP_201_CREATED)
def create_tmimf(
    payload: TmimfCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TmimfResponse:
    _ensure_access(current_user)
    if payload.tipo_tarjeta.upper() not in VALID_TIPOS_TARJETA:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="tipo_tarjeta debe ser 'M' o 'O' (las 'I' inválidas no se capturan)")
    target = _scope_state(current_user, current_state_id, payload.estado_id)
    if db.execute(text("SELECT id FROM tmimf WHERE folio_tmimf = :f"), {"f": payload.folio_tmimf.strip()}).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe una TMIMF con ese folio")

    params = _payload_to_params(payload, target)
    params["user_id"] = current_user.id
    # Defaults requeridos por columnas NOT NULL del legacy
    for k in ("ludens", "obliqua", "striata", "serpentina",
              "larva_en_empaque", "frutos_muestreados", "frutos_larvados",
              "numero_larvas", "porcentaje_infestacion"):
        params.setdefault(k, 0)

    r = db.execute(
        text(
            """
            INSERT INTO tmimf (
                folio_tmimf, subfolio, folio_original, unidad_produccion_id,
                tipo_tarjeta, pais, ruta_id, modulo_emisor_id, mercado_id,
                tipo_transporte_id, placas_transporte, funcionario_aprobo_id,
                semana, fecha_emision, hora_emision, vigencia_tarjeta, fecha_vencimiento,
                clave_movilizacion, nombre_pfa, cfmn,
                estado_id, estatus_bloqueo, resuelto, facturado, estatus_id,
                ludens, obliqua, striata, serpentina,
                larva_en_empaque, frutos_muestreados, frutos_larvados, numero_larvas, porcentaje_infestacion,
                usuario_generador_id, created_by_user_id, updated_by_user_id,
                created_at, updated_at, created_date, edited_date
            ) VALUES (
                :folio_tmimf, :subfolio, :folio_original, :unidad_produccion_id,
                :tipo_tarjeta, :pais, :ruta_id, :modulo_emisor_id, :mercado_id,
                :tipo_transporte_id, :placas_transporte, :funcionario_aprobo_id,
                :semana, :fecha_emision, :hora_emision, :vigencia_tarjeta, :fecha_vencimiento,
                :clave_movilizacion, :nombre_pfa, :cfmn,
                :estado_id, :estatus_bloqueo, :resuelto, :facturado, :estatus_id,
                :ludens, :obliqua, :striata, :serpentina,
                :larva_en_empaque, :frutos_muestreados, :frutos_larvados, :numero_larvas, :porcentaje_infestacion,
                :user_id, :user_id, :user_id,
                NOW(), NOW(), CURDATE(), CURDATE()
            )
            """
        ),
        params,
    )
    new_id = int(r.lastrowid)
    audit_catalog_change(db, catalogo="tmimf", registro_id=new_id, accion="CREATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=None, datos_nuevos={**payload.model_dump(mode="json"), "estado_id": target},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="create-tmimf",
        metodo="POST", path="/tmimf", estado_afectado_id=target,
        recurso_tipo="tmimf", recurso_id=str(new_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="INSERT INTO tmimf (...) VALUES (...)",
        resultado_status=201, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE t.id = :id"), {"id": new_id}).mappings().first()
    return _to_tmimf_response(dict(row))


@router.put("/{tmimf_id}", response_model=TmimfResponse)
def update_tmimf(
    tmimf_id: int,
    payload: TmimfUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TmimfResponse:
    _ensure_access(current_user)
    if payload.tipo_tarjeta.upper() not in VALID_TIPOS_TARJETA:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="tipo_tarjeta debe ser 'M' o 'O'")
    prev = db.execute(text("SELECT * FROM tmimf WHERE id = :id"), {"id": tmimf_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TMIMF no encontrada")
    if not is_elevated(current_user) and prev.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    target = _scope_state(current_user, current_state_id, payload.estado_id)
    folio_changed = payload.folio_tmimf.strip() != prev["folio_tmimf"]
    if folio_changed and db.execute(
        text("SELECT id FROM tmimf WHERE folio_tmimf = :f AND id <> :id"),
        {"f": payload.folio_tmimf.strip(), "id": tmimf_id},
    ).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Folio ya existe")

    params = _payload_to_params(payload, target)
    params["user_id"] = current_user.id
    params["id"] = tmimf_id
    db.execute(
        text(
            """
            UPDATE tmimf SET
                folio_tmimf=:folio_tmimf, subfolio=:subfolio, folio_original=:folio_original,
                unidad_produccion_id=:unidad_produccion_id, tipo_tarjeta=:tipo_tarjeta, pais=:pais,
                ruta_id=:ruta_id, modulo_emisor_id=:modulo_emisor_id, mercado_id=:mercado_id,
                tipo_transporte_id=:tipo_transporte_id, placas_transporte=:placas_transporte,
                funcionario_aprobo_id=:funcionario_aprobo_id, semana=:semana,
                fecha_emision=:fecha_emision, hora_emision=:hora_emision,
                vigencia_tarjeta=:vigencia_tarjeta, fecha_vencimiento=:fecha_vencimiento,
                clave_movilizacion=:clave_movilizacion, nombre_pfa=:nombre_pfa, cfmn=:cfmn,
                estado_id=:estado_id, estatus_bloqueo=:estatus_bloqueo,
                resuelto=:resuelto, facturado=:facturado, estatus_id=:estatus_id,
                updated_by_user_id=:user_id
            WHERE id=:id
            """
        ),
        params,
    )
    audit_catalog_change(db, catalogo="tmimf", registro_id=tmimf_id, accion="UPDATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos={**payload.model_dump(mode="json"), "estado_id": target},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="update-tmimf",
        metodo="PUT", path=f"/tmimf/{tmimf_id}", estado_afectado_id=target,
        recurso_tipo="tmimf", recurso_id=str(tmimf_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="UPDATE tmimf SET ... WHERE id = :id",
        resultado_status=200, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE t.id = :id"), {"id": tmimf_id}).mappings().first()
    return _to_tmimf_response(dict(row))


@router.post("/{tmimf_id}/cancelar", response_model=TmimfResponse)
def cancel_tmimf(
    tmimf_id: int,
    payload: TmimfCancelRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TmimfResponse:
    """Cancela una TMIMF: marca estatus_bloqueo='C' + crea row en cancelaciones + audit."""
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM tmimf WHERE id = :id"), {"id": tmimf_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TMIMF no encontrada")
    if not is_elevated(current_user) and prev.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    if prev.get("estatus_bloqueo") == "C":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="TMIMF ya estaba cancelada")

    db.execute(
        text(
            """
            UPDATE tmimf SET
                estatus_bloqueo = 'C',
                usuario_cancelo_id = :user_id,
                fecha_bloqueo = CURDATE(),
                hora_bloqueo = CURTIME(),
                updated_by_user_id = :user_id
            WHERE id = :id
            """
        ),
        {"user_id": current_user.id, "id": tmimf_id},
    )
    db.execute(
        text(
            """
            INSERT INTO cancelaciones (
                tipo_documento, folio_documento, motivo, fecha_cancelacion,
                usuario_cancelo_id, estatus_id, created_at, created_date
            ) VALUES (
                'TMIMF', :folio, :motivo, NOW(),
                :user_id, 1, NOW(), CURDATE()
            )
            """
        ),
        {"folio": str(prev["folio_tmimf"]), "motivo": payload.motivo, "user_id": current_user.id},
    )

    audit_catalog_change(db, catalogo="tmimf", registro_id=tmimf_id, accion="CANCEL",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos={"estatus_bloqueo": "C", "motivo": payload.motivo},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="cancel-tmimf",
        metodo="POST", path=f"/tmimf/{tmimf_id}/cancelar",
        estado_afectado_id=int(prev.get("estado_id")) if prev.get("estado_id") is not None else None,
        recurso_tipo="tmimf", recurso_id=str(tmimf_id),
        datos_request=payload.model_dump(),
        sql_query="UPDATE tmimf SET estatus_bloqueo='C' + INSERT INTO cancelaciones",
        resultado_status=200, ip_origen=request.client.host if request.client else None,
        observaciones=f"Cancelación con motivo: {payload.motivo[:80]}")
    db.commit()
    row = db.execute(text(f"{_BASE_SELECT} WHERE t.id = :id"), {"id": tmimf_id}).mappings().first()
    return _to_tmimf_response(dict(row))


# =========================================================
# Detallados (sub-folios) de una TMIMF
# =========================================================

_DET_SELECT = """
    SELECT d.id, d.tmimf_id, d.sub_folio, d.unidad_produccion_id, d.variedad_id,
           d.cantidad_movilizada, d.saldo,
           d.cajas_14, d.cajas_15, d.cajas_16, d.cajas_18, d.cajas_20, d.cajas_25, d.cajas_30,
           d.granel, d.tipo_vehiculo_id, d.placas, d.semana, d.estado_id, d.estatus_id,
           v.nombre AS variedad_nombre,
           u.numero_inscripcion AS unidad_produccion_ni,
           tv.nombre AS tipo_vehiculo_nombre
    FROM detallado_tmimf d
    LEFT JOIN variedades v ON v.id = d.variedad_id
    LEFT JOIN unidades_produccion u ON u.id = d.unidad_produccion_id
    LEFT JOIN vehiculos tv ON tv.id = d.tipo_vehiculo_id
"""


@router.get("/{tmimf_id}/detallado", response_model=TmimfDetalleListResponse)
def list_detallados(
    tmimf_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TmimfDetalleListResponse:
    _ensure_access(current_user)
    rows = db.execute(
        text(f"{_DET_SELECT} WHERE d.tmimf_id = :id ORDER BY d.sub_folio ASC"),
        {"id": tmimf_id},
    ).mappings().all()
    return TmimfDetalleListResponse(items=[_to_det_response(dict(r)) for r in rows], total=len(rows))


def _det_payload_to_params(payload: TmimfDetalleCreate | TmimfDetalleUpdate, tmimf_id: int, estado_id: int) -> dict[str, Any]:
    return {
        "tmimf_id": tmimf_id,
        "sub_folio": payload.sub_folio,
        "unidad_produccion_id": payload.unidad_produccion_id,
        "variedad_id": payload.variedad_id,
        "cantidad_movilizada": payload.cantidad_movilizada,
        "saldo": payload.saldo,
        "cajas_14": payload.cajas_14, "cajas_15": payload.cajas_15, "cajas_16": payload.cajas_16,
        "cajas_18": payload.cajas_18, "cajas_20": payload.cajas_20, "cajas_25": payload.cajas_25,
        "cajas_30": payload.cajas_30, "granel": payload.granel,
        "tipo_vehiculo_id": payload.tipo_vehiculo_id,
        "placas": payload.placas,
        "semana": payload.semana,
        "estado_id": estado_id,
        "estatus_id": payload.estatus_id,
    }


@router.post("/{tmimf_id}/detallado", response_model=TmimfDetalleResponse, status_code=status.HTTP_201_CREATED)
def create_detallado(
    tmimf_id: int,
    payload: TmimfDetalleCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TmimfDetalleResponse:
    _ensure_access(current_user)
    tmimf = db.execute(text("SELECT id, estado_id FROM tmimf WHERE id = :id"), {"id": tmimf_id}).mappings().first()
    if not tmimf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TMIMF no encontrada")
    if not is_elevated(current_user) and tmimf.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")

    params = _det_payload_to_params(payload, tmimf_id, int(tmimf.get("estado_id") or current_state_id))
    params["user_id"] = current_user.id

    r = db.execute(
        text(
            """
            INSERT INTO detallado_tmimf (
                tmimf_id, sub_folio, unidad_produccion_id, variedad_id,
                cantidad_movilizada, saldo,
                cajas_14, cajas_15, cajas_16, cajas_18, cajas_20, cajas_25, cajas_30, granel,
                tipo_vehiculo_id, placas, semana, estado_id, estatus_id,
                usuario_id, created_by_user_id, updated_by_user_id,
                fecha_creacion, created_at, updated_at, created_date, edited_date
            ) VALUES (
                :tmimf_id, :sub_folio, :unidad_produccion_id, :variedad_id,
                :cantidad_movilizada, :saldo,
                :cajas_14, :cajas_15, :cajas_16, :cajas_18, :cajas_20, :cajas_25, :cajas_30, :granel,
                :tipo_vehiculo_id, :placas, :semana, :estado_id, :estatus_id,
                :user_id, :user_id, :user_id,
                NOW(), NOW(), NOW(), CURDATE(), CURDATE()
            )
            """
        ),
        params,
    )
    new_id = int(r.lastrowid)
    audit_catalog_change(db, catalogo="detallado_tmimf", registro_id=new_id, accion="CREATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=None, datos_nuevos={**payload.model_dump(mode="json"), "tmimf_id": tmimf_id},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="create-tmimf-detallado",
        metodo="POST", path=f"/tmimf/{tmimf_id}/detallado",
        recurso_tipo="detallado_tmimf", recurso_id=str(new_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="INSERT INTO detallado_tmimf (...)",
        resultado_status=201, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_DET_SELECT} WHERE d.id = :id"), {"id": new_id}).mappings().first()
    return _to_det_response(dict(row))


@router.put("/detallado/{det_id}", response_model=TmimfDetalleResponse)
def update_detallado(
    det_id: int,
    payload: TmimfDetalleUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TmimfDetalleResponse:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM detallado_tmimf WHERE id = :id"), {"id": det_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detallado no encontrado")
    tmimf = db.execute(text("SELECT estado_id FROM tmimf WHERE id = :id"), {"id": prev["tmimf_id"]}).mappings().first()
    if tmimf and not is_elevated(current_user) and tmimf.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")

    params = _det_payload_to_params(payload, int(prev["tmimf_id"]), int(prev.get("estado_id") or current_state_id))
    params["user_id"] = current_user.id
    params["id"] = det_id
    db.execute(
        text(
            """
            UPDATE detallado_tmimf SET
                sub_folio=:sub_folio, unidad_produccion_id=:unidad_produccion_id, variedad_id=:variedad_id,
                cantidad_movilizada=:cantidad_movilizada, saldo=:saldo,
                cajas_14=:cajas_14, cajas_15=:cajas_15, cajas_16=:cajas_16,
                cajas_18=:cajas_18, cajas_20=:cajas_20, cajas_25=:cajas_25, cajas_30=:cajas_30,
                granel=:granel, tipo_vehiculo_id=:tipo_vehiculo_id, placas=:placas,
                semana=:semana, estatus_id=:estatus_id, updated_by_user_id=:user_id
            WHERE id=:id
            """
        ),
        params,
    )
    audit_catalog_change(db, catalogo="detallado_tmimf", registro_id=det_id, accion="UPDATE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos=payload.model_dump(mode="json"),
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="update-tmimf-detallado",
        metodo="PUT", path=f"/tmimf/detallado/{det_id}",
        recurso_tipo="detallado_tmimf", recurso_id=str(det_id),
        datos_request=payload.model_dump(mode="json"),
        sql_query="UPDATE detallado_tmimf SET ... WHERE id = :id",
        resultado_status=200, ip_origen=request.client.host if request.client else None)
    db.commit()
    row = db.execute(text(f"{_DET_SELECT} WHERE d.id = :id"), {"id": det_id}).mappings().first()
    return _to_det_response(dict(row))


@router.delete("/detallado/{det_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_detallado(
    det_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    _ensure_access(current_user)
    prev = db.execute(text("SELECT * FROM detallado_tmimf WHERE id = :id"), {"id": det_id}).mappings().first()
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detallado no encontrado")
    tmimf = db.execute(text("SELECT estado_id FROM tmimf WHERE id = :id"), {"id": prev["tmimf_id"]}).mappings().first()
    if tmimf and not is_elevated(current_user) and tmimf.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fuera de tu estado activo")
    db.execute(text("UPDATE detallado_tmimf SET estatus_id=2, updated_by_user_id=:u WHERE id=:id"),
               {"u": current_user.id, "id": det_id})
    audit_catalog_change(db, catalogo="detallado_tmimf", registro_id=det_id, accion="DELETE",
        usuario_id=current_user.id, estado_activo_id=current_state_id,
        datos_anteriores=dict(prev), datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None)
    audit_senasica(db, user=current_user, accion="inactivate-tmimf-detallado",
        metodo="DELETE", path=f"/tmimf/detallado/{det_id}",
        recurso_tipo="detallado_tmimf", recurso_id=str(det_id),
        datos_request={"estatus_id": 2},
        sql_query="UPDATE detallado_tmimf SET estatus_id = 2 WHERE id = :id",
        resultado_status=204, ip_origen=request.client.host if request.client else None)
    db.commit()
