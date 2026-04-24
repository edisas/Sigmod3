"""
Diagnóstico de TMIMFs operativas ('O') faltantes + preview de cierre.

Un huerto+semana con revisiones debería tener una TMIMF tipo 'O' activa que
consolide el trampeo. Cuando falta, la tarjeta nunca se cerró.

Endpoints:
- GET /faltantes            — lista paginada de gaps con stats básicos.
- GET /faltantes/preview    — detalle de un gap: gates de validación + los
                              cálculos que irían en la TMIMF (MTDs, trampas,
                              controles, muestreo). Solo lectura — no inserta.

Convención de semana: `no_semana` aquí es el FOLIO de la tabla `semanas`
(mismo patrón que trampas_revision.no_semana y tmimf.semana). Para mostrar
al usuario se arma `semana_label = "{no_semana_año} - {periodo}"`.

Chiapas: las columnas `numeroinscripcion` mezclan collations `latin1_general_ci`
(en trampas) con `latin1_swedish_ci` (en sv01_sv02, tmimf, control_quimico,
control_mecanico_cultural, muestreo_de_frutos). Los joins fuerzan `BINARY TRIM`
en ambos lados — no-op en las 7 BDs compatibles.
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


class GapRow(BaseModel):
    numeroinscripcion: str
    no_semana: int
    semana_label: str
    fecha_revision_max: str | None  # ISO date
    trampas_instaladas: int
    trampas_revisadas: int
    revisiones_pendientes_validar: int  # validado != 'S'
    revisiones_con_captura: int         # status_revision = 2
    capturas_sin_identificacion: int    # status=2 sin filas en identificacion
    trampas_incompletas: int            # status_revision IN (3,4,5,6)
    pfa_nombre: str | None
    ruta_nombre: str | None
    modulo_nombre: str | None


class GapsPage(BaseModel):
    total: int
    offset: int
    limit: int
    rows: list[GapRow]


class GateStatus(BaseModel):
    fecha_revision_ok: bool           # existe al menos una fecha válida
    trampas_todas_validadas: bool     # validado='S' en todas
    capturas_todas_identificadas: bool
    sin_trampas_incompletas: bool     # ninguna status IN (3,4,5,6)
    tiene_control_quimico: bool
    tiene_control_mecanico: bool
    tiene_muestreo_frutos: bool


class CalculosTmimf(BaseModel):
    fecha_revision: str | None
    mtd_ludens: float
    mtd_obliqua: float
    mtd_striata: float
    mtd_serpentina: float
    mtd_promedio_semanal: float
    trampas_instaladas: int
    trampas_revisadas: int
    porcentaje_trampas_rev: float
    dias_exposicion_prom: float
    superficie_asperjada: float
    litros_mezcla_asperjada: float
    kg_fruta_destruida: float
    otros_controles: str | None
    kg_fruta_muestreada: float
    larvas_por_kg_fruta: float


class MetaTmimf(BaseModel):
    folio_ruta: int | None
    clave_pfa: int | None
    pfa_nombre: str | None
    modulo_folio: int | None
    modulo_nombre: str | None


class PreviewResult(BaseModel):
    numeroinscripcion: str
    no_semana: int
    semana_label: str
    puede_cerrar: bool     # todos los gates ok
    gates: GateStatus
    calculos: CalculosTmimf
    meta: MetaTmimf


# ──────────────────────────────────────────────────────────────────────
# GET /faltantes
# ──────────────────────────────────────────────────────────────────────


@router.get("/faltantes", response_model=GapsPage)
def listar_faltantes(
    pfa: int | None = Query(None, ge=1, description="Filtra por clave_pfa (cat_funcionarios)"),
    no_semana: int | None = Query(None, ge=1, description="Filtra por folio de semana"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> GapsPage:
    # Subquery base: huerto+semana con revisiones que NO tienen TMIMF 'O' activa.
    # BINARY TRIM para compatibilidad con Chiapas (mezcla de collations).
    params: dict = {}
    where_extra = ""
    if pfa is not None:
        where_extra += " AND cr.clave_pfa = :pfa"
        params["pfa"] = pfa
    if no_semana is not None:
        where_extra += " AND tr.no_semana = :nsem"
        params["nsem"] = no_semana

    sql_total = text(f"""
        SELECT COUNT(*) FROM (
            SELECT
                BINARY TRIM(tp.numeroinscripcion) AS nins,
                tr.no_semana
            FROM trampas_revision tr
            JOIN trampas tp ON BINARY TRIM(tp.no_trampa) = BINARY TRIM(tr.no_trampa)
            JOIN cat_rutas cr ON cr.folio = tp.folio_ruta
            WHERE tr.no_semana > 0
              {where_extra}
            GROUP BY nins, tr.no_semana
        ) x
        LEFT JOIN (
            SELECT DISTINCT
                BINARY TRIM(numeroinscripcion) AS nins,
                semana AS no_semana
            FROM tmimf
            WHERE tipo_tarjeta = 'O' AND status = 'A' AND semana <> ''
        ) o ON o.nins = x.nins AND CAST(o.no_semana AS UNSIGNED) = x.no_semana
        WHERE o.nins IS NULL
    """)
    total = session.execute(sql_total, params).scalar() or 0

    # Lista con stats básicos. Una sola query agregada + 3 count distintos.
    sql_rows = text(f"""
        SELECT
            BINARY TRIM(tp.numeroinscripcion) AS numeroinscripcion,
            tr.no_semana                      AS no_semana,
            MAX(tr.fecha_revision)            AS fecha_revision_max,
            COUNT(DISTINCT tr.no_trampa)      AS trampas_revisadas,
            SUM(CASE WHEN tr.validado <> 'S' THEN 1 ELSE 0 END) AS revisiones_pendientes_validar,
            SUM(CASE WHEN tr.status_revision = 2 THEN 1 ELSE 0 END) AS revisiones_con_captura,
            SUM(CASE WHEN tr.status_revision IN (3,4,5,6) THEN 1 ELSE 0 END) AS trampas_incompletas,
            MIN(cr.folio)                     AS folio_ruta,
            MIN(cr.clave_pfa)                 AS clave_pfa,
            MIN(cr.nombre_ruta)               AS ruta_nombre,
            MIN(cr.modulo)                    AS modulo_folio,
            MIN(cm.nombre_modulo)             AS modulo_nombre,
            MIN(cf.nombre)                    AS pfa_nombre,
            MIN(s.no_semana)                  AS no_semana_anio,
            MIN(s.periodo)                    AS periodo
        FROM trampas_revision tr
        JOIN trampas tp ON BINARY TRIM(tp.no_trampa) = BINARY TRIM(tr.no_trampa)
        JOIN cat_rutas cr ON cr.folio = tp.folio_ruta
        LEFT JOIN cat_modulos cm ON cm.folio = cr.modulo
        LEFT JOIN cat_funcionarios cf ON cf.folio = cr.clave_pfa
        LEFT JOIN semanas s ON s.folio = tr.no_semana
        LEFT JOIN (
            SELECT DISTINCT
                BINARY TRIM(numeroinscripcion) AS nins,
                semana AS no_semana
            FROM tmimf
            WHERE tipo_tarjeta = 'O' AND status = 'A' AND semana <> ''
        ) o ON o.nins = BINARY TRIM(tp.numeroinscripcion)
           AND CAST(o.no_semana AS UNSIGNED) = tr.no_semana
        WHERE tr.no_semana > 0
          AND o.nins IS NULL
          {where_extra}
        GROUP BY numeroinscripcion, tr.no_semana
        ORDER BY tr.no_semana DESC, numeroinscripcion ASC
        LIMIT :lim OFFSET :off
    """)
    rows = session.execute(sql_rows, {**params, "lim": limit, "off": offset}).mappings().all()

    def _decode(v) -> str:
        # BINARY TRIM devuelve bytes en MySQL; normalizamos a str.
        if isinstance(v, (bytes, bytearray)):
            return v.decode("latin-1", errors="replace").strip()
        return str(v or "").strip()

    nins_list = sorted({_decode(r["numeroinscripcion"]) for r in rows})
    pairs = [(_decode(r["numeroinscripcion"]), int(r["no_semana"])) for r in rows]

    # Batch: trampas instaladas por huerto (1 query para todo el page).
    trampas_inst_map: dict[str, int] = {}
    if nins_list:
        ph = ", ".join(f":n{i}" for i in range(len(nins_list)))
        pars = {f"n{i}": nins_list[i] for i in range(len(nins_list))}
        for row in session.execute(
            text(f"""
                SELECT BINARY TRIM(numeroinscripcion) AS nins, COUNT(*) AS cnt
                FROM trampas
                WHERE BINARY TRIM(numeroinscripcion) IN ({ph})
                  AND (status IS NULL OR status = 'A')
                GROUP BY nins
            """),
            pars,
        ).mappings():
            trampas_inst_map[_decode(row["nins"])] = int(row["cnt"])

    # Batch: capturas sin identificacion por (nins, no_semana).
    capturas_sin_id_map: dict[tuple[str, int], int] = {}
    if pairs:
        ors = []
        pars: dict = {}
        for i, (n, s) in enumerate(pairs):
            ors.append(f"(BINARY TRIM(tp.numeroinscripcion) = :n{i} AND tr.no_semana = :s{i})")
            pars[f"n{i}"] = n
            pars[f"s{i}"] = s
        or_clause = " OR ".join(ors) if ors else "0"
        for row in session.execute(
            text(f"""
                SELECT BINARY TRIM(tp.numeroinscripcion) AS nins,
                       tr.no_semana                     AS no_semana,
                       COUNT(*)                         AS cnt
                FROM trampas_revision tr
                JOIN trampas tp ON BINARY TRIM(tp.no_trampa) = BINARY TRIM(tr.no_trampa)
                LEFT JOIN identificacion i ON i.folio_revision = tr.folio
                WHERE tr.status_revision = 2
                  AND i.folio_revision IS NULL
                  AND ({or_clause})
                GROUP BY nins, tr.no_semana
            """),
            pars,
        ).mappings():
            capturas_sin_id_map[(_decode(row["nins"]), int(row["no_semana"]))] = int(row["cnt"])

    out: list[GapRow] = []
    for r in rows:
        nins = _decode(r["numeroinscripcion"])
        nsem = int(r["no_semana"])
        nsa = r["no_semana_anio"]
        per = r["periodo"]
        if nsa is not None and per is not None:
            label = f"{int(nsa)} - {int(per)}"
        else:
            label = f"sem {nsem}"

        fecha_max = r["fecha_revision_max"]
        out.append(GapRow(
            numeroinscripcion=nins,
            no_semana=nsem,
            semana_label=label,
            fecha_revision_max=fecha_max.isoformat() if fecha_max else None,
            trampas_instaladas=trampas_inst_map.get(nins, 0),
            trampas_revisadas=int(r["trampas_revisadas"] or 0),
            revisiones_pendientes_validar=int(r["revisiones_pendientes_validar"] or 0),
            revisiones_con_captura=int(r["revisiones_con_captura"] or 0),
            capturas_sin_identificacion=capturas_sin_id_map.get((nins, nsem), 0),
            trampas_incompletas=int(r["trampas_incompletas"] or 0),
            pfa_nombre=(r["pfa_nombre"] or "").strip() or None,
            ruta_nombre=(r["ruta_nombre"] or "").strip() or None,
            modulo_nombre=(r["modulo_nombre"] or "").strip() or None,
        ))

    return GapsPage(total=int(total), offset=offset, limit=limit, rows=out)


# ──────────────────────────────────────────────────────────────────────
# GET /faltantes/preview
# ──────────────────────────────────────────────────────────────────────


@router.get("/faltantes/preview", response_model=PreviewResult)
def preview_cierre(
    numeroinscripcion: str = Query(..., min_length=1),
    no_semana: int = Query(..., ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> PreviewResult:
    # 1. Meta del huerto: ruta, PFA, módulo
    meta_row = session.execute(
        text("""
            SELECT
                cr.folio         AS folio_ruta,
                cr.clave_pfa     AS clave_pfa,
                cf.nombre        AS pfa_nombre,
                cr.modulo        AS modulo_folio,
                cm.nombre_modulo AS modulo_nombre
            FROM trampas tp
            JOIN cat_rutas cr ON cr.folio = tp.folio_ruta
            LEFT JOIN cat_funcionarios cf ON cf.folio = cr.clave_pfa
            LEFT JOIN cat_modulos cm ON cm.folio = cr.modulo
            WHERE BINARY TRIM(tp.numeroinscripcion) = :n
              AND (tp.status IS NULL OR tp.status = 'A')
            LIMIT 1
        """),
        {"n": numeroinscripcion.strip()},
    ).mappings().first()

    # 2. Label de la semana
    sem_row = session.execute(
        text("SELECT no_semana, periodo FROM semanas WHERE folio = :f"),
        {"f": no_semana},
    ).mappings().first()
    if sem_row and sem_row["no_semana"] is not None and sem_row["periodo"] is not None:
        semana_label = f"{int(sem_row['no_semana'])} - {int(sem_row['periodo'])}"
    else:
        semana_label = f"sem {no_semana}"

    # 3. Revisiones de la semana para este huerto
    revs = session.execute(
        text("""
            SELECT tr.folio, tr.no_trampa, tr.fecha_revision, tr.status_revision,
                   tr.dias_exposicion, tr.validado
            FROM trampas_revision tr
            JOIN trampas tp ON BINARY TRIM(tp.no_trampa) = BINARY TRIM(tr.no_trampa)
            WHERE BINARY TRIM(tp.numeroinscripcion) = :n
              AND tr.no_semana = :s
        """),
        {"n": numeroinscripcion.strip(), "s": no_semana},
    ).mappings().all()

    # 4. Gates
    fechas_ok = [r["fecha_revision"] for r in revs if r["fecha_revision"]]
    gate_fecha = bool(fechas_ok)
    gate_validadas = bool(revs) and all((r["validado"] or "").upper() == "S" for r in revs)
    gate_sin_incompletas = not any(r["status_revision"] in (3, 4, 5, 6) for r in revs)

    # Capturas identificadas: por cada revisión status=2 debe haber ≥1 identificacion
    revisiones_captura = [r for r in revs if r["status_revision"] == 2]
    if revisiones_captura:
        folios = tuple(r["folio"] for r in revisiones_captura)
        placeholders = ", ".join([f":f{i}" for i in range(len(folios))])
        params_f = {f"f{i}": folios[i] for i in range(len(folios))}
        count_ident = session.execute(
            text(f"""
                SELECT COUNT(DISTINCT folio_revision)
                FROM identificacion
                WHERE folio_revision IN ({placeholders})
            """),
            params_f,
        ).scalar() or 0
        gate_identificadas = int(count_ident) >= len(revisiones_captura)
    else:
        gate_identificadas = True

    # Control químico / mecánico / muestreo
    has_cq = session.execute(
        text("""
            SELECT COUNT(*) FROM control_quimico
            WHERE BINARY TRIM(numeroinscripcion) = :n AND no_semana = :s
        """),
        {"n": numeroinscripcion.strip(), "s": str(no_semana)},
    ).scalar() or 0
    has_cm = session.execute(
        text("""
            SELECT COUNT(*) FROM control_mecanico_cultural
            WHERE BINARY TRIM(numeroinscripcion) = :n AND no_semana = :s
        """),
        {"n": numeroinscripcion.strip(), "s": str(no_semana)},
    ).scalar() or 0
    has_mf = session.execute(
        text("""
            SELECT COUNT(*) FROM muestreo_de_frutos
            WHERE BINARY TRIM(numeroinscripcion) = :n AND no_semana = :s
        """),
        {"n": numeroinscripcion.strip(), "s": str(no_semana)},
    ).scalar() or 0

    gates = GateStatus(
        fecha_revision_ok=gate_fecha,
        trampas_todas_validadas=gate_validadas,
        capturas_todas_identificadas=gate_identificadas,
        sin_trampas_incompletas=gate_sin_incompletas,
        tiene_control_quimico=bool(has_cq),
        tiene_control_mecanico=bool(has_cm),
        tiene_muestreo_frutos=bool(has_mf),
    )
    # Los 4 primeros gates son los bloqueantes (los del PHP legacy). Los 3 últimos
    # son opcionales — su ausencia deja el valor en 0 en la TMIMF sin bloquear.
    puede_cerrar = (
        gates.fecha_revision_ok
        and gates.trampas_todas_validadas
        and gates.capturas_todas_identificadas
        and gates.sin_trampas_incompletas
    )

    # 5. Cálculos
    trampas_instaladas = session.execute(
        text("""
            SELECT COUNT(*) FROM trampas
            WHERE BINARY TRIM(numeroinscripcion) = :n
              AND (status IS NULL OR status = 'A')
        """),
        {"n": numeroinscripcion.strip()},
    ).scalar() or 0
    trampas_revisadas = len({(r["no_trampa"] or "").strip() for r in revs})
    porcentaje = (trampas_revisadas / trampas_instaladas * 100.0) if trampas_instaladas else 0.0

    dias_exp_vals = [int(r["dias_exposicion"]) for r in revs if r["dias_exposicion"] is not None]
    dias_exp_prom = (sum(dias_exp_vals) / len(dias_exp_vals)) if dias_exp_vals else 0.0

    # Conteos por especie desde identificacion (cat_especie_mosca: 1 ludens, 2 obliqua, 3 striata, 4 serpentina)
    sp = {1: 0, 2: 0, 3: 0, 4: 0}
    if revisiones_captura:
        folios = tuple(r["folio"] for r in revisiones_captura)
        placeholders = ", ".join([f":f{i}" for i in range(len(folios))])
        params_f = {f"f{i}": folios[i] for i in range(len(folios))}
        for row in session.execute(
            text(f"""
                SELECT tipo_especie,
                       COALESCE(SUM(hembras_silvestre + machos_silvestre), 0) AS capt
                FROM identificacion
                WHERE folio_revision IN ({placeholders})
                GROUP BY tipo_especie
            """),
            params_f,
        ).mappings():
            te = row["tipo_especie"]
            if te in sp:
                sp[te] = int(row["capt"] or 0)

    def _mtd(capt: int) -> float:
        denom = trampas_revisadas * dias_exp_prom
        return (capt / denom) if denom > 0 else 0.0

    mtd_ludens = _mtd(sp[1])
    mtd_obliqua = _mtd(sp[2])
    mtd_striata = _mtd(sp[3])
    mtd_serpentina = _mtd(sp[4])
    mtd_prom = mtd_ludens + mtd_obliqua  # fórmula del PHP legacy (solo 2 especies)

    # Control químico (superficie, litros de mezcla, estaciones_cebo → otros_controles)
    cq_row = session.execute(
        text("""
            SELECT superficie, proteina_lts, malathion_lts, agua_lts, estaciones_cebo
            FROM control_quimico
            WHERE BINARY TRIM(numeroinscripcion) = :n AND no_semana = :s
            LIMIT 1
        """),
        {"n": numeroinscripcion.strip(), "s": str(no_semana)},
    ).mappings().first()
    sup_asp = float(cq_row["superficie"] or 0) if cq_row else 0.0
    litros = 0.0
    otros = None
    if cq_row:
        litros = float(cq_row["proteina_lts"] or 0) + float(cq_row["malathion_lts"] or 0) + float(cq_row["agua_lts"] or 0)
        if (cq_row["estaciones_cebo"] or 0) > 0:
            otros = f"Estaciones Cebo : {int(cq_row['estaciones_cebo'])}"

    # Control mecánico (kg destruidos)
    cm_row = session.execute(
        text("""
            SELECT kgs_destruidos
            FROM control_mecanico_cultural
            WHERE BINARY TRIM(numeroinscripcion) = :n AND no_semana = :s
            LIMIT 1
        """),
        {"n": numeroinscripcion.strip(), "s": str(no_semana)},
    ).mappings().first()
    kg_destruidos = float(cm_row["kgs_destruidos"] or 0) if cm_row else 0.0

    # Muestreo de frutos (kg, larvas/kg). El PHP legacy suma kgs y frutos
    # infestados de todo el huerto en esa semana y calcula larvas/kg =
    # frutos_infestados / kgs_muestreados. Si no hay muestreo o kgs=0 → 0.
    mf_row = session.execute(
        text("""
            SELECT COALESCE(SUM(kgs_muestreados), 0) AS kgs_muestreados,
                   COALESCE(SUM(frutos_infestados), 0) AS frutos_infestados
            FROM muestreo_de_frutos
            WHERE BINARY TRIM(numeroinscripcion) = :n AND no_semana = :s
        """),
        {"n": numeroinscripcion.strip(), "s": str(no_semana)},
    ).mappings().first()
    kg_muestreados = float(mf_row["kgs_muestreados"] or 0) if mf_row else 0.0
    frutos_inf = float(mf_row["frutos_infestados"] or 0) if mf_row else 0.0
    larvas_kg = (frutos_inf / kg_muestreados) if kg_muestreados > 0 else 0.0

    fecha_max = max(fechas_ok) if fechas_ok else None

    calculos = CalculosTmimf(
        fecha_revision=fecha_max.isoformat() if fecha_max else None,
        mtd_ludens=round(mtd_ludens, 4),
        mtd_obliqua=round(mtd_obliqua, 4),
        mtd_striata=round(mtd_striata, 4),
        mtd_serpentina=round(mtd_serpentina, 4),
        mtd_promedio_semanal=round(mtd_prom, 4),
        trampas_instaladas=int(trampas_instaladas),
        trampas_revisadas=int(trampas_revisadas),
        porcentaje_trampas_rev=round(porcentaje, 2),
        dias_exposicion_prom=round(dias_exp_prom, 2),
        superficie_asperjada=sup_asp,
        litros_mezcla_asperjada=round(litros, 2),
        kg_fruta_destruida=kg_destruidos,
        otros_controles=otros,
        kg_fruta_muestreada=kg_muestreados,
        larvas_por_kg_fruta=larvas_kg,
    )

    meta = MetaTmimf(
        folio_ruta=int(meta_row["folio_ruta"]) if meta_row and meta_row["folio_ruta"] else None,
        clave_pfa=int(meta_row["clave_pfa"]) if meta_row and meta_row["clave_pfa"] else None,
        pfa_nombre=(meta_row["pfa_nombre"] or "").strip() or None if meta_row else None,
        modulo_folio=int(meta_row["modulo_folio"]) if meta_row and meta_row["modulo_folio"] else None,
        modulo_nombre=(meta_row["modulo_nombre"] or "").strip() or None if meta_row else None,
    )

    return PreviewResult(
        numeroinscripcion=numeroinscripcion.strip(),
        no_semana=no_semana,
        semana_label=semana_label,
        puede_cerrar=puede_cerrar,
        gates=gates,
        calculos=calculos,
        meta=meta,
    )
