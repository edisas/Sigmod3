"""
Catálogo legacy de huertos (sv01_sv02) — vista, edición y desactivación.

Reemplaza los formularios PHP `cat_sv01.php`, `cat_sv01_actualizar.php`,
`bajar_huertos.php`, `desbloquear_huertos.php`. La tabla `sv01_sv02` tiene
69 columnas pero la mayoría son flags de escaneos / facturación; este
módulo expone solo las operativas (datos del huerto, ruta, mercado,
estado, observaciones).

Endpoints:
- GET /                           — listado paginado con filtros.
- GET /{numeroinscripcion}        — detalle completo del huerto.
- PATCH /{numeroinscripcion}      — actualiza campos editables.
- POST /{numeroinscripcion}/desactivar — status='I' (soft delete).
- POST /{numeroinscripcion}/reactivar  — status='A'.

Audit V3 en cada escritura.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.legacy.dependencies import get_current_legacy_claims, get_legacy_db
from app.api.routes.legacy.helpers import (
    estado_clave_y_db as _estado_clave_y_db,
)
from app.api.routes.legacy.helpers import (
    resolver_legacy_user as _resolver_legacy_user,
)
from app.core.legacy_audit import record_legacy_write

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────


class HuertoListRow(BaseModel):
    numeroinscripcion: str
    nombre_unidad: str | None
    nombre_propietario: str | None
    municipio: str | None
    zona: str | None
    folio_ruta: int | None
    nombre_ruta: str | None
    clave_pfa: int | None
    pfa_nombre: str | None
    clave_especie: int | None
    especie_nombre: str | None
    mercado_destino: int | None
    mercado_nombre: str | None
    aprobado_exportacion: int
    status: str | None
    temporada_ano: str | None


class HuertosPage(BaseModel):
    total: int
    offset: int
    limit: int
    rows: list[HuertoListRow]


class HuertoDetalle(BaseModel):
    numeroinscripcion: str
    nombre_unidad: str | None
    nombre_propietario: str | None
    direccion: str | None
    telefono: str | None
    ubicacion: str | None
    municipio: str | None
    zona: str | None
    folio_ruta: int | None
    nombre_ruta: str | None
    clave_pfa: int | None
    pfa_nombre: str | None
    clave_especie: int | None
    especie_nombre: str | None
    mercado_destino: int | None
    mercado_nombre: str | None
    aprobado_exportacion: int
    cumple_023: str | None
    observaciones_sv02: str | None
    motivo_rechazo: str | None
    fecha_rechazo: date | None
    fecha_alta_sv01: date | None
    fecha_alta_sv02: date | None
    fecha_captura_datos: date | None
    temporada_ano: str | None
    htl: str | None
    status: str | None


class HuertoPatchBody(BaseModel):
    nombre_unidad: str | None = Field(default=None, max_length=100)
    nombre_propietario: str | None = Field(default=None, max_length=100)
    direccion: str | None = Field(default=None, max_length=150)
    telefono: str | None = Field(default=None, max_length=30)
    ubicacion: str | None = Field(default=None, max_length=150)
    municipio: str | None = Field(default=None, max_length=100)
    zona: str | None = Field(default=None, max_length=100)
    folio_ruta: int | None = Field(default=None, ge=1)
    mercado_destino: int | None = Field(default=None, ge=1, le=2)
    aprobado_exportacion: int | None = Field(default=None, ge=0, le=1)
    observaciones_sv02: str | None = Field(default=None, max_length=200)


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


def _mercado_label(m: int | None) -> str | None:
    if m == 1:
        return "Exportación"
    if m == 2:
        return "Nacional"
    return None


# ──────────────────────────────────────────────────────────────────────
# GET / — listado paginado con filtros
# ──────────────────────────────────────────────────────────────────────


@router.get("", response_model=HuertosPage)
def listar(
    pfa: int | None = Query(None, ge=1),
    folio_ruta: int | None = Query(None, ge=1),
    mercado_destino: int | None = Query(None, ge=1, le=2),
    status_filter: str | None = Query(None, alias="status", pattern="^[AI]$"),
    busqueda: str | None = Query(None, min_length=2, max_length=80, description="Texto en inscripción/huerto/propietario"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> HuertosPage:
    where: list[str] = []
    params: dict = {}

    if pfa is not None:
        where.append("cr.clave_pfa = :pfa")
        params["pfa"] = pfa
    if folio_ruta is not None:
        where.append("sv.folio_ruta = :ruta")
        params["ruta"] = folio_ruta
    if mercado_destino is not None:
        where.append("sv.mercado_destino = :md")
        params["md"] = mercado_destino
    if status_filter:
        where.append("sv.status = :st")
        params["st"] = status_filter
    if busqueda:
        where.append("""(sv.numeroinscripcion LIKE :q
                        OR sv.nombre_unidad LIKE :q
                        OR sv.nombre_propietario LIKE :q)""")
        params["q"] = f"%{busqueda.strip()}%"

    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    total = session.execute(
        text(f"""
            SELECT COUNT(*) FROM sv01_sv02 sv
            LEFT JOIN cat_rutas cr ON cr.folio = sv.folio_ruta
            {where_sql}
        """),
        params,
    ).scalar() or 0

    rows = session.execute(
        text(f"""
            SELECT TRIM(sv.numeroinscripcion) AS numeroinscripcion,
                   sv.nombre_unidad, sv.nombre_propietario,
                   sv.municipio, sv.zona,
                   sv.folio_ruta,
                   cr.nombre_ruta, cr.clave_pfa,
                   cf.nombre AS pfa_nombre,
                   sv.clave_especie,
                   ce.nombre AS especie_nombre,
                   sv.mercado_destino,
                   sv.aprobado_exportacion,
                   sv.status, sv.temporada_ano
            FROM sv01_sv02 sv
            LEFT JOIN cat_rutas cr ON cr.folio = sv.folio_ruta
            LEFT JOIN cat_funcionarios cf ON cf.folio = cr.clave_pfa
            LEFT JOIN cat_especies ce ON ce.folio = sv.clave_especie
            {where_sql}
            ORDER BY sv.numeroinscripcion ASC
            LIMIT :lim OFFSET :off
        """),
        {**params, "lim": limit, "off": offset},
    ).mappings().all()

    out: list[HuertoListRow] = []
    for r in rows:
        out.append(HuertoListRow(
            numeroinscripcion=str(r["numeroinscripcion"] or "").strip(),
            nombre_unidad=(str(r["nombre_unidad"]).strip() if r["nombre_unidad"] else None),
            nombre_propietario=(str(r["nombre_propietario"]).strip() if r["nombre_propietario"] else None),
            municipio=(str(r["municipio"]).strip() if r["municipio"] else None),
            zona=(str(r["zona"]).strip() if r["zona"] else None),
            folio_ruta=int(r["folio_ruta"]) if r["folio_ruta"] else None,
            nombre_ruta=(str(r["nombre_ruta"]).strip() if r["nombre_ruta"] else None),
            clave_pfa=int(r["clave_pfa"]) if r["clave_pfa"] else None,
            pfa_nombre=(str(r["pfa_nombre"]).strip() if r["pfa_nombre"] else None),
            clave_especie=int(r["clave_especie"]) if r["clave_especie"] else None,
            especie_nombre=(str(r["especie_nombre"]).strip() if r["especie_nombre"] else None),
            mercado_destino=int(r["mercado_destino"]) if r["mercado_destino"] else None,
            mercado_nombre=_mercado_label(r["mercado_destino"]),
            aprobado_exportacion=int(r["aprobado_exportacion"] or 0),
            status=(str(r["status"]).strip() if r["status"] else None),
            temporada_ano=(str(r["temporada_ano"]).strip() if r["temporada_ano"] else None),
        ))

    return HuertosPage(total=int(total), offset=offset, limit=limit, rows=out)


# ──────────────────────────────────────────────────────────────────────
# GET /{numeroinscripcion}
# ──────────────────────────────────────────────────────────────────────


def _read_detalle(session: Session, ni: str) -> HuertoDetalle | None:
    row = session.execute(
        text("""
            SELECT TRIM(sv.numeroinscripcion) AS numeroinscripcion,
                   sv.nombre_unidad, sv.nombre_propietario,
                   sv.direccion, sv.telefono, sv.ubicacion,
                   sv.municipio, sv.zona,
                   sv.folio_ruta,
                   cr.nombre_ruta, cr.clave_pfa,
                   cf.nombre AS pfa_nombre,
                   sv.clave_especie,
                   ce.nombre AS especie_nombre,
                   sv.mercado_destino,
                   sv.aprobado_exportacion,
                   sv.cumple_023,
                   sv.observaciones_sv02,
                   sv.motivo_rechazo, sv.fecha_rechazo,
                   sv.fecha_alta_sv01, sv.fecha_alta_sv02, sv.fecha_captura_datos,
                   sv.temporada_ano, sv.htl, sv.status
            FROM sv01_sv02 sv
            LEFT JOIN cat_rutas cr ON cr.folio = sv.folio_ruta
            LEFT JOIN cat_funcionarios cf ON cf.folio = cr.clave_pfa
            LEFT JOIN cat_especies ce ON ce.folio = sv.clave_especie
            WHERE sv.numeroinscripcion = :n
            LIMIT 1
        """),
        {"n": ni.strip()},
    ).mappings().first()
    if not row:
        return None
    return HuertoDetalle(
        numeroinscripcion=str(row["numeroinscripcion"] or "").strip(),
        nombre_unidad=(str(row["nombre_unidad"]).strip() if row["nombre_unidad"] else None),
        nombre_propietario=(str(row["nombre_propietario"]).strip() if row["nombre_propietario"] else None),
        direccion=(str(row["direccion"]).strip() if row["direccion"] else None),
        telefono=(str(row["telefono"]).strip() if row["telefono"] else None),
        ubicacion=(str(row["ubicacion"]).strip() if row["ubicacion"] else None),
        municipio=(str(row["municipio"]).strip() if row["municipio"] else None),
        zona=(str(row["zona"]).strip() if row["zona"] else None),
        folio_ruta=int(row["folio_ruta"]) if row["folio_ruta"] else None,
        nombre_ruta=(str(row["nombre_ruta"]).strip() if row["nombre_ruta"] else None),
        clave_pfa=int(row["clave_pfa"]) if row["clave_pfa"] else None,
        pfa_nombre=(str(row["pfa_nombre"]).strip() if row["pfa_nombre"] else None),
        clave_especie=int(row["clave_especie"]) if row["clave_especie"] else None,
        especie_nombre=(str(row["especie_nombre"]).strip() if row["especie_nombre"] else None),
        mercado_destino=int(row["mercado_destino"]) if row["mercado_destino"] else None,
        mercado_nombre=_mercado_label(row["mercado_destino"]),
        aprobado_exportacion=int(row["aprobado_exportacion"] or 0),
        cumple_023=(str(row["cumple_023"]).strip() if row["cumple_023"] else None),
        observaciones_sv02=(str(row["observaciones_sv02"]).strip() if row["observaciones_sv02"] else None),
        motivo_rechazo=(str(row["motivo_rechazo"]).strip() if row["motivo_rechazo"] else None),
        fecha_rechazo=row["fecha_rechazo"],
        fecha_alta_sv01=row["fecha_alta_sv01"],
        fecha_alta_sv02=row["fecha_alta_sv02"],
        fecha_captura_datos=row["fecha_captura_datos"],
        temporada_ano=(str(row["temporada_ano"]).strip() if row["temporada_ano"] else None),
        htl=(str(row["htl"]).strip() if row["htl"] else None),
        status=(str(row["status"]).strip() if row["status"] else None),
    )


@router.get("/{numeroinscripcion}", response_model=HuertoDetalle)
def detalle(
    numeroinscripcion: str = Path(..., min_length=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> HuertoDetalle:
    d = _read_detalle(session, numeroinscripcion)
    if not d:
        raise HTTPException(status_code=404, detail=f"Huerto {numeroinscripcion!r} no existe.")
    return d


# ──────────────────────────────────────────────────────────────────────
# PATCH /{numeroinscripcion}
# ──────────────────────────────────────────────────────────────────────


_EDITABLES = {
    "nombre_unidad", "nombre_propietario", "direccion", "telefono",
    "ubicacion", "municipio", "zona", "folio_ruta",
    "mercado_destino", "aprobado_exportacion", "observaciones_sv02",
}


@router.patch("/{numeroinscripcion}", response_model=HuertoDetalle)
def actualizar(
    numeroinscripcion: str,
    body: HuertoPatchBody = Body(...),
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> HuertoDetalle:
    ni = numeroinscripcion.strip()
    actual = _read_detalle(session, ni)
    if not actual:
        raise HTTPException(status_code=404, detail=f"Huerto {ni!r} no existe.")

    cambios = {k: v for k, v in body.model_dump(exclude_none=True).items() if k in _EDITABLES}
    if not cambios:
        return actual

    # Validar que la ruta exista si se cambia
    if "folio_ruta" in cambios:
        ruta_ok = session.execute(
            text("SELECT folio FROM cat_rutas WHERE folio = :r"),
            {"r": cambios["folio_ruta"]},
        ).scalar()
        if not ruta_ok:
            raise HTTPException(status_code=400, detail=f"Ruta {cambios['folio_ruta']} no existe.")

    set_clauses = ", ".join(f"{c} = :{c}" for c in cambios)
    cambios["ni"] = ni
    session.execute(
        text(f"UPDATE sv01_sv02 SET {set_clauses} WHERE numeroinscripcion = :ni"),
        cambios,
    )
    session.commit()

    user_clave, user_nick = _resolver_legacy_user(session, claims)
    estado_clave, db_name = _estado_clave_y_db(claims)
    antes = {k: getattr(actual, k, None) for k in cambios if k != "ni"}
    despues = {k: v for k, v in cambios.items() if k != "ni"}
    record_legacy_write(
        estado_clave=estado_clave, database_name=db_name,
        usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
        tabla="sv01_sv02", operacion="UPDATE",
        registro_pk=ni,
        campos_antes=antes, campos_despues=despues, registros_afectados=1,
    )

    nuevo = _read_detalle(session, ni)
    if not nuevo:
        raise HTTPException(status_code=500, detail="No se pudo recuperar el huerto actualizado.")
    return nuevo


# ──────────────────────────────────────────────────────────────────────
# POST /{numeroinscripcion}/desactivar | /reactivar
# ──────────────────────────────────────────────────────────────────────


def _change_status(session: Session, claims: dict, ni: str, nuevo_status: str) -> HuertoDetalle:
    actual = _read_detalle(session, ni)
    if not actual:
        raise HTTPException(status_code=404, detail=f"Huerto {ni!r} no existe.")
    if actual.status == nuevo_status:
        return actual
    session.execute(
        text("UPDATE sv01_sv02 SET status = :st WHERE numeroinscripcion = :ni"),
        {"st": nuevo_status, "ni": ni},
    )
    session.commit()
    user_clave, user_nick = _resolver_legacy_user(session, claims)
    estado_clave, db_name = _estado_clave_y_db(claims)
    record_legacy_write(
        estado_clave=estado_clave, database_name=db_name,
        usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
        tabla="sv01_sv02", operacion="UPDATE",
        registro_pk=ni,
        campos_antes={"status": actual.status},
        campos_despues={"status": nuevo_status},
        registros_afectados=1,
    )
    return _read_detalle(session, ni)  # type: ignore[return-value]


@router.post("/{numeroinscripcion}/desactivar", response_model=HuertoDetalle)
def desactivar(
    numeroinscripcion: str,
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> HuertoDetalle:
    return _change_status(session, claims, numeroinscripcion.strip(), "I")


@router.post("/{numeroinscripcion}/reactivar", response_model=HuertoDetalle)
def reactivar(
    numeroinscripcion: str,
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> HuertoDetalle:
    return _change_status(session, claims, numeroinscripcion.strip(), "A")
