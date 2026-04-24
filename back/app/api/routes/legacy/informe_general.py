"""
Informe general por PFA (rango de semanas).

Fuente principal: TMIMF (tarjeta tipo 'O' con consolidado semanal operativo,
tarjeta tipo 'M' con movilización y detallado_tmimf). Se complementa con
consultas a trampas_revision + identificacion (fértil/estéril), control_quimico
(estaciones cebo) y control_mecanico_cultural (árboles, has rastreadas).

Si no hay TMIMF del PFA en el rango → informe "sin actividad".
"""

from datetime import datetime
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.legacy.dependencies import get_legacy_db

router = APIRouter()

REV_STATUS_REVISADAS = (1, 2, 6)
PFA_CARGO_LIKE = "%PROFESIONAL%FITOS%"
MTD_UMBRAL_ALTA = 1.0
MTD_UMBRAL_BAJA = 0.0
MAX_SEMANAS_RANGO = 4

LOGO_PATH = Path(__file__).resolve().parent.parent.parent.parent / "app" / "assets" / "senasica.png"
if not LOGO_PATH.exists():
    LOGO_PATH = Path(__file__).resolve().parent.parent.parent.parent / "assets" / "senasica.png"


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────


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
    kg_fruta_muestreada: float


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


class PfaInfo(BaseModel):
    folio: int
    nombre: str
    cedula: str | None
    cargo: str


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


def _validar_pfa_y_rango(session: Session, pfa: int, s_ini: int, s_fin: int) -> PfaInfo:
    if s_ini > s_fin:
        raise HTTPException(status_code=400, detail="semana_inicio debe ser ≤ semana_fin")
    semanas = s_fin - s_ini + 1
    if semanas > MAX_SEMANAS_RANGO:
        raise HTTPException(
            status_code=400,
            detail=f"El rango no puede exceder {MAX_SEMANAS_RANGO} semanas (seleccionaste {semanas}).",
        )
    row = session.execute(
        text("SELECT folio, nombre, cedula, cargo FROM cat_funcionarios WHERE folio = :p AND UPPER(cargo) LIKE :c"),
        {"p": pfa, "c": PFA_CARGO_LIKE},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail=f"PFA {pfa} no encontrado")
    return PfaInfo(
        folio=int(row["folio"]),
        nombre=str(row["nombre"] or "").strip(),
        cedula=(str(row["cedula"]).strip() if row["cedula"] else None),
        cargo=str(row["cargo"] or "").strip(),
    )


def _params(
    pfa_folio: int = Query(..., ge=1),
    semana_inicio: int = Query(..., ge=1),
    semana_fin: int = Query(..., ge=1),
) -> dict:
    return {"pfa": pfa_folio, "s_ini": semana_inicio, "s_fin": semana_fin}


def _get_semana_info(session: Session, folio: int) -> dict | None:
    row = session.execute(
        text("SELECT folio, no_semana, periodo, fecha_inicio, fecha_final FROM semanas WHERE folio = :f"),
        {"f": folio},
    ).mappings().first()
    return dict(row) if row else None


def _tiene_actividad(session: Session, params: dict) -> bool:
    """True si el PFA tiene al menos una TMIMF (tipo O o M) en el rango."""
    n = session.execute(text("""
        SELECT COUNT(*) FROM tmimf
        WHERE clave_aprobado = :pfa AND status = 'A'
          AND CAST(NULLIF(semana,'') AS UNSIGNED) BETWEEN :s_ini AND :s_fin
    """), params).scalar()
    return int(n or 0) > 0


# ──────────────────────────────────────────────────────────────────────
# Agregado principal: TMIMF tipo 'O' por huerto
# ──────────────────────────────────────────────────────────────────────


