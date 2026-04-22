"""
Informe general por PFA (rango de semanas).

Se expone como 6 endpoints independientes — uno por sección — para que el frontend
pueda llamarlos en paralelo y mostrar una barra de progreso por fase.

Fases:
  I   · huertos       — huertos atendidos, superficie, prevalencia por MTD
  II  · trampeo       — instaladas, revisadas, %, fértiles, estériles, días, MTD región
  III · muestreo      — muestras tomadas, con larva, frutos, larvas/kg
  IV  · control-quimico
  V   · control-cultural
  VI  · generalidades — TMIMF emitidas y toneladas por mercado
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.legacy.dependencies import get_legacy_db

router = APIRouter()

REV_STATUS_REVISADAS = (1, 2, 6)   # Revisada, revisada c/captura, extemporanea
PFA_CARGO_LIKE = "%PROFESIONAL%FITOS%"
MTD_UMBRAL_ALTA = 1.0
MTD_UMBRAL_BAJA = 0.0


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────

class RangoParams(BaseModel):
    pfa_folio: int
    semana_inicio: int
    semana_fin: int


class HuertosSeccion(BaseModel):
    huertos_atendidos: int
    superficie_ha: float
    huertos_alta_prevalencia: int
    huertos_baja_prevalencia: int
    huertos_nula_prevalencia: int


class TrampeoSeccion(BaseModel):
    trampas_instaladas_total: int
    semanas_en_rango: int
    trampas_instaladas_x_semanas: int
    trampas_revisadas: int
    porcentaje_revisadas: float
    trampas_con_mosca_fertil: int
    trampas_con_mosca_esteril: int
    dias_exposicion_promedio: float
    mtd_region: float


class MuestreoSeccion(BaseModel):
    muestreos_tomados: int
    muestreos_con_larva: int
    larvas_por_kg: float
    frutos_muestreados: int
    frutos_infestados: int


class ControlQuimicoSeccion(BaseModel):
    hectareas_asperjadas: float
    litros_asperjados: float
    estaciones_cebo: int
    huertos_con_control: int


class ControlCulturalSeccion(BaseModel):
    kgs_destruidos: float
    arboles_eliminados: int
    hectareas_rastreadas: float


class GeneralidadesSeccion(BaseModel):
    tmimf_emitidas: int
    toneladas_movilizadas: float
    embarques_exportacion: int
    embarques_nacional: int
    toneladas_exportacion: float
    toneladas_nacional: float


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────

def _validar_pfa_y_rango(session: Session, pfa: int, s_ini: int, s_fin: int) -> None:
    if s_ini > s_fin:
        raise HTTPException(status_code=400, detail="semana_inicio debe ser ≤ semana_fin")
    exists = session.execute(
        text("SELECT 1 FROM cat_funcionarios WHERE folio = :p AND UPPER(cargo) LIKE :c"),
        {"p": pfa, "c": PFA_CARGO_LIKE},
    ).first()
    if not exists:
        raise HTTPException(status_code=404, detail=f"PFA {pfa} no encontrado")


def _params(
    pfa_folio: int = Query(..., ge=1),
    semana_inicio: int = Query(..., ge=1),
    semana_fin: int = Query(..., ge=1),
) -> dict:
    return {"pfa": pfa_folio, "s_ini": semana_inicio, "s_fin": semana_fin}


# ──────────────────────────────────────────────────────────────────────
# I · Huertos
# ──────────────────────────────────────────────────────────────────────

@router.get("/huertos", response_model=HuertosSeccion)
def huertos(params: dict = Depends(_params), session: Session = Depends(get_legacy_db)) -> HuertosSeccion:
    _validar_pfa_y_rango(session, params["pfa"], params["s_ini"], params["s_fin"])

    totales = session.execute(text("""
        SELECT
          COUNT(*)                           AS huertos,
          COALESCE(SUM(sup_por_huerto), 0)   AS superficie_total
        FROM (
            SELECT sv.numeroinscripcion,
                   COALESCE(SUM(cs.superficie), 0) AS sup_por_huerto
            FROM sv01_sv02 sv
            JOIN cat_rutas r                     ON r.folio = sv.folio_ruta
            LEFT JOIN cat_superficie_registrada cs ON TRIM(cs.numeroinscripcion) = TRIM(sv.numeroinscripcion)
            WHERE r.clave_pfa = :pfa AND sv.status = 'A'
            GROUP BY sv.numeroinscripcion
        ) t
    """), params).mappings().first()

    mtd_huertos = session.execute(text("""
        SELECT sv.numeroinscripcion,
               COALESCE(SUM(IFNULL(i.hembras_silvestre,0) + IFNULL(i.machos_silvestre,0)), 0) AS moscas_fertiles,
               COALESCE(SUM(tr.dias_exposicion), 0) AS total_dias
        FROM sv01_sv02 sv
        JOIN cat_rutas r           ON r.folio = sv.folio_ruta
        JOIN trampas tp            ON TRIM(tp.numeroinscripcion) = TRIM(sv.numeroinscripcion)
        JOIN trampas_revision tr   ON tr.no_trampa = tp.no_trampa
        LEFT JOIN identificacion i ON i.no_trampa = tr.no_trampa AND i.no_semana = tr.no_semana
        WHERE r.clave_pfa = :pfa
          AND sv.status = 'A'
          AND tr.no_semana BETWEEN :s_ini AND :s_fin
          AND tr.status_revision IN :rev
        GROUP BY sv.numeroinscripcion
    """).bindparams(**{"rev": list(REV_STATUS_REVISADAS)}), params).mappings().all()

    alta = baja = nula = 0
    for row in mtd_huertos:
        dias = float(row["total_dias"] or 0)
        moscas = float(row["moscas_fertiles"] or 0)
        mtd = (moscas / dias) if dias > 0 else 0.0
        if mtd >= MTD_UMBRAL_ALTA:
            alta += 1
        elif mtd > MTD_UMBRAL_BAJA:
            baja += 1
        else:
            nula += 1

    return HuertosSeccion(
        huertos_atendidos=int(totales["huertos"] or 0),
        superficie_ha=round(float(totales["superficie_total"] or 0), 4),
        huertos_alta_prevalencia=alta,
        huertos_baja_prevalencia=baja,
        huertos_nula_prevalencia=nula,
    )


# ──────────────────────────────────────────────────────────────────────
# II · Trampeo
# ──────────────────────────────────────────────────────────────────────

@router.get("/trampeo", response_model=TrampeoSeccion)
def trampeo(params: dict = Depends(_params), session: Session = Depends(get_legacy_db)) -> TrampeoSeccion:
    _validar_pfa_y_rango(session, params["pfa"], params["s_ini"], params["s_fin"])
    semanas = params["s_fin"] - params["s_ini"] + 1

    instaladas_row = session.execute(text("""
        SELECT COUNT(DISTINCT tp.no_trampa) AS total
        FROM trampas tp
        JOIN sv01_sv02 sv ON TRIM(sv.numeroinscripcion) = TRIM(tp.numeroinscripcion)
        JOIN cat_rutas r  ON r.folio = sv.folio_ruta
        WHERE r.clave_pfa = :pfa AND tp.status = 'A' AND sv.status = 'A'
    """), params).mappings().first()
    trampas_instaladas = int(instaladas_row["total"] or 0)

    rev_row = session.execute(text("""
        SELECT
          COUNT(*)                                  AS revisadas,
          COALESCE(SUM(tr.dias_exposicion), 0)      AS dias_total,
          COALESCE(
            SUM(IFNULL(i.hembras_silvestre,0) + IFNULL(i.machos_silvestre,0)), 0
          )                                         AS moscas_fertiles,
          COALESCE(
            SUM(IFNULL(i.hembras_esteril,0) + IFNULL(i.machos_esteril,0)), 0
          )                                         AS moscas_esteriles,
          COUNT(DISTINCT CASE
              WHEN IFNULL(i.hembras_silvestre,0)+IFNULL(i.machos_silvestre,0) > 0
                THEN tr.no_trampa END)              AS trampas_c_fertil,
          COUNT(DISTINCT CASE
              WHEN IFNULL(i.hembras_esteril,0)+IFNULL(i.machos_esteril,0) > 0
                THEN tr.no_trampa END)              AS trampas_c_esteril
        FROM trampas_revision tr
        JOIN trampas tp ON tp.no_trampa = tr.no_trampa
        JOIN sv01_sv02 sv ON TRIM(sv.numeroinscripcion) = TRIM(tp.numeroinscripcion)
        JOIN cat_rutas r ON r.folio = sv.folio_ruta
        LEFT JOIN identificacion i ON i.no_trampa = tr.no_trampa AND i.no_semana = tr.no_semana
        WHERE r.clave_pfa = :pfa
          AND tr.no_semana BETWEEN :s_ini AND :s_fin
          AND tr.status_revision IN :rev
    """).bindparams(**{"rev": list(REV_STATUS_REVISADAS)}), params).mappings().first()

    revisadas = int(rev_row["revisadas"] or 0)
    dias_total = int(rev_row["dias_total"] or 0)
    moscas_fertiles = int(rev_row["moscas_fertiles"] or 0)
    denom = trampas_instaladas * semanas
    pct = (revisadas * 100 / denom) if denom > 0 else 0.0
    dias_promedio = (dias_total / revisadas) if revisadas > 0 else 0.0
    mtd = (moscas_fertiles / dias_total) if dias_total > 0 else 0.0

    return TrampeoSeccion(
        trampas_instaladas_total=trampas_instaladas,
        semanas_en_rango=semanas,
        trampas_instaladas_x_semanas=denom,
        trampas_revisadas=revisadas,
        porcentaje_revisadas=round(pct, 2),
        trampas_con_mosca_fertil=int(rev_row["trampas_c_fertil"] or 0),
        trampas_con_mosca_esteril=int(rev_row["trampas_c_esteril"] or 0),
        dias_exposicion_promedio=round(dias_promedio, 2),
        mtd_region=round(mtd, 4),
    )


# ──────────────────────────────────────────────────────────────────────
# III · Muestreo
# ──────────────────────────────────────────────────────────────────────

@router.get("/muestreo", response_model=MuestreoSeccion)
def muestreo(params: dict = Depends(_params), session: Session = Depends(get_legacy_db)) -> MuestreoSeccion:
    _validar_pfa_y_rango(session, params["pfa"], params["s_ini"], params["s_fin"])

    row = session.execute(text("""
        SELECT
          COUNT(DISTINCT m.no_muestra)                                AS muestreos,
          COUNT(DISTINCT CASE WHEN m.frutos_infestados > 0 THEN m.no_muestra END) AS con_larva,
          COALESCE(SUM(m.no_frutos), 0)                               AS frutos,
          COALESCE(SUM(m.frutos_infestados), 0)                       AS infestados,
          COALESCE(SUM(m.kgs_muestreados), 0)                         AS kgs
        FROM muestreo_de_frutos m
        JOIN sv01_sv02 sv ON TRIM(sv.numeroinscripcion) = TRIM(m.numeroinscripcion)
        JOIN cat_rutas r  ON r.folio = sv.folio_ruta
        WHERE r.clave_pfa = :pfa
          AND m.no_semana BETWEEN :s_ini AND :s_fin
    """), params).mappings().first()

    larvas_row = session.execute(text("""
        SELECT COALESCE(SUM(il.no_larvas), 0) AS larvas
        FROM identificacion_laboratorio il
        JOIN muestreo_de_frutos m ON m.no_muestra = il.no_muestra
        JOIN sv01_sv02 sv ON TRIM(sv.numeroinscripcion) = TRIM(m.numeroinscripcion)
        JOIN cat_rutas r  ON r.folio = sv.folio_ruta
        WHERE r.clave_pfa = :pfa
          AND m.no_semana BETWEEN :s_ini AND :s_fin
    """), params).mappings().first()

    kgs = float(row["kgs"] or 0)
    larvas = int(larvas_row["larvas"] or 0)
    larvas_kg = (larvas / kgs) if kgs > 0 else 0.0

    return MuestreoSeccion(
        muestreos_tomados=int(row["muestreos"] or 0),
        muestreos_con_larva=int(row["con_larva"] or 0),
        larvas_por_kg=round(larvas_kg, 4),
        frutos_muestreados=int(row["frutos"] or 0),
        frutos_infestados=int(row["infestados"] or 0),
    )


# ──────────────────────────────────────────────────────────────────────
# IV · Control químico
# ──────────────────────────────────────────────────────────────────────

@router.get("/control-quimico", response_model=ControlQuimicoSeccion)
def control_quimico(params: dict = Depends(_params), session: Session = Depends(get_legacy_db)) -> ControlQuimicoSeccion:
    _validar_pfa_y_rango(session, params["pfa"], params["s_ini"], params["s_fin"])

    row = session.execute(text("""
        SELECT
          COALESCE(SUM(cq.superficie), 0)                                           AS has,
          COALESCE(SUM(cq.proteina_lts + cq.malathion_lts + cq.agua_lts), 0)        AS litros,
          COALESCE(SUM(cq.estaciones_cebo), 0)                                      AS cebo,
          COUNT(DISTINCT cq.numeroinscripcion)                                      AS huertos
        FROM control_quimico cq
        JOIN sv01_sv02 sv ON TRIM(sv.numeroinscripcion) = TRIM(cq.numeroinscripcion)
        JOIN cat_rutas r  ON r.folio = sv.folio_ruta
        WHERE r.clave_pfa = :pfa
          AND cq.no_semana BETWEEN :s_ini AND :s_fin
    """), params).mappings().first()

    return ControlQuimicoSeccion(
        hectareas_asperjadas=round(float(row["has"] or 0), 4),
        litros_asperjados=round(float(row["litros"] or 0), 2),
        estaciones_cebo=int(row["cebo"] or 0),
        huertos_con_control=int(row["huertos"] or 0),
    )


# ──────────────────────────────────────────────────────────────────────
# V · Control mecánico-cultural
# ──────────────────────────────────────────────────────────────────────

@router.get("/control-cultural", response_model=ControlCulturalSeccion)
def control_cultural(params: dict = Depends(_params), session: Session = Depends(get_legacy_db)) -> ControlCulturalSeccion:
    _validar_pfa_y_rango(session, params["pfa"], params["s_ini"], params["s_fin"])

    row = session.execute(text("""
        SELECT
          COALESCE(SUM(cmc.kgs_destruidos), 0) AS kgs,
          COALESCE(SUM(cmc.no_arboles), 0)     AS arboles,
          COALESCE(SUM(cmc.has_rastreadas), 0) AS has
        FROM control_mecanico_cultural cmc
        JOIN sv01_sv02 sv ON TRIM(sv.numeroinscripcion) = TRIM(cmc.numeroinscripcion)
        JOIN cat_rutas r  ON r.folio = sv.folio_ruta
        WHERE r.clave_pfa = :pfa
          AND cmc.no_semana BETWEEN :s_ini AND :s_fin
    """), params).mappings().first()

    return ControlCulturalSeccion(
        kgs_destruidos=round(float(row["kgs"] or 0), 2),
        arboles_eliminados=int(row["arboles"] or 0),
        hectareas_rastreadas=round(float(row["has"] or 0), 4),
    )


# ──────────────────────────────────────────────────────────────────────
# VI · Generalidades (TMIMF)
# ──────────────────────────────────────────────────────────────────────

@router.get("/generalidades", response_model=GeneralidadesSeccion)
def generalidades(params: dict = Depends(_params), session: Session = Depends(get_legacy_db)) -> GeneralidadesSeccion:
    _validar_pfa_y_rango(session, params["pfa"], params["s_ini"], params["s_fin"])

    row = session.execute(text("""
        SELECT
          COUNT(*)                                                  AS tmimf_total,
          SUM(CASE WHEN t.mercado_destino = 1 THEN 1 ELSE 0 END)    AS tmimf_exp,
          SUM(CASE WHEN t.mercado_destino > 1 THEN 1 ELSE 0 END)    AS tmimf_nal
        FROM tmimf t
        WHERE t.clave_aprobado = :pfa
          AND t.tipo_tarjeta = 'M'
          AND t.status = 'A'
          AND CAST(NULLIF(t.semana, '') AS UNSIGNED) BETWEEN :s_ini AND :s_fin
    """), params).mappings().first()

    ton_row = session.execute(text("""
        SELECT
          COALESCE(SUM(det.cantidad_movilizada), 0)                                 AS ton_total,
          COALESCE(SUM(CASE WHEN t.mercado_destino = 1
                            THEN det.cantidad_movilizada ELSE 0 END), 0)            AS ton_exp,
          COALESCE(SUM(CASE WHEN t.mercado_destino > 1
                            THEN det.cantidad_movilizada ELSE 0 END), 0)            AS ton_nal
        FROM tmimf t
        JOIN detallado_tmimf det ON det.folio_completo = t.folio_tmimf
        WHERE t.clave_aprobado = :pfa
          AND t.tipo_tarjeta = 'M'
          AND t.status = 'A'
          AND det.status <> 'C'
          AND CAST(NULLIF(t.semana, '') AS UNSIGNED) BETWEEN :s_ini AND :s_fin
    """), params).mappings().first()

    return GeneralidadesSeccion(
        tmimf_emitidas=int(row["tmimf_total"] or 0),
        toneladas_movilizadas=round(float(ton_row["ton_total"] or 0) / 1000, 3),
        embarques_exportacion=int(row["tmimf_exp"] or 0),
        embarques_nacional=int(row["tmimf_nal"] or 0),
        toneladas_exportacion=round(float(ton_row["ton_exp"] or 0) / 1000, 3),
        toneladas_nacional=round(float(ton_row["ton_nal"] or 0) / 1000, 3),
    )
