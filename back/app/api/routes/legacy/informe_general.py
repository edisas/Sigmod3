"""
Informe general por PFA (rango de semanas).

6 endpoints independientes (uno por sección) + 1 endpoint `/pdf` que arma
un reporte PDF formal con logo SENASICA y bloque de firma.
"""

from datetime import datetime
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    Image,
    PageBreak,
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


# ──────────────────────────────────────────────────────────────────────
# Builders (reutilizables por endpoint HTTP y por PDF)
# ──────────────────────────────────────────────────────────────────────


def _compute_huertos(session: Session, params: dict) -> HuertosSeccion:
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


def _compute_trampeo(session: Session, params: dict) -> TrampeoSeccion:
    semanas = params["s_fin"] - params["s_ini"] + 1

    instaladas = session.execute(text("""
        SELECT COUNT(DISTINCT tp.no_trampa) AS total
        FROM trampas tp
        JOIN sv01_sv02 sv ON TRIM(sv.numeroinscripcion) = TRIM(tp.numeroinscripcion)
        JOIN cat_rutas r  ON r.folio = sv.folio_ruta
        WHERE r.clave_pfa = :pfa AND tp.status = 'A' AND sv.status = 'A'
    """), params).mappings().first()
    trampas_instaladas = int(instaladas["total"] or 0)

    rev = session.execute(text("""
        SELECT
          COUNT(*)                                  AS revisadas,
          COALESCE(SUM(tr.dias_exposicion), 0)      AS dias_total,
          COALESCE(SUM(IFNULL(i.hembras_silvestre,0)+IFNULL(i.machos_silvestre,0)), 0) AS moscas_fertiles,
          COALESCE(SUM(IFNULL(i.hembras_esteril,0)+IFNULL(i.machos_esteril,0)), 0)     AS moscas_esteriles,
          COUNT(DISTINCT CASE WHEN IFNULL(i.hembras_silvestre,0)+IFNULL(i.machos_silvestre,0)>0 THEN tr.no_trampa END) AS trampas_c_fertil,
          COUNT(DISTINCT CASE WHEN IFNULL(i.hembras_esteril,0)+IFNULL(i.machos_esteril,0)>0 THEN tr.no_trampa END)     AS trampas_c_esteril
        FROM trampas_revision tr
        JOIN trampas tp ON tp.no_trampa = tr.no_trampa
        JOIN sv01_sv02 sv ON TRIM(sv.numeroinscripcion) = TRIM(tp.numeroinscripcion)
        JOIN cat_rutas r ON r.folio = sv.folio_ruta
        LEFT JOIN identificacion i ON i.no_trampa = tr.no_trampa AND i.no_semana = tr.no_semana
        WHERE r.clave_pfa = :pfa
          AND tr.no_semana BETWEEN :s_ini AND :s_fin
          AND tr.status_revision IN :rev
    """).bindparams(**{"rev": list(REV_STATUS_REVISADAS)}), params).mappings().first()

    revisadas = int(rev["revisadas"] or 0)
    dias_total = int(rev["dias_total"] or 0)
    moscas_fertiles = int(rev["moscas_fertiles"] or 0)
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
        trampas_con_mosca_fertil=int(rev["trampas_c_fertil"] or 0),
        trampas_con_mosca_esteril=int(rev["trampas_c_esteril"] or 0),
        dias_exposicion_promedio=round(dias_promedio, 2),
        mtd_region=round(mtd, 4),
    )


