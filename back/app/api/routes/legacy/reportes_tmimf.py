"""
Reporte legacy: TMIMFs emitidas por fecha.

Consolida 3 variantes del PHP legacy en un solo endpoint parametrizado:

- `modo=emitidas` — por `fecha_emision`, scope módulo opcional. Equivalente a
  `tmimf_emitidas_por_fecha_generar.php`.
- `modo=validadas_normex` — por `fecha_verifico_normex`, solo `larva_en_empaque='S'`.
  Equivalente a `todas_tmimf_emitidas_por_fecha_generar.php`.
- `modo=mis_validadas` — idéntico a `validadas_normex` + filtro por
  `verifico_normex = <usuario legacy actual>`. Equivalente a
  `pfas_tmimf_emitidas_por_fecha_generar.php`.

Además opcionalmente incluye los renglones de `detallado_tmimf` (variedad,
cantidad, vehículo, placas, saldo, cajas por tamaño, granel).

Filtros adicionales: tipo_tarjeta (`M`=Movilización, `O`=Operaciones —
las `I`=Inválidas se EXCLUYEN siempre, no son visibles en este reporte),
mercado_destino (1 Exportación, 2 Nacional), módulo emisor.

Parámetros always-on: `fecha_inicio`, `fecha_fin`, paginación offset/limit.

Chiapas: `tmimf.numeroinscripcion` y `sv01_sv02.numeroinscripcion` comparten
collation `latin1_swedish_ci` — join directo, SIN BINARY TRIM (ver
reference_legacy_schema notes).
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.legacy.dependencies import get_current_legacy_claims, get_legacy_db

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────


class DetalladoRow(BaseModel):
    folio: int
    sub_folio: str | None
    cantidad_movilizada: float
    variedad_folio: int | None
    variedad_nombre: str | None
    tipo_vehiculo: str | None
    placas: str | None
    saldo: float
    cajas_total: int
    granel: float
    status: str | None


class TmimfEmitidaRow(BaseModel):
    folio_tmimf: str
    status: str | None
    tipo_tarjeta: str | None
    mercado_destino: int | None
    numeroinscripcion: str
    nombre_propietario: str | None
    nombre_unidad: str | None
    fecha_emision: date | None
    hora_emision: str | None
    fecha_verifico_normex: date | None
    pfa_folio: int | None
    pfa_nombre: str | None
    pfa_cedula: str | None
    usuario_generador_nombre: str | None
    modulo_emisor_folio: int | None
    modulo_emisor_nombre: str | None
    semana: int | None
    detallado: list[DetalladoRow] | None


class TmimfEmitidasPage(BaseModel):
    total: int
    offset: int
    limit: int
    modo: str
    rows: list[TmimfEmitidaRow]


# ──────────────────────────────────────────────────────────────────────
# GET /emitidas
# ──────────────────────────────────────────────────────────────────────


@router.get("/emitidas", response_model=TmimfEmitidasPage)
def tmimfs_emitidas(
    fecha_inicio: date = Query(..., description="Fecha inicio (inclusive)"),
    fecha_fin: date = Query(..., description="Fecha fin (inclusive)"),
    modo: str = Query("emitidas", pattern="^(emitidas|validadas_normex|mis_validadas)$"),
    tipo_tarjeta: str | None = Query(None, pattern="^(O|M)$", description="Solo M y O — las I (Inválidas) se excluyen siempre"),
    mercado_destino: int | None = Query(None, ge=1, le=2),
    modulo_folio: int | None = Query(None, ge=1),
    incluir_detallado: bool = Query(False),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> TmimfEmitidasPage:
    if fecha_fin < fecha_inicio:
        fecha_inicio, fecha_fin = fecha_fin, fecha_inicio

    # Construir WHERE dinámico según modo.
    # Las TMIMF tipo 'I' (Inválidas) se excluyen siempre — son cancelaciones
    # internas que no deben aparecer en reportes ni dashboards.
    params: dict = {"fi": fecha_inicio, "ff": fecha_fin}
    conds: list[str] = [
        "LENGTH(tmi.folio_tmimf) > 9",
        "(tmi.tipo_tarjeta IS NULL OR tmi.tipo_tarjeta <> 'I')",
    ]

    if modo == "emitidas":
        conds.append("tmi.fecha_emision BETWEEN :fi AND :ff")
        conds.append("(tmi.status IS NULL OR tmi.status NOT IN ('E', 'R'))")
    else:
        # validadas_normex / mis_validadas usan fecha_verifico_normex
        conds.append("tmi.fecha_verifico_normex BETWEEN :fi AND :ff")
        conds.append("tmi.larva_en_empaque = 'S'")
        if modo == "mis_validadas":
            try:
                sub = int(claims.get("sub", 0))
            except (TypeError, ValueError):
                sub = 0
            conds.append("tmi.verifico_normex = :user_sub")
            params["user_sub"] = sub

    if tipo_tarjeta:
        conds.append("tmi.tipo_tarjeta = :tt")
        params["tt"] = tipo_tarjeta
    if mercado_destino is not None:
        conds.append("tmi.mercado_destino = :md")
        params["md"] = mercado_destino
    if modulo_folio is not None:
        conds.append("tmi.modulo_emisor = :mod")
        params["mod"] = modulo_folio

    where_clause = " AND ".join(conds)

    # Count total (sin joins caros)
    total = session.execute(
        text(f"SELECT COUNT(*) FROM tmimf tmi WHERE {where_clause}"),
        params,
    ).scalar() or 0

    # Listado con joins a catálogos
    rows = session.execute(
        text(f"""
            SELECT
                tmi.folio_tmimf,
                tmi.status,
                tmi.tipo_tarjeta,
                tmi.mercado_destino,
                tmi.numeroinscripcion,
                sv.nombre_propietario,
                sv.nombre_unidad,
                tmi.fecha_emision,
                tmi.hora_emision,
                tmi.fecha_verifico_normex,
                tmi.clave_aprobado AS pfa_folio,
                fun.nombre         AS pfa_nombre,
                fun.cedula         AS pfa_cedula,
                usu.nombre         AS usuario_generador_nombre,
                tmi.modulo_emisor  AS modulo_emisor_folio,
                cm.nombre_modulo   AS modulo_emisor_nombre,
                tmi.semana
            FROM tmimf tmi
            LEFT JOIN sv01_sv02        sv  ON sv.numeroinscripcion = tmi.numeroinscripcion
            LEFT JOIN cat_funcionarios fun ON fun.folio = tmi.clave_aprobado
            LEFT JOIN usuarios         usu ON usu.clave = tmi.usuario_generador
            LEFT JOIN cat_modulos      cm  ON cm.folio = tmi.modulo_emisor
            WHERE {where_clause}
            ORDER BY tmi.fecha_emision DESC, tmi.folio_tmimf ASC
            LIMIT :lim OFFSET :off
        """),
        {**params, "lim": limit, "off": offset},
    ).mappings().all()

    # Detallado opcional — una sola query con IN (folio_completo) y agrupamos en Python.
    # `granel` falta en 2 BDs (CHP, OAX) — detectamos dinámicamente para evitar
    # error SQL 1054. Se asume 0 cuando la columna no existe.
    detallado_map: dict[str, list[DetalladoRow]] = {}
    if incluir_detallado and rows:
        tiene_granel = session.execute(
            text("""
                SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'detallado_tmimf'
                  AND column_name = 'granel'
            """),
        ).scalar() or 0
        granel_expr = "d.granel" if tiene_granel else "0"

        folios = [str(r["folio_tmimf"]) for r in rows]
        placeholders = ", ".join(f":f{i}" for i in range(len(folios)))
        params_det = {f"f{i}": folios[i] for i in range(len(folios))}
        det_rows = session.execute(
            text(f"""
                SELECT
                    d.folio,
                    d.folio_completo,
                    d.sub_folio,
                    d.cantidad_movilizada,
                    d.variedad_movilizada AS variedad_folio,
                    v.descripcion         AS variedad_nombre,
                    d.tipo_vehiculo,
                    d.placas,
                    d.saldo,
                    {granel_expr}         AS granel,
                    d.cajas14, d.cajas15, d.cajas16, d.cajas18, d.cajas20, d.cajas25, d.cajas30,
                    d.status
                FROM detallado_tmimf d
                LEFT JOIN cat_variedades v ON v.folio = d.variedad_movilizada
                WHERE d.folio_completo IN ({placeholders})
                ORDER BY d.folio_completo ASC, d.folio ASC
            """),
            params_det,
        ).mappings().all()
        for dr in det_rows:
            fc = str(dr["folio_completo"]).strip()
            cajas_total = sum(
                int(dr[c] or 0)
                for c in ("cajas14", "cajas15", "cajas16", "cajas18", "cajas20", "cajas25", "cajas30")
            )
            detallado_map.setdefault(fc, []).append(DetalladoRow(
                folio=int(dr["folio"]),
                sub_folio=(str(dr["sub_folio"]).strip() if dr["sub_folio"] is not None else None),
                cantidad_movilizada=float(dr["cantidad_movilizada"] or 0),
                variedad_folio=int(dr["variedad_folio"]) if dr["variedad_folio"] else None,
                variedad_nombre=(str(dr["variedad_nombre"]).strip() if dr["variedad_nombre"] else None),
                tipo_vehiculo=(str(dr["tipo_vehiculo"]).strip() if dr["tipo_vehiculo"] else None),
                placas=(str(dr["placas"]).strip() if dr["placas"] else None),
                saldo=float(dr["saldo"] or 0),
                cajas_total=cajas_total,
                granel=float(dr["granel"] or 0),
                status=(str(dr["status"]).strip() if dr["status"] else None),
            ))

    out: list[TmimfEmitidaRow] = []
    for r in rows:
        folio = str(r["folio_tmimf"]).strip()
        out.append(TmimfEmitidaRow(
            folio_tmimf=folio,
            status=(str(r["status"]).strip() if r["status"] else None),
            tipo_tarjeta=(str(r["tipo_tarjeta"]).strip() if r["tipo_tarjeta"] else None),
            mercado_destino=int(r["mercado_destino"]) if r["mercado_destino"] else None,
            numeroinscripcion=str(r["numeroinscripcion"] or "").strip(),
            nombre_propietario=(str(r["nombre_propietario"]).strip() if r["nombre_propietario"] else None),
            nombre_unidad=(str(r["nombre_unidad"]).strip() if r["nombre_unidad"] else None),
            fecha_emision=r.get("fecha_emision"),
            hora_emision=(str(r["hora_emision"]).strip() if r["hora_emision"] else None),
            fecha_verifico_normex=r.get("fecha_verifico_normex"),
            pfa_folio=int(r["pfa_folio"]) if r["pfa_folio"] else None,
            pfa_nombre=(str(r["pfa_nombre"]).strip() if r["pfa_nombre"] else None),
            pfa_cedula=(str(r["pfa_cedula"]).strip() if r["pfa_cedula"] else None),
            usuario_generador_nombre=(str(r["usuario_generador_nombre"]).strip() if r["usuario_generador_nombre"] else None),
            modulo_emisor_folio=int(r["modulo_emisor_folio"]) if r["modulo_emisor_folio"] else None,
            modulo_emisor_nombre=(str(r["modulo_emisor_nombre"]).strip() if r["modulo_emisor_nombre"] else None),
            semana=int(r["semana"]) if r["semana"] not in (None, "") else None,
            detallado=detallado_map.get(folio) if incluir_detallado else None,
        ))

    return TmimfEmitidasPage(
        total=int(total),
        offset=offset,
        limit=limit,
        modo=modo,
        rows=out,
    )


# ──────────────────────────────────────────────────────────────────────
# GET /modulos — catálogo para el filtro del modo "emitidas"
# ──────────────────────────────────────────────────────────────────────


class ModuloSelect(BaseModel):
    folio: int
    nombre_modulo: str


@router.get("/modulos", response_model=list[ModuloSelect])
def modulos_emisores(
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[ModuloSelect]:
    rows = session.execute(
        text("""
            SELECT folio, nombre_modulo
            FROM cat_modulos
            ORDER BY nombre_modulo ASC
        """),
    ).mappings().all()
    return [
        ModuloSelect(folio=int(r["folio"]), nombre_modulo=str(r["nombre_modulo"] or "").strip())
        for r in rows
    ]


# ──────────────────────────────────────────────────────────────────────
# GET /detallado-movilizacion — búsqueda por folio TMIMF (zoom-in)
# ──────────────────────────────────────────────────────────────────────


class DetalladoMovilizacionResponse(BaseModel):
    encontrado: bool
    cabecera: TmimfEmitidaRow | None
    detallado: list[DetalladoRow]


@router.get("/detallado-movilizacion", response_model=DetalladoMovilizacionResponse)
def detallado_movilizacion(
    folio_tmimf: str = Query(..., min_length=1, description="Folio completo de la TMIMF"),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> DetalladoMovilizacionResponse:
    """Búsqueda zoom-in por folio TMIMF: cabecera + todos los renglones.

    Reemplaza el placeholder `detallado_de_movilizacion.php` que en el legacy
    nunca se implementó. Útil para auditoría puntual cuando ya se tiene un
    folio en mano (ej. desde un COPREF, recibo, queja, etc.).

    Las TMIMFs tipo 'I' (Inválidas) NO se devuelven — regla global.
    """
    folio = folio_tmimf.strip()
    cab = session.execute(
        text("""
            SELECT
                tmi.folio_tmimf,
                tmi.status,
                tmi.tipo_tarjeta,
                tmi.mercado_destino,
                tmi.numeroinscripcion,
                sv.nombre_propietario,
                sv.nombre_unidad,
                tmi.fecha_emision,
                tmi.hora_emision,
                tmi.fecha_verifico_normex,
                tmi.clave_aprobado AS pfa_folio,
                fun.nombre         AS pfa_nombre,
                fun.cedula         AS pfa_cedula,
                usu.nombre         AS usuario_generador_nombre,
                tmi.modulo_emisor  AS modulo_emisor_folio,
                cm.nombre_modulo   AS modulo_emisor_nombre,
                tmi.semana
            FROM tmimf tmi
            LEFT JOIN sv01_sv02        sv  ON sv.numeroinscripcion = tmi.numeroinscripcion
            LEFT JOIN cat_funcionarios fun ON fun.folio = tmi.clave_aprobado
            LEFT JOIN usuarios         usu ON usu.clave = tmi.usuario_generador
            LEFT JOIN cat_modulos      cm  ON cm.folio = tmi.modulo_emisor
            WHERE tmi.folio_tmimf = :f
              AND (tmi.tipo_tarjeta IS NULL OR tmi.tipo_tarjeta <> 'I')
            LIMIT 1
        """),
        {"f": folio},
    ).mappings().first()

    if not cab:
        return DetalladoMovilizacionResponse(encontrado=False, cabecera=None, detallado=[])

    # `granel` falta en CHP/OAX — detección dinámica.
    tiene_granel = session.execute(
        text("""
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'detallado_tmimf'
              AND column_name = 'granel'
        """),
    ).scalar() or 0
    granel_expr = "d.granel" if tiene_granel else "0"

    det_rows = session.execute(
        text(f"""
            SELECT
                d.folio,
                d.sub_folio,
                d.cantidad_movilizada,
                d.variedad_movilizada AS variedad_folio,
                v.descripcion         AS variedad_nombre,
                d.tipo_vehiculo,
                d.placas,
                d.saldo,
                {granel_expr}         AS granel,
                d.cajas14, d.cajas15, d.cajas16, d.cajas18, d.cajas20, d.cajas25, d.cajas30,
                d.status
            FROM detallado_tmimf d
            LEFT JOIN cat_variedades v ON v.folio = d.variedad_movilizada
            WHERE d.folio_completo = :f
            ORDER BY d.folio ASC
        """),
        {"f": folio},
    ).mappings().all()

    detallado: list[DetalladoRow] = []
    for dr in det_rows:
        cajas_total = sum(
            int(dr[c] or 0)
            for c in ("cajas14", "cajas15", "cajas16", "cajas18", "cajas20", "cajas25", "cajas30")
        )
        detallado.append(DetalladoRow(
            folio=int(dr["folio"]),
            sub_folio=(str(dr["sub_folio"]).strip() if dr["sub_folio"] is not None else None),
            cantidad_movilizada=float(dr["cantidad_movilizada"] or 0),
            variedad_folio=int(dr["variedad_folio"]) if dr["variedad_folio"] else None,
            variedad_nombre=(str(dr["variedad_nombre"]).strip() if dr["variedad_nombre"] else None),
            tipo_vehiculo=(str(dr["tipo_vehiculo"]).strip() if dr["tipo_vehiculo"] else None),
            placas=(str(dr["placas"]).strip() if dr["placas"] else None),
            saldo=float(dr["saldo"] or 0),
            cajas_total=cajas_total,
            granel=float(dr["granel"] or 0),
            status=(str(dr["status"]).strip() if dr["status"] else None),
        ))

    cabecera = TmimfEmitidaRow(
        folio_tmimf=str(cab["folio_tmimf"]).strip(),
        status=(str(cab["status"]).strip() if cab["status"] else None),
        tipo_tarjeta=(str(cab["tipo_tarjeta"]).strip() if cab["tipo_tarjeta"] else None),
        mercado_destino=int(cab["mercado_destino"]) if cab["mercado_destino"] else None,
        numeroinscripcion=str(cab["numeroinscripcion"] or "").strip(),
        nombre_propietario=(str(cab["nombre_propietario"]).strip() if cab["nombre_propietario"] else None),
        nombre_unidad=(str(cab["nombre_unidad"]).strip() if cab["nombre_unidad"] else None),
        fecha_emision=cab.get("fecha_emision"),
        hora_emision=(str(cab["hora_emision"]).strip() if cab["hora_emision"] else None),
        fecha_verifico_normex=cab.get("fecha_verifico_normex"),
        pfa_folio=int(cab["pfa_folio"]) if cab["pfa_folio"] else None,
        pfa_nombre=(str(cab["pfa_nombre"]).strip() if cab["pfa_nombre"] else None),
        pfa_cedula=(str(cab["pfa_cedula"]).strip() if cab["pfa_cedula"] else None),
        usuario_generador_nombre=(str(cab["usuario_generador_nombre"]).strip() if cab["usuario_generador_nombre"] else None),
        modulo_emisor_folio=int(cab["modulo_emisor_folio"]) if cab["modulo_emisor_folio"] else None,
        modulo_emisor_nombre=(str(cab["modulo_emisor_nombre"]).strip() if cab["modulo_emisor_nombre"] else None),
        semana=int(cab["semana"]) if cab["semana"] not in (None, "") else None,
        detallado=None,
    )

    return DetalladoMovilizacionResponse(encontrado=True, cabecera=cabecera, detallado=detallado)
