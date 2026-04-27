"""Endpoints de productores V3 nativos.

Multi-tenant por estado:
- Roles elevados (admin general, senasica, admin) ven y escriben sobre
  cualquier estado pero su contexto activo es su estado_activo_id (Senasica
  cambia con /auth/switch-state).
- Roles estatales (administrador estatal) solo ven y escriben en su estado
  activo.

RBAC:
- READ: admin general, admin, administrador senasica, administrador estatal.
- WRITE (POST/PUT/DELETE): admin general, admin, administrador senasica,
  administrador estatal (solo en su estado activo).

Auditoría: cuando el actor es Senasica, cada mutación se registra también en
senasica_audit_log con el SQL implícito (campo + valor + estado).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.catalogos import audit_catalog_change
from app.core.senasica import audit_senasica, is_elevated, is_senasica
from app.db import get_db
from app.dependencies import get_current_state_id, get_current_user
from app.models import User
from app.schemas import (
    ProductorCreate,
    ProductorListResponse,
    ProductorResponse,
    ProductorUpdate,
)

router = APIRouter()

ALLOWED_ROLES = {
    "admin",
    "administrador general",
    "administrador estatal",
    "administrador senasica",
}

VALID_TIPOS_PERSONA = {"fisica", "moral"}


def _ensure_access(current_user: User) -> None:
    role = (current_user.rol or "").strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para gestionar productores")


def _validate_payload(payload: ProductorCreate | ProductorUpdate) -> None:
    if payload.tipo_persona.strip().lower() not in VALID_TIPOS_PERSONA:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="tipo_persona debe ser 'fisica' o 'moral'")


def _scope_state_id(current_user: User, current_state_id: int, requested_estado_id: int | None) -> int:
    """Determina el estado_id efectivo para una operación de write.

    Estatales: forzados a su estado_activo_id (cualquier intento de modificar
    otro estado es rechazado). Elevados (admin general/senasica/admin): pueden
    operar en cualquier estado, pero por simplicidad lo anclamos al
    estado_activo_id del JWT (Senasica cambia vía switch-state).
    """
    target = requested_estado_id if requested_estado_id is not None else current_state_id
    if not is_elevated(current_user) and target != current_state_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No puedes operar productores fuera de tu estado activo",
        )
    return target


def _to_response(row: dict[str, Any]) -> ProductorResponse:
    return ProductorResponse(
        id=int(row["id"]),
        tipo_persona=str(row["tipo_persona"]),
        rfc=str(row["rfc"]),
        razon_social=row.get("razon_social"),
        calle=row.get("calle"),
        numero_interior=row.get("numero_interior"),
        numero_exterior=row.get("numero_exterior"),
        colonia_id=int(row["colonia_id"]) if row.get("colonia_id") is not None else None,
        municipio_id=int(row["municipio_id"]) if row.get("municipio_id") is not None else None,
        estado_id=int(row["estado_id"]) if row.get("estado_id") is not None else None,
        codigo_postal=row.get("codigo_postal"),
        telefono=row.get("telefono"),
        correo_electronico=row.get("correo_electronico"),
        estatus_id=int(row.get("estatus_id", 1)),
        figura_cooperadora_id=int(row["figura_cooperadora_id"]) if row.get("figura_cooperadora_id") is not None else None,
        estado_nombre=row.get("estado_nombre"),
        municipio_nombre=row.get("municipio_nombre"),
        figura_cooperadora_nombre=row.get("figura_cooperadora_nombre"),
    )


_BASE_SELECT = """
    SELECT p.id, p.tipo_persona, p.rfc, p.razon_social,
           p.calle, p.numero_interior, p.numero_exterior,
           p.colonia_id, p.municipio_id, p.estado_id,
           p.codigo_postal, p.telefono, p.correo_electronico,
           p.estatus_id, p.figura_cooperadora_id,
           e.nombre AS estado_nombre,
           m.nombre AS municipio_nombre,
           fc.nombre AS figura_cooperadora_nombre
    FROM productores p
    LEFT JOIN estados e ON e.id = p.estado_id
    LEFT JOIN municipios m ON m.id = p.municipio_id
    LEFT JOIN figura_cooperadora fc ON fc.id = p.figura_cooperadora_id