def _compute_muestreo(session: Session, params: dict) -> MuestreoSeccion:
    row = session.execute(text("""
        SELECT
          COUNT(DISTINCT m.no_muestra)                                                AS muestreos,
          COUNT(DISTINCT CASE WHEN m.frutos_infestados > 0 THEN m.no_muestra END)     AS con_larva,
          COALESCE(SUM(m.no_frutos), 0)                                               AS frutos,
          COALESCE(SUM(m.frutos_infestados), 0)                                       AS infestados,
          COALESCE(SUM(m.kgs_muestreados), 0)                                         AS kgs
        FROM muestreo_de_frutos m
        JOIN sv01_sv02 sv ON TRIM(sv.numeroinscripcion) = TRIM(m.numeroinscripcion)
        JOIN cat_rutas r  ON r.folio = sv.folio_ruta
        WHERE r.clave_pfa = :pfa
          AND m.no_semana BETWEEN :s_ini AND :s_fin
    """), params).mappings().first()

    larvas = session.execute(text("""
        SELECT COALESCE(SUM(il.no_larvas), 0) AS larvas
        FROM identificacion_laboratorio il
        JOIN muestreo_de_frutos m ON m.no_muestra = il.no_muestra
        JOIN sv01_sv02 sv ON TRIM(sv.numeroinscripcion) = TRIM(m.numeroinscripcion)
        JOIN cat_rutas r  ON r.folio = sv.folio_ruta
        WHERE r.clave_pfa = :pfa
          AND m.no_semana BETWEEN :s_ini AND :s_fin
    """), params).mappings().first()

    kgs = float(row["kgs"] or 0)
    larvas_n = int(larvas["larvas"] or 0)
    larvas_kg = (larvas_n / kgs) if kgs > 0 else 0.0

    return MuestreoSeccion(
        muestreos_tomados=int(row["muestreos"] or 0),
        muestreos_con_larva=int(row["con_larva"] or 0),
        larvas_por_kg=round(larvas_kg, 4),
        frutos_muestreados=int(row["frutos"] or 0),
        frutos_infestados=int(row["infestados"] or 0),
    )


def _compute_control_quimico(session: Session, params: dict) -> ControlQuimicoSeccion:
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


def _compute_control_cultural(session: Session, params: dict) -> ControlCulturalSeccion:
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
          COALESCE(SUM(det.cantidad_movilizada), 0)                                 AS ton_total,
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
        toneladas_movilizadas=round(float(ton["ton_total"] or 0) / 1000, 3),
        embarques_exportacion=int(row["tmimf_exp"] or 0),
        embarques_nacional=int(row["tmimf_nal"] or 0),
        toneladas_exportacion=round(float(ton["ton_exp"] or 0) / 1000, 3),
        toneladas_nacional=round(float(ton["ton_nal"] or 0) / 1000, 3),
    )


# ──────────────────────────────────────────────────────────────────────
# HTTP endpoints (JSON por sección)
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


# ──────────────────────────────────────────────────────────────────────
# PDF endpoint
# ──────────────────────────────────────────────────────────────────────

# Paleta institucional
COLOR_PRIMARIO = colors.HexColor("#5F4B8B")   # morado tenue institucional
COLOR_ACENTO = colors.HexColor("#C4A35A")     # dorado/ámbar
COLOR_TEXTO = colors.HexColor("#1F2937")
COLOR_SECUNDARIO = colors.HexColor("#6B7280")
COLOR_BANDA = colors.HexColor("#F3F0E8")


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
        return f"{int(n):,}".replace(",", ",")
    return f"{n:,.{decimals}f}"


def _draw_page(canvas, doc, estado_label: str):
    """Header/footer en cada página."""
    canvas.saveState()

    # Franja superior
    canvas.setFillColor(COLOR_PRIMARIO)
    canvas.rect(0, letter[1] - 8 * mm, letter[0], 8 * mm, fill=1, stroke=0)

    # Footer
    canvas.setFillColor(COLOR_SECUNDARIO)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(
        1.8 * cm,
        1.2 * cm,
        f"SENASICA · Campaña Nacional contra Moscas de la Fruta · {estado_label}",
    )
    canvas.drawRightString(
        letter[0] - 1.8 * cm,
        1.2 * cm,
        f"Página {doc.page}",
    )

    canvas.restoreState()


