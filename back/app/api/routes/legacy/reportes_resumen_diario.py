"""
Reporte legacy: Resumen diario por módulo (Grupo B).

Tablero 3×3 con conteo de documentos emitidos / cancelados / activos por
fecha y módulo. Documentos: TMIMF (tarjetas de manejo), COPREF, recibos
(facturas).

Consolida 6 variantes del PHP legacy en 2 endpoints:
- GET /                — resumen 3×3 con filtros (fecha, modulo, usuario).
- GET /detalle         — drill-down: lista de documentos por celda clicada.

Equivalencias PHP:
- resumendiariomodulos / fra_resumendiariomodulos          → resumen sin filtro de usuario.
- resumendiariomodulos_x_usuario / fra_*_x_usuario        → resumen con filtro de usuario_generador.
- detalladoresumendiariomodulos / *_x_usuario             → drill-down (lista detallada).

Notas:
- Las tablas `copref` y `facturas` solo existen en 4 de 8 BDs (OAX, GRO,
  MIC, COL) y casi siempre vacías. Se detectan dinámicamente via
  information_schema y se devuelve 0 si no existen.
- TMIMF se filtra con `LENGTH(folio_tmimf) > 9` para descartar drafts —
  patrón heredado del PHP. Excluye también tipo 'I' (Inválidas, regla
  global del proyecto).
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.legacy.dependencies import get_current_legacy_claims, get_legacy_db

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────


class ConteoDocumento(BaseModel):
    emitidos: int
    cancelados: int
    activos: int
    disponible: bool   # False si la tabla legacy no existe en esta BD


class ResumenDiarioResponse(BaseModel):
    fecha: date
    modulo_folio: int | None
    modulo_nombre: str | None
    usuario_clave: int | None
    usuario_nombre: str | None
    tarjetas: ConteoDocumento
    copref: ConteoDocumento
    recibos: ConteoDocumento


class DetalleRow(BaseModel):
    folio: str
    extra1: str | None    # clave_movilizacion / num_tmimf / folio_copref
    numeroinscripcion: str | None
    fecha: date | None
    hora: str | None
    status: str | None
    funcionario: str | None
    usuario_nombre: str | None


class DetalleResponse(BaseModel):
    documento: str
    estado: str
    fecha: date
    rows: list[DetalleRow]


TipoDocumento = Literal["tarjetas", "copref", "recibos"]
EstadoDocumento = Literal["emitidos", "cancelados", "activos"]


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


def _conteo_tmimf(session: Session, fecha: date, modulo: int | None, usuario: int | None) -> ConteoDocumento:
    conds = ["LENGTH(folio_tmimf) > 9", "fecha_emision = :f",
             "(tipo_tarjeta IS NULL OR tipo_tarjeta <> 'I')"]
    params: dict = {"f": fecha}
    if modulo is not None:
        conds.append("modulo_emisor = :m")
        params["m"] = modulo
    if usuario is not None:
        conds.append("usuario_generador = :u")
        params["u"] = usuario
    where = " AND ".join(conds)

    emitidos = session.execute(
        text(f"SELECT COUNT(*) FROM tmimf WHERE {where}"), params,
    ).scalar() or 0
    cancelados = session.execute(
        text(f"SELECT COUNT(*) FROM tmimf WHERE {where} AND status = 'C'"), params,
    ).scalar() or 0
    return ConteoDocumento(
        emitidos=int(emitidos), cancelados=int(cancelados),
        activos=int(emitidos) - int(cancelados), disponible=True,
    )


def _conteo_copref(session: Session, fecha: date, modulo: int | None, usuario: int | None) -> ConteoDocumento:
    if not _tabla_existe(session, "copref"):
        return ConteoDocumento(emitidos=0, cancelados=0, activos=0, disponible=False)
    conds = ["fecha_expedicion = :f"]
    params: dict = {"f": fecha}
    if modulo is not None:
        conds.append("modulo_generador = :m")
        params["m"] = modulo
    if usuario is not None:
        conds.append("usuario_generador = :u")
        params["u"] = usuario
    where = " AND ".join(conds)
    emitidos = session.execute(text(f"SELECT COUNT(*) FROM copref WHERE {where}"), params).scalar() or 0
    cancelados = session.execute(text(f"SELECT COUNT(*) FROM copref WHERE {where} AND status = 'C'"), params).scalar() or 0
    return ConteoDocumento(
        emitidos=int(emitidos), cancelados=int(cancelados),
        activos=int(emitidos) - int(cancelados), disponible=True,
    )


def _conteo_facturas(session: Session, fecha: date, modulo: int | None, usuario: int | None) -> ConteoDocumento:
    if not _tabla_existe(session, "facturas"):
        return ConteoDocumento(emitidos=0, cancelados=0, activos=0, disponible=False)
    conds = ["fecha = :f"]
    params: dict = {"f": fecha}
    if modulo is not None:
        conds.append("modulo_generador = :m")
        params["m"] = modulo
    if usuario is not None:
        conds.append("usuario_generador = :u")
        params["u"] = usuario
    where = " AND ".join(conds)
    emitidos = session.execute(text(f"SELECT COUNT(*) FROM facturas WHERE {where}"), params).scalar() or 0
    cancelados = session.execute(text(f"SELECT COUNT(*) FROM facturas WHERE {where} AND status = 'C'"), params).scalar() or 0
    return ConteoDocumento(
        emitidos=int(emitidos), cancelados=int(cancelados),
        activos=int(emitidos) - int(cancelados), disponible=True,
    )


# ──────────────────────────────────────────────────────────────────────
# GET / — resumen 3×3
# ──────────────────────────────────────────────────────────────────────


@router.get("", response_model=ResumenDiarioResponse)
def resumen_diario(
    fecha: date = Query(...),
    modulo_folio: int | None = Query(None, ge=1),
    usuario_clave: int | None = Query(None, ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> ResumenDiarioResponse:
    modulo_nombre = None
    if modulo_folio is not None:
        row = session.execute(
            text("SELECT nombre_modulo FROM cat_modulos WHERE folio = :m"),
            {"m": modulo_folio},
        ).mappings().first()
        if row:
            modulo_nombre = str(row["nombre_modulo"] or "").strip()

    usuario_nombre = None
    if usuario_clave is not None:
        row = session.execute(
            text("SELECT nombre, nick FROM usuarios WHERE clave = :u"),
            {"u": usuario_clave},
        ).mappings().first()
        if row:
            usuario_nombre = (str(row["nombre"]).strip() or str(row["nick"]).strip()) if (row["nombre"] or row["nick"]) else None

    return ResumenDiarioResponse(
        fecha=fecha,
        modulo_folio=modulo_folio,
        modulo_nombre=modulo_nombre,
        usuario_clave=usuario_clave,
        usuario_nombre=usuario_nombre,
        tarjetas=_conteo_tmimf(session, fecha, modulo_folio, usuario_clave),
        copref=_conteo_copref(session, fecha, modulo_folio, usuario_clave),
        recibos=_conteo_facturas(session, fecha, modulo_folio, usuario_clave),
    )


# ──────────────────────────────────────────────────────────────────────
# GET /detalle — drill-down
# ──────────────────────────────────────────────────────────────────────


def _filtro_estado(estado: EstadoDocumento) -> str:
    if estado == "cancelados":
        return " AND status = 'C'"
    if estado == "activos":
        return " AND (status IS NULL OR status <> 'C')"
    return ""


@router.get("/detalle", response_model=DetalleResponse)
def detalle_documento(
    documento: TipoDocumento = Query(...),
    estado: EstadoDocumento = Query(...),
    fecha: date = Query(...),
    modulo_folio: int | None = Query(None, ge=1),
    usuario_clave: int | None = Query(None, ge=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> DetalleResponse:
    rows: list[DetalleRow] = []

    if documento == "tarjetas":
        conds = ["LENGTH(t.folio_tmimf) > 9", "t.fecha_emision = :f",
                 "(t.tipo_tarjeta IS NULL OR t.tipo_tarjeta <> 'I')"]
        params: dict = {"f": fecha}
        if modulo_folio is not None:
            conds.append("t.modulo_emisor = :m")
            params["m"] = modulo_folio
        if usuario_clave is not None:
            conds.append("t.usuario_generador = :u")
            params["u"] = usuario_clave
        where = " AND ".join(conds) + _filtro_estado(estado).replace("status", "t.status")
        sql = f"""
            SELECT t.folio_tmimf, t.clave_movilizacion AS extra1, t.numeroinscripcion,
                   t.fecha_emision AS fecha, t.hora_emision AS hora, t.status,
                   cf.nombre AS funcionario, COALESCE(u.nombre, u.nick) AS usuario_nombre
            FROM tmimf t
            LEFT JOIN cat_funcionarios cf ON cf.folio = t.clave_aprobado
            LEFT JOIN usuarios         u  ON u.clave = t.usuario_generador
            WHERE {where}
            ORDER BY t.hora_emision ASC, t.folio_tmimf ASC
            LIMIT 1000
        """
        for r in session.execute(text(sql), params).mappings():
            rows.append(_to_detalle_row(r))

    elif documento == "copref":
        if _tabla_existe(session, "copref"):
            conds = ["c.fecha_expedicion = :f"]
            params2: dict = {"f": fecha}
            if modulo_folio is not None:
                conds.append("c.modulo_generador = :m")
                params2["m"] = modulo_folio
            if usuario_clave is not None:
                conds.append("c.usuario_generador = :u")
                params2["u"] = usuario_clave
            where = " AND ".join(conds) + _filtro_estado(estado).replace("status", "c.status")
            sql = f"""
                SELECT c.Folio AS folio_tmimf, c.num_tmimf AS extra1, c.numeroinscripcion,
                       c.fecha_expedicion AS fecha, c.hora_creacion AS hora, c.status,
                       cf.nombre AS funcionario, COALESCE(u.nombre, u.nick) AS usuario_nombre
                FROM copref c
                LEFT JOIN cat_funcionarios cf ON cf.folio = c.cve_funcionario
                LEFT JOIN usuarios         u  ON u.clave = c.usuario_generador
                WHERE {where}
                ORDER BY c.hora_creacion ASC, c.Folio ASC
                LIMIT 1000
            """
            for r in session.execute(text(sql), params2).mappings():
                rows.append(_to_detalle_row(r))

    elif documento == "recibos":
        if _tabla_existe(session, "facturas"):
            conds = ["f.fecha = :f"]
            params3: dict = {"f": fecha}
            if modulo_folio is not None:
                conds.append("f.modulo_generador = :m")
                params3["m"] = modulo_folio
            if usuario_clave is not None:
                conds.append("f.usuario_generador = :u")
                params3["u"] = usuario_clave
            where = " AND ".join(conds) + _filtro_estado(estado).replace("status", "f.status")
            sql = f"""
                SELECT f.folio AS folio_tmimf, f.folio_tmimf AS extra1, f.numeroinscripcion,
                       f.fecha, f.hora, f.status,
                       NULL AS funcionario, COALESCE(u.nombre, u.nick) AS usuario_nombre
                FROM facturas f
                LEFT JOIN usuarios u ON u.clave = f.usuario_generador
                WHERE {where}
                ORDER BY f.hora ASC, f.folio ASC
                LIMIT 1000
            """
            for r in session.execute(text(sql), params3).mappings():
                rows.append(_to_detalle_row(r))

    return DetalleResponse(documento=documento, estado=estado, fecha=fecha, rows=rows)


def _to_detalle_row(r) -> DetalleRow:
    """Construye DetalleRow normalizando todos los campos a str/None."""
    hora = r["hora"]
    return DetalleRow(
        folio=str(r["folio_tmimf"] or "").strip(),
        extra1=(str(r["extra1"]).strip() if r["extra1"] else None),
        numeroinscripcion=(str(r["numeroinscripcion"]).strip() if r["numeroinscripcion"] else None),
        fecha=r["fecha"],
        hora=(str(hora) if hora is not None else None),
        status=(str(r["status"]).strip() if r["status"] else None),
        funcionario=(str(r["funcionario"]).strip() if r["funcionario"] else None),
        usuario_nombre=(str(r["usuario_nombre"]).strip() if r["usuario_nombre"] else None),
    )


# ──────────────────────────────────────────────────────────────────────
# GET /modulos — selector de módulos del estado
# ──────────────────────────────────────────────────────────────────────


class ModuloOption(BaseModel):
    folio: int
    nombre: str


@router.get("/modulos", response_model=list[ModuloOption])
def modulos_estado(
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[ModuloOption]:
    rows = session.execute(text("""
        SELECT folio, nombre_modulo FROM cat_modulos
        ORDER BY nombre_modulo ASC
    """)).mappings().all()
    return [
        ModuloOption(folio=int(r["folio"]), nombre=str(r["nombre_modulo"] or "").strip())
        for r in rows if r["folio"]
    ]