"""


@router.get("/listado", response_model=ProductorListResponse)
def list_productores(
    q: str | None = Query(default=None),
    estatus_id: int | None = Query(default=None),
    figura_cooperadora_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> ProductorListResponse:
    _ensure_access(current_user)
    offset = (page - 1) * page_size
    search = f"%{q.strip()}%" if q and q.strip() else None

    where_estado = "p.estado_id = :estado_id" if not is_senasica(current_user) else "(:estado_id IS NULL OR p.estado_id = :estado_id OR p.estado_id IS NULL)"
    # Elevated (admin general / admin) opera bajo su estado activo, igual que estatal,
    # pero Senasica puede ver "todos" si su JWT no tiene estado fijado en consultas.
    # Por ahora todos filtran por estado_activo_id; el listado consolidado vendrá después.
    if not is_senasica(current_user):
        where_estado = "p.estado_id = :estado_id"

    where_clause = f"""
        WHERE {where_estado}
          AND (:estatus_id IS NULL OR p.estatus_id = :estatus_id)
          AND (:figura_id IS NULL OR p.figura_cooperadora_id = :figura_id)
          AND (
              :search IS NULL
              OR p.rfc LIKE :search
              OR p.razon_social LIKE :search
              OR p.correo_electronico LIKE :search
          )
    """

    params = {
        "estado_id": current_state_id,
        "estatus_id": estatus_id,
        "figura_id": figura_cooperadora_id,
        "search": search,
        "limit": page_size,
        "offset": offset,
    }

    total = int(
        db.execute(
            text(f"SELECT COUNT(*) FROM productores p {where_clause}"),
            params,
        ).scalar_one()
    )

    rows = db.execute(
        text(
            f"""
            {_BASE_SELECT}
            {where_clause}
            ORDER BY p.razon_social ASC, p.rfc ASC
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    ).mappings().all()

    return ProductorListResponse(
        items=[_to_response(dict(r)) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{productor_id}", response_model=ProductorResponse)
def get_productor(
    productor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> ProductorResponse:
    _ensure_access(current_user)
    row = db.execute(
        text(f"{_BASE_SELECT} WHERE p.id = :id"),
        {"id": productor_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Productor no encontrado")
    if not is_elevated(current_user) and row.get("estado_id") not in (current_state_id, None):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Productor no encontrado")
    return _to_response(dict(row))


@router.post("", response_model=ProductorResponse, status_code=status.HTTP_201_CREATED)
def create_productor(
    payload: ProductorCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> ProductorResponse:
    _ensure_access(current_user)
    _validate_payload(payload)
    target_estado_id = _scope_state_id(current_user, current_state_id, payload.estado_id)

    # rfc duplicado
    if db.execute(text("SELECT id FROM productores WHERE rfc = :rfc"), {"rfc": payload.rfc.upper()}).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe un productor con ese RFC")

    insert = db.execute(
        text(
            """
            INSERT INTO productores (
                tipo_persona, rfc, razon_social, calle, numero_interior, numero_exterior,
                colonia_id, municipio_id, estado_id, codigo_postal, telefono, correo_electronico,
                estatus_id, figura_cooperadora_id, created_by_user_id, updated_by_user_id,
                created_at, updated_at, created_date, edited_date
            ) VALUES (
                :tipo_persona, :rfc, :razon_social, :calle, :numero_interior, :numero_exterior,
                :colonia_id, :municipio_id, :estado_id, :codigo_postal, :telefono, :correo_electronico,
                :estatus_id, :figura_cooperadora_id, :user_id, :user_id,
                NOW(), NOW(), CURDATE(), CURDATE()
            )
            """
        ),
        {
            "tipo_persona": payload.tipo_persona.strip().lower(),
            "rfc": payload.rfc.upper(),
            "razon_social": payload.razon_social,
            "calle": payload.calle,
            "numero_interior": payload.numero_interior,
            "numero_exterior": payload.numero_exterior,
            "colonia_id": payload.colonia_id,
            "municipio_id": payload.municipio_id,
            "estado_id": target_estado_id,
            "codigo_postal": payload.codigo_postal,
            "telefono": payload.telefono,
            "correo_electronico": payload.correo_electronico,
            "estatus_id": payload.estatus_id,
            "figura_cooperadora_id": payload.figura_cooperadora_id,
            "user_id": current_user.id,
        },
    )
    new_id = int(insert.lastrowid)

    audit_catalog_change(
        db,
        catalogo="productores",
        registro_id=new_id,
        accion="CREATE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=None,
        datos_nuevos={**payload.model_dump(), "estado_id": target_estado_id},
        ip_origen=request.client.host if request.client else None,
    )
    audit_senasica(
        db,
        user=current_user,
        accion="create-productor",
        metodo="POST",
        path="/productores",
        estado_afectado_id=target_estado_id,
        recurso_tipo="productores",
        recurso_id=str(new_id),
        datos_request=payload.model_dump(),
        sql_query="INSERT INTO productores (tipo_persona, rfc, ..., estado_id) VALUES (...)",
        resultado_status=201,
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()

    row = db.execute(
        text(f"{_BASE_SELECT} WHERE p.id = :id"),
        {"id": new_id},
    ).mappings().first()
    return _to_response(dict(row))


@router.put("/{productor_id}", response_model=ProductorResponse)
def update_productor(
    productor_id: int,
    payload: ProductorUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> ProductorResponse:
    _ensure_access(current_user)
    _validate_payload(payload)

    previous = db.execute(
        text("SELECT * FROM productores WHERE id = :id"),
        {"id": productor_id},
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Productor no encontrado")
    if not is_elevated(current_user) and previous.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes editar productores fuera de tu estado activo")

    target_estado_id = _scope_state_id(current_user, current_state_id, payload.estado_id)

    if payload.rfc.upper() != previous["rfc"]:
        dup = db.execute(text("SELECT id FROM productores WHERE rfc = :rfc AND id <> :id"), {"rfc": payload.rfc.upper(), "id": productor_id}).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe otro productor con ese RFC")

    db.execute(
        text(
            """
            UPDATE productores SET
                tipo_persona = :tipo_persona,
                rfc = :rfc,
                razon_social = :razon_social,
                calle = :calle,
                numero_interior = :numero_interior,
                numero_exterior = :numero_exterior,
                colonia_id = :colonia_id,
                municipio_id = :municipio_id,
                estado_id = :estado_id,
                codigo_postal = :codigo_postal,
                telefono = :telefono,
                correo_electronico = :correo_electronico,
                estatus_id = :estatus_id,
                figura_cooperadora_id = :figura_cooperadora_id,
                updated_by_user_id = :user_id
            WHERE id = :id
            """
        ),
        {
            "tipo_persona": payload.tipo_persona.strip().lower(),
            "rfc": payload.rfc.upper(),
            "razon_social": payload.razon_social,
            "calle": payload.calle,
            "numero_interior": payload.numero_interior,
            "numero_exterior": payload.numero_exterior,
            "colonia_id": payload.colonia_id,
            "municipio_id": payload.municipio_id,
            "estado_id": target_estado_id,
            "codigo_postal": payload.codigo_postal,
            "telefono": payload.telefono,
            "correo_electronico": payload.correo_electronico,
            "estatus_id": payload.estatus_id,
            "figura_cooperadora_id": payload.figura_cooperadora_id,
            "user_id": current_user.id,
            "id": productor_id,
        },
    )

    audit_catalog_change(
        db,
        catalogo="productores",
        registro_id=productor_id,
        accion="UPDATE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=dict(previous),
        datos_nuevos={**payload.model_dump(), "estado_id": target_estado_id},
        ip_origen=request.client.host if request.client else None,
    )
    audit_senasica(
        db,
        user=current_user,
        accion="update-productor",
        metodo="PUT",
        path=f"/productores/{productor_id}",
        estado_afectado_id=target_estado_id,
        recurso_tipo="productores",
        recurso_id=str(productor_id),
        datos_request=payload.model_dump(),
        sql_query="UPDATE productores SET ... WHERE id = :id",
        resultado_status=200,
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()

    row = db.execute(
        text(f"{_BASE_SELECT} WHERE p.id = :id"),
        {"id": productor_id},
    ).mappings().first()
    return _to_response(dict(row))


@router.delete("/{productor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_productor(
    productor_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> None:
    _ensure_access(current_user)
    previous = db.execute(
        text("SELECT * FROM productores WHERE id = :id"),
        {"id": productor_id},
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Productor no encontrado")
    if not is_elevated(current_user) and previous.get("estado_id") != current_state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes inactivar productores fuera de tu estado activo")

    db.execute(
        text("UPDATE productores SET estatus_id = 2, updated_by_user_id = :u WHERE id = :id"),
        {"u": current_user.id, "id": productor_id},
    )

    audit_catalog_change(
        db,
        catalogo="productores",
        registro_id=productor_id,
        accion="DELETE",
        usuario_id=current_user.id,
        estado_activo_id=current_state_id,
        datos_anteriores=dict(previous),
        datos_nuevos={"estatus_id": 2},
        ip_origen=request.client.host if request.client else None,
    )
    audit_senasica(
        db,
        user=current_user,
        accion="inactivate-productor",
        metodo="DELETE",
        path=f"/productores/{productor_id}",
        estado_afectado_id=int(previous.get("estado_id")) if previous.get("estado_id") is not None else None,
        recurso_tipo="productores",
        recurso_id=str(productor_id),
        datos_request={"estatus_id": 2},
        sql_query="UPDATE productores SET estatus_id = 2 WHERE id = :id",
        resultado_status=204,
        ip_origen=request.client.host if request.client else None,
    )
    db.commit()
