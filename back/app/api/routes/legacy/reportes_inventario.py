"""
Reporte legacy: Inventario por PFA.

Consolida 3 reportes del PHP legacy en un solo endpoint que devuelve la
fotografía operativa de un PFA en una sola respuesta:

- `rutas` — equivalente a `reporte_rutas_por_pfa_generar.php`. Rutas activas
  asignadas al PFA con su módulo y fecha primera revisión.
- `huertos` — equivalente a `reporte_huertos_por_rutas_por_pfa_generar.php`
  pero scope correcto (todas las rutas del PFA, no una sola). Huertos activos
  con propietario, mercado destino, especie, ruta.
- `trampas` — equivalente a `reporte_trampas_instaladas_por_ruta_generar.php`.
  Trampas activas con su huerto, ruta y fecha de colocación.

Filtros: PFA (req). Las 3 secciones se calculan en una sola llamada porque
comparten el universo "rutas del PFA" — ahorra round-trips al frontend que
las muestra en tabs.
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


class RutaRow(BaseModel):
    folio: int
    nombre_ruta: str | None
    inicial_ruta: str | None
    modulo_folio: int | None
    modulo_nombre: str | None
    fecha_primera_revision: date | None
    descripcion: str | None
    dia_revision: str | None
    tipo_folio: str | None


class HuertoRow(BaseModel):
    numeroinscripcion: str
    nombre_unidad: str | None
    nombre_propietario: str | None
    folio_ruta: int | None
    nombre_ruta: str | None
    especie_folio: int | None
    especie_nombre: str | None
    mercado_destino: int | None
    mercado_nombre: str | None


class TrampaRow(BaseModel):
    folio: int
    no_trampa: str | None
    numeroinscripcion: str | None
    folio_ruta: int | None
    nombre_ruta: str | None
    tipo_trampa: int | None
    fecha_colocacion: date | None
    fecha_ultima_revision: date | None


class PfaInfo(BaseModel):
    folio: int
    nombre: str | None
    cedula: str | None
    inicial: str | None


class InventarioResponse(BaseModel):
    pfa: PfaInfo
    rutas: list[RutaRow]
    huertos: list[HuertoRow]
    trampas: list[TrampaRow]


# ──────────────────────────────────────────────────────────────────────
# GET /pfas — selector compartido
# ──────────────────────────────────────────────────────────────────────


@router.get("/pfas", response_model=list[PfaInfo])
def listar_pfas(
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[PfaInfo]:
    """PFAs activos que tienen al menos una ruta asignada."""
    rows = session.execute(text("""
        SELECT cf.folio, cf.nombre, cf.cedula, cf.inicial_funcionario AS inicial
        FROM cat_funcionarios cf
        WHERE cf.cargo = 'PROFESIONAL FITOSANITARIO AUTORIZADO'
          AND (cf.status IS NULL OR cf.status = 'A')
          AND EXISTS (
              SELECT 1 FROM cat_rutas cr
              WHERE cr.clave_pfa = cf.folio
                AND (cr.status IS NULL OR cr.status = 'A')
          )
        ORDER BY cf.nombre ASC
    """)).mappings().all()
    return [
        PfaInfo(
            folio=int(r["folio"]),
            nombre=(str(r["nombre"]).strip() if r["nombre"] else None),
            cedula=(str(r["cedula"]).strip() if r["cedula"] else None),
            inicial=(str(r["inicial"]).strip() if r["inicial"] else None),
        )
        for r in rows
    ]


# ──────────────────────────────────────────────────────────────────────
# GET / — dataset completo del PFA
# ──────────────────────────────────────────────────────────────────────


@router.get("", response_model=InventarioResponse)
def inventario(
    pfa: int = Query(..., ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> InventarioResponse:
    pfa_row = session.execute(
        text("""
            SELECT folio, nombre, cedula, inicial_funcionario AS inicial
            FROM cat_funcionarios WHERE folio = :p LIMIT 1
        """),
        {"p": pfa},
    ).mappings().first()
    pfa_info = PfaInfo(
        folio=pfa,
        nombre=(str(pfa_row["nombre"]).strip() if pfa_row and pfa_row["nombre"] else None),
        cedula=(str(pfa_row["cedula"]).strip() if pfa_row and pfa_row["cedula"] else None),
        inicial=(str(pfa_row["inicial"]).strip() if pfa_row and pfa_row["inicial"] else None),
    )

    # 1. Rutas del PFA
    rutas_rows = session.execute(
        text("""
            SELECT cr.folio, cr.nombre_ruta, cr.inicial_ruta, cr.modulo,
                   cm.nombre_modulo, cr.fecha_primera_revision,
                   cr.descripcion, cr.dia_revision, cr.tipo_folio
            FROM cat_rutas cr
            LEFT JOIN cat_modulos cm ON cm.folio = cr.modulo
            WHERE cr.clave_pfa = :p
              AND (cr.status IS NULL OR cr.status = 'A')
            ORDER BY cr.nombre_ruta ASC
        """),
        {"p": pfa},
    ).mappings().all()
    rutas = [
        RutaRow(
            folio=int(r["folio"]),
            nombre_ruta=(str(r["nombre_ruta"]).strip() if r["nombre_ruta"] else None),
            inicial_ruta=(str(r["inicial_ruta"]).strip() if r["inicial_ruta"] else None),
            modulo_folio=int(r["modulo"]) if r["modulo"] else None,
            modulo_nombre=(str(r["nombre_modulo"]).strip() if r["nombre_modulo"] else None),
            fecha_primera_revision=r["fecha_primera_revision"],
            descripcion=(str(r["descripcion"]).strip() if r["descripcion"] else None),
            dia_revision=(str(r["dia_revision"]).strip() if r["dia_revision"] else None),
            tipo_folio=(str(r["tipo_folio"]).strip() if r["tipo_folio"] else None),
        )
        for r in rutas_rows
    ]

    if not rutas:
        # PFA sin rutas activas — devolver vacío.
        return InventarioResponse(pfa=pfa_info, rutas=[], huertos=[], trampas=[])

    folios_ruta = [r.folio for r in rutas]
    placeholders = ", ".join(f":r{i}" for i in range(len(folios_ruta)))
    params_r = {f"r{i}": folios_ruta[i] for i in range(len(folios_ruta))}

    # 2. Huertos en esas rutas (sv01_sv02)
    huertos_rows = session.execute(
        text(f"""
            SELECT sv.numeroinscripcion, sv.nombre_unidad, sv.nombre_propietario,
                   sv.folio_ruta, cr.nombre_ruta,
                   sv.clave_especie, ce.nombre AS especie_nombre,
                   sv.mercado_destino
            FROM sv01_sv02 sv
            LEFT JOIN cat_rutas    cr ON cr.folio = sv.folio_ruta
            LEFT JOIN cat_especies ce ON ce.folio = sv.clave_especie
            WHERE sv.folio_ruta IN ({placeholders})
              AND (sv.status IS NULL OR sv.status = 'A')
            ORDER BY cr.nombre_ruta ASC, sv.numeroinscripcion ASC
        """),
        params_r,
    ).mappings().all()
    huertos = [
        HuertoRow(
            numeroinscripcion=str(r["numeroinscripcion"] or "").strip(),
            nombre_unidad=(str(r["nombre_unidad"]).strip() if r["nombre_unidad"] else None),
            nombre_propietario=(str(r["nombre_propietario"]).strip() if r["nombre_propietario"] else None),
            folio_ruta=int(r["folio_ruta"]) if r["folio_ruta"] else None,
            nombre_ruta=(str(r["nombre_ruta"]).strip() if r["nombre_ruta"] else None),
            especie_folio=int(r["clave_especie"]) if r["clave_especie"] else None,
            especie_nombre=(str(r["especie_nombre"]).strip() if r["especie_nombre"] else None),
            mercado_destino=int(r["mercado_destino"]) if r["mercado_destino"] else None,
            mercado_nombre=(
                "Exportación" if r["mercado_destino"] == 1
                else "Nacional" if r["mercado_destino"] == 2 else None
            ),
        )
        for r in huertos_rows
    ]

    # 3. Trampas activas en esas rutas
    trampas_rows = session.execute(
        text(f"""
            SELECT tp.folio, tp.no_trampa, tp.numeroinscripcion,
                   tp.folio_ruta, cr.nombre_ruta,
                   tp.tipo_trampa, tp.fecha_colocacion, tp.fecha_ultima_revision
            FROM trampas tp
            LEFT JOIN cat_rutas cr ON cr.folio = tp.folio_ruta
            WHERE tp.folio_ruta IN ({placeholders})
              AND (tp.status IS NULL OR tp.status = 'A')
            ORDER BY cr.nombre_ruta ASC, tp.no_trampa ASC
        """),
        params_r,
    ).mappings().all()
    trampas = [
        TrampaRow(
            folio=int(r["folio"]),
            no_trampa=(str(r["no_trampa"]).strip() if r["no_trampa"] else None),
            numeroinscripcion=(str(r["numeroinscripcion"]).strip() if r["numeroinscripcion"] else None),
            folio_ruta=int(r["folio_ruta"]) if r["folio_ruta"] else None,
            nombre_ruta=(str(r["nombre_ruta"]).strip() if r["nombre_ruta"] else None),
            tipo_trampa=int(r["tipo_trampa"]) if r["tipo_trampa"] else None,
            fecha_colocacion=r["fecha_colocacion"],
            fecha_ultima_revision=r["fecha_ultima_revision"],
        )
        for r in trampas_rows
    ]

    return InventarioResponse(pfa=pfa_info, rutas=rutas, huertos=huertos, trampas=trampas)
