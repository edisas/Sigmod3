"""
Edición de estimados de cosecha — equivalente a
`estimado_de_cosecha_guardar.php`. Captura nuevas estimaciones (re-estimaciones
o iniciales) por huerto y variedad.

Reglas de negocio:
- Por huerto, se captura una cantidad por variedad.
- Si YA EXISTE `estimado_cosecha (numeroinscripcion, variedad)`:
  - Snapshot a `bitacora_estimado_cosecha` con el estado actual.
  - UPDATE: `saldo += cantidad_nueva`, `estimado += cantidad_nueva`,
    `fecha_estimacion = hoy`, `progresivo_estimacion += 1`,
    `usuario_estimo = actual`.
- Si NO EXISTE:
  - INSERT con `estimado = saldo = cantidad`, `progresivo = 1`.
- Cantidad <= 0 → renglón ignorado (no genera escritura).

Audit V3: 1 registro por (huerto × variedad) modificado, con ANTES/DESPUÉS.

Endpoints:
- GET /huerto/{numeroinscripcion} — estado del huerto: estimaciones
  existentes + catálogo de variedades disponibles para captura nueva.
- POST /reestimar — graba los ajustes y devuelve el resultado por variedad.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException
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


class HuertoInfo(BaseModel):
    numeroinscripcion: str
    nombre_unidad: str | None
    nombre_propietario: str | None
    folio_ruta: int | None
    nombre_ruta: str | None
    clave_pfa: int | None
    pfa_nombre: str | None


class EstimadoVariedad(BaseModel):
    variedad_folio: int
    variedad_nombre: str
    existe: bool
    estimado_actual: float
    saldo_actual: float
    superficie: float
    progresivo_estimacion: int | None
    fecha_estimacion: date | None
    total_movilizado: float


class HuertoEdicionResponse(BaseModel):
    huerto: HuertoInfo
    variedades: list[EstimadoVariedad]


class AjusteVariedad(BaseModel):
    variedad_folio: int = Field(ge=1)
    cantidad: float = Field(gt=0, description="kg a sumar al estimado y saldo")
    superficie: float | None = Field(default=None, ge=0, description="Superficie ha de la variedad (solo en INSERT inicial)")


class ReestimarRequest(BaseModel):
    numeroinscripcion: str = Field(..., min_length=1)
    ajustes: list[AjusteVariedad] = Field(..., min_length=1)


class CambioEstimadoResultado(BaseModel):
    variedad_folio: int
    variedad_nombre: str | None
    operacion: str   # 'insert' | 'update' | 'noop'
    estimado_anterior: float | None
    saldo_anterior: float | None
    cantidad: float
    estimado_nuevo: float
    saldo_nuevo: float
    progresivo_nuevo: int


class ReestimarResult(BaseModel):
    numeroinscripcion: str
    cambios: list[CambioEstimadoResultado]


# ──────────────────────────────────────────────────────────────────────
# GET /huerto/{numeroinscripcion}
# ──────────────────────────────────────────────────────────────────────


@router.get("/huerto/{numeroinscripcion}", response_model=HuertoEdicionResponse)
def estado_huerto(
    numeroinscripcion: str,
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> HuertoEdicionResponse:
    ni = numeroinscripcion.strip()

    # 1. Datos del huerto
    huerto_row = session.execute(
        text("""
            SELECT TRIM(sv.numeroinscripcion) AS numeroinscripcion,
                   sv.nombre_unidad, sv.nombre_propietario,
                   sv.folio_ruta,
                   cr.nombre_ruta, cr.clave_pfa,
                   cf.nombre AS pfa_nombre
            FROM sv01_sv02 sv
            LEFT JOIN cat_rutas cr ON cr.folio = sv.folio_ruta
            LEFT JOIN cat_funcionarios cf ON cf.folio = cr.clave_pfa
            WHERE sv.numeroinscripcion = :n
              AND (sv.status IS NULL OR sv.status = 'A')
            LIMIT 1
        """),
        {"n": ni},
    ).mappings().first()
    if not huerto_row:
        raise HTTPException(status_code=404, detail=f"Huerto {ni!r} no existe o no está activo.")

    huerto = HuertoInfo(
        numeroinscripcion=str(huerto_row["numeroinscripcion"] or "").strip(),
        nombre_unidad=(str(huerto_row["nombre_unidad"]).strip() if huerto_row["nombre_unidad"] else None),
        nombre_propietario=(str(huerto_row["nombre_propietario"]).strip() if huerto_row["nombre_propietario"] else None),
        folio_ruta=int(huerto_row["folio_ruta"]) if huerto_row["folio_ruta"] else None,
        nombre_ruta=(str(huerto_row["nombre_ruta"]).strip() if huerto_row["nombre_ruta"] else None),
        clave_pfa=int(huerto_row["clave_pfa"]) if huerto_row["clave_pfa"] else None,
        pfa_nombre=(str(huerto_row["pfa_nombre"]).strip() if huerto_row["pfa_nombre"] else None),
    )

    # 2. Catálogo de variedades de mango (especie=1) + estado por variedad
    rows = session.execute(
        text("""
            SELECT v.folio AS variedad_folio,
                   v.descripcion AS variedad_nombre,
                   ec.estimado, ec.saldo, ec.superficie,
                   ec.progresivo_estimacion, ec.fecha_estimacion,
                   COALESCE(mov.cant_mov, 0) AS total_movilizado
            FROM cat_variedades v
            LEFT JOIN estimado_cosecha ec
                   ON ec.numeroinscripcion = :n
                  AND ec.variedad = v.folio
            LEFT JOIN (
                SELECT variedad_movilizada,
                       SUM(cantidad_movilizada) AS cant_mov
                FROM detallado_tmimf
                WHERE numeroinscripcion = :n
                  AND (status IS NULL OR status = 'A')
                GROUP BY variedad_movilizada
            ) mov ON mov.variedad_movilizada = v.folio
            WHERE v.especie = 1
              AND (v.descripcion IS NOT NULL AND v.descripcion <> '')
            ORDER BY v.descripcion ASC
        """),
        {"n": ni},
    ).mappings().all()

    variedades = [
        EstimadoVariedad(
            variedad_folio=int(r["variedad_folio"]),
            variedad_nombre=str(r["variedad_nombre"] or "").strip() or f"#{r['variedad_folio']}",
            existe=r["estimado"] is not None,
            estimado_actual=float(r["estimado"] or 0),
            saldo_actual=float(r["saldo"] or 0),
            superficie=float(r["superficie"] or 0),
            progresivo_estimacion=int(r["progresivo_estimacion"]) if r["progresivo_estimacion"] else None,
            fecha_estimacion=r["fecha_estimacion"],
            total_movilizado=float(r["total_movilizado"] or 0),
        )
        for r in rows
    ]

    return HuertoEdicionResponse(huerto=huerto, variedades=variedades)


# ──────────────────────────────────────────────────────────────────────
# POST /reestimar
# ──────────────────────────────────────────────────────────────────────


@router.post("/reestimar", response_model=ReestimarResult)
def reestimar(
    body: ReestimarRequest = Body(...),
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> ReestimarResult:
    ni = body.numeroinscripcion.strip()

    # Validar que el huerto exista
    h = session.execute(
        text("SELECT numeroinscripcion FROM sv01_sv02 WHERE numeroinscripcion = :n LIMIT 1"),
        {"n": ni},
    ).scalar()
    if not h:
        raise HTTPException(status_code=404, detail=f"Huerto {ni!r} no existe.")

    # Validar duplicados de variedad en el body
    vars_set = [a.variedad_folio for a in body.ajustes]
    if len(vars_set) != len(set(vars_set)):
        raise HTTPException(status_code=400, detail="No puedes repetir la misma variedad en el ajuste.")

    user_clave, user_nick = _resolver_legacy_user(session, claims)
    estado_clave, db_name = _estado_clave_y_db(claims)
    fecha_actual = date.today()
    user_estimo = user_clave or 0

    cambios: list[CambioEstimadoResultado] = []

    for ajuste in body.ajustes:
        var_folio = ajuste.variedad_folio
        cantidad = float(ajuste.cantidad)

        # Validar que la variedad existe (especie 1 = mango)
        var_row = session.execute(
            text("SELECT descripcion FROM cat_variedades WHERE folio = :v"),
            {"v": var_folio},
        ).mappings().first()
        if not var_row:
            raise HTTPException(status_code=400, detail=f"Variedad {var_folio} no existe en cat_variedades.")
        var_nombre = str(var_row["descripcion"] or "").strip() or None

        # Snapshot del estado actual
        actual = session.execute(
            text("""
                SELECT folio, estimado, saldo, superficie,
                       progresivo_estimacion, fecha_estimacion, usuario_estimo
                FROM estimado_cosecha
                WHERE numeroinscripcion = :n AND variedad = :v
                LIMIT 1
            """),
            {"n": ni, "v": var_folio},
        ).mappings().first()

        if actual:
            # UPDATE: snapshot a bitácora + suma cantidad
            session.execute(
                text("""
                    INSERT INTO bitacora_estimado_cosecha
                      (folio_estimado, numeroinscripcion, variedad, estimado,
                       fecha_estimacion, progresivo_estimacion, usuario_estimo,
                       saldo, superficie, kg_estimados)
                    VALUES
                      (:folio, :n, :v, :estimado, :fecha, :prog, :user,
                       :saldo, :superficie, :estimado)
                """),
                {
                    "folio": actual["folio"],
                    "n": ni, "v": var_folio,
                    "estimado": actual["estimado"], "saldo": actual["saldo"],
                    "fecha": actual["fecha_estimacion"],
                    "prog": actual["progresivo_estimacion"],
                    "user": actual["usuario_estimo"],
                    "superficie": actual["superficie"],
                },
            )
            estimado_anterior = float(actual["estimado"] or 0)
            saldo_anterior = float(actual["saldo"] or 0)
            estimado_nuevo = estimado_anterior + cantidad
            saldo_nuevo = saldo_anterior + cantidad
            progresivo_nuevo = int(actual["progresivo_estimacion"] or 0) + 1

            session.execute(
                text("""
                    UPDATE estimado_cosecha
                       SET saldo = :saldo,
                           estimado = :estimado,
                           fecha_estimacion = :fecha,
                           progresivo_estimacion = :prog,
                           usuario_estimo = :user,
                           kg_estimados = :estimado
                     WHERE numeroinscripcion = :n AND variedad = :v
                """),
                {
                    "saldo": saldo_nuevo, "estimado": estimado_nuevo,
                    "fecha": fecha_actual, "prog": progresivo_nuevo,
                    "user": user_estimo, "n": ni, "v": var_folio,
                },
            )
            session.commit()

            cambios.append(CambioEstimadoResultado(
                variedad_folio=var_folio,
                variedad_nombre=var_nombre,
                operacion="update",
                estimado_anterior=estimado_anterior,
                saldo_anterior=saldo_anterior,
                cantidad=cantidad,
                estimado_nuevo=estimado_nuevo,
                saldo_nuevo=saldo_nuevo,
                progresivo_nuevo=progresivo_nuevo,
            ))

            record_legacy_write(
                estado_clave=estado_clave, database_name=db_name,
                usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
                tabla="estimado_cosecha", operacion="UPDATE",
                registro_pk=f"{ni}/{var_folio}",
                campos_antes={"estimado": estimado_anterior, "saldo": saldo_anterior, "progresivo": int(actual["progresivo_estimacion"] or 0)},
                campos_despues={"estimado": estimado_nuevo, "saldo": saldo_nuevo, "progresivo": progresivo_nuevo, "cantidad_agregada": cantidad},
                registros_afectados=1,
            )

        else:
            # INSERT inicial
            superficie_init = float(ajuste.superficie or 0)
            session.execute(
                text("""
                    INSERT INTO estimado_cosecha
                      (numeroinscripcion, variedad, estimado, saldo,
                       superficie, fecha_estimacion, progresivo_estimacion,
                       usuario_estimo, kg_estimados)
                    VALUES
                      (:n, :v, :cant, :cant, :sup, :fecha, 1, :user, :cant)
                """),
                {
                    "n": ni, "v": var_folio,
                    "cant": cantidad, "sup": superficie_init,
                    "fecha": fecha_actual, "user": user_estimo,
                },
            )
            session.commit()

            cambios.append(CambioEstimadoResultado(
                variedad_folio=var_folio,
                variedad_nombre=var_nombre,
                operacion="insert",
                estimado_anterior=None,
                saldo_anterior=None,
                cantidad=cantidad,
                estimado_nuevo=cantidad,
                saldo_nuevo=cantidad,
                progresivo_nuevo=1,
            ))

            record_legacy_write(
                estado_clave=estado_clave, database_name=db_name,
                usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
                tabla="estimado_cosecha", operacion="INSERT",
                registro_pk=f"{ni}/{var_folio}",
                campos_antes=None,
                campos_despues={"estimado": cantidad, "saldo": cantidad, "superficie": superficie_init, "progresivo": 1},
                registros_afectados=1,
            )

    return ReestimarResult(numeroinscripcion=ni, cambios=cambios)
