"""Catalogos auxiliares V3 nativos.

Router parametrizable que expone los 10 catalogos auxiliares (variedades,
especies_mosca, vehiculos, hospederos, tipos_aplicacion, aplicadores, areas,
empaques, productos, status_revision) bajo el mismo esquema CRUD + pivote
multi-estado.

Reglas de negocio:
- Catalogo nacional con pivote N:M a estados ("para que estados aplica").
- Solo "administrador general" y "admin" pueden CREATE/UPDATE/DELETE.
- "administrador estatal" tiene solo lectura, filtrada por su estado_activo_id.
- Soft-delete via estatus_id=2; jamas DELETE fisico.
- Auditoria via catalogos_cambios_log (helper compartido).

Seguridad SQL:
- El path param {slug} se valida contra el dict CATALOGOS_AUX. Si no existe → 404.
- Una vez resuelto, los nombres de tabla/columna salen del CatalogoAuxSpec (constantes
  hardcodeadas), nunca del input del usuario.
- Todos los valores van por bind params. No hay concatenacion de input en SQL.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.api.routes.catalogos import audit_catalog_change
from app.db import get_db
from app.dependencies import get_current_state_id, get_current_user
from app.models import User
from app.schemas import (
    CatalogAuxCatalogoMeta,
    CatalogAuxCreate,
    CatalogAuxListResponse,
    CatalogAuxResponse,
    CatalogAuxUpdate,
)

router = APIRouter()


# ----------------------------------------------------------------------
# Spec de cada catalogo. Hardcoded — nunca derivado del input del usuario.
# ----------------------------------------------------------------------


@dataclass(frozen=True)
class CatalogoAuxSpec:
    slug: str          # path param exposed to frontend
    label: str         # human label (ES)
    table: str         # SQL table name
    pivot_table: str   # SQL pivot table name
    pivot_fk: str      # FK column on pivot referencing the catalog row


CATALOGOS_AUX: dict[str, CatalogoAuxSpec] = {
    "variedades": CatalogoAuxSpec(
        slug="variedades",
        label="Variedades",
        table="variedades",
        pivot_table="variedades_estados",
        pivot_fk="variedad_id",
    ),
    "especies-mosca": CatalogoAuxSpec(
        slug="especies-mosca",
        label="Especies de mosca",
        table="especies_mosca",
        pivot_table="especies_mosca_estados",
        pivot_fk="especie_mosca_id",
    ),
    "vehiculos": CatalogoAuxSpec(
        slug="vehiculos",
        label="Vehiculos",
        table="vehiculos",
        pivot_table="vehiculos_estados",
        pivot_fk="vehiculo_id",
    ),
    "hospederos": CatalogoAuxSpec(
        slug="hospederos",
        label="Hospederos",
        table="hospederos",
        pivot_table="hospederos_estados",
        pivot_fk="hospedero_id",
    ),
    "tipos-aplicacion": CatalogoAuxSpec(
        slug="tipos-aplicacion",
        label="Tipos de aplicacion",
        table="tipos_aplicacion",
        pivot_table="tipos_aplicacion_estados",
        pivot_fk="tipo_aplicacion_id",
    ),
    "aplicadores": CatalogoAuxSpec(
        slug="aplicadores",
        label="Aplicadores",
        table="aplicadores",
        pivot_table="aplicadores_estados",
        pivot_fk="aplicador_id",
    ),
    "areas": CatalogoAuxSpec(
        slug="areas",
        label="Areas",
        table="areas",
        pivot_table="areas_estados",
        pivot_fk="area_id",
    ),
    "empaques": CatalogoAuxSpec(
        slug="empaques",
        label="Empaques",
        table="empaques",
        pivot_table="empaques_estados",
        pivot_fk="empaque_id",
    ),
    "productos": CatalogoAuxSpec(
        slug="productos",
        label="Productos",
        table="productos",
        pivot_table="productos_estados",
        pivot_fk="producto_id",
    ),
    "status-revision": CatalogoAuxSpec(
        slug="status-revision",
        label="Status de revision",
        table="status_revision",
        pivot_table="status_revision_estados",
        pivot_fk="status_revision_id",
    ),
}


# ----------------------------------------------------------------------
# Helpers de RBAC y resolucion de spec.
# ----------------------------------------------------------------------


READ_ROLES = {"administrador general", "administrador estatal", "admin", "administrador senasica"}
WRITE_ROLES = {"administrador general", "admin", "administrador senasica"}


def _ensure_read_access(user: User) -> None:
    role = (user.rol or "").strip().lower()
    if role not in READ_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para consultar catalogos auxiliares",
        )


def _ensure_write_access(user: User) -> None:
    role = (user.rol or "").strip().lower()
    if role not in WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administrador general puede modificar catalogos auxiliares",
        )


def _is_admin_general(user: User) -> bool:
    return (user.rol or "").strip().lower() in WRITE_ROLES


def _resolve_spec(slug: str) -> CatalogoAuxSpec:
    spec = CATALOGOS_AUX.get(slug)
    if spec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Catalogo auxiliar '{slug}' no existe",
        )
    return spec


def _validate_estados_ids(db: Session, estados_ids: list[int]) -> list[int]:
    """Valida que los ids referencien estados activos. Devuelve set unico ordenado."""
    unique_ids = sorted({int(x) for x in estados_ids})
    if not unique_ids:
        return []
    stmt = text("SELECT id FROM estados WHERE id IN :ids AND estatus_id = 1").bindparams(
        bindparam("ids", expanding=True)
    )
    rows = db.execute(stmt, {"ids": unique_ids}).all()
    found = {int(r[0]) for r in rows}
    missing = [x for x in unique_ids if x not in found]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Estados no validos o inactivos: {missing}",
        )
    return unique_ids


def _replace_pivot(
    db: Session,
    spec: CatalogoAuxSpec,
    catalogo_id: int,
    estados_ids: list[int],
) -> None:
    """Reescribe la pivote: borra todo y reinserta los ids dados."""
    db.execute(
        text(f"DELETE FROM {spec.pivot_table} WHERE {spec.pivot_fk} = :cid"),
        {"cid": catalogo_id},
    )
    if not estados_ids:
        return
    db.execute(
        text(
            f"""
            INSERT INTO {spec.pivot_table} ({spec.pivot_fk}, estado_id)
            VALUES (:cid, :eid)
            """
        ),
        [{"cid": catalogo_id, "eid": eid} for eid in estados_ids],
    )


def _fetch_estados_aplicables(
    db: Session,
    spec: CatalogoAuxSpec,
    catalogo_id: int,
) -> tuple[list[int], list[str]]:
    rows = db.execute(
        text(
            f"""
            SELECT e.id, e.nombre
            FROM {spec.pivot_table} p
            JOIN estados e ON e.id = p.estado_id
            WHERE p.{spec.pivot_fk} = :cid
            ORDER BY e.nombre ASC
            """
        ),
        {"cid": catalogo_id},
    ).all()
    return [int(r[0]) for r in rows], [str(r[1]) for r in rows]


def _row_to_response(
    db: Session,
    spec: CatalogoAuxSpec,
    row: dict,
) -> CatalogAuxResponse:
    estados_ids, estados_nombres = _fetch_estados_aplicables(db, spec, int(row["id"]))
    return CatalogAuxResponse(
        id=int(row["id"]),
        clave=str(row["clave"]),
        nombre=str(row["nombre"]),
        descripcion=row["descripcion"] if row.get("descripcion") is not None else None,
        estatus_id=int(row["estatus_id"]),
        estados_aplicables=estados_ids,
        estados_aplicables_nombres=estados_nombres,
    )


# ----------------------------------------------------------------------
# Endpoints.
# ----------------------------------------------------------------------


@router.get("/", response_model=list[CatalogAuxCatalogoMeta])
def list_catalogos_disponibles(
    current_user: User = Depends(get_current_user),
) -> list[CatalogAuxCatalogoMeta]:
    """Lista los slugs de catalogos auxiliares disponibles (para el sidebar UI)."""
    _ensure_read_access(current_user)
    return [CatalogAuxCatalogoMeta(slug=s.slug, label=s.label) for s in CATALOGOS_AUX.values()]


@router.get("/{slug}", response_model=list[CatalogAuxResponse])
def list_catalogo(
    slug: str,
    estatus_id: int | None = Query(default=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> list[CatalogAuxResponse]:
    """Listado simple (sin paginar) — para selects/dropdowns."""
    _ensure_read_access(current_user)
    spec = _resolve_spec(slug)

    if _is_admin_general(current_user):
        rows = db.execute(
            text(
                f"""
                SELECT id, clave, nombre, descripcion, estatus_id
                FROM {spec.table}
                WHERE (:estatus_id IS NULL OR estatus_id = :estatus_id)
                ORDER BY nombre ASC
                """
            ),
            {"estatus_id": estatus_id},
        ).mappings().all()
    else:
        rows = db.execute(
            text(
                f"""
                SELECT c.id, c.clave, c.nombre, c.descripcion, c.estatus_id
                FROM {spec.table} c
                JOIN {spec.pivot_table} p ON p.{spec.pivot_fk} = c.id
                WHERE p.estado_id = :estado_activo_id
                  AND (:estatus_id IS NULL OR c.estatus_id = :estatus_id)
                ORDER BY c.nombre ASC
                """
            ),
            {"estado_activo_id": current_state_id, "estatus_id": estatus_id},
        ).mappings().all()

    return [_row_to_response(db, spec, dict(r)) for r in rows]


@router.get("/{slug}/listado", response_model=CatalogAuxListResponse)
def list_catalogo_paginado(
    slug: str,
    q: str | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> CatalogAuxListResponse:
    _ensure_read_access(current_user)
    spec = _resolve_spec(slug)

    offset = (page - 1) * page_size
    search = f"%{q.strip()}%" if q and q.strip() else None
    is_admin = _is_admin_general(current_user)

    base_from = (
        f"FROM {spec.table} c"
        if is_admin
        else (
            f"FROM {spec.table} c "
            f"JOIN {spec.pivot_table} p ON p.{spec.pivot_fk} = c.id "
            f"AND p.estado_id = :estado_activo_id"
        )
    )
    base_where = (
        "WHERE (:estatus_id IS NULL OR c.estatus_id = :estatus_id) "
        "AND (:search IS NULL OR c.nombre LIKE :search OR c.clave LIKE :search OR c.descripcion LIKE :search)"
    )

    params = {
        "estatus_id": estatus_id,
        "search": search,
        "limit": page_size,
        "offset": offset,
    }
    if not is_admin:
        params["estado_activo_id"] = current_state_id

    total = int(
        db.execute(
            text(f"SELECT COUNT(DISTINCT c.id) {base_from} {base_where}"),
            params,
        ).scalar_one()
    )

    rows = db.execute(
        text(
            f"""
            SELECT DISTINCT c.id, c.clave, c.nombre, c.descripcion, c.estatus_id
            {base_from}
            {base_where}
            ORDER BY c.nombre ASC
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    ).mappings().all()

    return CatalogAuxListResponse(
        items=[_row_to_response(db, spec, dict(r)) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{slug}/{registro_id}", response_model=CatalogAuxResponse)
def get_catalogo_item(
    slug: str,
    registro_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> CatalogAuxResponse:
    _ensure_read_access(current_user)
    spec = _resolve_spec(slug)

    row = db.execute(
        text(
            f"""
            SELECT id, clave, nombre, descripcion, estatus_id
            FROM {spec.table}
            WHERE id = :id
            """
        ),
        {"id": registro_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")

    # Estatales solo pueden ver registros que apliquen a su estado activo.
    if not _is_admin_general(current_user):
        applies = db.execute(
            text(
                f"""
                SELECT 1 FROM {spec.pivot_table}
                WHERE {spec.pivot_fk} = :id AND estado_id = :estado_activo_id
                LIMIT 1
                """
            ),
            {"id": registro_id, "estado_activo_id": current_state_id},
        ).first()
        if not applies:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")

    return _row_to_response(db, spec, dict(row))


@router.post("/{slug}", response_model=CatalogAuxResponse, status_code=status.HTTP_201_CREATED)
def create_catalogo_item(
    slug: str,
    payload: CatalogAuxCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> CatalogAuxResponse:
    _ensure_write_access(current_user)
    spec = _resolve_spec(slug)
    estados_ids = _validate_estados_ids(db, payload.estados_aplicables)

    # Clave duplicada
    dup = db.execute(
        text(f"SELECT id FROM {spec.table} WHERE clave = :clave"),
        {"clave": payload.clave},
    ).first()
    if dup:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La clave ya existe")

    result = db.execute(
        text(
            f"""
            INSERT INTO {spec.table}
                (clave, nombre, descripcion, estatus_id, created_by_user_id, updated_by_user_id)
            VALUES (:clave, :nombre, :descripcion, :estatus_id, :user_id, :user_id)
            """
        ),
        {
            "clave": payload.clave,
            "nombre": payload.nombre,
            "descripcion": payload.descripcion,
            "estatus_id": payload.estatus_id,
            "user_id": current_user.id,
        },
    )
    new_id = int(result.lastrowid)
    _replace_pivot(db, spec, new_id, estados_ids)

    audit_catalog_change(
        db,
        catalogo=spec.table,
        registro_id=new_id,
        accion="CREATE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=None,
        datos_nuevos={**payload.model_dump(), "estados_aplicables": estados_ids},
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()

    row = db.execute(
        text(
            f"SELECT id, clave, nombre, descripcion, estatus_id FROM {spec.table} WHERE id = :id"
        ),
        {"id": new_id},
    ).mappings().first()
    return _row_to_response(db, spec, dict(row))


@router.put("/{slug}/{registro_id}", response_model=CatalogAuxResponse)
def update_catalogo_item(
    slug: str,
    registro_id: int,
    payload: CatalogAuxUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> CatalogAuxResponse:
    _ensure_write_access(current_user)
    spec = _resolve_spec(slug)

    previous = db.execute(
        text(
            f"SELECT id, clave, nombre, descripcion, estatus_id FROM {spec.table} WHERE id = :id"
        ),
        {"id": registro_id},
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")

    # Si cambia la clave, validar duplicado.
    if payload.clave != previous["clave"]:
        dup = db.execute(
            text(f"SELECT id FROM {spec.table} WHERE clave = :clave AND id <> :id"),
            {"clave": payload.clave, "id": registro_id},
        ).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La clave ya existe")

    db.execute(
        text(
            f"""
            UPDATE {spec.table}
            SET clave = :clave,
                nombre = :nombre,
                descripcion = :descripcion,
                estatus_id = :estatus_id,
                updated_by_user_id = :user_id
            WHERE id = :id
            """
        ),
        {
            "clave": payload.clave,
            "nombre": payload.nombre,
            "descripcion": payload.descripcion,
            "estatus_id": payload.estatus_id,
            "user_id": current_user.id,
            "id": registro_id,
        },
    )

    estados_ids: list[int] | None = None
    if payload.estados_aplicables is not None:
        estados_ids = _validate_estados_ids(db, payload.estados_aplicables)
        _replace_pivot(db, spec, registro_id, estados_ids)

    audit_catalog_change(
        db,
        catalogo=spec.table,
        registro_id=registro_id,
        accion="UPDATE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=dict(previous),
        datos_nuevos={
            **payload.model_dump(exclude={"estados_aplicables"}),
            **({"estados_aplicables": estados_ids} if estados_ids is not None else {}),
        },
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()

    row = db.execute(
        text(
            f"SELECT id, clave, nombre, descripcion, estatus_id FROM {spec.table} WHERE id = :id"
        ),
        {"id": registro_id},
    ).mappings().first()
    return _row_to_response(db, spec, dict(row))


@router.delete("/{slug}/{registro_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_catalogo_item(
    slug: str,
    registro_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    _ensure_write_access(current_user)
    spec = _resolve_spec(slug)

    previous = db.execute(
        text(
            f"SELECT id, clave, nombre, descripcion, estatus_id FROM {spec.table} WHERE id = :id"
        ),
        {"id": registro_id},
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")

    db.execute(
        text(
            f"""
            UPDATE {spec.table}
            SET estatus_id = 2, updated_by_user_id = :user_id
            WHERE id = :id
            """
        ),
        {"user_id": current_user.id, "id": registro_id},
    )

    audit_catalog_change(
        db,
        catalogo=spec.table,
        registro_id=registro_id,
        accion="DELETE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=dict(previous),
        datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()