def _seccion_titulo(roman: str, titulo: str, styles) -> Table:
    """Banda de sección estilo heading."""
    data = [[f"{roman}.  {titulo.upper()}"]]
    t = Table(data, colWidths=[17 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_PRIMARIO),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def _tabla_indicadores(rows: list[tuple[str, str, str]], mtd_highlight_index: int | None = None) -> Table:
    """Tabla de 3 columnas: Concepto | Unidad | Cantidad."""
    header = [("CONCEPTO", "UNIDAD DE MEDIDA", "CANTIDAD")]
    data = header + rows

    t = Table(data, colWidths=[10 * cm, 4 * cm, 3 * cm])
    style = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_ACENTO),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("ALIGN", (0, 0), (0, 0), "LEFT"),
        ("ALIGN", (1, 0), (1, 0), "CENTER"),
        ("ALIGN", (2, 0), (2, 0), "RIGHT"),
        # body
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("TEXTCOLOR", (0, 1), (-1, -1), COLOR_TEXTO),
        ("ALIGN", (1, 1), (1, -1), "CENTER"),
        ("ALIGN", (2, 1), (2, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, COLOR_BANDA]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, COLOR_ACENTO),
        ("GRID", (0, 1), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
    ])
    if mtd_highlight_index is not None:
        # +1 porque el header es la fila 0
        row = mtd_highlight_index + 1
        style.add("BACKGROUND", (0, row), (-1, row), colors.HexColor("#FEF3C7"))
        style.add("FONTNAME", (0, row), (-1, row), "Helvetica-Bold")
    t.setStyle(style)
    return t