def _agregado_tmimf_o(session: Session, params: dict) -> list[dict]:
    """
    Devuelve una fila por huerto (numeroinscripcion) con todos los consolidados
    de sus TMIMF tipo 'O' en el rango. Una query única.
    """
    rows = session.execute(text("""
        SELECT
          TRIM(tmi.numeroinscripcion)                                   AS ni,
          SUM(IFNULL(tmi.num_trampas_instaladas, 0))                    AS trampas_instaladas,
          SUM(IFNULL(tmi.trampas_revisadas, 0))                         AS trampas_revisadas,
          SUM(IFNULL(tmi.dias_exposicion_trampa, 0))                    AS dias_exposicion_sum,
          COUNT(*)                                                      AS tmimfs_o,
          SUM(IFNULL(tmi.mtd_promedio_semanal, 0) * IFNULL(tmi.num_trampas_instaladas, 0)) AS mtd_num,
          SUM(IFNULL(tmi.num_trampas_instaladas, 0))                    AS mtd_den,
          SUM(IFNULL(tmi.kg_fruta_muestreada, 0))                       AS kg_muestreada,
          SUM(IFNULL(tmi.larvas_por_kg_fruta, 0))                       AS larvas_kg_sum,
          SUM(CASE WHEN IFNULL(tmi.kg_fruta_muestreada, 0) > 0 THEN 1 ELSE 0 END)  AS muestreos_tomados,
          SUM(CASE WHEN IFNULL(tmi.larvas_por_kg_fruta, 0) > 0 THEN 1 ELSE 0 END)  AS muestreos_con_larva,
          SUM(IFNULL(tmi.superficie_asperjada, 0))                      AS has_asperjadas,
          SUM(IFNULL(tmi.litros_mezcla_asperjada, 0))                   AS litros_asperjados,
          SUM(IFNULL(tmi.kg_fruta_destruida, 0))                        AS kg_destruidos
        FROM tmimf tmi
        WHERE tmi.clave_aprobado = :pfa
          AND tmi.tipo_tarjeta = 'O'
          AND tmi.status = 'A'
          AND CAST(NULLIF(tmi.semana, '') AS UNSIGNED) BETWEEN :s_ini AND :s_fin
        GROUP BY TRIM(tmi.numeroinscripcion)
    """), params).mappings().all()
    return [dict(r) for r in rows]


# ──────────────────────────────────────────────────────────────────────
# Builders por sección
# ──────────────────────────────────────────────────────────────────────


def _compute_huertos(session: Session, params: dict, agregado: list[dict] | None = None) -> HuertosSeccion:
    agregado = agregado if agregado is not None else _agregado_tmimf_o(session, params)
    huertos = [r["ni"] for r in agregado]
    if not huertos:
        return HuertosSeccion(
            huertos_atendidos=0, superficie_ha=0.0,
            huertos_alta_prevalencia=0, huertos_baja_prevalencia=0, huertos_nula_prevalencia=0,
        )

    superficie_total = session.execute(text("""
        SELECT COALESCE(SUM(sup), 0) AS total FROM (
            SELECT TRIM(numeroinscripcion) AS ni, SUM(superficie) AS sup
            FROM cat_superficie_registrada
            GROUP BY TRIM(numeroinscripcion)
        ) t
        WHERE t.ni IN :ni_list
    """).bindparams(**{"ni_list": huertos}), {}).scalar() or 0

    alta = baja = nula = 0
    for r in agregado:
        mtd_den = float(r["mtd_den"] or 0)
        mtd_num = float(r["mtd_num"] or 0)
        mtd = (mtd_num / mtd_den) if mtd_den > 0 else 0.0
        if mtd >= MTD_UMBRAL_ALTA:
            alta += 1
        elif mtd > MTD_UMBRAL_BAJA:
            baja += 1
        else:
            nula += 1

    return HuertosSeccion(
        huertos_atendidos=len(huertos),
        superficie_ha=round(float(superficie_total), 2),
        huertos_alta_prevalencia=alta,
        huertos_baja_prevalencia=baja,
        huertos_nula_prevalencia=nula,
    )


