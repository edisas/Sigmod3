"""
Reporte legacy: Estimado de cosecha por PFA.

Equivalente a `estimado_cosecha_pfa.php`. Lista los huertos asignados al
PFA con sus estimaciones de cosecha por variedad: estimado actual, saldo,
total ya movilizado, fecha y progresivo de la última estimación; opcional
historial completo (bitácora).

Tablas:
- `estimado_cosecha`            — última estimación vigente por huerto+variedad.
- `bitacora_estimado_cosecha`   — historial de estimaciones (1 fila por re-estimación).
- `detallado_tmimf`             — para calcular total movilizado por huerto+variedad.

Endpoints:
- GET /                — datos consolidados por PFA (1 fila por huerto+variedad).
- GET /bitacora        — historial de estimaciones por (huerto, variedad).
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


class PfaInfo(BaseModel):
    folio: int
    nombre: str | None
    cedula: str | None
    inicial: str | None


class EstimadoRow(BaseModel):
    numeroinscripcion: str
    nombre_unidad: str | None
    propietario: str | None
    folio_ruta: int | None
    nombre_ruta: str | None
    variedad_folio: int | None
    variedad_nombre: str | None
    superficie: float
    estimado: float
    saldo: float
    total_movilizado: float
    progresivo_estimacion: int | None
    fecha_estimacion: date | None


class EstimadoResponse(BaseModel):
    pfa: PfaInfo
    rows: list[EstimadoRow]
    totales: dict   # {huertos, variedades, estimado_kg, saldo_kg, movilizado_kg}


class BitacoraRow(BaseModel):
    folio: int
    progresivo_estimacion: int | None
    estimado: float
    saldo: float
    superficie: float
    fecha_estimacion: date | None


class BitacoraResponse(BaseModel):
    numeroinscripcion: str
    variedad_folio: int
    variedad_nombre: str | None
    rows: list[BitacoraRow]


# ──────────────────────────────────────────────────────────────────────
# GET / — datos consolidados por PFA
# ──────────────────────────────────────────────────────────────────────


@router.get("", response_model=EstimadoResponse)
def estimado_por_pfa(
    pfa: int = Query(..., ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> EstimadoResponse:
    pfa_row = session.execute(
        text("""
            SELECT folio, nombre, cedula, inicial_funcionario AS inicial
            FROM cat_funcionarios WHERE folio = :p
        """),
        {"p": pfa},
    ).mappings().first()
    pfa_info = PfaInfo(
        folio=pfa,
        nombre=(str(pfa_row["nombre"]).strip() if pfa_row and pfa_row["nombre"] else None),
        cedula=(str(pfa_row["cedula"]).strip() if pfa_row and pfa_row["cedula"] else None),
        inicial=(str(pfa_row["inicial"]).strip() if pfa_row and pfa_row["inicial"] else None),
    )

    # Una sola query: huertos del PFA + estimados + total movilizado por
    # huerto+variedad. Subquery para movilizado evita N+1.
    rows = session.execute(
        text("""
            SELECT TRIM(sv.numeroinscripcion) AS numeroinscripcion,
                   sv.nombre_unidad,
                   sv.nombre_propietario AS propietario,
                   cr.folio AS folio_ruta,
                   cr.nombre_ruta,
                   ec.variedad AS variedad_folio,
                   v.descripcion AS variedad_nombre,
                   ec.superficie, ec.estimado, ec.saldo,
                   ec.progresivo_estimacion, ec.fecha_estimacion,
                   COALESCE(mov.cant_mov, 0) AS total_movilizado
            FROM sv01_sv02 sv
            JOIN cat_rutas cr ON cr.folio = sv.folio_ruta
            JOIN estimado_cosecha ec ON ec.numeroinscripcion = sv.numeroinscripcion
            LEFT JOIN cat_variedades v ON v.folio = ec.variedad
            LEFT JOIN (
                SELECT numeroinscripcion, variedad_movilizada,
                       SUM(cantidad_movilizada) AS cant_mov
                FROM detallado_tmimf
                WHERE status = 'A' OR status IS NULL
                GROUP BY numeroinscripcion, variedad_movilizada
            ) mov ON mov.numeroinscripcion = sv.numeroinscripcion
                  AND mov.variedad_movilizada = ec.variedad
            WHERE cr.clave_pfa = :p
              AND (sv.status IS NULL OR sv.status = 'A')
            ORDER BY sv.numeroinscripcion ASC, v.descripcion ASC
        """),
        {"p": pfa},
    ).mappings().all()

    out: list[EstimadoRow] = []
    huertos = set()
    variedades = set()
    tot_est = tot_saldo = tot_mov = 0.0
    for r in rows:
        ni = str(r["numeroinscripcion"] or "").strip()
        var = int(r["variedad_folio"]) if r["variedad_folio"] else None
        est = float(r["estimado"] or 0)
        saldo = float(r["saldo"] or 0)
        mov = float(r["total_movilizado"] or 0)
        if ni:
            huertos.add(ni)
        if var:
            variedades.add(var)
        tot_est += est
        tot_saldo += saldo
        tot_mov += mov
        out.append(EstimadoRow(
            numeroinscripcion=ni,
            nombre_unidad=(str(r["nombre_unidad"]).strip() if r["nombre_unidad"] else None),
            propietario=(str(r["propietario"]).strip() if r["propietario"] else None),
            folio_ruta=int(r["folio_ruta"]) if r["folio_ruta"] else None,
            nombre_ruta=(str(r["nombre_ruta"]).strip() if r["nombre_ruta"] else None),
            variedad_folio=var,
            variedad_nombre=(str(r["variedad_nombre"]).strip() if r["variedad_nombre"] else None),
            superficie=float(r["superficie"] or 0),
            estimado=est,
            saldo=saldo,
            total_movilizado=mov,
            progresivo_estimacion=int(r["progresivo_estimacion"]) if r["progresivo_estimacion"] else None,
            fecha_estimacion=r["fecha_estimacion"],
        ))

    return EstimadoResponse(
        pfa=pfa_info,
        rows=out,
        totales={
            "huertos": len(huertos),
            "variedades": len(variedades),
            "estimado_kg": round(tot_est, 4),
            "saldo_kg": round(tot_saldo, 4),
            "movilizado_kg": round(tot_mov, 4),
        },
    )


# ──────────────────────────────────────────────────────────────────────
# GET /bitacora — historial de estimaciones de un huerto+variedad
# ──────────────────────────────────────────────────────────────────────


@router.get("/bitacora", response_model=BitacoraResponse)
def bitacora_estimaciones(
    numeroinscripcion: str = Query(..., min_length=1),
    variedad: int = Query(..., ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> BitacoraResponse:
    var_row = session.execute(
        text("SELECT descripcion FROM cat_variedades WHERE folio = :v"),
        {"v": variedad},
    ).mappings().first()
    var_nombre = (str(var_row["descripcion"]).strip() if var_row and var_row["descripcion"] else None)

    rows = session.execute(
        text("""
            SELECT folio, progresivo_estimacion, estimado, saldo,
                   superficie, fecha_estimacion
            FROM bitacora_estimado_cosecha
            WHERE numeroinscripcion = :n AND variedad = :v
            ORDER BY progresivo_estimacion ASC, fecha_estimacion ASC
        """),
        {"n": numeroinscripcion.strip(), "v": variedad},
    ).mappings().all()

    out = [
        BitacoraRow(
            folio=int(r["folio"]),
            progresivo_estimacion=int(r["progresivo_estimacion"]) if r["progresivo_estimacion"] else None,
            estimado=float(r["estimado"] or 0),
            saldo=float(r["saldo"] or 0),
            superficie=float(r["superficie"] or 0),
            fecha_estimacion=r["fecha_estimacion"],
        )
        for r in rows
    ]

    return BitacoraResponse(
        numeroinscripcion=numeroinscripcion.strip(),
        variedad_folio=variedad,
        variedad_nombre=var_nombre,
        rows=out,
    )
