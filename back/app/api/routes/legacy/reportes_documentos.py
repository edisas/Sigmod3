"""
Reporte legacy: COPREF y Recibos (facturas) por rango de fecha.

Equivalente a `copref_emitidas_por_fecha_generar.php` y
`recibos_emitidas_por_fecha_generar.php`. Lista los documentos emitidos en
un rango de fechas, con filtro opcional por módulo generador y/o usuario.

Notas operacionales:
- Las tablas `copref` y `facturas` solo existen en 4 de 8 BDs (OAX, GRO,
  MIC, COL) y casi siempre vacías. Detección dinámica via
  information_schema — devuelve `disponible: false` si la tabla no existe
  en la BD del estado.
- Endpoints listos para cuando se llenen las tablas. Hoy regresan [].

Endpoints:
- GET /copref       — COPREF en rango de fecha.
- GET /recibos      — Recibos (facturas) en rango.
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


class CoprefRow(BaseModel):
    folio: str
    num_tmimf: str | None
    numeroinscripcion: str | None
    cve_solicitante: int | None
    cve_destinatario: int | None
    fecha_expedicion: date | None
    hora_creacion: str | None
    status: str | None
    cantidad_movilizada: str | None
    funcionario_nombre: str | None
    usuario_nombre: str | None
    modulo_nombre: str | None


class CoprefResponse(BaseModel):
    fecha_inicio: date
    fecha_fin: date
    disponible: bool
    rows: list[CoprefRow]


class ReciboRow(BaseModel):
    folio: str
    consecutivo: int | None
    folio_tmimf: str | None
    folio_copref: str | None
    numeroinscripcion: str | None
    fecha: date | None
    hora: str | None
    status: str | None
    cantidad: int | None
    precio: float
    total: float
    saldo_al_mov: float
    tipo_pago: str | None
    usuario_nombre: str | None
    modulo_nombre: str | None


class RecibosResponse(BaseModel):
    fecha_inicio: date
    fecha_fin: date
    disponible: bool
    rows: list[ReciboRow]


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


def _tabla_existe(session: Session, tabla: str) -> bool:
    return bool(session.execute(
        text("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t
        """),
        {"t": tabla},
    ).scalar() or 0)


def _normalize_dates(fi: date, ff: date) -> tuple[date, date]:
    if ff < fi:
        return ff, fi
    return fi, ff


# ──────────────────────────────────────────────────────────────────────
# GET /copref
# ──────────────────────────────────────────────────────────────────────