def _compute_trampeo(session: Session, params: dict, agregado: list[dict] | None = None) -> TrampeoSeccion:
    agregado = agregado if agregado is not None else _agregado_tmimf_o(session, params)
    semanas = params["s_fin"] - params["s_ini"] + 1

    trampas_instaladas_acumulado = sum(int(r["trampas_instaladas"] or 0) for r in agregado)
    trampas_revisadas = sum(int(r["trampas_revisadas"] or 0) for r in agregado)
    dias_acumulados = sum(int(r["dias_exposicion_sum"] or 0) for r in agregado)
    tmimfs_o = sum(int(r["tmimfs_o"] or 0) for r in agregado)
    mtd_num = sum(float(r["mtd_num"] or 0) for r in agregado)
    mtd_den = sum(float(r["mtd_den"] or 0) for r in agregado)

    # Trampas instaladas total = promedio de trampas por TMIMF por # de huertos
    # (cada TMIMF 'O' es un huerto × semana con sus trampas).
    huertos_count = len(agregado)
    trampas_instaladas_total = (
        round(trampas_instaladas_acumulado / semanas) if semanas > 0 and huertos_count > 0 else 0
    )
    trampas_x_semanas = trampas_instaladas_acumulado

    pct = (trampas_revisadas * 100 / trampas_x_semanas) if trampas_x_semanas > 0 else 0.0
    dias_promedio = (dias_acumulados / tmimfs_o) if tmimfs_o > 0 else 0.0
    mtd_region = (mtd_num / mtd_den) if mtd_den > 0 else 0.0

    # Fértiles / estériles siguen desde trampas_revision + identificacion
    rev_flies = session.execute(text("""
        SELECT
          COUNT(DISTINCT CASE WHEN IFNULL(i.hembras_silvestre,0)+IFNULL(i.machos_silvestre,0)>0 THEN tr.no_trampa END) AS fertil,
          COUNT(DISTINCT CASE WHEN IFNULL(i.hembras_esteril,0)+IFNULL(i.machos_esteril,0)>0 THEN tr.no_trampa END)     AS esteril
        FROM trampas_revision tr
        JOIN trampas tp ON tp.no_trampa = tr.no_trampa
        JOIN sv01_sv02 sv ON BINARY TRIM(sv.numeroinscripcion) = BINARY TRIM(tp.numeroinscripcion)
        JOIN cat_rutas r ON r.folio = sv.folio_ruta
        LEFT JOIN identificacion i ON i.no_trampa = tr.no_trampa AND i.no_semana = tr.no_semana
        WHERE r.clave_pfa = :pfa
          AND tr.no_semana BETWEEN :s_ini AND :s_fin
          AND tr.status_revision IN :rev
    """).bindparams(**{"rev": list(REV_STATUS_REVISADAS)}), params).mappings().first()

    return TrampeoSeccion(
        trampas_instaladas_total=trampas_instaladas_total,
        semanas_en_rango=semanas,
        trampas_instaladas_x_semanas=trampas_x_semanas,
        trampas_revisadas=trampas_revisadas,
        porcentaje_revisadas=round(pct, 2),
        trampas_con_mosca_fertil=int(rev_flies["fertil"] or 0),
        trampas_con_mosca_esteril=int(rev_flies["esteril"] or 0),
        dias_exposicion_promedio=round(dias_promedio, 2),
        mtd_region=round(mtd_region, 4),
    )


def _compute_muestreo(session: Session, params: dict, agregado: list[dict] | None = None) -> MuestreoSeccion:
    agregado = agregado if agregado is not None else _agregado_tmimf_o(session, params)

    muestreos_tomados = sum(int(r["muestreos_tomados"] or 0) for r in agregado)
    muestreos_con_larva = sum(int(r["muestreos_con_larva"] or 0) for r in agregado)
    larvas_kg_sum = sum(float(r["larvas_kg_sum"] or 0) for r in agregado)
    kg_muestreada = sum(float(r["kg_muestreada"] or 0) for r in agregado)

    return MuestreoSeccion(
        muestreos_tomados=muestreos_tomados,
        muestreos_con_larva=muestreos_con_larva,
        larvas_por_kg=round(larvas_kg_sum, 2),
        kg_fruta_muestreada=round(kg_muestreada, 2),
    )


