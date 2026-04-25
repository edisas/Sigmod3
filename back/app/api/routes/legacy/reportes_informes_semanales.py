"""
Reportes legacy: Informes semanales SAGARPA (Grupo C).

Reportes oficiales que se entregan a SENASICA. Cada uno agrega registros de
una semana epidemiológica filtrando por `no_semana`.

Endpoints implementados:
- GET /trampeo               — por (PFA × ruta × semana). Replica `informe_semanal_trampeo_generar.php`.
- GET /control-quimico       — por semana, lista de aplicaciones químicas (`control_quimico`).
- GET /control-cultural      — por semana, lista de podas/derribos (`control_mecanico_cultural`).
- GET /muestreo-frutos       — por semana, lista de muestreos (`muestreo_de_frutos`).
- GET /semanas-disponibles   — selector compartido de semanas con datos.

Selectores se reusan de otros routers existentes:
- PFAs con rutas: `/legacy/reportes/inventario-pfa/pfas`
- Rutas por PFA: `/legacy/correcciones/rutas-por-pfa`
- Semanas con revisiones: `/legacy/correcciones/semanas-por-ruta`

Reportes del PHP legacy NO migrables (tablas inexistentes en las 8 BDs):
- `informe_semanal_cursos` (tabla `capacitacion`).
- `informe_semanal_divulgacion` (tabla `divulgacion`).
- `informe_semanal_platicas_fitosanitarias` (tabla `capacitacion`).

Convención de localidad: el PHP joinea con `localidades.CLAVE_LOCALIDAD`
pero esa tabla está vacía. En su lugar se devuelve `sv01_sv02.municipio`
(el nombre del municipio del huerto correspondiente).

Notas técnicas:
- `trampas_revision.no_trampa` y `trampas.no_trampa` son VARCHAR (no FK por
  folio). El JOIN es por `BINARY TRIM(no_trampa)` por compat Chiapas.
- `identificacion.folio_revision` apunta a `trampas_revision.folio`.
- MTD aquí usa la fórmula del PHP legacy (`captura × trampas_instaladas /
  dias_exp_prom`) — NO la fórmula NOM-023 (`M / (T×D)`). Se conserva el
  cálculo histórico para que el reporte sea idéntico al SIGMOD 2.
- `tipo_especie` mapea a `cat_especie_mosca` (1=ludens, 2=obliqua,
  3=striata, 4=serpentina, 5=spp). La distinción fértil vs estéril NO es
  por tipo_especie sino por los campos: `hembras/machos_silvestre` cuenta
  capturas fértiles, `hembras/machos_esteril` cuenta estériles. El PHP
  legacy usaba `tipo_especie 6,7` para estériles pero esos códigos no se
  usan en las BDs reales — se conserva el agrupamiento por columnas.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.legacy.dependencies import get_current_legacy_claims, get_legacy_db

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────


class IndicesOperativos(BaseModel):
    trampas_instaladas: int
    trampas_revisadas: int
    dias_exposicion: float
    porcentaje_revision: float


class CapturasPorEspecie(BaseModel):
    a_ludens_fertil: int
    a_obliqua_fertil: int
    a_striata_fertil: int
    a_serpentina_fertil: int
    a_spp_fertil: int
    total_fertil: int
    a_ludens_esteril: int
    a_obliqua_esteril: int
    total_esteril: int


class IndicesTecnicos(BaseModel):
    positivas_fertil: int
    porcentaje_positivas_fertil: float
    mtd_total_fertil: float
    mtd_ludens_fertil: float
    mtd_obliqua_fertil: float
    mtd_striata_fertil: float
    mtd_serpentina_fertil: float
    mtd_spp_fertil: float
    positivas_esteril: int
    porcentaje_positivas_esteril: float
    mtd_total_esteril: float
    mtd_ludens_esteril: float
    mtd_obliqua_esteril: float


class MetaInforme(BaseModel):
    pfa_folio: int
    pfa_nombre: str | None
    ruta_folio: int
    ruta_nombre: str | None
    inicial_ruta: str | None
    modulo_nombre: str | None
    semana_folio: int
    semana_label: str
    fecha_inicio: date | None
    fecha_final: date | None


class InformeSemanalTrampeo(BaseModel):
    meta: MetaInforme
    operativos: IndicesOperativos
    capturas: CapturasPorEspecie
    tecnicos: IndicesTecnicos


# ──────────────────────────────────────────────────────────────────────
# GET /trampeo
# ──────────────────────────────────────────────────────────────────────


@router.get("/trampeo", response_model=InformeSemanalTrampeo)
def informe_semanal_trampeo(
    pfa: int = Query(..., ge=1),
    ruta: int = Query(..., ge=1),
    semana: int = Query(..., ge=1, description="Folio de la semana (no el número 1-52)"),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> InformeSemanalTrampeo:
    # ── Meta: PFA + ruta + semana
    ruta_row = session.execute(
        text("""
            SELECT cr.folio, cr.nombre_ruta, cr.inicial_ruta, cr.clave_pfa,
                   cm.nombre_modulo,
                   cf.nombre AS pfa_nombre
            FROM cat_rutas cr
            LEFT JOIN cat_modulos cm ON cm.folio = cr.modulo
            LEFT JOIN cat_funcionarios cf ON cf.folio = cr.clave_pfa
            WHERE cr.folio = :r
        """),
        {"r": ruta},
    ).mappings().first()
    if not ruta_row:
        raise HTTPException(status_code=404, detail=f"Ruta {ruta} no existe")
    if int(ruta_row["clave_pfa"] or 0) != pfa:
        raise HTTPException(
            status_code=400,
            detail=f"La ruta {ruta} no pertenece al PFA {pfa}",
        )

    sem_row = session.execute(
        text("""
            SELECT folio, no_semana, periodo, fecha_inicio, fecha_final
            FROM semanas WHERE folio = :s
        """),
        {"s": semana},
    ).mappings().first()
    if sem_row and sem_row["no_semana"] is not None and sem_row["periodo"] is not None:
        sem_label = f"{int(sem_row['no_semana'])} - {int(sem_row['periodo'])}"
    else:
        sem_label = f"sem {semana}"

    meta = MetaInforme(
        pfa_folio=pfa,
        pfa_nombre=(str(ruta_row["pfa_nombre"]).strip() if ruta_row["pfa_nombre"] else None),
        ruta_folio=ruta,
        ruta_nombre=(str(ruta_row["nombre_ruta"]).strip() if ruta_row["nombre_ruta"] else None),
        inicial_ruta=(str(ruta_row["inicial_ruta"]).strip() if ruta_row["inicial_ruta"] else None),
        modulo_nombre=(str(ruta_row["nombre_modulo"]).strip() if ruta_row["nombre_modulo"] else None),
        semana_folio=semana,
        semana_label=sem_label,
        fecha_inicio=sem_row["fecha_inicio"] if sem_row else None,
        fecha_final=sem_row["fecha_final"] if sem_row else None,
    )

    # ── Índices operativos
    trampas_instaladas = session.execute(
        text("""
            SELECT COUNT(*) FROM trampas
            WHERE folio_ruta = :r AND (status IS NULL OR status = 'A')
        """),
        {"r": ruta},
    ).scalar() or 0

    # status_revision IN (1, 2) son las que sí se revisaron — 1=Revisada,
    # 2=Revisada con captura. Las 3,4,5,6 son "no revisada / extraviada /
    # quebrada / extemporánea" y el PHP las excluía con STATUS_REVISION='REVISADA'.
    revisadas_rows = session.execute(
        text("""
            SELECT tr.folio, tr.dias_exposicion
            FROM trampas_revision tr
            JOIN trampas tp ON BINARY TRIM(tp.no_trampa) = BINARY TRIM(tr.no_trampa)
            WHERE tr.no_semana = :s
              AND tp.folio_ruta = :r
              AND tr.status_revision IN (1, 2)
        """),
        {"s": semana, "r": ruta},
    ).mappings().all()
    trampas_revisadas = len(revisadas_rows)

    # PHP: $dias = sum(dias_exp de revisadas) / trampas_instaladas (no /revisadas)
    suma_dias = sum(int(r["dias_exposicion"] or 0) for r in revisadas_rows)
    dias_exposicion = (suma_dias / trampas_instaladas) if trampas_instaladas else 0.0
    porcentaje_revision = (trampas_revisadas / trampas_instaladas * 100.0) if trampas_instaladas else 0.0

    operativos = IndicesOperativos(
        trampas_instaladas=int(trampas_instaladas),
        trampas_revisadas=int(trampas_revisadas),
        dias_exposicion=round(dias_exposicion, 4),
        porcentaje_revision=round(porcentaje_revision, 2),
    )

    # ── Capturas por especie (lab. identificación)
    # `identificacion` agrupado por tipo_especie (catálogo cat_especie_mosca).
    # Cada fila trae 4 contadores: hembras/machos × silvestre/estéril. La
    # distinción fértil vs estéril viene de las columnas, NO del tipo_especie.
    capturas_rows = session.execute(
        text("""
            SELECT i.tipo_especie,
                   COALESCE(SUM(i.hembras_silvestre + i.machos_silvestre), 0) AS silvestres,
                   COALESCE(SUM(i.hembras_esteril   + i.machos_esteril),   0) AS esteriles
            FROM identificacion i
            JOIN trampas_revision tr ON tr.folio = i.folio_revision
            JOIN trampas tp ON BINARY TRIM(tp.no_trampa) = BINARY TRIM(tr.no_trampa)
            WHERE tr.no_semana = :s AND tp.folio_ruta = :r
            GROUP BY i.tipo_especie
        """),
        {"s": semana, "r": ruta},
    ).mappings().all()

    # Mapeo: tipo_especie 1-5 son fértiles+estériles potenciales (mismo catálogo
    # cat_especie_mosca). Solo ludens y obliqua se reportan como estériles
    # (tipo 1 y 2) porque son las especies con cría estéril en producción.
    fertil = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    esteril = {1: 0, 2: 0}
    for cr in capturas_rows:
        te = int(cr["tipo_especie"] or 0)
        if te in fertil:
            fertil[te] = int(cr["silvestres"] or 0)
        if te in esteril:
            esteril[te] = int(cr["esteriles"] or 0)

    total_fertil = fertil[1] + fertil[2] + fertil[3] + fertil[4] + fertil[5]
    total_esteril = esteril[1] + esteril[2]

    capturas = CapturasPorEspecie(
        a_ludens_fertil=fertil[1],
        a_obliqua_fertil=fertil[2],
        a_striata_fertil=fertil[3],
        a_serpentina_fertil=fertil[4],
        a_spp_fertil=fertil[5],
        total_fertil=total_fertil,
        a_ludens_esteril=esteril[1],
        a_obliqua_esteril=esteril[2],
        total_esteril=total_esteril,
    )

    # ── Índices técnicos (% positivas, MTDs)
    total_global = total_fertil + total_esteril
    pct_fertil  = (total_fertil  / total_global * 100.0) if total_global else 0.0
    pct_esteril = (total_esteril / total_global * 100.0) if total_global else 0.0

    # MTD legacy: (captura × trampas_instaladas) / dias_exp_prom — NO es la
    # fórmula NOM-023 estándar pero se conserva por fidelidad al PHP.
    def _mtd(captura: int) -> float:
        if dias_exposicion <= 0:
            return 0.0
        return (captura * trampas_instaladas) / dias_exposicion

    tecnicos = IndicesTecnicos(
        positivas_fertil=total_fertil,
        porcentaje_positivas_fertil=round(pct_fertil, 4),
        mtd_total_fertil=round(_mtd(total_fertil), 4),
        mtd_ludens_fertil=round(_mtd(fertil[1]), 4),
        mtd_obliqua_fertil=round(_mtd(fertil[2]), 4),
        mtd_striata_fertil=round(_mtd(fertil[3]), 4),
        mtd_serpentina_fertil=round(_mtd(fertil[4]), 4),
        mtd_spp_fertil=round(_mtd(fertil[5]), 4),
        positivas_esteril=total_esteril,
        porcentaje_positivas_esteril=round(pct_esteril, 4),
        mtd_total_esteril=round(_mtd(total_esteril), 4),
        mtd_ludens_esteril=round(_mtd(esteril[1]), 4),
        mtd_obliqua_esteril=round(_mtd(esteril[2]), 4),
    )

    return InformeSemanalTrampeo(
        meta=meta,
        operativos=operativos,
        capturas=capturas,
        tecnicos=tecnicos,
    )


# ──────────────────────────────────────────────────────────────────────
# GET /semanas-disponibles — selector común para los reportes por estado
# ──────────────────────────────────────────────────────────────────────


class SemanaOption(BaseModel):
    folio: int
    no_semana: int | None
    periodo: int | None
    fecha_inicio: date | None
    fecha_final: date | None
    label: str


@router.get("/semanas-disponibles", response_model=list[SemanaOption])
def semanas_disponibles(
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[SemanaOption]:
    """Semanas que tienen datos en al menos uno de los 3 reportes (control_quimico,
    control_mecanico_cultural, muestreo_de_frutos)."""
    rows = session.execute(text("""
        SELECT s.folio, s.no_semana, s.periodo, s.fecha_inicio, s.fecha_final
        FROM semanas s
        WHERE s.folio IN (
            SELECT DISTINCT no_semana FROM control_quimico WHERE no_semana > 0
            UNION SELECT DISTINCT no_semana FROM control_mecanico_cultural WHERE no_semana > 0
            UNION SELECT DISTINCT no_semana FROM muestreo_de_frutos WHERE no_semana > 0
        )
        ORDER BY s.folio DESC
        LIMIT 104
    """)).mappings().all()
    out: list[SemanaOption] = []
    for r in rows:
        nsa = r["no_semana"]
        per = r["periodo"]
        label = f"{int(nsa)} - {int(per)}" if (nsa is not None and per is not None) else f"sem {int(r['folio'])}"
        out.append(SemanaOption(
            folio=int(r["folio"]),
            no_semana=int(nsa) if nsa is not None else None,
            periodo=int(per) if per is not None else None,
            fecha_inicio=r["fecha_inicio"],
            fecha_final=r["fecha_final"],
            label=label,
        ))
    return out


# ──────────────────────────────────────────────────────────────────────
# GET /control-quimico
# ──────────────────────────────────────────────────────────────────────


class ControlQuimicoRow(BaseModel):
    folio: int
    fecha_aplicacion: date | None
    numeroinscripcion: str | None
    propietario: str | None
    municipio: str | None
    tipo_aplicacion_nombre: str | None
    superficie: float
    estaciones_cebo: int
    proteina_lts: float
    malathion_lts: float
    agua_lts: float
    observaciones: str | None


class ControlQuimicoResponse(BaseModel):
    semana: SemanaOption
    rows: list[ControlQuimicoRow]
    totales: dict   # {superficie, estaciones_cebo, proteina_lts, malathion_lts, agua_lts}


@router.get("/control-quimico", response_model=ControlQuimicoResponse)
def control_quimico_semanal(
    semana: int = Query(..., ge=1, description="Folio de la semana"),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> ControlQuimicoResponse:
    sem_opt = _resolve_semana(session, semana)

    rows = session.execute(
        text("""
            SELECT cq.folio, cq.fecha_aplicacion,
                   TRIM(cq.numeroinscripcion) AS numeroinscripcion,
                   sv.nombre_propietario AS propietario,
                   sv.municipio          AS municipio,
                   ta.nombre             AS tipo_aplicacion_nombre,
                   cq.superficie, cq.estaciones_cebo,
                   cq.proteina_lts, cq.malathion_lts, cq.agua_lts,
                   cq.observaciones
            FROM control_quimico cq
            LEFT JOIN sv01_sv02 sv ON sv.numeroinscripcion = cq.numeroinscripcion
            LEFT JOIN cat_tipos_aplicacion ta ON ta.folio = cq.tipo_aplicacion
            WHERE cq.no_semana = :s
            ORDER BY cq.fecha_aplicacion ASC, cq.folio ASC
        """),
        {"s": semana},
    ).mappings().all()

    out: list[ControlQuimicoRow] = []
    tot = {"superficie": 0.0, "estaciones_cebo": 0,
           "proteina_lts": 0.0, "malathion_lts": 0.0, "agua_lts": 0.0}
    for r in rows:
        sup = float(r["superficie"] or 0)
        est = int(r["estaciones_cebo"] or 0)
        pro = float(r["proteina_lts"] or 0)
        mal = float(r["malathion_lts"] or 0)
        agu = float(r["agua_lts"] or 0)
        tot["superficie"] += sup
        tot["estaciones_cebo"] += est
        tot["proteina_lts"] += pro
        tot["malathion_lts"] += mal
        tot["agua_lts"] += agu
        out.append(ControlQuimicoRow(
            folio=int(r["folio"]),
            fecha_aplicacion=r["fecha_aplicacion"],
            numeroinscripcion=str(r["numeroinscripcion"] or "").strip() or None,
            propietario=(str(r["propietario"]).strip() if r["propietario"] else None),
            municipio=(str(r["municipio"]).strip() if r["municipio"] else None),
            tipo_aplicacion_nombre=(str(r["tipo_aplicacion_nombre"]).strip() if r["tipo_aplicacion_nombre"] else None),
            superficie=sup, estaciones_cebo=est,
            proteina_lts=pro, malathion_lts=mal, agua_lts=agu,
            observaciones=(str(r["observaciones"]).strip() if r["observaciones"] else None),
        ))
    return ControlQuimicoResponse(semana=sem_opt, rows=out, totales=tot)


# ──────────────────────────────────────────────────────────────────────
# GET /control-cultural
# ──────────────────────────────────────────────────────────────────────


class ControlCulturalRow(BaseModel):
    folio: int
    fecha: date | None
    numeroinscripcion: str | None
    propietario: str | None
    municipio: str | None
    hospedero_nombre: str | None
    kgs_destruidos: float
    no_arboles: int
    has_rastreadas: float
    observaciones: str | None


class ControlCulturalResponse(BaseModel):
    semana: SemanaOption
    rows: list[ControlCulturalRow]
    totales: dict


@router.get("/control-cultural", response_model=ControlCulturalResponse)
def control_cultural_semanal(
    semana: int = Query(..., ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> ControlCulturalResponse:
    sem_opt = _resolve_semana(session, semana)

    rows = session.execute(
        text("""
            SELECT cmc.folio, cmc.fecha,
                   TRIM(cmc.numeroinscripcion) AS numeroinscripcion,
                   sv.nombre_propietario AS propietario,
                   sv.municipio          AS municipio,
                   ch.nombre             AS hospedero_nombre,
                   cmc.kgs_destruidos, cmc.no_arboles, cmc.has_rastreadas,
                   cmc.observaciones
            FROM control_mecanico_cultural cmc
            LEFT JOIN sv01_sv02 sv ON sv.numeroinscripcion = cmc.numeroinscripcion
            LEFT JOIN cat_hospederos ch ON ch.folio = cmc.folio_hospedero
            WHERE cmc.no_semana = :s
            ORDER BY cmc.fecha ASC, cmc.folio ASC
        """),
        {"s": semana},
    ).mappings().all()

    out: list[ControlCulturalRow] = []
    tot = {"kgs_destruidos": 0.0, "no_arboles": 0, "has_rastreadas": 0.0}
    for r in rows:
        kgs = float(r["kgs_destruidos"] or 0)
        arb = int(r["no_arboles"] or 0)
        has_r = float(r["has_rastreadas"] or 0)
        tot["kgs_destruidos"] += kgs
        tot["no_arboles"] += arb
        tot["has_rastreadas"] += has_r
        out.append(ControlCulturalRow(
            folio=int(r["folio"]),
            fecha=r["fecha"],
            numeroinscripcion=str(r["numeroinscripcion"] or "").strip() or None,
            propietario=(str(r["propietario"]).strip() if r["propietario"] else None),
            municipio=(str(r["municipio"]).strip() if r["municipio"] else None),
            hospedero_nombre=(str(r["hospedero_nombre"]).strip() if r["hospedero_nombre"] else None),
            kgs_destruidos=kgs, no_arboles=arb, has_rastreadas=has_r,
            observaciones=(str(r["observaciones"]).strip() if r["observaciones"] else None),
        ))
    return ControlCulturalResponse(semana=sem_opt, rows=out, totales=tot)


# ──────────────────────────────────────────────────────────────────────
# GET /muestreo-frutos
# ──────────────────────────────────────────────────────────────────────


class MuestreoFrutosRow(BaseModel):
    folio: int
    no_muestra: str | None
    fecha_muestreo: date | None
    fecha_diseccion: date | None
    numeroinscripcion: str | None
    propietario: str | None
    municipio: str | None
    hospedero_nombre: str | None
    no_frutos: int
    frutos_infestados: int
    kgs_muestreados: float
    kgs_disectados: float
    larvas_por_kg: float
    usuario: str | None


class MuestreoFrutosResponse(BaseModel):
    semana: SemanaOption
    rows: list[MuestreoFrutosRow]
    totales: dict


@router.get("/muestreo-frutos", response_model=MuestreoFrutosResponse)
def muestreo_frutos_semanal(
    semana: int = Query(..., ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> MuestreoFrutosResponse:
    sem_opt = _resolve_semana(session, semana)

    # `cat_hospederos.folio` puede mapear a `muestreo_de_frutos.variedad`
    # o no — tomamos `variedad` como hospedero genérico (compat con PHP que
    # usaba clave_hospedero pero la columna no existe en V3).
    rows = session.execute(
        text("""
            SELECT mf.folio, mf.no_muestra, mf.fecha_muestreo, mf.fecha_diseccion,
                   TRIM(mf.numeroinscripcion) AS numeroinscripcion,
                   sv.nombre_propietario AS propietario,
                   sv.municipio          AS municipio,
                   ch.nombre             AS hospedero_nombre,
                   mf.no_frutos, mf.frutos_infestados,
                   mf.kgs_muestreados, mf.kgs_disectados,
                   mf.usuario
            FROM muestreo_de_frutos mf
            LEFT JOIN sv01_sv02 sv ON sv.numeroinscripcion = mf.numeroinscripcion
            LEFT JOIN cat_hospederos ch ON ch.folio = mf.variedad
            WHERE mf.no_semana = :s
            ORDER BY mf.fecha_muestreo ASC, mf.folio ASC
        """),
        {"s": semana},
    ).mappings().all()

    out: list[MuestreoFrutosRow] = []
    tot = {"no_frutos": 0, "frutos_infestados": 0,
           "kgs_muestreados": 0.0, "kgs_disectados": 0.0}
    for r in rows:
        nfr = int(r["no_frutos"] or 0)
        finf = int(r["frutos_infestados"] or 0)
        kgm = float(r["kgs_muestreados"] or 0)
        kgd = float(r["kgs_disectados"] or 0)
        tot["no_frutos"] += nfr
        tot["frutos_infestados"] += finf
        tot["kgs_muestreados"] += kgm
        tot["kgs_disectados"] += kgd
        larvas_kg = (finf / kgm) if kgm > 0 else 0.0
        out.append(MuestreoFrutosRow(
            folio=int(r["folio"]),
            no_muestra=(str(r["no_muestra"]).strip() if r["no_muestra"] else None),
            fecha_muestreo=r["fecha_muestreo"],
            fecha_diseccion=r["fecha_diseccion"],
            numeroinscripcion=str(r["numeroinscripcion"] or "").strip() or None,
            propietario=(str(r["propietario"]).strip() if r["propietario"] else None),
            municipio=(str(r["municipio"]).strip() if r["municipio"] else None),
            hospedero_nombre=(str(r["hospedero_nombre"]).strip() if r["hospedero_nombre"] else None),
            no_frutos=nfr, frutos_infestados=finf,
            kgs_muestreados=kgm, kgs_disectados=kgd,
            larvas_por_kg=round(larvas_kg, 4),
            usuario=(str(r["usuario"]).strip() if r["usuario"] else None),
        ))
    return MuestreoFrutosResponse(semana=sem_opt, rows=out, totales=tot)


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


def _resolve_semana(session: Session, semana_folio: int) -> SemanaOption:
    """Resuelve metadata de una semana por folio."""
    row = session.execute(
        text("""
            SELECT folio, no_semana, periodo, fecha_inicio, fecha_final
            FROM semanas WHERE folio = :f
        """),
        {"f": semana_folio},
    ).mappings().first()
    if not row:
        return SemanaOption(folio=semana_folio, no_semana=None, periodo=None,
                            fecha_inicio=None, fecha_final=None,
                            label=f"sem {semana_folio}")
    nsa = row["no_semana"]
    per = row["periodo"]
    label = f"{int(nsa)} - {int(per)}" if (nsa is not None and per is not None) else f"sem {semana_folio}"
    return SemanaOption(
        folio=int(row["folio"]),
        no_semana=int(nsa) if nsa is not None else None,
        periodo=int(per) if per is not None else None,
        fecha_inicio=row["fecha_inicio"],
        fecha_final=row["fecha_final"],
        label=label,
    )
