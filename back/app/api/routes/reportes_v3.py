"""Reportes V3 nativos.

Endpoint de informe semanal consolidado: trampeo + TMIMF + muestreos
+ controles. Retorna JSON multi-tabla; el frontend genera el XLSX
con la utileria existente (lib/excelExport).

Multi-tenant por estado_id (Senasica puede pedir cualquier estado_id).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.senasica import is_elevated
from app.db import get_db
from app.dependencies import get_current_state_id, get_current_user
from app.models import User

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


@router.get("/informe-semanal")
def informe_semanal(
    semana: int = Query(..., ge=1, le=53),
    estado_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> dict[str, Any]:
    _ensure_access(current_user)
    target = _scope_state(current_user, current_state_id, estado_id)

    estado_row = db.execute(text("SELECT nombre FROM estados WHERE id = :id"), {"id": target}).first()
    estado_nombre = estado_row[0] if estado_row else None

    p = {"estado_id": target, "semana": semana}

    revisiones = db.execute(text("""
        SELECT r.id, r.numero_semana, r.fecha_revision, r.fecha,
               t.numero AS trampa_numero,
               r.numero_lecturas, r.recibo_servicio, r.cancelada
        FROM revisiones r
        LEFT JOIN trampas t ON t.id = r.trampa_id
        WHERE r.estado_id = :estado_id
          AND r.numero_semana = :semana
          AND r.estatus_id = 1
        ORDER BY r.fecha_revision, r.id
    """), p).mappings().all()

    identificaciones = db.execute(text("""
        SELECT i.id, i.numero_semana, i.fecha,
               t.numero AS trampa_numero,
               em.nombre AS especie_nombre,
               i.hembras_silvestre, i.machos_silvestre,
               i.hembras_esteril, i.machos_esteril,
               (i.hembras_silvestre + i.machos_silvestre + i.hembras_esteril + i.machos_esteril) AS total_capturado
        FROM identificaciones_trampa i
        LEFT JOIN trampas t ON t.id = i.trampa_id
        LEFT JOIN especies_mosca em ON em.id = i.especie_mosca_id
        WHERE i.estado_id = :estado_id
          AND i.numero_semana = :semana
          AND i.estatus_id = 1
        ORDER BY i.fecha, i.id
    """), p).mappings().all()

    tmimfs = db.execute(text("""
        SELECT t.id, t.numero_folio, t.fecha_emision, t.fecha_movilizacion,
               t.semana_anio, t.cantidad_total_kg, t.cancelado,
               p.razon_social AS productor_nombre,
               m.nombre AS modulo_emisor_nombre
        FROM tmimf t
        LEFT JOIN productores p ON p.id = t.productor_id
        LEFT JOIN modulos m ON m.id = t.modulo_emisor_id
        WHERE t.estado_id = :estado_id
          AND t.semana_anio = :semana
          AND t.estatus_id = 1
        ORDER BY t.fecha_emision, t.id
    """), p).mappings().all()

    muestreos = db.execute(text("""
        SELECT mf.id, mf.numero_muestra, mf.fecha_muestreo, mf.numero_semana,
               up.nombre AS unidad_nombre,
               v.nombre AS variedad_nombre,
               mf.numero_frutos, mf.kgs_muestreados,
               mf.frutos_infestados,
               CASE WHEN mf.numero_frutos > 0
                    THEN ROUND((mf.frutos_infestados / mf.numero_frutos) * 100, 2)
                    ELSE 0 END AS pct_infestacion
        FROM muestreos_frutos mf
        LEFT JOIN unidades_produccion up ON up.id = mf.unidad_produccion_id
        LEFT JOIN variedades v ON v.id = mf.variedad_id
        WHERE mf.estado_id = :estado_id
          AND mf.numero_semana = :semana
          AND mf.estatus_id = 1
        ORDER BY mf.fecha_muestreo, mf.id
    """), p).mappings().all()

    control_quimico = db.execute(text("""
        SELECT cq.id, cq.fecha_aplicacion, cq.numero_semana,
               up.nombre AS unidad_nombre,
               ta.nombre AS tipo_aplicacion_nombre,
               cq.superficie, cq.proteina_litros, cq.malathion_litros, cq.agua_litros
        FROM control_quimico cq
        LEFT JOIN unidades_produccion up ON up.id = cq.unidad_produccion_id
        LEFT JOIN tipos_aplicacion ta ON ta.id = cq.tipo_aplicacion_id
        WHERE cq.estado_id = :estado_id
          AND cq.numero_semana = :semana
          AND cq.estatus_id = 1
        ORDER BY cq.fecha_aplicacion, cq.id
    """), p).mappings().all()

    control_mecanico = db.execute(text("""
        SELECT cmc.id, cmc.fecha, cmc.numero_semana,
               up.nombre AS unidad_nombre,
               h.nombre AS hospedero_nombre,
               cmc.kgs_destruidos, cmc.numero_arboles, cmc.has_rastreadas
        FROM control_mecanico_cultural cmc
        LEFT JOIN unidades_produccion up ON up.id = cmc.unidad_produccion_id
        LEFT JOIN hospederos h ON h.id = cmc.hospedero_id
        WHERE cmc.estado_id = :estado_id
          AND cmc.numero_semana = :semana
          AND cmc.estatus_id = 1
        ORDER BY cmc.fecha, cmc.id
    """), p).mappings().all()

    def _rows(items: Any) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for r in items:
            d = dict(r)
            for k, v in list(d.items()):
                if hasattr(v, "isoformat"):
                    d[k] = v.isoformat()
            out.append(d)
        return out

    return {
        "estado_id": target,
        "estado_nombre": estado_nombre,
        "semana": semana,
        "revisiones": _rows(revisiones),
        "identificaciones": _rows(identificaciones),
        "tmimfs": _rows(tmimfs),
        "muestreos": _rows(muestreos),
        "control_quimico": _rows(control_quimico),
        "control_mecanico": _rows(control_mecanico),
        "totales": {
            "revisiones": len(revisiones),
            "identificaciones": len(identificaciones),
            "tmimfs": len(tmimfs),
            "muestreos": len(muestreos),
            "control_quimico": len(control_quimico),
            "control_mecanico": len(control_mecanico),
        },
    }
