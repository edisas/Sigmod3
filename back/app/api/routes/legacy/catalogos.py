"""
Catálogos legacy — CRUD sobre las 8 BDs legacy (SIGMOD 2).

Primera superficie: cat_rutas con cascada a trampas.folio_tecnico cuando cambia
el PFA responsable. El PHP legacy nunca sincronizó ese desnormalizado; este
endpoint resuelve ese bug histórico para rutas futuras y permite corregir
manualmente el histórico desde la UI de V3.

Campos editables del MVP: modulo, clave_pfa, nombre_ruta, inicial_ruta, status.
Al cambiar modulo re-toma cat_modulos.tipo_folio (mismo comportamiento que el
guardar.php original). Al cambiar clave_pfa hace cascade a trampas.folio_tecnico
dentro de la misma transacción legacy.

Toda corrección se registra en V3.legacy_audit_log vía `record_legacy_write`.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
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


class RutaRow(BaseModel):
    folio: int
    nombre_ruta: str | None
    inicial_ruta: str | None
    descripcion: str | None
    status: str | None
    modulo_folio: int | None
    modulo_nombre: str | None
    tipo_folio: str | None
    pfa_clave: int | None
    pfa_nombre: str | None
    pfa_inicial: str | None
    huertos: int
    trampas: int


class ModuloRow(BaseModel):
    folio: int
    nombre_modulo: str
    tipo_folio: str | None


class PfaRow(BaseModel):
    folio: int
    nombre: str
    inicial: str | None
    cedula: str | None


class PatchRutaBody(BaseModel):
    modulo: int | None = Field(default=None, ge=1)
    clave_pfa: int | None = Field(default=None, ge=1)
    nombre_ruta: str | None = Field(default=None, min_length=1, max_length=50)
    inicial_ruta: str | None = Field(default=None, min_length=1, max_length=50)
    status: Literal["A", "I"] | None = None

    def changes_dict(self) -> dict:
        return {k: v for k, v in self.model_dump().items() if v is not None}


class CascadaPreview(BaseModel):
    trampas_afectadas: int


class PatchRutaResult(BaseModel):
    folio: int
    antes: dict
    despues: dict
    cascada: dict  # {"trampas_actualizadas": N}


# ──────────────────────────────────────────────────────────────────────
# GET: listar rutas / módulos / PFAs
# ──────────────────────────────────────────────────────────────────────


def _base_rutas_sql() -> str:
    # Conteos via subconsultas correlacionadas para evitar hinchazón por JOINs múltiples.
    return """
        SELECT
            r.folio,
            r.nombre_ruta,
            r.inicial_ruta,
            r.descripcion,
            r.status,
            r.modulo              AS modulo_folio,
            m.nombre_modulo       AS modulo_nombre,
            r.tipo_folio          AS tipo_folio,
            r.clave_pfa           AS pfa_clave,
            f.nombre              AS pfa_nombre,
            f.inicial_funcionario AS pfa_inicial,
            (SELECT COUNT(*) FROM sv01_sv02 sv WHERE sv.folio_ruta = r.folio)                                      AS huertos,
            (SELECT COUNT(*) FROM trampas   tp WHERE tp.folio_ruta = r.folio AND (tp.status IS NULL OR tp.status = 'A')) AS trampas
        FROM cat_rutas r
        LEFT JOIN cat_modulos       m ON m.folio = r.modulo
        LEFT JOIN cat_funcionarios  f ON f.folio = r.clave_pfa
    """


@router.get("/rutas", response_model=list[RutaRow])
def listar_rutas(
    q: str | None = Query(default=None, description="Busca en nombre/inicial"),
    only_active: bool = Query(default=False, description="Solo status='A'"),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[RutaRow]:
    where = []
    params: dict = {}
    if q:
        where.append("(r.nombre_ruta LIKE :q OR r.inicial_ruta LIKE :q)")
        params["q"] = f"%{q}%"
    if only_active:
        where.append("r.status = 'A'")
    sql = _base_rutas_sql()
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY r.folio ASC"
    rows = session.execute(text(sql), params).mappings().all()
    return [RutaRow(**dict(r)) for r in rows]


@router.get("/modulos", response_model=list[ModuloRow])
def listar_modulos(
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[ModuloRow]:
    # OJO: cat_modulos.status solo existe en Sinaloa; en las otras 7 BDs la
    # columna no existe (verificado con information_schema). No se filtra por
    # status aquí — los pocos módulos inactivos en Sinaloa son aceptables.
    rows = session.execute(
        text("""
            SELECT folio, nombre_modulo, tipo_folio
              FROM cat_modulos
             ORDER BY nombre_modulo ASC
        """)
    ).mappings().all()
    return [ModuloRow(**dict(r)) for r in rows]


@router.get("/pfas", response_model=list[PfaRow])
def listar_pfas(
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[PfaRow]:
    rows = session.execute(
        text("""
            SELECT folio, nombre, inicial_funcionario AS inicial, cedula
              FROM cat_funcionarios
             WHERE cargo  = 'PROFESIONAL FITOSANITARIO AUTORIZADO'
               AND status = 'A'
             ORDER BY nombre ASC
        """)
    ).mappings().all()
    return [PfaRow(**dict(r)) for r in rows]


@router.get("/rutas/{folio}/cascada-preview", response_model=CascadaPreview)
def cascada_preview(
    folio: int,
    clave_pfa: int | None = Query(default=None, description="Nuevo PFA a asignar"),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> CascadaPreview:
    """Cuenta cuántas trampas se reasignarían si el clave_pfa de la ruta cambia."""
    if clave_pfa is None:
        return CascadaPreview(trampas_afectadas=0)
    row = session.execute(
        text("""
            SELECT COUNT(*) AS n
              FROM trampas
             WHERE folio_ruta = :folio
               AND folio_tecnico <> :nuevo
        """),
        {"folio": folio, "nuevo": str(clave_pfa)},
    ).mappings().one()
    return CascadaPreview(trampas_afectadas=int(row["n"]))


# ──────────────────────────────────────────────────────────────────────
# PATCH: corregir una ruta con cascada a trampas.folio_tecnico
# ──────────────────────────────────────────────────────────────────────


@router.patch("/rutas/{folio}", response_model=PatchRutaResult)
def actualizar_ruta(
    folio: int,
    body: PatchRutaBody,
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> PatchRutaResult:
    cambios = body.changes_dict()
    if not cambios:
        raise HTTPException(status_code=400, detail="No hay cambios que aplicar")

    # 1) Snapshot "antes"
    before = session.execute(
        text("""
            SELECT folio, nombre_ruta, inicial_ruta, descripcion, status,
                   modulo, tipo_folio, clave_pfa
              FROM cat_rutas
             WHERE folio = :folio
        """),
        {"folio": folio},
    ).mappings().first()
    if not before:
        raise HTTPException(status_code=404, detail=f"Ruta {folio} no existe")
    before_d = dict(before)

    # 2) Si cambia modulo → re-toma tipo_folio del nuevo modulo
    nuevo_tipo_folio: str | None = None
    if "modulo" in cambios and cambios["modulo"] != before_d["modulo"]:
        mod_row = session.execute(
            text("SELECT tipo_folio FROM cat_modulos WHERE folio = :m"),
            {"m": cambios["modulo"]},
        ).mappings().first()
        if not mod_row:
            raise HTTPException(status_code=400, detail=f"Modulo {cambios['modulo']} no existe")
        nuevo_tipo_folio = mod_row["tipo_folio"]

    # 3) Valida clave_pfa si cambia
    if "clave_pfa" in cambios and cambios["clave_pfa"] != before_d["clave_pfa"]:
        pfa_row = session.execute(
            text("""
                SELECT folio FROM cat_funcionarios
                 WHERE folio = :p
                   AND cargo = 'PROFESIONAL FITOSANITARIO AUTORIZADO'
                   AND status = 'A'
            """),
            {"p": cambios["clave_pfa"]},
        ).mappings().first()
        if not pfa_row:
            raise HTTPException(status_code=400, detail=f"PFA {cambios['clave_pfa']} no válido (no existe, no es PFA, o está inactivo)")

    # 4) UPDATE dinámico cat_rutas
    set_clauses = []
    set_params: dict = {"folio": folio}
    column_map = {
        "modulo":       "modulo",
        "clave_pfa":    "clave_pfa",
        "nombre_ruta":  "nombre_ruta",
        "inicial_ruta": "inicial_ruta",
        "status":       "status",
    }
    for key, col in column_map.items():
        if key in cambios:
            set_clauses.append(f"{col} = :{key}")
            set_params[key] = cambios[key]
    if nuevo_tipo_folio is not None:
        set_clauses.append("tipo_folio = :tipo_folio")
        set_params["tipo_folio"] = nuevo_tipo_folio

    session.execute(
        text(f"UPDATE cat_rutas SET {', '.join(set_clauses)} WHERE folio = :folio"),
        set_params,
    )

    # 5) Cascada: si cambia clave_pfa, actualizar trampas.folio_tecnico (VARCHAR)
    trampas_actualizadas = 0
    if "clave_pfa" in cambios and cambios["clave_pfa"] != before_d["clave_pfa"]:
        res = session.execute(
            text("""
                UPDATE trampas
                   SET folio_tecnico = :nuevo
                 WHERE folio_ruta = :folio
                   AND folio_tecnico <> :nuevo
            """),
            {"nuevo": str(cambios["clave_pfa"]), "folio": folio},
        )
        trampas_actualizadas = res.rowcount or 0

    # 6) Commit legacy
    session.commit()

    # 7) Snapshot "después"
    after = session.execute(
        text("""
            SELECT folio, nombre_ruta, inicial_ruta, descripcion, status,
                   modulo, tipo_folio, clave_pfa
              FROM cat_rutas
             WHERE folio = :folio
        """),
        {"folio": folio},
    ).mappings().first()
    after_d = dict(after) if after else {}

    # 8) Auditoría en V3 (best-effort, no falla la operación legacy si truena)
    user_clave, user_nick = _resolver_legacy_user(session, claims)
    estado_clave, db_name = _estado_clave_y_db(claims)

    # diff mínimo: sólo campos que cambiaron realmente + cascada info
    diff_antes = {k: before_d[k] for k in after_d if before_d.get(k) != after_d.get(k)}
    diff_despues = {k: after_d[k] for k in after_d if before_d.get(k) != after_d.get(k)}
    if trampas_actualizadas:
        diff_despues["__cascada_trampas_folio_tecnico"] = trampas_actualizadas

    record_legacy_write(
        estado_clave=estado_clave,
        database_name=db_name,
        usuario_legacy_clave=user_clave,
        usuario_legacy_nick=user_nick,
        tabla="cat_rutas",
        operacion="UPDATE",
        registro_pk=str(folio),
        campos_antes=diff_antes,
        campos_despues=diff_despues,
        registros_afectados=1 + trampas_actualizadas,
    )

    return PatchRutaResult(
        folio=folio,
        antes=before_d,
        despues=after_d,
        cascada={"trampas_actualizadas": trampas_actualizadas},
    )
