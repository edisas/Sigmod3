"""
Catálogos auxiliares legacy — vista y edición de los catálogos simples.

Reemplaza los formularios PHP `cat_*.php` (cat_especies, cat_funcionarios,
cat_modulos, etc.). Maneja 14 catálogos heterogéneos vía un registry
declarativo: read-only para los complejos, CRUD inline para los simples.

Catálogos editables (CRUD inline): variedades, especies, especie_mosca,
vehiculos, hospederos, tipos_aplicacion, aplicadores, areas, empaques,
status_revision, productos.

Catálogos read-only (esquema complejo, dejados para forms dedicados):
modulos, funcionarios, destinatarios, solicitantes.

Endpoints:
- GET /                 — lista los catálogos disponibles + flag editable.
- GET /{cat}            — lista filas de un catálogo.
- POST /{cat}           — crea fila (solo si editable).
- PATCH /{cat}/{folio}  — actualiza fila (solo si editable).
- DELETE /{cat}/{folio} — borrado lógico via status='I' (solo si editable
  y el catálogo tiene columna status).

Audit V3 en cada escritura.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path
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
# Registry de catálogos
# ──────────────────────────────────────────────────────────────────────


class CatalogoSpec:
    """Define cómo leer/escribir un catálogo legacy."""
    def __init__(
        self,
        clave: str,
        tabla: str,
        nombre_humano: str,
        col_pk: str = "folio",
        col_nombre: str = "nombre",
        cols_extra: list[str] | None = None,
        editable: bool = False,
        col_status: str | None = None,
        cols_obligatorias: list[str] | None = None,
        order_by: str = "nombre",
    ):
        self.clave = clave
        self.tabla = tabla
        self.nombre_humano = nombre_humano
        self.col_pk = col_pk
        self.col_nombre = col_nombre
        self.cols_extra = cols_extra or []
        self.editable = editable
        self.col_status = col_status
        self.cols_obligatorias = cols_obligatorias or [col_nombre]
        self.order_by = order_by

    @property
    def select_cols(self) -> str:
        cols = [self.col_pk, self.col_nombre, *self.cols_extra]
        if self.col_status and self.col_status not in cols:
            cols.append(self.col_status)
        return ", ".join(cols)


CATALOGOS: dict[str, CatalogoSpec] = {
    # ── Editables simples (folio + nombre + status?) ──────────────────
    "variedades": CatalogoSpec(
        "variedades", "cat_variedades", "Variedades",
        col_nombre="descripcion", cols_extra=["especie"],
        editable=True, cols_obligatorias=["descripcion", "especie"],
        order_by="descripcion",
    ),
    "especies": CatalogoSpec(
        "especies", "cat_especies", "Especies (frutos hospederos)",
        cols_extra=["nombre_botanico", "clave_oficial"],
        editable=True,
    ),
    "especie_mosca": CatalogoSpec(
        "especie_mosca", "cat_especie_mosca", "Especies de mosca",
        editable=True,
    ),
    "vehiculos": CatalogoSpec(
        "vehiculos", "cat_vehiculos", "Tipos de vehículo",
        col_nombre="descripcion", cols_extra=["clave_oficial"],
        editable=True, cols_obligatorias=["descripcion"],
        order_by="descripcion",
    ),
    "hospederos": CatalogoSpec(
        "hospederos", "cat_hospederos", "Hospederos",
        editable=True, col_status="status",
    ),
    "tipos_aplicacion": CatalogoSpec(
        "tipos_aplicacion", "cat_tipos_aplicacion", "Tipos de aplicación química",
        editable=True, col_status="status",
    ),
    "aplicadores": CatalogoSpec(
        "aplicadores", "cat_aplicadores", "Aplicadores",
        editable=True, col_status="status",
    ),
    "areas": CatalogoSpec(
        "areas", "cat_areas", "Áreas",
        editable=True,
    ),
    "empaques": CatalogoSpec(
        "empaques", "cat_empaques", "Empaques",
        col_nombre="descripcion", editable=True,
        cols_obligatorias=["descripcion"], order_by="descripcion",
    ),
    "status_revision": CatalogoSpec(
        "status_revision", "cat_status_revision", "Status de revisión de trampa",
        cols_extra=["descripcion"], editable=True,
    ),
    "productos": CatalogoSpec(
        "productos", "cat_productos", "Productos (cebos)",
        cols_extra=["nombre_corto", "nombre_botanico"],
        editable=True,
    ),

    # ── Read-only (esquema complejo) ──────────────────────────────────
    "modulos": CatalogoSpec(
        "modulos", "cat_modulos", "Módulos",
        col_nombre="nombre_modulo",
        cols_extra=["tipo_folio", "clave_estado", "clave_municipio",
                    "ubicacion", "inicial_modulo", "Zona"],
        editable=False, col_status="status",
        order_by="nombre_modulo",
    ),
    "funcionarios": CatalogoSpec(
        "funcionarios", "cat_funcionarios", "Funcionarios (incluye PFAs)",
        cols_extra=["cedula", "vigencia", "cargo", "inicial_funcionario"],
        editable=False, col_status="status",
    ),
    "destinatarios": CatalogoSpec(
        "destinatarios", "cat_destinatarios", "Destinatarios",
        cols_extra=["direccion1", "direccion2", "direccion3", "rfc", "edo_mun"],
        editable=False, col_status="status",
    ),
    "solicitantes": CatalogoSpec(
        "solicitantes", "cat_solicitantes", "Solicitantes",
        cols_extra=["direccion1", "direccion2", "direccion3", "rfc", "edo_mun",
                    "estatus_bloqueo", "fecha_bloqueo"],
        editable=False, col_status="status",
    ),
}


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────


class CatalogoMeta(BaseModel):
    clave: str
    tabla: str
    nombre_humano: str
    editable: bool
    col_pk: str
    col_nombre: str
    cols_extra: list[str]
    tiene_status: bool


class CatalogoRow(BaseModel):
    folio: int
    nombre: str | None
    extra: dict[str, Any]
    status: str | None


class UpsertBody(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=200)
    extra: dict[str, Any] | None = None


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


def _spec(cat: str) -> CatalogoSpec:
    if cat not in CATALOGOS:
        raise HTTPException(status_code=404, detail=f"Catálogo '{cat}' no existe.")
    return CATALOGOS[cat]


def _normalize_value(v: Any) -> Any:
    """Convierte tipos no-JSON-serializables a string."""
    if v is None:
        return None
    if isinstance(v, str):
        return v.strip()
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def _row_to_dto(spec: CatalogoSpec, row: dict[str, Any]) -> CatalogoRow:
    extra = {}
    for c in spec.cols_extra:
        extra[c] = _normalize_value(row.get(c))
    status = None
    if spec.col_status:
        s = row.get(spec.col_status)
        status = str(s).strip() if s is not None else None
    return CatalogoRow(
        folio=int(row[spec.col_pk]),
        nombre=str(row[spec.col_nombre]).strip() if row.get(spec.col_nombre) else None,
        extra=extra,
        status=status,
    )


# ──────────────────────────────────────────────────────────────────────
# GET / — lista de catálogos disponibles
# ──────────────────────────────────────────────────────────────────────


@router.get("", response_model=list[CatalogoMeta])
def listar_catalogos(
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[CatalogoMeta]:
    return [
        CatalogoMeta(
            clave=s.clave, tabla=s.tabla, nombre_humano=s.nombre_humano,
            editable=s.editable, col_pk=s.col_pk, col_nombre=s.col_nombre,
            cols_extra=s.cols_extra, tiene_status=s.col_status is not None,
        )
        for s in CATALOGOS.values()
    ]


# ──────────────────────────────────────────────────────────────────────
# GET /{cat} — listar filas
# ──────────────────────────────────────────────────────────────────────


@router.get("/{cat}", response_model=list[CatalogoRow])
def listar_filas(
    cat: str = Path(..., min_length=1),
    session: Session = Depends(get_legacy_db),
    _claims: dict = Depends(get_current_legacy_claims),
) -> list[CatalogoRow]:
    spec = _spec(cat)
    rows = session.execute(
        text(f"SELECT {spec.select_cols} FROM {spec.tabla} ORDER BY {spec.order_by} ASC"),
    ).mappings().all()
    return [_row_to_dto(spec, dict(r)) for r in rows]


# ──────────────────────────────────────────────────────────────────────
# POST /{cat} — crear fila
# ──────────────────────────────────────────────────────────────────────


@router.post("/{cat}", response_model=CatalogoRow)
def crear_fila(
    cat: str,
    body: UpsertBody,
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> CatalogoRow:
    spec = _spec(cat)
    if not spec.editable:
        raise HTTPException(status_code=403, detail=f"Catálogo '{cat}' es read-only.")

    extra = body.extra or {}
    valores = {spec.col_nombre: body.nombre.strip()}

    # Validar y agregar campos extra permitidos
    for col in spec.cols_extra:
        if col in extra:
            valores[col] = _normalize_value(extra[col])
    if spec.col_status:
        valores[spec.col_status] = "A"

    # Validar obligatorios
    for col in spec.cols_obligatorias:
        if col not in valores or valores[col] in (None, ""):
            raise HTTPException(status_code=400, detail=f"Campo obligatorio faltante: {col}")

    cols_ins = list(valores.keys())
    placeholders = ", ".join(f":{c}" for c in cols_ins)
    sql = text(f"INSERT INTO {spec.tabla} ({', '.join(cols_ins)}) VALUES ({placeholders})")
    res = session.execute(sql, valores)
    session.commit()

    new_pk = int(res.lastrowid or 0)
    if not new_pk:
        # MyISAM puede no devolver lastrowid en algunos casos — lookup por nombre
        new_pk = int(session.execute(
            text(f"SELECT MAX({spec.col_pk}) FROM {spec.tabla}")
        ).scalar() or 0)

    user_clave, user_nick = _resolver_legacy_user(session, claims)
    estado_clave, db_name = _estado_clave_y_db(claims)
    record_legacy_write(
        estado_clave=estado_clave, database_name=db_name,
        usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
        tabla=spec.tabla, operacion="INSERT",
        registro_pk=str(new_pk),
        campos_antes=None, campos_despues=valores, registros_afectados=1,
    )

    row = session.execute(
        text(f"SELECT {spec.select_cols} FROM {spec.tabla} WHERE {spec.col_pk} = :pk"),
        {"pk": new_pk},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=500, detail="No se pudo recuperar la fila creada.")
    return _row_to_dto(spec, dict(row))


# ──────────────────────────────────────────────────────────────────────
# PATCH /{cat}/{folio} — actualizar fila
# ──────────────────────────────────────────────────────────────────────


@router.patch("/{cat}/{folio}", response_model=CatalogoRow)
def actualizar_fila(
    cat: str,
    folio: int,
    body: UpsertBody,
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> CatalogoRow:
    spec = _spec(cat)
    if not spec.editable:
        raise HTTPException(status_code=403, detail=f"Catálogo '{cat}' es read-only.")

    actual = session.execute(
        text(f"SELECT {spec.select_cols} FROM {spec.tabla} WHERE {spec.col_pk} = :pk"),
        {"pk": folio},
    ).mappings().first()
    if not actual:
        raise HTTPException(status_code=404, detail=f"Fila {folio} no existe en {spec.tabla}.")

    nuevos = {spec.col_nombre: body.nombre.strip()}
    extra = body.extra or {}
    for col in spec.cols_extra:
        if col in extra:
            nuevos[col] = _normalize_value(extra[col])

    set_clauses = ", ".join(f"{c} = :{c}" for c in nuevos)
    nuevos["pk"] = folio
    session.execute(
        text(f"UPDATE {spec.tabla} SET {set_clauses} WHERE {spec.col_pk} = :pk"),
        nuevos,
    )
    session.commit()

    user_clave, user_nick = _resolver_legacy_user(session, claims)
    estado_clave, db_name = _estado_clave_y_db(claims)
    record_legacy_write(
        estado_clave=estado_clave, database_name=db_name,
        usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
        tabla=spec.tabla, operacion="UPDATE",
        registro_pk=str(folio),
        campos_antes={k: actual[k] for k in nuevos if k != "pk"},
        campos_despues={k: v for k, v in nuevos.items() if k != "pk"},
        registros_afectados=1,
    )

    row = session.execute(
        text(f"SELECT {spec.select_cols} FROM {spec.tabla} WHERE {spec.col_pk} = :pk"),
        {"pk": folio},
    ).mappings().first()
    return _row_to_dto(spec, dict(row))


# ──────────────────────────────────────────────────────────────────────
# DELETE /{cat}/{folio} — desactivar (status='I')
# ──────────────────────────────────────────────────────────────────────


@router.delete("/{cat}/{folio}", response_model=CatalogoRow)
def desactivar_fila(
    cat: str,
    folio: int,
    session: Session = Depends(get_legacy_db),
    claims: dict = Depends(get_current_legacy_claims),
) -> CatalogoRow:
    spec = _spec(cat)
    if not spec.editable:
        raise HTTPException(status_code=403, detail=f"Catálogo '{cat}' es read-only.")
    if not spec.col_status:
        raise HTTPException(status_code=400, detail=f"Catálogo '{cat}' no soporta desactivación (sin columna status).")

    actual = session.execute(
        text(f"SELECT {spec.select_cols} FROM {spec.tabla} WHERE {spec.col_pk} = :pk"),
        {"pk": folio},
    ).mappings().first()
    if not actual:
        raise HTTPException(status_code=404, detail=f"Fila {folio} no existe en {spec.tabla}.")

    session.execute(
        text(f"UPDATE {spec.tabla} SET {spec.col_status} = 'I' WHERE {spec.col_pk} = :pk"),
        {"pk": folio},
    )
    session.commit()

    user_clave, user_nick = _resolver_legacy_user(session, claims)
    estado_clave, db_name = _estado_clave_y_db(claims)
    record_legacy_write(
        estado_clave=estado_clave, database_name=db_name,
        usuario_legacy_clave=user_clave, usuario_legacy_nick=user_nick,
        tabla=spec.tabla, operacion="UPDATE",
        registro_pk=str(folio),
        campos_antes={spec.col_status: actual[spec.col_status]},
        campos_despues={spec.col_status: "I"},
        registros_afectados=1,
    )

    row = session.execute(
        text(f"SELECT {spec.select_cols} FROM {spec.tabla} WHERE {spec.col_pk} = :pk"),
        {"pk": folio},
    ).mappings().first()
    return _row_to_dto(spec, dict(row))