def _compute_control_quimico(session: Session, params: dict, agregado: list[dict] | None = None) -> ControlQuimicoSeccion:
    agregado = agregado if agregado is not None else _agregado_tmimf_o(session, params)

    has = sum(float(r["has_asperjadas"] or 0) for r in agregado)
    litros = sum(float(r["litros_asperjados"] or 0) for r in agregado)

    # Estaciones cebo y #huertos con control siguen desde control_quimico
    extra = session.execute(text("""
        SELECT
          COALESCE(SUM(cq.estaciones_cebo), 0)   AS cebo,
          COUNT(DISTINCT cq.numeroinscripcion)   AS huertos
        FROM control_quimico cq
        JOIN sv01_sv02 sv ON TRIM(sv.numeroinscripcion) = TRIM(cq.numeroinscripcion)
        JOIN cat_rutas r  ON r.folio = sv.folio_ruta
        WHERE r.clave_pfa = :pfa
          AND cq.no_semana BETWEEN :s_ini AND :s_fin
    """), params).mappings().first()

    return ControlQuimicoSeccion(
        hectareas_asperjadas=round(has, 2),
        litros_asperjados=round(litros, 2),
        estaciones_cebo=int(extra["cebo"] or 0),
        huertos_con_control=int(extra["huertos"] or 0),
    )


def _compute_control_cultural(session: Session, params: dict, agregado: list[dict] | None = None) -> ControlCulturalSeccion:
    agregado = agregado if agregado is not None else _agregado_tmimf_o(session, params)

    kgs = sum(float(r["kg_destruidos"] or 0) for r in agregado)

    # Árboles y has rastreadas siguen desde control_mecanico_cultural
    extra = session.execute(text("""
        SELECT
          COALESCE(SUM(cmc.no_arboles), 0)     AS arboles,
          COALESCE(SUM(cmc.has_rastreadas), 0) AS has
        FROM control_mecanico_cultural cmc
        JOIN sv01_sv02 sv ON TRIM(sv.numeroinscripcion) = TRIM(cmc.numeroinscripcion)
        JOIN cat_rutas r  ON r.folio = sv.folio_ruta
        WHERE r.clave_pfa = :pfa
          AND cmc.no_semana BETWEEN :s_ini AND :s_fin
    """), params).mappings().first()

    return ControlCulturalSeccion(
        kgs_destruidos=round(kgs, 2),
        arboles_eliminados=int(extra["arboles"] or 0),
        hectareas_rastreadas=round(float(extra["has"] or 0), 2),
    )


