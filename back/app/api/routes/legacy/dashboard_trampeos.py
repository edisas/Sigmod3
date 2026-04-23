"""
Dashboard legacy — capturas de trampeo (revisiones con status=2 "Revisada con captura").

Fuente principal: tabla `identificacion` (una fila por especie identificada en una
trampa_revisión con captura). Conteos por hembras_silvestre / machos_silvestre /
hembras_esteril / machos_esteril.

MTD estatal por semana: promedio ponderado sobre TMIMF tipo 'O' activas:
  MTD = Σ(mtd_promedio_semanal × trampas_revisadas) / Σ(trampas_revisadas)

Parámetro `semanas`: N últimas semanas (folios) con datos.

5 endpoints independientes — el front los dispara en paralelo como fases para
poder pintar el avance con barra de progreso.
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


class ResumenKpis(BaseModel):
    rango_semanas: int
    sem_inicio_folio: int | None
    sem_fin_folio: int | None
    sem_inicio_label: str | None
    sem_fin_label: str | None
    revisiones_con_captura: int
    trampas_con_captura: int
    huertos_con_captura: int
    moscas_silvestres: int
    moscas_esteriles: int
    especies_distintas: int


class EspecieRow(BaseModel):
    folio: int
    nombre: str
    hembras_silvestre: int
    machos_silvestre: int
    hembras_esteril: int
    machos_esteril: int
    total_silvestre: int
    total_esteril: int
    total: int


class SexoTotales(BaseModel):
    hembras_silvestre: int
    machos_silvestre: int
    hembras_esteril: int
    machos_esteril: int


class CapturasPorSemana(BaseModel):
    sem_folio: int
    sem_anio: int | None
    periodo: int | None
    label: str
    hembras_silvestre: int
    machos_silvestre: int
    hembras_esteril: int
    machos_esteril: int
    silvestre: int
    esteril: int
    mtd_estatal: float


class PfaCaptura(BaseModel):
    clave_pfa: int
    nombre: str
    inicial: str | None
    revisiones_con_captura: int
    silvestre: int
    esteril: int
    semanas_con_captura: int  # "frecuencia": en cuántas semanas distintas capturó


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


def _rango_semanas(session: Session, semanas: int) -> tuple[int, int]:
    """Devuelve (folio_min, folio_max) de identificacion para las N últimas semanas con data."""
    row = session.execute(
        text("""
            SELECT MIN(no_semana) AS fmin, MAX(no_semana) AS fmax FROM (
                SELECT DISTINCT no_semana FROM identificacion
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


@router.get("/resumen", response_model=ResumenKpis)
def resumen(
    semanas: int = Query(default=10, ge=1, le=52),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> ResumenKpis:
    fmin, fmax = _rango_semanas(session, semanas)
    if fmax == 0:
        return ResumenKpis(
            rango_semanas=semanas, sem_inicio_folio=None, sem_fin_folio=None,
            sem_inicio_label=None, sem_fin_label=None,
            revisiones_con_captura=0, trampas_con_captura=0, huertos_con_captura=0,
            moscas_silvestres=0, moscas_esteriles=0, especies_distintas=0,
        )
    row = session.execute(
        text("""
            SELECT COUNT(DISTINCT i.folio_revision)                          AS rev,
                   COUNT(DISTINCT i.no_trampa)                               AS trampas,
                   COUNT(DISTINCT TRIM(tp.numeroinscripcion))                AS huertos,
                   SUM(IFNULL(i.hembras_silvestre,0)+IFNULL(i.machos_silvestre,0)) AS silv,
                   SUM(IFNULL(i.hembras_esteril,0)+IFNULL(i.machos_esteril,0))     AS estr,
                   COUNT(DISTINCT i.tipo_especie)                            AS esp
              FROM identificacion i
              LEFT JOIN trampas tp ON tp.no_trampa = i.no_trampa
             WHERE i.no_semana BETWEEN :fmin AND :fmax
        """),
        {"fmin": fmin, "fmax": fmax},
    ).mappings().one()
    return ResumenKpis(
        rango_semanas=semanas,
        sem_inicio_folio=fmin, sem_fin_folio=fmax,
        sem_inicio_label=_label_semana(session, fmin),
        sem_fin_label=_label_semana(session, fmax),
        revisiones_con_captura=int(row["rev"] or 0),
        trampas_con_captura=int(row["trampas"] or 0),
        huertos_con_captura=int(row["huertos"] or 0),
        moscas_silvestres=int(row["silv"] or 0),
        moscas_esteriles=int(row["estr"] or 0),
        especies_distintas=int(row["esp"] or 0),
    )


@router.get("/especies", response_model=list[EspecieRow])
def top_especies(
    semanas: int = Query(default=10, ge=1, le=52),
    limit: int = Query(default=8, ge=1, le=25),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[EspecieRow]:
    fmin, fmax = _rango_semanas(session, semanas)
    if fmax == 0:
        return []
    rows = session.execute(
        text("""
            SELECT i.tipo_especie AS folio,
                   COALESCE(e.nombre, CONCAT('#', i.tipo_especie)) AS nombre,
                   SUM(IFNULL(i.hembras_silvestre,0)) AS hs,
                   SUM(IFNULL(i.machos_silvestre,0))  AS ms,
                   SUM(IFNULL(i.hembras_esteril,0))   AS he,
                   SUM(IFNULL(i.machos_esteril,0))    AS me
              FROM identificacion i
              LEFT JOIN cat_especies e ON e.folio = i.tipo_especie
             WHERE i.no_semana BETWEEN :fmin AND :fmax
               AND i.tipo_especie IS NOT NULL
             GROUP BY i.tipo_especie, e.nombre
             ORDER BY (SUM(IFNULL(i.hembras_silvestre,0)+IFNULL(i.machos_silvestre,0))
                     + SUM(IFNULL(i.hembras_esteril,0)+IFNULL(i.machos_esteril,0))) DESC
             LIMIT :lim
        """),
        {"fmin": fmin, "fmax": fmax, "lim": limit},
    ).mappings().all()
    out: list[EspecieRow] = []
    for r in rows:
        hs = int(r["hs"] or 0); ms = int(r["ms"] or 0)
        he = int(r["he"] or 0); me = int(r["me"] or 0)
        silv = hs + ms
        estr = he + me
        out.append(EspecieRow(
            folio=int(r["folio"] or 0),
            nombre=str(r["nombre"] or f"#{r['folio']}"),
            hembras_silvestre=hs, machos_silvestre=ms,
            hembras_esteril=he,   machos_esteril=me,
            total_silvestre=silv, total_esteril=estr,
            total=silv + estr,
        ))
    return out


@router.get("/sexo", response_model=SexoTotales)
def totales_sexo(
    semanas: int = Query(default=10, ge=1, le=52),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> SexoTotales:
    fmin, fmax = _rango_semanas(session, semanas)
    if fmax == 0:
        return SexoTotales(hembras_silvestre=0, machos_silvestre=0, hembras_esteril=0, machos_esteril=0)
    row = session.execute(
        text("""
            SELECT SUM(IFNULL(hembras_silvestre,0)) hs,
                   SUM(IFNULL(machos_silvestre,0))  ms,
                   SUM(IFNULL(hembras_esteril,0))   he,
                   SUM(IFNULL(machos_esteril,0))    me
              FROM identificacion
             WHERE no_semana BETWEEN :fmin AND :fmax
        """),
        {"fmin": fmin, "fmax": fmax},
    ).mappings().one()
    return SexoTotales(
        hembras_silvestre=int(row["hs"] or 0),
        machos_silvestre=int(row["ms"] or 0),
        hembras_esteril=int(row["he"] or 0),
        machos_esteril=int(row["me"] or 0),
    )


@router.get("/por-semana", response_model=list[CapturasPorSemana])
def capturas_por_semana(
    semanas: int = Query(default=10, ge=1, le=52),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[CapturasPorSemana]:
    fmin, fmax = _rango_semanas(session, semanas)
    if fmax == 0:
        return []

    # Capturas agregadas por semana
    cap_rows = session.execute(
        text("""
            SELECT i.no_semana AS sem_folio,
                   s.no_semana AS sem_anio, s.periodo,
                   SUM(IFNULL(i.hembras_silvestre,0)) hs,
                   SUM(IFNULL(i.machos_silvestre,0))  ms,
                   SUM(IFNULL(i.hembras_esteril,0))   he,
                   SUM(IFNULL(i.machos_esteril,0))    me
              FROM identificacion i
              LEFT JOIN semanas s ON s.folio = i.no_semana
             WHERE i.no_semana BETWEEN :fmin AND :fmax
             GROUP BY i.no_semana, s.no_semana, s.periodo
             ORDER BY i.no_semana ASC
        """),
        {"fmin": fmin, "fmax": fmax},
    ).mappings().all()

    # MTD estatal por semana (TMIMF tipo 'O' weighted avg)
    mtd_rows = session.execute(
        text("""
            SELECT CAST(NULLIF(tmi.semana,'') AS UNSIGNED) AS sem_folio,
                   SUM(CAST(IFNULL(tmi.mtd_promedio_semanal,0) AS DECIMAL(14,6))
                       * IFNULL(tmi.trampas_revisadas,0)) AS num,
                   SUM(IFNULL(tmi.trampas_revisadas,0))   AS den
              FROM tmimf tmi
             WHERE tmi.tipo_tarjeta = 'O'
               AND tmi.status = 'A'
               AND CAST(NULLIF(tmi.semana,'') AS UNSIGNED) BETWEEN :fmin AND :fmax
             GROUP BY sem_folio
        """),
        {"fmin": fmin, "fmax": fmax},
    ).mappings().all()
    mtd_map: dict[int, float] = {}
    for m in mtd_rows:
        den = float(m["den"] or 0)
        mtd_map[int(m["sem_folio"] or 0)] = (float(m["num"] or 0) / den) if den > 0 else 0.0

    out: list[CapturasPorSemana] = []
    for r in cap_rows:
        hs = int(r["hs"] or 0); ms = int(r["ms"] or 0)
        he = int(r["he"] or 0); me = int(r["me"] or 0)
        sem_folio = int(r["sem_folio"])
        sem_anio = r["sem_anio"]
        periodo = r["periodo"]
        label = f"{int(sem_anio)}-{int(periodo)}" if (sem_anio is not None and periodo is not None) else f"sem {sem_folio}"
        out.append(CapturasPorSemana(
            sem_folio=sem_folio, sem_anio=sem_anio, periodo=periodo, label=label,
            hembras_silvestre=hs, machos_silvestre=ms,
            hembras_esteril=he, machos_esteril=me,
            silvestre=hs + ms, esteril=he + me,
            mtd_estatal=round(mtd_map.get(sem_folio, 0.0), 4),
        ))
    return out


@router.get("/por-pfa", response_model=list[PfaCaptura])
def top_pfas(
    semanas: int = Query(default=10, ge=1, le=52),
    limit: int = Query(default=10, ge=1, le=25),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[PfaCaptura]:
    fmin, fmax = _rango_semanas(session, semanas)
    if fmax == 0:
        return []
    rows = session.execute(
        text("""
            SELECT r.clave_pfa AS clave_pfa,
                   COALESCE(f.nombre, CONCAT('#', r.clave_pfa)) AS nombre,
                   f.inicial_funcionario AS inicial,
                   COUNT(DISTINCT i.folio_revision) AS revs,
                   SUM(IFNULL(i.hembras_silvestre,0)+IFNULL(i.machos_silvestre,0)) AS silv,
                   SUM(IFNULL(i.hembras_esteril,0)+IFNULL(i.machos_esteril,0))     AS estr,
                   COUNT(DISTINCT i.no_semana) AS semanas_cap
              FROM identificacion i
              JOIN trampas tp  ON tp.no_trampa = i.no_trampa
              JOIN sv01_sv02 sv ON TRIM(sv.numeroinscripcion) = TRIM(tp.numeroinscripcion)
              JOIN cat_rutas r ON r.folio = sv.folio_ruta
              LEFT JOIN cat_funcionarios f ON f.folio = r.clave_pfa
             WHERE i.no_semana BETWEEN :fmin AND :fmax
             GROUP BY r.clave_pfa, f.nombre, f.inicial_funcionario
             ORDER BY COUNT(DISTINCT i.folio_revision) DESC
             LIMIT :lim
        """),
        {"fmin": fmin, "fmax": fmax, "lim": limit},
    ).mappings().all()
    return [
        PfaCaptura(
            clave_pfa=int(r["clave_pfa"] or 0),
            nombre=str(r["nombre"] or "—"),
            inicial=(str(r["inicial"]) if r["inicial"] else None),
            revisiones_con_captura=int(r["revs"] or 0),
            silvestre=int(r["silv"] or 0),
            esteril=int(r["estr"] or 0),
            semanas_con_captura=int(r["semanas_cap"] or 0),
        )
        for r in rows
    ]
