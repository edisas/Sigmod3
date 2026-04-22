import time
from threading import Lock

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.legacy.dependencies import get_current_legacy_claims, get_legacy_db

router = APIRouter()

UNIT_DIVISOR = 1000
ESPECIE_FILTRO = 1
CACHE_TTL_SECONDS = 1800  # 30 min

_overview_cache: dict[str, tuple[float, dict]] = {}
_overview_lock = Lock()


class DashboardKpis(BaseModel):
    unidades_produccion_activas: int
    productores_unicos: int
    tmimfs_emitidos: int
    toneladas_totales: float


class VariedadSlice(BaseModel):
    nombre: str
    toneladas: float
    porcentaje: float


class MercadoSlice(BaseModel):
    toneladas: float
    porcentaje: float


class SemanaTick(BaseModel):
    folio: int
    label: str  # "Sem 16 · 2026"


class VariedadSerie(BaseModel):
    nombre: str
    valores: list[float]


class TendenciaSemanal(BaseModel):
    semanas: list[SemanaTick]
    series: list[VariedadSerie]


class ComparativoSemanal(BaseModel):
    semanas: list[SemanaTick]
    exportacion: list[float]
    nacional: list[float]


class DashboardOverviewResponse(BaseModel):
    kpis: DashboardKpis
    variedades_top: list[VariedadSlice]
    mercado_split: dict[str, MercadoSlice]
    tendencia_semanal: TendenciaSemanal
    comparativo_semanal: ComparativoSemanal
    generated_at: float


def _build_overview(session: Session) -> dict:
    kpi_row = session.execute(text("""
        SELECT
          SUM(CASE WHEN status = 'A' AND clave_especie = :especie THEN 1 ELSE 0 END) AS unidades,
          COUNT(DISTINCT CASE WHEN status = 'A' AND clave_especie = :especie
                              THEN TRIM(nombre_propietario) END)                     AS productores
        FROM sv01_sv02
    """), {"especie": ESPECIE_FILTRO}).mappings().first()

    tmimfs = session.execute(text(
        "SELECT COUNT(*) FROM tmimf WHERE status <> 'C' AND tipo_tarjeta = 'M'"
    )).scalar() or 0

    variedades_rows = session.execute(text("""
        SELECT v.descripcion AS nombre,
               COALESCE(SUM(det.cantidad_movilizada), 0) AS cantidad
        FROM detallado_tmimf det
        JOIN tmimf tmi          ON det.folio_completo = tmi.folio_tmimf
        JOIN cat_variedades v   ON v.folio = det.variedad_movilizada
        WHERE det.status <> 'C' AND v.especie = :especie
        GROUP BY v.folio, v.descripcion
        HAVING cantidad > 0
        ORDER BY cantidad DESC
        LIMIT 10
    """), {"especie": ESPECIE_FILTRO}).mappings().all()

    mercado_rows = session.execute(text("""
        SELECT tmi.mercado_destino AS mercado,
               COALESCE(SUM(det.cantidad_movilizada), 0) AS cantidad
        FROM detallado_tmimf det
        JOIN tmimf tmi          ON det.folio_completo = tmi.folio_tmimf
        JOIN cat_variedades v   ON v.folio = det.variedad_movilizada
        WHERE det.status <> 'C' AND v.especie = :especie
        GROUP BY tmi.mercado_destino
    """), {"especie": ESPECIE_FILTRO}).mappings().all()

    variedades_ton = [(str(r["nombre"]), float(r["cantidad"]) / UNIT_DIVISOR) for r in variedades_rows]
    total_variedades = sum(t for _, t in variedades_ton) or 1.0
    variedades_top = [
        VariedadSlice(
            nombre=nombre,
            toneladas=round(ton, 3),
            porcentaje=round(ton / total_variedades * 100, 1),
        )
        for nombre, ton in variedades_ton
    ]

    mercado_map = {int(r["mercado"] or 0): float(r["cantidad"] or 0) / UNIT_DIVISOR for r in mercado_rows}
    exportacion_t = mercado_map.get(1, 0.0)
    nacional_t = mercado_map.get(2, 0.0)
    total_mercado = exportacion_t + nacional_t or 1.0
    mercado_split = {
        "exportacion": MercadoSlice(
            toneladas=round(exportacion_t, 3),
            porcentaje=round(exportacion_t / total_mercado * 100, 1),
        ),
        "nacional": MercadoSlice(
            toneladas=round(nacional_t, 3),
            porcentaje=round(nacional_t / total_mercado * 100, 1),
        ),
    }

    toneladas_totales = exportacion_t + nacional_t

    tendencia = _build_tendencia_variedades(session, ultimas_n=10, top_variedades=6)
    comparativo = _build_comparativo_mercado(session, ultimas_n=10)

    return {
        "kpis": DashboardKpis(
            unidades_produccion_activas=int(kpi_row["unidades"] or 0),
            productores_unicos=int(kpi_row["productores"] or 0),
            tmimfs_emitidos=int(tmimfs),
            toneladas_totales=round(toneladas_totales, 3),
        ),
        "variedades_top": variedades_top,
        "mercado_split": mercado_split,
        "tendencia_semanal": tendencia,
        "comparativo_semanal": comparativo,
        "generated_at": time.time(),
    }


