"""
Dashboard legacy — muestreo de frutos.

Fuentes:
- `muestreo_de_frutos` (detalle semanal por huerto)
- `tmimf` tipo 'O' (para calcular muestreos *debidos* con estado_fenologico=3:
  "FRUCTIFICACION - FLORACION"; cada huerto que reporta ese estado fenológico
  en una semana debería tener al menos un muestreo esa semana).

5 endpoints paralelos que el front dispara como fases progresivas.

Parámetro `semanas=N` (default 10, max 52) — últimas N semanas con registros
en `muestreo_de_frutos`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.legacy.dependencies import get_current_legacy_claims, get_legacy_db

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────


class ResumenMuestreo(BaseModel):
    rango_semanas: int
    sem_inicio_folio: int | None
    sem_fin_folio: int | None
    sem_inicio_label: str | None
    sem_fin_label: str | None
    muestreos_realizados: int
    kg_totales_muestreados: float
    huertos_muestreados: int
    muestreos_debidos: int  # pares distintos (huerto, semana) con estado_fen=3
    muestreos_cumplidos: int  # debidos que sí tienen muestreo_de_frutos
    porcentaje_cumplimiento: float
    muestreos_con_larvas: int


class CumplimientoSemana(BaseModel):
    sem_folio: int
    sem_anio: int | None
    periodo: int | None
    label: str
    debidos: int
    cumplidos: int
    porcentaje: float


class VariedadSemanaRow(BaseModel):
    sem_folio: int
    sem_anio: int | None
    periodo: int | None
    label: str
    variedad_folio: int
    variedad_nombre: str
    muestreos: int
    kgs: float


class PfaMuestreo(BaseModel):
    clave_pfa: int
    nombre: str
    inicial: str | None
    muestreos: int
    kgs: float
    semanas_con_muestreo: int
    huertos_muestreados: int


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


def _rango_semanas(session: Session, semanas: int) -> tuple[int, int]:
    row = session.execute(
        text("""
            SELECT MIN(no_semana) AS fmin, MAX(no_semana) AS fmax FROM (
                SELECT DISTINCT no_semana FROM muestreo_de_frutos
                 WHERE no_semana IS NOT NULL
                 ORDER BY no_semana DESC LIMIT :n
            ) AS sub
        """),
        {"n": int(semanas)},
    ).mappings().first()
    if not row or row["fmax"] is None:
        return (0, 0)
    return (int(row["fmin"]), int(row["fmax"]))


def _label_semana(session: Session, folio: int | None) -> str | None:
    if not folio:
        return None
    row = session.execute(
        text("SELECT no_semana, periodo FROM semanas WHERE folio = :f"),
        {"f": folio},
    ).mappings().first()
    if not row:
        return f"sem {folio}"
    return f"{row['no_semana']} - {row['periodo']}"


# ──────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────


@router.get("/resumen", response_model=ResumenMuestreo)
def resumen(
    semanas: int = Query(default=10, ge=1, le=52),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> ResumenMuestreo:
    fmin, fmax = _rango_semanas(session, semanas)
    if fmax == 0:
        return ResumenMuestreo(
            rango_semanas=semanas, sem_inicio_folio=None, sem_fin_folio=None,
            sem_inicio_label=None, sem_fin_label=None,
            muestreos_realizados=0, kg_totales_muestreados=0.0,
            huertos_muestreados=0, muestreos_debidos=0,
            muestreos_cumplidos=0, porcentaje_cumplimiento=0.0,
            muestreos_con_larvas=0,
        )

    # KPIs básicos sobre muestreo_de_frutos (numeroinscripcion sin espacios reales,
    # verificado en las 8 BDs — se omite TRIM para poder usar el índice por no_semana).
    base = session.execute(
        text("""
            SELECT COUNT(*)                                  AS mues,
                   COALESCE(SUM(kgs_muestreados), 0)         AS kgs,
                   COUNT(DISTINCT numeroinscripcion)         AS huertos,
                   SUM(CASE WHEN IFNULL(frutos_infestados,0) > 0 THEN 1 ELSE 0 END) AS con_larvas
              FROM muestreo_de_frutos
             WHERE no_semana BETWEEN :fmin AND :fmax
        """),
        {"fmin": fmin, "fmax": fmax},
    ).mappings().one()

    # Muestreos debidos = pares distintos (huerto, semana) de TMIMF O estado_fen=3 en rango
    deb = session.execute(
        text("""
            SELECT COUNT(DISTINCT CONCAT(numeroinscripcion, '|', CAST(NULLIF(semana,'') AS UNSIGNED))) AS n
              FROM tmimf
             WHERE tipo_tarjeta = 'O' AND status = 'A'
               AND estado_fenologico = 3
               AND CAST(NULLIF(semana,'') AS UNSIGNED) BETWEEN :fmin AND :fmax
        """),
        {"fmin": fmin, "fmax": fmax},
    ).scalar() or 0

    # Cumplidos = JOIN interno entre pares (huerto, semana) debidos y muestreos
    # distintos en rango. Mucho más rápido que EXISTS correlado contra una tabla
    # sin índice en numeroinscripcion.
    cumpl = session.execute(
        text("""
            SELECT COUNT(*) AS n FROM (
                SELECT t.numeroinscripcion, CAST(NULLIF(t.semana,'') AS UNSIGNED) AS sem
                  FROM tmimf t
                 WHERE t.tipo_tarjeta = 'O' AND t.status = 'A'
                   AND t.estado_fenologico = 3
                   AND CAST(NULLIF(t.semana,'') AS UNSIGNED) BETWEEN :fmin AND :fmax
                 GROUP BY t.numeroinscripcion, CAST(NULLIF(t.semana,'') AS UNSIGNED)
            ) deb
            JOIN (
                SELECT DISTINCT numeroinscripcion, no_semana
                  FROM muestreo_de_frutos
                 WHERE no_semana BETWEEN :fmin AND :fmax
            ) mu ON mu.numeroinscripcion = deb.numeroinscripcion
                AND mu.no_semana        = deb.sem
        """),
        {"fmin": fmin, "fmax": fmax},
    ).scalar() or 0

    debidos = int(deb)
    cumplidos = int(cumpl)
    pct = round((cumplidos * 100.0 / debidos), 2) if debidos > 0 else 0.0

    return ResumenMuestreo(
        rango_semanas=semanas,
        sem_inicio_folio=fmin, sem_fin_folio=fmax,
        sem_inicio_label=_label_semana(session, fmin),
        sem_fin_label=_label_semana(session, fmax),
        muestreos_realizados=int(base["mues"] or 0),
        kg_totales_muestreados=float(base["kgs"] or 0),
        huertos_muestreados=int(base["huertos"] or 0),
        muestreos_debidos=debidos,
        muestreos_cumplidos=cumplidos,
        porcentaje_cumplimiento=pct,
        muestreos_con_larvas=int(base["con_larvas"] or 0),
    )


@router.get("/cumplimiento-por-semana", response_model=list[CumplimientoSemana])
def cumplimiento_por_semana(
    semanas: int = Query(default=10, ge=1, le=52),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[CumplimientoSemana]:
    fmin, fmax = _rango_semanas(session, semanas)
    if fmax == 0:
        return []

    # Pares debidos (huerto, semana) + LEFT JOIN con muestreos distintos. Más rápido
    # que EXISTS porque MariaDB puede usar el índice no_semana en ambos lados.
    rows = session.execute(
        text("""
            SELECT deb.no_semana AS sem_folio,
                   s.no_semana   AS sem_anio,
                   s.periodo     AS periodo,
                   COUNT(*)      AS debidos,
                   SUM(CASE WHEN mu.numeroinscripcion IS NOT NULL THEN 1 ELSE 0 END) AS cumplidos
              FROM (
                SELECT DISTINCT CAST(NULLIF(semana,'') AS UNSIGNED) AS no_semana,
                                numeroinscripcion
                  FROM tmimf
                 WHERE tipo_tarjeta = 'O' AND status = 'A'
                   AND estado_fenologico = 3
                   AND CAST(NULLIF(semana,'') AS UNSIGNED) BETWEEN :fmin AND :fmax
              ) deb
              LEFT JOIN (
                SELECT DISTINCT numeroinscripcion, no_semana
                  FROM muestreo_de_frutos
                 WHERE no_semana BETWEEN :fmin AND :fmax
              ) mu ON mu.numeroinscripcion = deb.numeroinscripcion
                  AND mu.no_semana        = deb.no_semana
              LEFT JOIN semanas s ON s.folio = deb.no_semana
             GROUP BY deb.no_semana, s.no_semana, s.periodo
             ORDER BY deb.no_semana ASC
        """),
        {"fmin": fmin, "fmax": fmax},
    ).mappings().all()

    out: list[CumplimientoSemana] = []
    for r in rows:
        debidos = int(r["debidos"] or 0)
        cump = int(r["cumplidos"] or 0)
        pct = round((cump * 100.0 / debidos), 2) if debidos > 0 else 0.0
        sa, pe = r["sem_anio"], r["periodo"]
        label = f"{int(sa)}-{int(pe)}" if sa is not None and pe is not None else f"sem {int(r['sem_folio'])}"
        out.append(CumplimientoSemana(
            sem_folio=int(r["sem_folio"]), sem_anio=sa, periodo=pe, label=label,
            debidos=debidos, cumplidos=cump, porcentaje=pct,
        ))
    return out


def _por_variedad_semana(session: Session, fmin: int, fmax: int) -> list[VariedadSemanaRow]:
    rows = session.execute(
        text("""
            SELECT mf.no_semana AS sem_folio,
                   s.no_semana  AS sem_anio, s.periodo,
                   mf.variedad  AS variedad_folio,
                   COALESCE(v.descripcion, CONCAT('#', mf.variedad)) AS variedad_nombre,
                   COUNT(*) AS muestreos,
                   COALESCE(SUM(mf.kgs_muestreados), 0) AS kgs
              FROM muestreo_de_frutos mf
              LEFT JOIN semanas       s ON s.folio = mf.no_semana
              LEFT JOIN cat_variedades v ON v.folio = mf.variedad
             WHERE mf.no_semana BETWEEN :fmin AND :fmax
               AND mf.variedad IS NOT NULL
             GROUP BY mf.no_semana, s.no_semana, s.periodo, mf.variedad, v.descripcion
             ORDER BY mf.no_semana ASC, muestreos DESC
        """),
        {"fmin": fmin, "fmax": fmax},
    ).mappings().all()
    out: list[VariedadSemanaRow] = []
    for r in rows:
        sa, pe = r["sem_anio"], r["periodo"]
        label = f"{int(sa)}-{int(pe)}" if sa is not None and pe is not None else f"sem {int(r['sem_folio'])}"
        out.append(VariedadSemanaRow(
            sem_folio=int(r["sem_folio"]), sem_anio=sa, periodo=pe, label=label,
            variedad_folio=int(r["variedad_folio"] or 0),
            variedad_nombre=str(r["variedad_nombre"] or "—"),
            muestreos=int(r["muestreos"] or 0),
            kgs=float(r["kgs"] or 0),
        ))
    return out


@router.get("/muestreos-por-variedad", response_model=list[VariedadSemanaRow])
def muestreos_por_variedad(
    semanas: int = Query(default=10, ge=1, le=52),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[VariedadSemanaRow]:
    fmin, fmax = _rango_semanas(session, semanas)
    if fmax == 0:
        return []
    return _por_variedad_semana(session, fmin, fmax)


@router.get("/kgs-por-variedad", response_model=list[VariedadSemanaRow])
def kgs_por_variedad(
    semanas: int = Query(default=10, ge=1, le=52),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[VariedadSemanaRow]:
    # Mismo payload que muestreos; el front lee `kgs` en vez de `muestreos`.
    # Se expone como endpoint separado para que las fases corran en paralelo
    # sin acoplarse.
    fmin, fmax = _rango_semanas(session, semanas)
    if fmax == 0:
        return []
    return _por_variedad_semana(session, fmin, fmax)


@router.get("/por-pfa", response_model=list[PfaMuestreo])
def top_pfas(
    semanas: int = Query(default=10, ge=1, le=52),
    limit: int = Query(default=10, ge=1, le=25),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[PfaMuestreo]:
    fmin, fmax = _rango_semanas(session, semanas)
    if fmax == 0:
        return []
    rows = session.execute(
        text("""
            SELECT r.clave_pfa AS clave_pfa,
                   COALESCE(f.nombre, CONCAT('#', r.clave_pfa)) AS nombre,
                   f.inicial_funcionario AS inicial,
                   COUNT(*) AS muestreos,
                   COALESCE(SUM(mf.kgs_muestreados), 0) AS kgs,
                   COUNT(DISTINCT mf.no_semana) AS semanas_cap,
                   COUNT(DISTINCT mf.numeroinscripcion) AS huertos
              FROM muestreo_de_frutos mf
              JOIN sv01_sv02 sv ON sv.numeroinscripcion = mf.numeroinscripcion
              JOIN cat_rutas  r ON r.folio = sv.folio_ruta
              LEFT JOIN cat_funcionarios f ON f.folio = r.clave_pfa
             WHERE mf.no_semana BETWEEN :fmin AND :fmax
             GROUP BY r.clave_pfa, f.nombre, f.inicial_funcionario
             ORDER BY COUNT(*) DESC
             LIMIT :lim
        """),
        {"fmin": fmin, "fmax": fmax, "lim": limit},
    ).mappings().all()
    return [
        PfaMuestreo(
            clave_pfa=int(r["clave_pfa"] or 0),
            nombre=str(r["nombre"] or "—"),
            inicial=(str(r["inicial"]) if r["inicial"] else None),
            muestreos=int(r["muestreos"] or 0),
            kgs=float(r["kgs"] or 0),
            semanas_con_muestreo=int(r["semanas_cap"] or 0),
            huertos_muestreados=int(r["huertos"] or 0),
        )
        for r in rows
    ]