@router.get("/pdf")
def informe_pdf(
    params: dict = Depends(_params),
    session: Session = Depends(get_legacy_db),
) -> StreamingResponse:
    pfa = _validar_pfa_y_rango(session, **params)

    sem_ini = _get_semana_info(session, params["s_ini"])
    sem_fin = _get_semana_info(session, params["s_fin"])
    estado_label = ""  # no siempre tenemos el nombre del estado aquí; queda genérico

    huertos = _compute_huertos(session, params)
    trampeo = _compute_trampeo(session, params)
    muestreo = _compute_muestreo(session, params)
    quimico = _compute_control_quimico(session, params)
    cultural = _compute_control_cultural(session, params)
    generalidades = _compute_generalidades(session, params)

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=2.2 * cm,
        bottomMargin=2.0 * cm,
        title="Informe General por PFA",
        author="SIGMOD",
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        "TitPrincipal", parent=styles["Title"],
        fontName="Helvetica-Bold", fontSize=16, textColor=COLOR_PRIMARIO,
        alignment=TA_CENTER, spaceAfter=2,
    ))
    styles.add(ParagraphStyle(
        "SubtPrincipal", parent=styles["Normal"],
        fontName="Helvetica", fontSize=10, textColor=COLOR_SECUNDARIO,
        alignment=TA_CENTER, spaceAfter=14,
    ))
    styles.add(ParagraphStyle(
        "MetaLabel", parent=styles["Normal"],
        fontName="Helvetica-Bold", fontSize=9, textColor=COLOR_SECUNDARIO,
    ))
    styles.add(ParagraphStyle(
        "MetaValue", parent=styles["Normal"],
        fontName="Helvetica", fontSize=10, textColor=COLOR_TEXTO,
    ))
    styles.add(ParagraphStyle(
        "FirmaLabel", parent=styles["Normal"],
        fontName="Helvetica", fontSize=9, textColor=COLOR_SECUNDARIO,
        alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        "FirmaNombre", parent=styles["Normal"],
        fontName="Helvetica-Bold", fontSize=11, textColor=COLOR_TEXTO,
        alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        "FirmaCargo", parent=styles["Normal"],
        fontName="Helvetica", fontSize=9, textColor=COLOR_SECUNDARIO,
        alignment=TA_CENTER,
    ))

    # ── Header (logo + título) ─────────────────────────────
    story: list = []

    logo = None
    if LOGO_PATH.exists():
        logo = Image(str(LOGO_PATH), width=5 * cm, height=1.6 * cm, kind="proportional")

    if logo:
        header_row = Table(
            [[logo,
              Paragraph("INFORME GENERAL DE ACTIVIDAD FITOSANITARIA", styles["TitPrincipal"])]],
            colWidths=[5.5 * cm, 11.5 * cm],
        )
        header_row.setStyle(TableStyle([
            ("ALIGN", (0, 0), (0, 0), "LEFT"),
            ("ALIGN", (1, 0), (1, 0), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(header_row)
    else:
        story.append(Paragraph("INFORME GENERAL DE ACTIVIDAD FITOSANITARIA", styles["TitPrincipal"]))

    story.append(Paragraph(
        "Servicio Nacional de Sanidad, Inocuidad y Calidad Agroalimentaria — SENASICA",
        styles["SubtPrincipal"],
    ))

    # ── Meta block (PFA, período, generación) ─────────────
    ahora = datetime.now()
    periodo_label = ""
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
         Paragraph(periodo_label or "—", styles["MetaValue"])],
        [Paragraph("GENERADO", styles["MetaLabel"]),
         Paragraph(ahora.strftime("%d/%m/%Y %H:%M"), styles["MetaValue"])],
    ]
    meta = Table(meta_data, colWidths=[5.5 * cm, 11.5 * cm])
    meta.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, COLOR_SECUNDARIO),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F9FAFB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(meta)
    story.append(Spacer(1, 14))

    # ── I. Huertos ─────────────────────────────────────────
    story.append(_seccion_titulo("I", "Huertos atendidos", styles))
    story.append(_tabla_indicadores([
        ("Huertos atendidos",                  "Huertos",   _pf_numero(huertos.huertos_atendidos)),
        ("I.1  Superficie atendida",           "Hectáreas", _pf_numero(huertos.superficie_ha, 4)),
        ("I.2  Huertos en alta prevalencia",   "Huertos",   _pf_numero(huertos.huertos_alta_prevalencia)),
        ("I.3  Huertos en baja prevalencia",   "Huertos",   _pf_numero(huertos.huertos_baja_prevalencia)),
        ("I.4  Huertos en nula prevalencia",   "Huertos",   _pf_numero(huertos.huertos_nula_prevalencia)),
    ]))
    story.append(Spacer(1, 10))

    # ── II. Trampeo ────────────────────────────────────────
    story.append(_seccion_titulo("II", "Trampeo", styles))
    trampeo_rows = [
        ("II.1  Trampas instaladas",
         "Trampas",
         f"{_pf_numero(trampeo.trampas_instaladas_total)} × {trampeo.semanas_en_rango} sem = {_pf_numero(trampeo.trampas_instaladas_x_semanas)}"),
        ("II.2  Trampas revisadas",            "Trampas",    _pf_numero(trampeo.trampas_revisadas)),
        ("II.3  Porcentaje de revisadas",      "%",          f"{trampeo.porcentaje_revisadas:.2f}%"),
        ("II.4  Trampas con mosca fértil",     "Trampas",    _pf_numero(trampeo.trampas_con_mosca_fertil)),
        ("II.5  Trampas con mosca estéril",    "Trampas",    _pf_numero(trampeo.trampas_con_mosca_esteril)),
        ("II.6  Días de exposición (promedio)","Días",       f"{trampeo.dias_exposicion_promedio:.2f}"),
        ("II.7  MTD región",                   "MTD",        f"{trampeo.mtd_region:.4f}"),
    ]
    story.append(_tabla_indicadores(trampeo_rows, mtd_highlight_index=len(trampeo_rows) - 1))
    story.append(Spacer(1, 10))

    # ── III. Muestreo ──────────────────────────────────────
    story.append(_seccion_titulo("III", "Muestreo de frutos", styles))
    story.append(_tabla_indicadores([
        ("III.1  Muestreos tomados",      "Muestreos", _pf_numero(muestreo.muestreos_tomados)),
        ("III.2  Muestreos con larva",    "Muestreos", _pf_numero(muestreo.muestreos_con_larva)),
        ("III.3  Larvas / kilogramo",     "L / KG",    f"{muestreo.larvas_por_kg:.4f}"),
        ("III.4  Frutos muestreados",     "Frutos",    _pf_numero(muestreo.frutos_muestreados)),
        ("III.5  Frutos infestados",      "Frutos",    _pf_numero(muestreo.frutos_infestados)),
    ]))
    story.append(PageBreak())

    # ── IV. Control químico ────────────────────────────────
    story.append(_seccion_titulo("IV", "Control químico", styles))
    story.append(_tabla_indicadores([
        ("IV.1  Hectáreas asperjadas",    "Hectáreas",  _pf_numero(quimico.hectareas_asperjadas, 4)),
        ("IV.2  Litros asperjados",       "Litros",     f"{quimico.litros_asperjados:.2f}"),
        ("IV.3  Estaciones cebo",         "Estaciones", _pf_numero(quimico.estaciones_cebo)),
        ("IV.4  Huertos con control",     "Huertos",    _pf_numero(quimico.huertos_con_control)),
    ]))
    story.append(Spacer(1, 10))

    # ── V. Control mecánico-cultural ──────────────────────
    story.append(_seccion_titulo("V", "Control mecánico-cultural", styles))
    story.append(_tabla_indicadores([
        ("V.1  Kgs de frutos destruidos", "Kg",         f"{cultural.kgs_destruidos:.2f}"),
        ("V.2  Árboles eliminados",       "Árboles",    _pf_numero(cultural.arboles_eliminados)),
        ("V.3  Hectáreas rastreadas",     "Hectáreas",  _pf_numero(cultural.hectareas_rastreadas, 4)),
    ]))
    story.append(Spacer(1, 10))

    # ── VI. Generalidades ─────────────────────────────────
    story.append(_seccion_titulo("VI", "Generalidades (TMIMF)", styles))
    story.append(_tabla_indicadores([
        ("VI.1  TMIMF emitidas",                        "Emitidas",  _pf_numero(generalidades.tmimf_emitidas)),
        ("VI.2  Toneladas movilizadas",                 "Toneladas", f"{generalidades.toneladas_movilizadas:,.3f}"),
        ("VI.3  Embarques para exportación",            "Embarques", _pf_numero(generalidades.embarques_exportacion)),
        ("VI.4  Embarques para mercado nacional",       "Embarques", _pf_numero(generalidades.embarques_nacional)),
        ("VI.5  Toneladas exportación",                 "Toneladas", f"{generalidades.toneladas_exportacion:,.3f}"),
        ("VI.6  Toneladas nacional",                    "Toneladas", f"{generalidades.toneladas_nacional:,.3f}"),
    ]))

    # ── Firma ─────────────────────────────────────────────
    story.append(Spacer(1, 42))
    firma_data = [
        ["_" * 42],
        [Paragraph(pfa.nombre.upper(), styles["FirmaNombre"])],
        [Paragraph(pfa.cargo.upper() if pfa.cargo else "PROFESIONAL FITOSANITARIO AUTORIZADO", styles["FirmaCargo"])],
        [Paragraph(f"Cédula: {pfa.cedula}" if pfa.cedula else "", styles["FirmaCargo"])],
    ]
    firma = Table(firma_data, colWidths=[17 * cm])
    firma.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(firma)

    # Build
    on_page = lambda c, d: _draw_page(c, d, estado_label)
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)

    buffer.seek(0)
    filename = f"informe-general-pfa_{pfa.folio}_{params['s_ini']}-{params['s_fin']}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
