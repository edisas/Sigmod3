"""Endpoints de dashboard V3 nativo.

Dos vistas:
- /resumen-estado (cualquier rol autorizado): KPIs y agregados del
  estado_activo_id del JWT actual. Senasica usa este via switch-state.
- /resumen-nacional (solo Senasica): agregados cross-state en una sola
  vista. NO usa estado_activo_id.

Cálculos:
- "Última semana" = `MAX(numero_semana)` con datos en `trampas_revisiones`
  para el estado en cuestión. Si quieres una semana específica, usa el
  query param `semana`.
- KPIs: trampas activas, revisiones de la semana, identificaciones de la
  semana, total de capturas (suma silvestre+estéril).
- Variación vs semana anterior: opcional, devuelve change_pct cuando hay
  datos en semana-1.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.senasica import is_senasica
from app.db import get_db
from app.dependencies import get_current_state_id, get_current_user
from app.models import User
from app.schemas import (
    CapturasPorEspecie,
    CapturasPorEstado,
    CapturasPorRuta,
    DashboardEstadoResponse,
    DashboardKpi,
    DashboardNacionalResponse,
)

router = APIRouter()

ALLOWED_ROLES = {"admin", "administrador general", "administrador estatal", "administrador senasica"}


def _ensure_access(user: User) -> None:
    if (user.rol or "").strip().lower() not in ALLOWED_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


def _ensure_senasica(user: User) -> None:
    if not is_senasica(user) and (user.rol or "").strip().lower() not in {"admin", "administrador general"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo Senasica/admin general puede ver el consolidado nacional")


def _change_pct(actual: int, anterior: int) -> float | None:
    if anterior <= 0:
        return None
    return round(((actual - anterior) / anterior) * 100.0, 1)


def _semana_actual_estado(db: Session, estado_id: int) -> int | None:
    return db.execute(
        text(
            """
            SELECT MAX(r.numero_semana)
            FROM trampas_revisiones r
            JOIN trampas t ON t.id = r.trampa_id
            WHERE t.estado_id = :e AND r.estatus_id = 1
            """
        ),
        {"e": estado_id},
    ).scalar()


def _capturas_por_especie_estado(db: Session, estado_id: int, semana: int) -> list[CapturasPorEspecie]:
    rows = db.execute(
        text(
            """
            SELECT i.especie_mosca_id,
                   em.nombre AS especie_nombre,
                   COALESCE(SUM(i.hembras_silvestre), 0) AS hs,
                   COALESCE(SUM(i.machos_silvestre), 0) AS ms,
                   COALESCE(SUM(i.hembras_esteril), 0) AS he,
                   COALESCE(SUM(i.machos_esteril), 0) AS me
            FROM identificaciones_trampa i
            JOIN trampas t ON t.id = i.trampa_id
            LEFT JOIN especies_mosca em ON em.id = i.especie_mosca_id
            WHERE t.estado_id = :e AND i.numero_semana = :s AND i.estatus_id = 1
            GROUP BY i.especie_mosca_id, em.nombre
            ORDER BY SUM(i.hembras_silvestre + i.machos_silvestre + i.hembras_esteril + i.machos_esteril) DESC
            """
        ),
        {"e": estado_id, "s": semana},
    ).mappings().all()
    return [
        CapturasPorEspecie(
            especie_mosca_id=int(r["especie_mosca_id"]) if r["especie_mosca_id"] is not None else None,
            especie_mosca_nombre=r["especie_nombre"],
            hembras_silvestre=int(r["hs"] or 0),
            machos_silvestre=int(r["ms"] or 0),
            hembras_esteril=int(r["he"] or 0),
            machos_esteril=int(r["me"] or 0),
            total=int((r["hs"] or 0) + (r["ms"] or 0) + (r["he"] or 0) + (r["me"] or 0)),
        )
        for r in rows
    ]


def _capturas_por_ruta_estado(db: Session, estado_id: int, semana: int) -> list[CapturasPorRuta]:
    rows = db.execute(
        text(
            """
            SELECT t.ruta_id,
                   r.nombre AS ruta_nombre,
                   COUNT(DISTINCT t.id) AS trampas,
                   COUNT(DISTINCT rev.id) AS revisiones,
                   COALESCE(SUM(i.hembras_silvestre + i.machos_silvestre + i.hembras_esteril + i.machos_esteril), 0) AS capturas
            FROM trampas t
            LEFT JOIN rutas r ON r.id = t.ruta_id
            LEFT JOIN trampas_revisiones rev ON rev.trampa_id = t.id AND rev.numero_semana = :s AND rev.estatus_id = 1
            LEFT JOIN identificaciones_trampa i ON i.revision_id = rev.id AND i.estatus_id = 1
            WHERE t.estado_id = :e AND t.estatus_id = 1
            GROUP BY t.ruta_id, r.nombre
            ORDER BY capturas DESC, trampas DESC
            """
        ),
        {"e": estado_id, "s": semana},
    ).mappings().all()
    return [
        CapturasPorRuta(
            ruta_id=int(r["ruta_id"]) if r["ruta_id"] is not None else None,
            ruta_nombre=r["ruta_nombre"],
            trampas=int(r["trampas"] or 0),
            revisiones=int(r["revisiones"] or 0),
            capturas_total=int(r["capturas"] or 0),
        )
        for r in rows
    ]


@router.get("/resumen-estado", response_model=DashboardEstadoResponse)
def resumen_estado(
    semana: int | None = Query(default=None, ge=1, le=53),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> DashboardEstadoResponse:
    _ensure_access(current_user)

    target_semana = semana if semana is not None else _semana_actual_estado(db, current_state_id)
    if target_semana is None:
        target_semana = 1  # sin datos aún

    estado_row = db.execute(
        text("SELECT id, nombre FROM estados WHERE id = :id"),
        {"id": current_state_id},
    ).mappings().first()
    if not estado_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estado no encontrado")

    # Trampas activas
    trampas_activas = int(db.execute(
        text("SELECT COUNT(*) FROM trampas WHERE estado_id = :e AND estatus_id = 1"),
        {"e": current_state_id},
    ).scalar() or 0)

    # Revisiones de la semana
    revisiones_sem = int(db.execute(
        text(
            """
            SELECT COUNT(*) FROM trampas_revisiones r
            JOIN trampas t ON t.id = r.trampa_id
            WHERE t.estado_id = :e AND r.numero_semana = :s AND r.estatus_id = 1
            """
        ),
        {"e": current_state_id, "s": target_semana},
    ).scalar() or 0)

    revisiones_sem_prev = int(db.execute(
        text(
            """
            SELECT COUNT(*) FROM trampas_revisiones r
            JOIN trampas t ON t.id = r.trampa_id
            WHERE t.estado_id = :e AND r.numero_semana = :s AND r.estatus_id = 1
            """
        ),
        {"e": current_state_id, "s": max(target_semana - 1, 1)},
    ).scalar() or 0)

    # Identificaciones de la semana
    ident_sem = int(db.execute(
        text(
            """
            SELECT COUNT(*) FROM identificaciones_trampa i
            JOIN trampas t ON t.id = i.trampa_id
            WHERE t.estado_id = :e AND i.numero_semana = :s AND i.estatus_id = 1
            """
        ),
        {"e": current_state_id, "s": target_semana},
    ).scalar() or 0)

    # Total capturas (suma de los 4 conteos) de la semana
    capturas_total = int(db.execute(
        text(
            """
            SELECT COALESCE(SUM(i.hembras_silvestre + i.machos_silvestre + i.hembras_esteril + i.machos_esteril), 0)
            FROM identificaciones_trampa i
            JOIN trampas t ON t.id = i.trampa_id
            WHERE t.estado_id = :e AND i.numero_semana = :s AND i.estatus_id = 1
            """
        ),
        {"e": current_state_id, "s": target_semana},
    ).scalar() or 0)

    capturas_total_prev = int(db.execute(
        text(
            """
            SELECT COALESCE(SUM(i.hembras_silvestre + i.machos_silvestre + i.hembras_esteril + i.machos_esteril), 0)
            FROM identificaciones_trampa i
            JOIN trampas t ON t.id = i.trampa_id
            WHERE t.estado_id = :e AND i.numero_semana = :s AND i.estatus_id = 1
            """
        ),
        {"e": current_state_id, "s": max(target_semana - 1, 1)},
    ).scalar() or 0)

    kpis = [
        DashboardKpi(label="Trampas activas", value=trampas_activas),
        DashboardKpi(label=f"Revisiones sem {target_semana}", value=revisiones_sem,
                     change_pct=_change_pct(revisiones_sem, revisiones_sem_prev)),
        DashboardKpi(label=f"Identificaciones sem {target_semana}", value=ident_sem),
        DashboardKpi(label=f"Capturas totales sem {target_semana}", value=capturas_total,
                     change_pct=_change_pct(capturas_total, capturas_total_prev)),
    ]

    return DashboardEstadoResponse(
        estado_id=int(estado_row["id"]),
        estado_nombre=str(estado_row["nombre"]),
        semana=int(target_semana),
        kpis=kpis,
        capturas_por_especie=_capturas_por_especie_estado(db, current_state_id, target_semana),
        capturas_por_ruta=_capturas_por_ruta_estado(db, current_state_id, target_semana),
    )


@router.get("/resumen-nacional", response_model=DashboardNacionalResponse)
def resumen_nacional(
    semana: int | None = Query(default=None, ge=1, le=53),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardNacionalResponse:
    _ensure_access(current_user)
    _ensure_senasica(current_user)

    # Si no se pasa semana, usar la semana más reciente con datos a nivel nacional
    target_semana = semana
    if target_semana is None:
        target_semana = db.execute(
            text("SELECT MAX(numero_semana) FROM trampas_revisiones WHERE estatus_id = 1"),
        ).scalar()
        if target_semana is None:
            target_semana = 1

    # Estados activos+participantes
    total_estados_activos = int(db.execute(
        text("SELECT COUNT(*) FROM estados WHERE estatus_id = 1 AND participa_sigmod = 1"),
    ).scalar() or 0)

    # KPIs globales
    trampas_total = int(db.execute(
        text("SELECT COUNT(*) FROM trampas WHERE estatus_id = 1"),
    ).scalar() or 0)
    revisiones_total = int(db.execute(
        text("SELECT COUNT(*) FROM trampas_revisiones WHERE numero_semana = :s AND estatus_id = 1"),
        {"s": target_semana},
    ).scalar() or 0)
    ident_total = int(db.execute(
        text("SELECT COUNT(*) FROM identificaciones_trampa WHERE numero_semana = :s AND estatus_id = 1"),
        {"s": target_semana},
    ).scalar() or 0)
    capturas_total = int(db.execute(
        text(
            """
            SELECT COALESCE(SUM(hembras_silvestre + machos_silvestre + hembras_esteril + machos_esteril), 0)
            FROM identificaciones_trampa
            WHERE numero_semana = :s AND estatus_id = 1
            """
        ),
        {"s": target_semana},
    ).scalar() or 0)

    kpis_globales = [
        DashboardKpi(label="Trampas activas (nacional)", value=trampas_total),
        DashboardKpi(label=f"Revisiones sem {target_semana}", value=revisiones_total),
        DashboardKpi(label=f"Identificaciones sem {target_semana}", value=ident_total),
        DashboardKpi(label=f"Capturas totales sem {target_semana}", value=capturas_total),
    ]

    # Capturas por especie a nivel global
    rows_especies = db.execute(
        text(
            """
            SELECT i.especie_mosca_id,
                   em.nombre AS especie_nombre,
                   COALESCE(SUM(i.hembras_silvestre), 0) AS hs,
                   COALESCE(SUM(i.machos_silvestre), 0) AS ms,
                   COALESCE(SUM(i.hembras_esteril), 0) AS he,
                   COALESCE(SUM(i.machos_esteril), 0) AS me
            FROM identificaciones_trampa i
            LEFT JOIN especies_mosca em ON em.id = i.especie_mosca_id
            WHERE i.numero_semana = :s AND i.estatus_id = 1
            GROUP BY i.especie_mosca_id, em.nombre
            ORDER BY SUM(i.hembras_silvestre + i.machos_silvestre + i.hembras_esteril + i.machos_esteril) DESC
            """
        ),
        {"s": target_semana},
    ).mappings().all()
    capturas_por_especie = [
        CapturasPorEspecie(
            especie_mosca_id=int(r["especie_mosca_id"]) if r["especie_mosca_id"] is not None else None,
            especie_mosca_nombre=r["especie_nombre"],
            hembras_silvestre=int(r["hs"] or 0),
            machos_silvestre=int(r["ms"] or 0),
            hembras_esteril=int(r["he"] or 0),
            machos_esteril=int(r["me"] or 0),
            total=int((r["hs"] or 0) + (r["ms"] or 0) + (r["he"] or 0) + (r["me"] or 0)),
        )
        for r in rows_especies
    ]

    # Capturas por estado
    rows_estados = db.execute(
        text(
            """
            SELECT e.id, e.nombre, e.clave,
                   (SELECT COUNT(*) FROM trampas WHERE estado_id = e.id AND estatus_id = 1) AS trampas_activas,
                   (SELECT COUNT(*) FROM trampas_revisiones r JOIN trampas t ON t.id = r.trampa_id
                    WHERE t.estado_id = e.id AND r.numero_semana = :s AND r.estatus_id = 1) AS revs,
                   (SELECT COUNT(*) FROM identificaciones_trampa i JOIN trampas t ON t.id = i.trampa_id
                    WHERE t.estado_id = e.id AND i.numero_semana = :s AND i.estatus_id = 1) AS idents,
                   (SELECT COALESCE(SUM(i.hembras_silvestre + i.machos_silvestre + i.hembras_esteril + i.machos_esteril), 0)
                    FROM identificaciones_trampa i JOIN trampas t ON t.id = i.trampa_id
                    WHERE t.estado_id = e.id AND i.numero_semana = :s AND i.estatus_id = 1) AS capturas
            FROM estados e
            WHERE e.estatus_id = 1 AND e.participa_sigmod = 1
            ORDER BY capturas DESC, trampas_activas DESC, e.nombre ASC
            """
        ),
        {"s": target_semana},
    ).mappings().all()
    capturas_por_estado = [
        CapturasPorEstado(
            estado_id=int(r["id"]),
            estado_nombre=str(r["nombre"]),
            estado_clave=str(r["clave"]),
            trampas_activas=int(r["trampas_activas"] or 0),
            revisiones_ultima_semana=int(r["revs"] or 0),
            identificaciones_ultima_semana=int(r["idents"] or 0),
            capturas_total_ultima_semana=int(r["capturas"] or 0),
        )
        for r in rows_estados
    ]

    return DashboardNacionalResponse(
        semana=int(target_semana),
        total_estados_activos=total_estados_activos,
        kpis_globales=kpis_globales,
        capturas_por_especie_global=capturas_por_especie,
        capturas_por_estado=capturas_por_estado,
    )
