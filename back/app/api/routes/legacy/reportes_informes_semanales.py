"""
Reportes legacy: Informes semanales SAGARPA (Grupo C).

Reportes oficiales que se entregan a SENASICA por (PFA × ruta × semana).
Cada informe agrega indicadores operativos + identificación + técnicos
sobre el universo de trampas/revisiones de esa ruta en esa semana.

Endpoints implementados:
- GET /trampeo  — equivalente a `informe_semanal_trampeo_generar.php`.

Selectores se reusan de otros routers existentes:
- PFAs con rutas: `/legacy/reportes/inventario-pfa/pfas`
- Rutas por PFA: `/legacy/correcciones/rutas-por-pfa`
- Semanas con revisiones: `/legacy/correcciones/semanas-por-ruta`

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