def _semana_label(no_semana: int, periodo: int) -> str:
    return f"Sem {no_semana:02d} · {periodo}"


def _build_tendencia_variedades(
    session: Session,
    ultimas_n: int,
    top_variedades: int,
) -> TendenciaSemanal:
    rows = session.execute(text("""
        SELECT s.folio AS semana_folio, s.no_semana, s.periodo,
               v.folio AS variedad_folio, v.descripcion AS variedad,
               COALESCE(SUM(det.cantidad_movilizada), 0) AS cantidad
        FROM detallado_tmimf det
        JOIN tmimf tmi        ON det.folio_completo = tmi.folio_tmimf
        JOIN cat_variedades v ON v.folio = det.variedad_movilizada
        JOIN semanas s        ON s.folio = CAST(tmi.semana AS UNSIGNED)
        WHERE det.status <> 'C'
          AND v.especie = :especie
          AND tmi.semana IS NOT NULL AND tmi.semana <> ''
        GROUP BY s.folio, s.no_semana, s.periodo, v.folio, v.descripcion
    """), {"especie": ESPECIE_FILTRO}).mappings().all()

    if not rows:
        return TendenciaSemanal(semanas=[], series=[])

    semanas_set: dict[int, SemanaTick] = {}
    total_por_variedad: dict[tuple[int, str], float] = {}
    celdas: dict[tuple[int, int], float] = {}

    for r in rows:
        sf = int(r["semana_folio"])
        vf = int(r["variedad_folio"])
        ton = float(r["cantidad"] or 0) / UNIT_DIVISOR
        semanas_set.setdefault(sf, SemanaTick(
            folio=sf,
            label=_semana_label(int(r["no_semana"]), int(r["periodo"])),
        ))
        total_por_variedad[(vf, str(r["variedad"]))] = (
            total_por_variedad.get((vf, str(r["variedad"])), 0.0) + ton
        )
        celdas[(sf, vf)] = celdas.get((sf, vf), 0.0) + ton

    semanas = sorted(semanas_set.values(), key=lambda s: s.folio)[-ultimas_n:]
    top = sorted(total_por_variedad.items(), key=lambda kv: kv[1], reverse=True)[:top_variedades]

    series = [
        VariedadSerie(
            nombre=nombre,
            valores=[round(celdas.get((s.folio, vf), 0.0), 3) for s in semanas],
        )
        for (vf, nombre), _ in top
    ]
    return TendenciaSemanal(semanas=semanas, series=series)


def _build_comparativo_mercado(session: Session, ultimas_n: int) -> ComparativoSemanal:
    rows = session.execute(text("""
        SELECT s.folio AS semana_folio, s.no_semana, s.periodo,
               tmi.mercado_destino AS mercado,
               COALESCE(SUM(det.cantidad_movilizada), 0) AS cantidad
        FROM detallado_tmimf det
        JOIN tmimf tmi        ON det.folio_completo = tmi.folio_tmimf
        JOIN cat_variedades v ON v.folio = det.variedad_movilizada
        JOIN semanas s        ON s.folio = CAST(tmi.semana AS UNSIGNED)
        WHERE det.status <> 'C'
          AND v.especie = :especie
          AND tmi.semana IS NOT NULL AND tmi.semana <> ''
        GROUP BY s.folio, s.no_semana, s.periodo, tmi.mercado_destino
    """), {"especie": ESPECIE_FILTRO}).mappings().all()

    if not rows:
        return ComparativoSemanal(semanas=[], exportacion=[], nacional=[])

    semanas_set: dict[int, SemanaTick] = {}
    exp: dict[int, float] = {}
    nac: dict[int, float] = {}

    for r in rows:
        sf = int(r["semana_folio"])
        mercado = int(r["mercado"] or 0)
        ton = float(r["cantidad"] or 0) / UNIT_DIVISOR
        semanas_set.setdefault(sf, SemanaTick(
            folio=sf,
            label=_semana_label(int(r["no_semana"]), int(r["periodo"])),
        ))
        if mercado == 1:
            exp[sf] = exp.get(sf, 0.0) + ton
        elif mercado == 2:
            nac[sf] = nac.get(sf, 0.0) + ton

    semanas = sorted(semanas_set.values(), key=lambda s: s.folio)[-ultimas_n:]
    return ComparativoSemanal(
        semanas=semanas,
        exportacion=[round(exp.get(s.folio, 0.0), 3) for s in semanas],
        nacional=[round(nac.get(s.folio, 0.0), 3) for s in semanas],
    )


@router.get("/overview", response_model=DashboardOverviewResponse)
def overview(
    force_refresh: bool = Query(False),
    claims: dict = Depends(get_current_legacy_claims),
    session: Session = Depends(get_legacy_db),
) -> DashboardOverviewResponse:
    clave = claims["legacy_db"]
    now = time.time()

    with _overview_lock:
        cached = _overview_cache.get(clave)
        if not force_refresh and cached and (now - cached[0]) < CACHE_TTL_SECONDS:
            data = cached[1]
        else:
            data = _build_overview(session)
            _overview_cache[clave] = (now, data)

    return DashboardOverviewResponse(**data)