def _compute_generalidades(session: Session, params: dict) -> GeneralidadesSeccion:
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

    ton = session.execute(text("""
        SELECT
          COALESCE(SUM(det.cantidad_movilizada), 0) AS ton_total,
          COALESCE(SUM(CASE WHEN t.mercado_destino = 1 THEN det.cantidad_movilizada ELSE 0 END), 0) AS ton_exp,
          COALESCE(SUM(CASE WHEN t.mercado_destino > 1 THEN det.cantidad_movilizada ELSE 0 END), 0) AS ton_nal
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
        toneladas_movilizadas=round(float(ton["ton_total"] or 0) / 1000, 2),
        embarques_exportacion=int(row["tmimf_exp"] or 0),
        embarques_nacional=int(row["tmimf_nal"] or 0),
        toneladas_exportacion=round(float(ton["ton_exp"] or 0) / 1000, 2),
        toneladas_nacional=round(float(ton["ton_nal"] or 0) / 1000, 2),
    )


# ──────────────────────────────────────────────────────────────────────
# HTTP endpoints (JSON)
# ──────────────────────────────────────────────────────────────────────


@router.get("/huertos", response_model=HuertosSeccion)
def huertos(params: dict = Depends(_params), session: Session = Depends(get_legacy_db)) -> HuertosSeccion:
    _validar_pfa_y_rango(session, **params)
    return _compute_huertos(session, params)


@router.get("/trampeo", response_model=TrampeoSeccion)
def trampeo(params: dict = Depends(_params), session: Session = Depends(get_legacy_db)) -> TrampeoSeccion:
    _validar_pfa_y_rango(session, **params)
    return _compute_trampeo(session, params)


@router.get("/muestreo", response_model=MuestreoSeccion)
def muestreo(params: dict = Depends(_params), session: Session = Depends(get_legacy_db)) -> MuestreoSeccion:
    _validar_pfa_y_rango(session, **params)
    return _compute_muestreo(session, params)


@router.get("/control-quimico", response_model=ControlQuimicoSeccion)
def control_quimico(params: dict = Depends(_params), session: Session = Depends(get_legacy_db)) -> ControlQuimicoSeccion:
    _validar_pfa_y_rango(session, **params)
    return _compute_control_quimico(session, params)


@router.get("/control-cultural", response_model=ControlCulturalSeccion)
def control_cultural(params: dict = Depends(_params), session: Session = Depends(get_legacy_db)) -> ControlCulturalSeccion:
    _validar_pfa_y_rango(session, **params)
    return _compute_control_cultural(session, params)


@router.get("/generalidades", response_model=GeneralidadesSeccion)
def generalidades(params: dict = Depends(_params), session: Session = Depends(get_legacy_db)) -> GeneralidadesSeccion:
    _validar_pfa_y_rango(session, **params)
    return _compute_generalidades(session, params)


@router.get("/tiene-actividad", response_model=dict)
def tiene_actividad(params: dict = Depends(_params), session: Session = Depends(get_legacy_db)) -> dict:
    _validar_pfa_y_rango(session, **params)
    return {"tiene_actividad": _tiene_actividad(session, params)}


# ──────────────────────────────────────────────────────────────────────
# PDF endpoint
# ──────────────────────────────────────────────────────────────────────

# Paleta institucional SENASICA
COLOR_PRIMARIO = colors.HexColor("#014421")
COLOR_ACENTO = colors.HexColor("#4A7C3A")
COLOR_TEXTO = colors.HexColor("#1F2937")
COLOR_SECUNDARIO = colors.HexColor("#6B7280")
COLOR_BANDA = colors.HexColor("#F0F5EB")
COLOR_HIGHLIGHT = colors.HexColor("#D9EBCB")


def _meses_es() -> list[str]:
    return ["enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def _fmt_fecha(d) -> str:
    if not d:
        return "—"
    meses = _meses_es()
    return f"{d.day} de {meses[d.month - 1]} de {d.year}"


def _pf_numero(n: float | int, decimals: int = 0) -> str:
    if isinstance(n, int) or decimals == 0:
        return f"{int(n):,}"
    return f"{n:,.{decimals}f}"


def _draw_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(COLOR_PRIMARIO)
    canvas.rect(0, letter[1] - 5 * mm, letter[0], 5 * mm, fill=1, stroke=0)
    canvas.setFillColor(COLOR_SECUNDARIO)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(1.5 * cm, 1.0 * cm, "SENASICA · Campaña Nacional contra Moscas de la Fruta")
    canvas.drawRightString(letter[0] - 1.5 * cm, 1.0 * cm, f"Página {doc.page}")
    canvas.restoreState()


def _seccion_titulo(roman: str, titulo: str) -> Table:
    t = Table([[f"{roman}.  {titulo.upper()}"]], colWidths=[17.4 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_PRIMARIO),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _tabla_indicadores(rows: list[tuple[str, str, str]], mtd_highlight_index: int | None = None) -> Table:
    header = [("CONCEPTO", "UNIDAD DE MEDIDA", "CANTIDAD")]
    data = header + rows
    t = Table(data, colWidths=[10.2 * cm, 4.0 * cm, 3.2 * cm])
    style = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_ACENTO),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7.5),
        ("ALIGN", (0, 0), (0, 0), "LEFT"),
        ("ALIGN", (1, 0), (1, 0), "CENTER"),
        ("ALIGN", (2, 0), (2, 0), "RIGHT"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("TEXTCOLOR", (0, 1), (-1, -1), COLOR_TEXTO),
        ("ALIGN", (1, 1), (1, -1), "CENTER"),
        ("ALIGN", (2, 1), (2, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, COLOR_BANDA]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, COLOR_ACENTO),
        ("GRID", (0, 1), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
    ])
    if mtd_highlight_index is not None:
        row = mtd_highlight_index + 1
        style.add("BACKGROUND", (0, row), (-1, row), COLOR_HIGHLIGHT)
        style.add("FONTNAME", (0, row), (-1, row), "Helvetica-Bold")
    t.setStyle(style)
    return t


def _build_firma(pfa: PfaInfo, styles) -> Table:
    firma_data = [
        ["_" * 42],
        [Paragraph(pfa.nombre.upper(), styles["FirmaNombre"])],
        [Paragraph(pfa.cargo.upper() if pfa.cargo else "PROFESIONAL FITOSANITARIO AUTORIZADO", styles["FirmaCargo"])],
        [Paragraph(f"Cédula: {pfa.cedula}" if pfa.cedula else "", styles["FirmaCargo"])],
    ]
    firma = Table(firma_data, colWidths=[17.4 * cm])
    firma.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return firma


def _build_header_meta(pfa: PfaInfo, sem_ini: dict | None, sem_fin: dict | None, styles) -> list:
    story = []

    logo = None
    if LOGO_PATH.exists():
        logo = Image(str(LOGO_PATH), width=4 * cm, height=1.2 * cm, kind="proportional")

    if logo:
        title_cell = [
            Paragraph("INFORME GENERAL DE ACTIVIDAD FITOSANITARIA", styles["TitPrincipal"]),
            Paragraph("Servicio Nacional de Sanidad, Inocuidad y Calidad Agroalimentaria — SENASICA",
                      styles["SubtPrincipal"]),
        ]
        header_row = Table([[logo, title_cell]], colWidths=[4.5 * cm, 12.9 * cm])
        header_row.setStyle(TableStyle([
            ("ALIGN", (0, 0), (0, 0), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(header_row)
    else:
        story.append(Paragraph("INFORME GENERAL DE ACTIVIDAD FITOSANITARIA", styles["TitPrincipal"]))
        story.append(Paragraph("Servicio Nacional de Sanidad, Inocuidad y Calidad Agroalimentaria — SENASICA",
                               styles["SubtPrincipal"]))
    story.append(Spacer(1, 6))

    ahora = datetime.now()
    periodo_label = "—"
    if sem_ini and sem_fin:
        if sem_ini["folio"] == sem_fin["folio"]:
            periodo_label = (
                f"Semana {int(sem_ini['no_semana']):02d} / {int(sem_ini['periodo'])} "
                f"({_fmt_fecha(sem_ini['fecha_inicio'])} a {_fmt_fecha(sem_ini['fecha_final'])})"
            )
        else:
            periodo_label = (
                f"Semana {int(sem_ini['no_semana']):02d}/{int(sem_ini['periodo'])} → "
                f"Semana {int(sem_fin['no_semana']):02d}/{int(sem_fin['periodo'])} "
                f"({_fmt_fecha(sem_ini['fecha_inicio'])} a {_fmt_fecha(sem_fin['fecha_final'])})"
            )

    meta_data = [
        [Paragraph("PROFESIONAL FITOSANITARIO AUTORIZADO", styles["MetaLabel"]),
         Paragraph(pfa.nombre, styles["MetaValue"])],
        [Paragraph("CÉDULA", styles["MetaLabel"]),
         Paragraph(pfa.cedula or "—", styles["MetaValue"])],
        [Paragraph("PERÍODO DEL INFORME", styles["MetaLabel"]),
         Paragraph(periodo_label, styles["MetaValue"])],
        [Paragraph("GENERADO", styles["MetaLabel"]),
         Paragraph(ahora.strftime("%d/%m/%Y %H:%M"), styles["MetaValue"])],
    ]
    meta = Table(meta_data, colWidths=[5.5 * cm, 11.9 * cm])
    meta.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, COLOR_SECUNDARIO),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F9FAFB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(meta)
    story.append(Spacer(1, 6))
    return story


def _make_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        "TitPrincipal", parent=styles["Title"],
        fontName="Helvetica-Bold", fontSize=13, textColor=COLOR_PRIMARIO,
        alignment=TA_CENTER, spaceAfter=1, leading=15,
    ))
    styles.add(ParagraphStyle(
        "SubtPrincipal", parent=styles["Normal"],
        fontName="Helvetica", fontSize=8.5, textColor=COLOR_SECUNDARIO,
        alignment=TA_CENTER, spaceAfter=6, leading=10,
    ))
    styles.add(ParagraphStyle(
        "MetaLabel", parent=styles["Normal"],
        fontName="Helvetica-Bold", fontSize=7.5, textColor=COLOR_SECUNDARIO, leading=10,
    ))
    styles.add(ParagraphStyle(
        "MetaValue", parent=styles["Normal"],
        fontName="Helvetica", fontSize=8.5, textColor=COLOR_TEXTO, leading=11,
    ))
    styles.add(ParagraphStyle(
        "FirmaNombre", parent=styles["Normal"],
        fontName="Helvetica-Bold", fontSize=10, textColor=COLOR_TEXTO,
        alignment=TA_CENTER, leading=12,
    ))
    styles.add(ParagraphStyle(
        "FirmaCargo", parent=styles["Normal"],
        fontName="Helvetica", fontSize=8, textColor=COLOR_SECUNDARIO,
        alignment=TA_CENTER, leading=10,
    ))
    styles.add(ParagraphStyle(
        "SinActividad", parent=styles["Normal"],
        fontName="Helvetica", fontSize=11, textColor=COLOR_TEXTO,
        alignment=TA_CENTER, leading=18, spaceBefore=40,
    ))
    return styles


@router.get("/pdf")
def informe_pdf(
    params: dict = Depends(_params),
    session: Session = Depends(get_legacy_db),
) -> StreamingResponse:
    pfa = _validar_pfa_y_rango(session, **params)
    sem_ini = _get_semana_info(session, params["s_ini"])
    sem_fin = _get_semana_info(session, params["s_fin"])

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
        title="Informe General por PFA", author="SIGMOD",
    )
    styles = _make_styles()
    story: list = []

    # Header + meta (siempre)
    story.extend(_build_header_meta(pfa, sem_ini, sem_fin, styles))

    # ── ¿Hay actividad? ─────────────────────────────────
    if not _tiene_actividad(session, params):
        story.append(Spacer(1, 20))
        story.append(Paragraph(
            "<b>Este PFA no tiene TMIMF emitida en el período seleccionado.</b><br/><br/>"
            "Sin información disponible para generar el informe.",
            styles["SinActividad"],
        ))
        story.append(Spacer(1, 60))
        story.append(_build_firma(pfa, styles))
        doc.build(story, onFirstPage=_draw_page, onLaterPages=_draw_page)
        buffer.seek(0)
        return _streaming(buffer, pfa, params, suffix="_sin_actividad")

    # ── Computar todo ───────────────────────────────────
    agregado = _agregado_tmimf_o(session, params)
    huertos_data = _compute_huertos(session, params, agregado)
    trampeo_data = _compute_trampeo(session, params, agregado)
    muestreo_data = _compute_muestreo(session, params, agregado)
    quimico = _compute_control_quimico(session, params, agregado)
    cultural = _compute_control_cultural(session, params, agregado)
    generalidades_data = _compute_generalidades(session, params)

    SPACE = 4

    # ── I. Huertos ───────────────────────────────────────
    story.append(_seccion_titulo("I", "Huertos atendidos"))
    story.append(_tabla_indicadores([
        ("Huertos atendidos",                  "Huertos",   _pf_numero(huertos_data.huertos_atendidos)),
        ("I.1  Superficie atendida",           "Hectáreas", _pf_numero(huertos_data.superficie_ha, 2)),
        ("I.2  Huertos en alta prevalencia",   "Huertos",   _pf_numero(huertos_data.huertos_alta_prevalencia)),
        ("I.3  Huertos en baja prevalencia",   "Huertos",   _pf_numero(huertos_data.huertos_baja_prevalencia)),
        ("I.4  Huertos en nula prevalencia",   "Huertos",   _pf_numero(huertos_data.huertos_nula_prevalencia)),
    ]))
    story.append(Spacer(1, SPACE))

    # ── II. Trampeo ──────────────────────────────────────
    story.append(_seccion_titulo("II", "Trampeo"))
    trampeo_rows = [
        ("II.1  Trampas instaladas",
         "Trampas",
         f"{_pf_numero(trampeo_data.trampas_instaladas_total)} × {trampeo_data.semanas_en_rango} sem = {_pf_numero(trampeo_data.trampas_instaladas_x_semanas)}"),
        ("II.2  Trampas revisadas",            "Trampas",    _pf_numero(trampeo_data.trampas_revisadas)),
        ("II.3  Porcentaje de revisadas",      "%",          f"{trampeo_data.porcentaje_revisadas:.2f}%"),
        ("II.4  Trampas con mosca fértil",     "Trampas",    _pf_numero(trampeo_data.trampas_con_mosca_fertil)),
        ("II.5  Trampas con mosca estéril",    "Trampas",    _pf_numero(trampeo_data.trampas_con_mosca_esteril)),
        ("II.6  Días de exposición (promedio)","Días",       f"{trampeo_data.dias_exposicion_promedio:.2f}"),
        ("II.7  MTD región (NOM-023)",         "MTD",        f"{trampeo_data.mtd_region:.4f}"),
    ]
    story.append(_tabla_indicadores(trampeo_rows, mtd_highlight_index=len(trampeo_rows) - 1))
    story.append(Spacer(1, SPACE))

    # ── III. Muestreo ────────────────────────────────────
    story.append(_seccion_titulo("III", "Muestreo de frutos"))
    story.append(_tabla_indicadores([
        ("III.1  Muestreos tomados",           "Muestreos", _pf_numero(muestreo_data.muestreos_tomados)),
        ("III.2  Muestreos con larva",         "Muestreos", _pf_numero(muestreo_data.muestreos_con_larva)),
        ("III.3  Larvas / kilogramo (suma)",   "L / KG",    f"{muestreo_data.larvas_por_kg:.2f}"),
        ("III.4  Kg fruta muestreada",         "Kg",        f"{muestreo_data.kg_fruta_muestreada:.2f}"),
    ]))
    story.append(Spacer(1, SPACE))

    # ── IV. Control químico ──────────────────────────────
    story.append(_seccion_titulo("IV", "Control químico"))
    story.append(_tabla_indicadores([
        ("IV.1  Hectáreas asperjadas",    "Hectáreas",  _pf_numero(quimico.hectareas_asperjadas, 2)),
        ("IV.2  Litros asperjados",       "Litros",     f"{quimico.litros_asperjados:.2f}"),
        ("IV.3  Estaciones cebo",         "Estaciones", _pf_numero(quimico.estaciones_cebo)),
        ("IV.4  Huertos con control",     "Huertos",    _pf_numero(quimico.huertos_con_control)),
    ]))
    story.append(Spacer(1, SPACE))

    # ── V. Control mecánico-cultural ────────────────────
    story.append(_seccion_titulo("V", "Control mecánico-cultural"))
    story.append(_tabla_indicadores([
        ("V.1  Kgs de frutos destruidos", "Kg",         f"{cultural.kgs_destruidos:.2f}"),
        ("V.2  Árboles eliminados",       "Árboles",    _pf_numero(cultural.arboles_eliminados)),
        ("V.3  Hectáreas rastreadas",     "Hectáreas",  _pf_numero(cultural.hectareas_rastreadas, 2)),
    ]))
    story.append(Spacer(1, SPACE))

    # ── VI. Generalidades ───────────────────────────────
    story.append(_seccion_titulo("VI", "Generalidades (TMIMF)"))
    story.append(_tabla_indicadores([
        ("VI.1  TMIMF emitidas",                        "Emitidas",  _pf_numero(generalidades_data.tmimf_emitidas)),
        ("VI.2  Toneladas movilizadas",                 "Toneladas", f"{generalidades_data.toneladas_movilizadas:,.2f}"),
        ("VI.3  Embarques para exportación",            "Embarques", _pf_numero(generalidades_data.embarques_exportacion)),
        ("VI.4  Embarques para mercado nacional",       "Embarques", _pf_numero(generalidades_data.embarques_nacional)),
        ("VI.5  Toneladas exportación",                 "Toneladas", f"{generalidades_data.toneladas_exportacion:,.2f}"),
        ("VI.6  Toneladas nacional",                    "Toneladas", f"{generalidades_data.toneladas_nacional:,.2f}"),
    ]))

    # ── Firma (al final de la pág. 2) ───────────────────
    story.append(Spacer(1, 22))
    story.append(_build_firma(pfa, styles))

    doc.build(story, onFirstPage=_draw_page, onLaterPages=_draw_page)
    buffer.seek(0)
    return _streaming(buffer, pfa, params)


def _streaming(buffer: BytesIO, pfa: PfaInfo, params: dict, suffix: str = "") -> StreamingResponse:
    filename = f"informe-general-pfa_{pfa.folio}_{params['s_ini']}-{params['s_fin']}{suffix}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
