"""
Cancelación de TMIMF — equivalente a `cancelar_documentos_tmimf.php`.

Cancela una TMIMF (tipo M / Movilización) y todos sus renglones
detallado_tmimf, devolviendo las cantidades movilizadas al saldo de
estimado_cosecha. Registra la cancelación en `cancelaciones` con motivo.

Reglas de negocio:
- Solo se cancelan TMIMFs `status='A'` y SIN verificar en empaque
  (`verifico_normex` NULL o vacío). Las que ya pasaron normex no se
  pueden cancelar.
- TMIMF tipo `'I'` (Inválidas) NUNCA se procesa — son cancelaciones
  internas que ya están fuera del flujo (regla global del proyecto).
- Cascada por cada renglón `detallado_tmimf` activo:
  - Suma la `cantidad_movilizada` al `saldo` de `estimado_cosecha`
    para el (numeroinscripcion, variedad) correspondiente.
  - Marca el renglón con `status='C'`.
- Inserta una fila en `cancelaciones` con tipo='TMIMF', folio, motivo,
  fecha/hora actual y usuario_cancelo.
- Auditoría V3: 1 registro por tabla afectada (tmimf, detallado_tmimf,
  estimado_cosecha, cancelaciones).

Endpoints:
- GET  /buscar?folio_tmimf=X — preview con datos del huerto + detalles +
  flag `cancelable` y `motivo_no_cancelable` si no procede.
- POST /cancelar — ejecuta. Body: {folio_tmimf, motivo}.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query
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


class DetalleRow(BaseModel):
    folio: int
    sub_folio: str | None
    cantidad_movilizada: float
    variedad_folio: int | None
    variedad_nombre: str | None
    placas: str | None
    saldo_estimado_actual: float | None  # saldo en estimado_cosecha hoy
    status: str | None


class TmimfPreview(BaseModel):
    folio_tmimf: str
    status: str | None
    tipo_tarjeta: str | None
    numeroinscripcion: str
    nombre_unidad: str | None
    nombre_propietario: str | None
    nombre_ruta: str | None
    fecha_emision: str | None
    hora_emision: str | None
    clave_movilizacion: str | None
    usuario_generador_nombre: str | None
    fecha_verifico_normex: str | None
    cancelable: bool
    motivo_no_cancelable: str | None
    detalles: list[DetalleRow]
    total_kg_a_devolver: float


class CancelarRequest(BaseModel):
    folio_tmimf: str = Field(..., min_length=1)
    motivo: str = Field(..., min_length=10, max_length=200)


class CambioEstimado(BaseModel):
    numeroinscripcion: str
    variedad_folio: int
    variedad_nombre: str | None
    saldo_anterior: float
    cantidad_devuelta: float
    saldo_nuevo: float


class CancelarResult(BaseModel):
    folio_tmimf: str
    cancelado_en: str
    renglones_cancelados: int
    saldos_devueltos: list[CambioEstimado]


# ──────────────────────────────────────────────────────────────────────
# GET /buscar
# ──────────────────────────────────────────────────────────────────────


def _build_preview(
    session: Session,
    folio_tmimf: str,
) -> TmimfPreview | None:
    """Lee la TMIMF, su huerto y sus renglones. Devuelve None si no existe."""
    cab = session.execute(
        text("""
            SELECT tmi.folio_tmimf, tmi.status, tmi.tipo_tarjeta,
                   TRIM(tmi.numeroinscripcion) AS numeroinscripcion,
                   sv.nombre_unidad, sv.nombre_propietario,
                   cr.nombre_ruta,
                   tmi.fecha_emision, tmi.hora_emision,
                   tmi.clave_movilizacion,
                   COALESCE(usu.nombre, usu.nick) AS usuario_generador_nombre,
                   tmi.fecha_verifico_normex,
                   tmi.verifico_normex
            FROM tmimf tmi
            LEFT JOIN sv01_sv02   sv ON sv.numeroinscripcion = tmi.numeroinscripcion
            LEFT JOIN cat_rutas   cr ON cr.folio = sv.folio_ruta
            LEFT JOIN usuarios    usu ON usu.clave = tmi.usuario_generador
            WHERE tmi.folio_tmimf = :f
              AND (tmi.tipo_tarjeta IS NULL OR tmi.tipo_tarjeta <> 'I')
            LIMIT 1
        """),
        {"f": folio_tmimf.strip()},
    ).mappings().first()

    if not cab:
        return None

    # Solo se cancela tipo M (Movilización) — las O (Operativas) no usan
    # esta vía; tienen su propio flujo en correcciones_tmimf_o.
    tipo = (str(cab["tipo_tarjeta"]).strip() if cab["tipo_tarjeta"] else "")
    status = (str(cab["status"]).strip() if cab["status"] else "")
    verifico = cab["verifico_normex"]
    verifico_str = str(verifico).strip() if verifico is not None else ""

    cancelable = True
    motivo_no = None
    if tipo != "M":
        cancelable = False
        motivo_no = f"Solo se cancelan TMIMF tipo 'M' (Movilización). Esta es tipo '{tipo or '?'}'."
    elif status == "C":
        cancelable = False
        motivo_no = "La TMIMF ya está cancelada."
    elif status != "A":
        cancelable = False
        motivo_no = f"La TMIMF debe estar activa (status='A'). Status actual: '{status or '?'}'."
    elif verifico_str and verifico_str not in ("0", "0.0"):
        cancelable = False
        motivo_no = (
            f"La TMIMF ya fue verificada en empaque "
            f"({cab['fecha_verifico_normex']}). No se puede cancelar."
        )

    # Renglones del detallado + saldo actual del estimado por (huerto, variedad)
    det_rows = session.execute(
        text("""
            SELECT d.folio, d.sub_folio, d.cantidad_movilizada,
                   d.variedad_movilizada AS variedad_folio,
                   v.descripcion AS variedad_nombre,
                   d.placas, d.status,
                   ec.saldo AS saldo_estimado_actual
            FROM detallado_tmimf d
            LEFT JOIN cat_variedades v ON v.folio = d.variedad_movilizada
            LEFT JOIN estimado_cosecha ec
                   ON ec.numeroinscripcion = d.numeroinscripcion
                  AND ec.variedad = d.variedad_movilizada
            WHERE d.folio_completo = :f
            ORDER BY d.folio ASC
        """),
        {"f": folio_tmimf.strip()},
    ).mappings().all()

    detalles: list[DetalleRow] = []
    total_devolver = 0.0
    for r in det_rows:
        cant = float(r["cantidad_movilizada"] or 0)
        if (str(r["status"] or "").strip() or "A") != "C":
            total_devolver += cant
        detalles.append(DetalleRow(
            folio=int(r["folio"]),
            sub_folio=(str(r["sub_folio"]).strip() if r["sub_folio"] is not None else None),
            cantidad_movilizada=cant,
            variedad_folio=int(r["variedad_folio"]) if r["variedad_folio"] else None,
            variedad_nombre=(str(r["variedad_nombre"]).strip() if r["variedad_nombre"] else None),
            placas=(str(r["placas"]).strip() if r["placas"] else None),
            saldo_estimado_actual=float(r["saldo_estimado_actual"]) if r["saldo_estimado_actual"] is not None else None,
            status=(str(r["status"]).strip() if r["status"] else None),
        ))

    fecha_em = cab.get("fecha_emision")
    hora_em = cab.get("hora_emision")
    fecha_norm = cab.get("fecha_verifico_normex")

    return TmimfPreview(
        folio_tmimf=str(cab["folio_tmimf"]).strip(),
        status=status or None,
        tipo_tarjeta=tipo or None,
        numeroinscripcion=str(cab["numeroinscripcion"] or "").strip(),
        nombre_unidad=(str(cab["nombre_unidad"]).strip() if cab["nombre_unidad"] else None),
        nombre_propietario=(str(cab["nombre_propietario"]).strip() if cab["nombre_propietario"] else None),
        nombre_ruta=(str(cab["nombre_ruta"]).strip() if cab["nombre_ruta"] else None),
        fecha_emision=fecha_em.isoformat() if fecha_em else None,
        hora_emision=(str(hora_em) if hora_em is not None else None),
        clave_movilizacion=(str(cab["clave_movilizacion"]).strip() if cab["clave_movilizacion"] else None),
        usuario_generador_nombre=(str(cab["usuario_generador_nombre"]).strip() if cab["usuario_generador_nombre"] else None),
        fecha_verifico_normex=(fecha_norm.isoformat() if fecha_norm else None),
        cancelable=cancelable,
        motivo_no_cancelable=motivo_no,
        detalles=detalles,
        total_kg_a_devolver=round(total_devolver, 4),
    )


@router.get("/buscar", response_model=TmimfPreview)
def buscar(
    folio_tmimf: str = Query(..., min_length=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> TmimfPreview:
    pv = _build_preview(session, folio_tmimf)
    if not pv:
        raise HTTPException(
            status_code=404,
            detail=f"No se encontró TMIMF con folio {folio_tmimf!r}.",
        )
    return pv


# ──────────────────────────────────────────────────────────────────────
# POST /cancelar
# ──────────────────────────────────────────────────────────────────────


# Tipos para el switch de operación de auditoría.
OperacionLegacy = Literal["INSERT", "UPDATE", "DELETE"]


@router.post("/cancelar", response_model=CancelarResult)
def cancelar(
    body: CancelarRequest = Body(...),
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> CancelarResult:
    folio = body.folio_tmimf.strip()

    # 1. Re-validar al momento de la escritura (defensa: el preview pudo ser viejo).
    pv = _build_preview(session, folio)
    if not pv:
        raise HTTPException(status_code=404, detail=f"TMIMF {folio!r} no existe.")
    if not pv.cancelable:
        raise HTTPException(status_code=409, detail=pv.motivo_no_cancelable or "TMIMF no cancelable.")

    user_clave, user_nick = _resolver_legacy_user(session, claims)
    estado_clave, db_name = _estado_clave_y_db(claims)

    # 2. Snapshot detallado antes de mutar (para audit + cálculo de saldos).
    det_before = session.execute(
        text("""
            SELECT d.folio, d.sub_folio,
                   TRIM(d.numeroinscripcion) AS numeroinscripcion,
                   d.variedad_movilizada AS variedad,
                   v.descripcion AS variedad_nombre,
                   d.cantidad_movilizada,
                   d.status,
                   ec.saldo AS saldo_actual
            FROM detallado_tmimf d
            LEFT JOIN cat_variedades v ON v.folio = d.variedad_movilizada
            LEFT JOIN estimado_cosecha ec
                   ON ec.numeroinscripcion = d.numeroinscripcion
                  AND ec.variedad = d.variedad_movilizada
            WHERE d.folio_completo = :f
              AND (d.status IS NULL OR d.status <> 'C')
        """),
        {"f": folio},
    ).mappings().all()

    # 3. UPDATE tmimf → status='C'
    session.execute(
        text("UPDATE tmimf SET status = 'C' WHERE folio_tmimf = :f"),
        {"f": folio},
    )
    session.commit()

    # 4. Por cada renglón: devolver al saldo del estimado
    saldos_devueltos: list[CambioEstimado] = []
    for r in det_before:
        ni = str(r["numeroinscripcion"] or "").strip()
        var = r["variedad"]
        cant = float(r["cantidad_movilizada"] or 0)
        if not ni or var is None or cant <= 0:
            continue

        saldo_ant = float(r["saldo_actual"]) if r["saldo_actual"] is not None else None
        if saldo_ant is None:
            # No existe la fila en estimado_cosecha — nada que devolver.
            continue

        saldo_nuevo = saldo_ant + cant
        session.execute(
            text("""
                UPDATE estimado_cosecha
                   SET saldo = :nuevo
                 WHERE numeroinscripcion = :n AND variedad = :v
            """),
            {"nuevo": saldo_nuevo, "n": ni, "v": var},
        )
        saldos_devueltos.append(CambioEstimado(
            numeroinscripcion=ni,
            variedad_folio=int(var),
            variedad_nombre=(str(r["variedad_nombre"]).strip() if r["variedad_nombre"] else None),
            saldo_anterior=round(saldo_ant, 4),
            cantidad_devuelta=round(cant, 4),
            saldo_nuevo=round(saldo_nuevo, 4),
        ))

    # 5. Marcar todos los renglones del detallado con status='C'.
    session.execute(
        text("UPDATE detallado_tmimf SET status = 'C' WHERE folio_completo = :f"),
        {"f": folio},
    )
    session.commit()

    # 6. Registrar en `cancelaciones` (motivo histórico legacy).
    ahora = datetime.now()
    session.execute(
        text("""
            INSERT INTO cancelaciones
              (tipo_documento, folio_documento, motivo,
               fecha_cancelacion, hora_cancelacion, usuario_cancelo)
            VALUES
              ('TMIMF', :f, :motivo, :fecha, :hora, :usu)
        """),
        {
            "f": folio,
            "motivo": body.motivo.strip(),
            "fecha": ahora.date(),
            "hora": ahora.time().replace(microsecond=0),
            "usu": user_clave or 0,
        },
    )
    session.commit()

    # 7. Auditoría V3 — 1 registro por tabla afectada.
    record_legacy_write(
        estado_clave=estado_clave, database_name=db_name,
        usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
        tabla="tmimf", operacion="UPDATE",
        registro_pk=folio,
        campos_antes={"status": "A"},
        campos_despues={"status": "C", "motivo": body.motivo.strip()},
        registros_afectados=1,
    )
    if det_before:
        record_legacy_write(
            estado_clave=estado_clave, database_name=db_name,
            usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
            tabla="detallado_tmimf", operacion="UPDATE",
            registro_pk=f"folio_completo={folio}",
            campos_antes={"renglones": [dict(r) for r in det_before]},
            campos_despues={"status": "C"},
            registros_afectados=len(det_before),
        )
    if saldos_devueltos:
        record_legacy_write(
            estado_clave=estado_clave, database_name=db_name,
            usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
            tabla="estimado_cosecha", operacion="UPDATE",
            registro_pk=f"cancelacion_tmimf={folio}",
            campos_antes=None,
            campos_despues={"devoluciones": [s.model_dump() for s in saldos_devueltos]},
            registros_afectados=len(saldos_devueltos),
        )
    record_legacy_write(
        estado_clave=estado_clave, database_name=db_name,
        usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
        tabla="cancelaciones", operacion="INSERT",
        registro_pk=f"TMIMF/{folio}",
        campos_antes=None,
        campos_despues={"motivo": body.motivo.strip(), "fecha": ahora.isoformat()},
        registros_afectados=1,
    )

    return CancelarResult(
        folio_tmimf=folio,
        cancelado_en=ahora.isoformat(timespec="seconds"),
        renglones_cancelados=len(det_before),
        saldos_devueltos=saldos_devueltos,
    )