@router.get("/copref", response_model=CoprefResponse)
def copref_por_fecha(
    fecha_inicio: date = Query(...),
    fecha_fin: date = Query(...),
    modulo_folio: int | None = Query(None, ge=1),
    usuario_clave: int | None = Query(None, ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> CoprefResponse:
    fi, ff = _normalize_dates(fecha_inicio, fecha_fin)
    if not _tabla_existe(session, "copref"):
        return CoprefResponse(fecha_inicio=fi, fecha_fin=ff, disponible=False, rows=[])

    conds = ["c.fecha_expedicion BETWEEN :fi AND :ff"]
    params: dict = {"fi": fi, "ff": ff}
    if modulo_folio is not None:
        conds.append("c.modulo_generador = :m")
        params["m"] = modulo_folio
    if usuario_clave is not None:
        conds.append("c.usuario_generador = :u")
        params["u"] = usuario_clave
    where = " AND ".join(conds)

    rows = session.execute(
        text(f"""
            SELECT c.Folio AS folio, c.num_tmimf, c.numeroinscripcion,
                   c.cve_solicitante, c.cve_destinatario,
                   c.fecha_expedicion, c.hora_creacion, c.status,
                   c.cantidadmovilizada AS cantidad_movilizada,
                   cf.nombre AS funcionario_nombre,
                   COALESCE(u.nombre, u.nick) AS usuario_nombre,
                   cm.nombre_modulo AS modulo_nombre
            FROM copref c
            LEFT JOIN cat_funcionarios cf ON cf.folio = c.cve_funcionario
            LEFT JOIN usuarios         u  ON u.clave = c.usuario_generador
            LEFT JOIN cat_modulos      cm ON cm.folio = c.modulo_generador
            WHERE {where}
            ORDER BY c.fecha_expedicion ASC, c.hora_creacion ASC, c.Folio ASC
            LIMIT 5000
        """),
        params,
    ).mappings().all()

    out: list[CoprefRow] = []
    for r in rows:
        hora = r["hora_creacion"]
        out.append(CoprefRow(
            folio=str(r["folio"] or "").strip(),
            num_tmimf=(str(r["num_tmimf"]).strip() if r["num_tmimf"] else None),
            numeroinscripcion=(str(r["numeroinscripcion"]).strip() if r["numeroinscripcion"] else None),
            cve_solicitante=int(r["cve_solicitante"]) if r["cve_solicitante"] else None,
            cve_destinatario=int(r["cve_destinatario"]) if r["cve_destinatario"] else None,
            fecha_expedicion=r["fecha_expedicion"],
            hora_creacion=(str(hora) if hora is not None else None),
            status=(str(r["status"]).strip() if r["status"] else None),
            cantidad_movilizada=(str(r["cantidad_movilizada"]).strip() if r["cantidad_movilizada"] else None),
            funcionario_nombre=(str(r["funcionario_nombre"]).strip() if r["funcionario_nombre"] else None),
            usuario_nombre=(str(r["usuario_nombre"]).strip() if r["usuario_nombre"] else None),
            modulo_nombre=(str(r["modulo_nombre"]).strip() if r["modulo_nombre"] else None),
        ))

    return CoprefResponse(fecha_inicio=fi, fecha_fin=ff, disponible=True, rows=out)


# ──────────────────────────────────────────────────────────────────────
# GET /recibos
# ──────────────────────────────────────────────────────────────────────


@router.get("/recibos", response_model=RecibosResponse)
def recibos_por_fecha(
    fecha_inicio: date = Query(...),
    fecha_fin: date = Query(...),
    modulo_folio: int | None = Query(None, ge=1),
    usuario_clave: int | None = Query(None, ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> RecibosResponse:
    fi, ff = _normalize_dates(fecha_inicio, fecha_fin)
    if not _tabla_existe(session, "facturas"):
        return RecibosResponse(fecha_inicio=fi, fecha_fin=ff, disponible=False, rows=[])

    conds = ["f.fecha BETWEEN :fi AND :ff"]
    params: dict = {"fi": fi, "ff": ff}
    if modulo_folio is not None:
        conds.append("f.modulo_generador = :m")
        params["m"] = modulo_folio
    if usuario_clave is not None:
        conds.append("f.usuario_generador = :u")
        params["u"] = usuario_clave
    where = " AND ".join(conds)

    rows = session.execute(
        text(f"""
            SELECT f.folio, f.consecutivo, f.folio_tmimf, f.folio_copref,
                   f.numeroinscripcion, f.fecha, f.hora, f.status,
                   f.cantidad, f.precio, f.total, f.saldo_al_mov, f.tipo_pago,
                   COALESCE(u.nombre, u.nick) AS usuario_nombre,
                   cm.nombre_modulo AS modulo_nombre
            FROM facturas f
            LEFT JOIN usuarios    u  ON u.clave = f.usuario_generador
            LEFT JOIN cat_modulos cm ON cm.folio = f.modulo_generador
            WHERE {where}
            ORDER BY f.fecha ASC, f.hora ASC, f.folio ASC
            LIMIT 5000
        """),
        params,
    ).mappings().all()

    out: list[ReciboRow] = []
    for r in rows:
        hora = r["hora"]
        out.append(ReciboRow(
            folio=str(r["folio"] or "").strip(),
            consecutivo=int(r["consecutivo"]) if r["consecutivo"] else None,
            folio_tmimf=(str(r["folio_tmimf"]).strip() if r["folio_tmimf"] else None),
            folio_copref=(str(r["folio_copref"]).strip() if r["folio_copref"] else None),
            numeroinscripcion=(str(r["numeroinscripcion"]).strip() if r["numeroinscripcion"] else None),
            fecha=r["fecha"],
            hora=(str(hora) if hora is not None else None),
            status=(str(r["status"]).strip() if r["status"] else None),
            cantidad=int(r["cantidad"]) if r["cantidad"] else None,
            precio=float(r["precio"] or 0),
            total=float(r["total"] or 0),
            saldo_al_mov=float(r["saldo_al_mov"] or 0),
            tipo_pago=(str(r["tipo_pago"]).strip() if r["tipo_pago"] else None),
            usuario_nombre=(str(r["usuario_nombre"]).strip() if r["usuario_nombre"] else None),
            modulo_nombre=(str(r["modulo_nombre"]).strip() if r["modulo_nombre"] else None),
        ))

    return RecibosResponse(fecha_inicio=fi, fecha_fin=ff, disponible=True, rows=out)
