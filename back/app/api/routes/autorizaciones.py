from __future__ import annotations

import hashlib
import json
import secrets
from datetime import date, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models import User
from app.schemas import (
    AutorizacionFiguraCatalogItem,
    AutorizacionFiguraCatalogosResponse,
    AutorizacionFiguraEstadoItem,
    AutorizacionFiguraListItem,
    AutorizacionFiguraResponse,
    AutorizacionFiguraRevocarResponse,
)

router = APIRouter()

SUPER_ADMIN_ROLES = {"admin", "super admin", "super administrador", "administrador general"}
ADMIN_GENERAL_ROLES = {"admin", "administrador general"}

BASE_DIR = Path(__file__).resolve().parents[3]
STORAGE_ROOT = BASE_DIR / "storage"
AUTH_OFICIOS_DIR = STORAGE_ROOT / "figura_cooperadora_autorizaciones"
AUTH_REVOCACIONES_DIR = STORAGE_ROOT / "figura_cooperadora_revocaciones"


def _ensure_storage() -> None:
    AUTH_OFICIOS_DIR.mkdir(parents=True, exist_ok=True)
    AUTH_REVOCACIONES_DIR.mkdir(parents=True, exist_ok=True)


def _ensure_super_admin(current_user: User) -> None:
    role = (current_user.rol or "").strip().lower()
    if role not in SUPER_ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo usuarios Super Administradores pueden autorizar figuras cooperadoras.",
        )


def _ensure_admin_general(current_user: User) -> None:
    role = (current_user.rol or "").strip().lower()
    if role not in ADMIN_GENERAL_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo usuarios Administrador General pueden revocar autorizaciones.",
        )


def _table_has_column(db: Session, table_name: str, column_name: str) -> bool:
    value = db.execute(
        text(
            """
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = :table_name
              AND column_name = :column_name
            """
        ),
        {"table_name": table_name, "column_name": column_name},
    ).scalar_one()
    return value > 0


def _generate_clave_autorizacion(db: Session) -> str:
    while True:
        clave = f"AUT-{secrets.token_hex(4).upper()}"
        exists = db.execute(
            text(
                """
                SELECT 1
                FROM figura_cooperadora_detalle_autorizaciones
                WHERE clave_autorizacion = :clave
                LIMIT 1
                """
            ),
            {"clave": clave},
        ).first()
        if not exists:
            return clave


def _save_upload(upload: UploadFile, target_dir: Path, prefix: str, max_mb: int = 20) -> tuple[Path, dict[str, Any]]:
    content = upload.file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="El archivo esta vacio.")
    if len(content) > max_mb * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=f"El archivo excede {max_mb}MB.")

    ext = Path(upload.filename or "archivo.bin").suffix.lower()[:10] or ".bin"
    file_name = f"{prefix}_{uuid4().hex}{ext}"
    file_path = target_dir / file_name
    file_path.write_bytes(content)

    metadata = {
        "nombre_original": upload.filename or file_name,
        "content_type": upload.content_type or "application/octet-stream",
        "size_bytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "storage_relative_path": str(file_path.relative_to(STORAGE_ROOT)),
    }
    return file_path, metadata


def _validate_estado_ids(db: Session, estado_ids: list[int]) -> list[int]:
    if not estado_ids:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Selecciona al menos un estado.")

    rows = db.execute(
        text(
            """
            SELECT id
            FROM estados
            WHERE estatus_id = 1
              AND mostrar_en_registro = 1
              AND id IN :estado_ids
            """
        ).bindparams(bindparam("estado_ids", expanding=True)),
        {"estado_ids": tuple(estado_ids)},
    ).fetchall()
    valid_ids = sorted({int(r.id) for r in rows})
    if len(valid_ids) != len(set(estado_ids)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uno o mas estados no son validos para autorizacion (estatus_id=1, mostrar_en_registro=1).",
        )
    return valid_ids


@router.get("/figura-cooperadora/catalogos", response_model=AutorizacionFiguraCatalogosResponse)
def catalogos_autorizacion_figura(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AutorizacionFiguraCatalogosResponse:
    _ensure_super_admin(current_user)

    figuras = db.execute(
        text(
            """
            SELECT id, nombre
            FROM figura_cooperadora
            WHERE estatus_id = 1
            ORDER BY nombre ASC
            """
        )
    ).mappings().all()

    temporadas = db.execute(
        text(
            """
            SELECT id, nombre
            FROM temporadas
            WHERE estatus_id = 1
            ORDER BY nombre ASC
            """
        )
    ).mappings().all()

    funcionarios = db.execute(
        text(
            """
            SELECT id, nombre
            FROM funcionarios
            WHERE estatus_id = 1
            ORDER BY nombre ASC
            """
        )
    ).mappings().all()

    estados = db.execute(
        text(
            """
            SELECT id, clave, nombre
            FROM estados
            WHERE estatus_id = 1
              AND mostrar_en_registro = 1
            ORDER BY nombre ASC
            """
        )
    ).mappings().all()

    return AutorizacionFiguraCatalogosResponse(
        figuras=[AutorizacionFiguraCatalogItem(id=int(r["id"]), nombre=str(r["nombre"])) for r in figuras],
        temporadas=[AutorizacionFiguraCatalogItem(id=int(r["id"]), nombre=str(r["nombre"])) for r in temporadas],
        funcionarios=[AutorizacionFiguraCatalogItem(id=int(r["id"]), nombre=str(r["nombre"])) for r in funcionarios],
        estados=[
            AutorizacionFiguraEstadoItem(id=int(r["id"]), clave=str(r["clave"]), nombre=str(r["nombre"])) for r in estados
        ],
    )


@router.get("/figura-cooperadora/listado", response_model=list[AutorizacionFiguraListItem])
def listado_autorizaciones_figura(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AutorizacionFiguraListItem]:
    _ensure_super_admin(current_user)

    has_observaciones = _table_has_column(db, "figura_cooperadora_detalle_autorizaciones", "observaciones")
    has_oficio_nombre = _table_has_column(db, "figura_cooperadora_detalle_autorizaciones", "oficio_nombre_original")

    observaciones_select = "a.observaciones" if has_observaciones else "NULL"
    oficio_nombre_select = "a.oficio_nombre_original" if has_oficio_nombre else "NULL"

    rows = db.execute(
        text(
            f"""
            SELECT
              a.id,
              a.figura_cooperadora_id,
              f.nombre AS figura_cooperadora_nombre,
              a.temporada_id,
              t.nombre AS temporada_nombre,
              a.fechaInicio AS fecha_inicio,
              a.FechaFin AS fecha_fin,
              a.funcionario_autorizo_id,
              fu.nombre AS funcionario_autorizo_nombre,
              a.clave_autorizacion,
              a.estatus_id,
              {observaciones_select} AS observaciones,
              {oficio_nombre_select} AS oficio_nombre_original,
              a.created_at,
              t.estatus_id AS temporada_estatus_id
            FROM figura_cooperadora_detalle_autorizaciones a
            INNER JOIN figura_cooperadora f ON f.id = a.figura_cooperadora_id
            INNER JOIN temporadas t ON t.id = a.temporada_id
            INNER JOIN funcionarios fu ON fu.id = a.funcionario_autorizo_id
            WHERE a.estatus_id IN (1, 2)
            ORDER BY t.id DESC, a.id DESC
            """
        )
    ).mappings().all()

    output: list[AutorizacionFiguraListItem] = []
    for row in rows:
        output.append(
            AutorizacionFiguraListItem(
                id=int(row["id"]),
                figura_cooperadora_id=int(row["figura_cooperadora_id"]),
                figura_cooperadora_nombre=str(row["figura_cooperadora_nombre"]),
                temporada_id=int(row["temporada_id"]),
                temporada_nombre=str(row["temporada_nombre"]),
                fecha_inicio=row["fecha_inicio"],
                fecha_fin=row["fecha_fin"],
                funcionario_autorizo_id=int(row["funcionario_autorizo_id"]),
                funcionario_autorizo_nombre=str(row["funcionario_autorizo_nombre"]),
                clave_autorizacion=str(row["clave_autorizacion"]) if row["clave_autorizacion"] else None,
                estatus_id=int(row["estatus_id"]),
                observaciones=str(row["observaciones"]) if row["observaciones"] else None,
                oficio_nombre_original=str(row["oficio_nombre_original"]) if row["oficio_nombre_original"] else None,
                created_at=row["created_at"],
                puede_revocar=bool(int(row["estatus_id"]) == 1 and int(row["temporada_estatus_id"]) == 1),
            )
        )
    return output


@router.post("/figura-cooperadora", response_model=AutorizacionFiguraResponse, status_code=status.HTTP_201_CREATED)
async def crear_autorizacion_figura(
    figura_cooperadora_id: int = Form(...),
    temporada_id: int = Form(...),
    fecha_inicio: date = Form(...),
    fecha_fin: date = Form(...),
    funcionario_autorizo_id: int = Form(...),
    estado_ids: str = Form(..., description="JSON array, ej. [7,12,25]"),
    observaciones: str | None = Form(default=None),
    oficio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AutorizacionFiguraResponse:
    _ensure_super_admin(current_user)
    _ensure_storage()

    if fecha_fin < fecha_inicio:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="fecha_fin no puede ser menor a fecha_inicio.")

    try:
        estado_ids_raw = json.loads(estado_ids)
        if not isinstance(estado_ids_raw, list):
            raise ValueError("estado_ids debe ser arreglo")
        estado_ids_list = [int(x) for x in estado_ids_raw]
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="estado_ids invalido.") from exc

    estado_ids_valid = _validate_estado_ids(db, estado_ids_list)

    figura_row = db.execute(
        text("SELECT id, nombre FROM figura_cooperadora WHERE id = :id AND estatus_id = 1"),
        {"id": figura_cooperadora_id},
    ).mappings().first()
    if not figura_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Figura cooperadora no encontrada o inactiva.")

    temporada_row = db.execute(
        text("SELECT id, nombre FROM temporadas WHERE id = :id AND estatus_id = 1"),
        {"id": temporada_id},
    ).mappings().first()
    if not temporada_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Temporada no encontrada o inactiva.")

    funcionario_row = db.execute(
        text("SELECT id, nombre FROM funcionarios WHERE id = :id AND estatus_id = 1"),
        {"id": funcionario_autorizo_id},
    ).mappings().first()
    if not funcionario_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario autorizador no encontrado o inactivo.")

    existing_active = db.execute(
        text(
            """
            SELECT id
            FROM figura_cooperadora_detalle_autorizaciones
            WHERE figura_cooperadora_id = :figura_cooperadora_id
              AND temporada_id = :temporada_id
              AND estatus_id = 1
            LIMIT 1
            """
        ),
        {"figura_cooperadora_id": figura_cooperadora_id, "temporada_id": temporada_id},
    ).first()
    if existing_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una autorizacion vigente para esta figura y temporada. Debe revocarse antes de generar una nueva.",
        )

    has_clave = _table_has_column(db, "figura_cooperadora_detalle_autorizaciones", "clave_autorizacion")
    has_oficio_path = _table_has_column(db, "figura_cooperadora_detalle_autorizaciones", "oficio_path")
    has_oficio_nombre = _table_has_column(db, "figura_cooperadora_detalle_autorizaciones", "oficio_nombre_original")
    has_observaciones = _table_has_column(db, "figura_cooperadora_detalle_autorizaciones", "observaciones")

    clave_autorizacion = _generate_clave_autorizacion(db) if has_clave else f"AUT-{secrets.token_hex(4).upper()}"
    oficio_path_abs, oficio_metadata = _save_upload(oficio, AUTH_OFICIOS_DIR, clave_autorizacion)
    oficio_rel_path = str(oficio_path_abs.relative_to(STORAGE_ROOT))

    observaciones_normalized = (observaciones or "").strip() or None

    detalles = {
        "tipo": "autorizacion_figura_cooperadora",
        "version": 1,
        "autorizacion": {
            "clave_autorizacion": clave_autorizacion,
            "figura_cooperadora_id": figura_cooperadora_id,
            "figura_cooperadora_nombre": str(figura_row["nombre"]),
            "temporada_id": temporada_id,
            "temporada_nombre": str(temporada_row["nombre"]),
            "fecha_inicio": fecha_inicio.isoformat(),
            "fecha_fin": fecha_fin.isoformat(),
            "funcionario_autorizo_id": funcionario_autorizo_id,
            "funcionario_autorizo_nombre": str(funcionario_row["nombre"]),
            "estados_ids": estado_ids_valid,
            "observaciones": observaciones_normalized,
        },
        "archivo_oficio_autorizacion": {
            **oficio_metadata,
            "url": f"/api/v1/autorizaciones/figura-cooperadora/oficio/{oficio_path_abs.name}",
        },
        "auditoria": {
            "creado_por_usuario_id": current_user.id,
            "creado_at": datetime.utcnow().isoformat() + "Z",
        },
    }

    now = datetime.now()
    today = now.date()

    columns = [
        "figura_cooperadora_id",
        "temporada_id",
        "fechaInicio",
        "FechaFin",
        "funcionario_autorizo_id",
        "json_detalles_autorizacion",
        "estatus_id",
        "created_at",
        "edited_at",
        "created_date",
        "edited_date",
    ]
    values = [
        ":figura_cooperadora_id",
        ":temporada_id",
        ":fecha_inicio",
        ":fecha_fin",
        ":funcionario_autorizo_id",
        ":json_detalles_autorizacion",
        "1",
        ":created_at",
        ":edited_at",
        ":created_date",
        ":edited_date",
    ]
    params: dict[str, Any] = {
        "figura_cooperadora_id": figura_cooperadora_id,
        "temporada_id": temporada_id,
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin,
        "funcionario_autorizo_id": funcionario_autorizo_id,
        "json_detalles_autorizacion": json.dumps(detalles, ensure_ascii=False),
        "created_at": now,
        "edited_at": now,
        "created_date": today,
        "edited_date": today,
    }
    if has_clave:
        columns.append("clave_autorizacion")
        values.append(":clave_autorizacion")
        params["clave_autorizacion"] = clave_autorizacion
    if has_oficio_path:
        columns.append("oficio_path")
        values.append(":oficio_path")
        params["oficio_path"] = oficio_rel_path
    if has_oficio_nombre:
        columns.append("oficio_nombre_original")
        values.append(":oficio_nombre_original")
        params["oficio_nombre_original"] = oficio_metadata["nombre_original"]
    if has_observaciones:
        columns.append("observaciones")
        values.append(":observaciones")
        params["observaciones"] = observaciones_normalized

    result = db.execute(
        text(
            f"""
            INSERT INTO figura_cooperadora_detalle_autorizaciones ({", ".join(columns)})
            VALUES ({", ".join(values)})
            """
        ),
        params,
    )
    autorizacion_id = int(result.lastrowid)

    for estado_id in estado_ids_valid:
        db.execute(
            text(
                """
                INSERT INTO figura_cooperadora_detalle_estados (
                  figura_cooperadora_id, estado_id, temporada_id, estatus_id,
                  created_at, edited_at, created_date, edited_date
                )
                VALUES (
                  :figura_cooperadora_id, :estado_id, :temporada_id, 1,
                  :created_at, :edited_at, :created_date, :edited_date
                )
                ON DUPLICATE KEY UPDATE
                  estatus_id = VALUES(estatus_id),
                  edited_at = VALUES(edited_at),
                  edited_date = VALUES(edited_date)
                """
            ),
            {
                "figura_cooperadora_id": figura_cooperadora_id,
                "estado_id": estado_id,
                "temporada_id": temporada_id,
                "created_at": now,
                "edited_at": now,
                "created_date": today,
                "edited_date": today,
            },
        )

    db.commit()

    return AutorizacionFiguraResponse(
        id=autorizacion_id,
        figura_cooperadora_id=figura_cooperadora_id,
        temporada_id=temporada_id,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        funcionario_autorizo_id=funcionario_autorizo_id,
        clave_autorizacion=clave_autorizacion,
        estados_ids=estado_ids_valid,
        observaciones=observaciones_normalized,
        oficio_nombre_original=oficio_metadata["nombre_original"],
        oficio_path=oficio_rel_path,
        json_detalles_autorizacion=detalles,
    )


@router.post("/figura-cooperadora/{autorizacion_id}/revocar", response_model=AutorizacionFiguraRevocarResponse)
async def revocar_autorizacion_figura(
    autorizacion_id: int,
    motivo_revocacion: str = Form(...),
    solicitante_nombre: str = Form(...),
    solicitante_cargo: str = Form(...),
    oficio_revocacion: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AutorizacionFiguraRevocarResponse:
    _ensure_admin_general(current_user)
    _ensure_storage()

    motivo_norm = motivo_revocacion.strip()
    solicitante_nombre_norm = solicitante_nombre.strip()
    solicitante_cargo_norm = solicitante_cargo.strip()

    if not motivo_norm or not solicitante_nombre_norm or not solicitante_cargo_norm:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Completa motivo, nombre y cargo del solicitante.")

    row = db.execute(
        text(
            """
            SELECT a.id, a.figura_cooperadora_id, a.temporada_id, a.estatus_id, t.estatus_id AS temporada_estatus_id
            FROM figura_cooperadora_detalle_autorizaciones a
            INNER JOIN temporadas t ON t.id = a.temporada_id
            WHERE a.id = :id
            LIMIT 1
            """
        ),
        {"id": autorizacion_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Autorizacion no encontrada.")

    if int(row["estatus_id"]) != 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La autorizacion no esta vigente y no puede revocarse.")

    if int(row["temporada_estatus_id"]) != 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Solo se pueden revocar autorizaciones de temporadas activas.",
        )

    rev_file_path, rev_meta = _save_upload(oficio_revocacion, AUTH_REVOCACIONES_DIR, f"REV-{autorizacion_id}")

    has_revocada_at = _table_has_column(db, "figura_cooperadora_detalle_autorizaciones", "revocada_at")
    has_revocacion_motivo = _table_has_column(db, "figura_cooperadora_detalle_autorizaciones", "revocacion_motivo")
    has_rev_solicitante_nombre = _table_has_column(db, "figura_cooperadora_detalle_autorizaciones", "revocacion_solicitante_nombre")
    has_rev_solicitante_cargo = _table_has_column(db, "figura_cooperadora_detalle_autorizaciones", "revocacion_solicitante_cargo")
    has_rev_oficio_path = _table_has_column(db, "figura_cooperadora_detalle_autorizaciones", "revocacion_oficio_path")
    has_rev_oficio_nombre = _table_has_column(db, "figura_cooperadora_detalle_autorizaciones", "revocacion_oficio_nombre_original")
    has_revocada_por = _table_has_column(db, "figura_cooperadora_detalle_autorizaciones", "revocada_por_usuario_id")

    now = datetime.now()
    today = now.date()

    detalles_raw = db.execute(
        text("SELECT json_detalles_autorizacion FROM figura_cooperadora_detalle_autorizaciones WHERE id = :id"),
        {"id": autorizacion_id},
    ).scalar_one_or_none()
    try:
        detalles_json = json.loads(detalles_raw) if detalles_raw else {}
    except json.JSONDecodeError:
        detalles_json = {}
    detalles_json["revocacion"] = {
        "motivo": motivo_norm,
        "solicitante_nombre": solicitante_nombre_norm,
        "solicitante_cargo": solicitante_cargo_norm,
        "oficio": {
            **rev_meta,
            "url": f"/api/v1/autorizaciones/figura-cooperadora/revocacion/oficio/{rev_file_path.name}",
        },
        "revocada_at": now.isoformat(),
        "revocada_por_usuario_id": current_user.id,
    }

    set_parts = [
        "estatus_id = 2",
        "json_detalles_autorizacion = :json_detalles_autorizacion",
        "edited_at = :edited_at",
        "edited_date = :edited_date",
    ]
    params: dict[str, Any] = {
        "id": autorizacion_id,
        "json_detalles_autorizacion": json.dumps(detalles_json, ensure_ascii=False),
        "edited_at": now,
        "edited_date": today,
    }

    if has_revocada_at:
        set_parts.append("revocada_at = :revocada_at")
        params["revocada_at"] = now
    if has_revocacion_motivo:
        set_parts.append("revocacion_motivo = :revocacion_motivo")
        params["revocacion_motivo"] = motivo_norm
    if has_rev_solicitante_nombre:
        set_parts.append("revocacion_solicitante_nombre = :revocacion_solicitante_nombre")
        params["revocacion_solicitante_nombre"] = solicitante_nombre_norm
    if has_rev_solicitante_cargo:
        set_parts.append("revocacion_solicitante_cargo = :revocacion_solicitante_cargo")
        params["revocacion_solicitante_cargo"] = solicitante_cargo_norm
    if has_rev_oficio_path:
        set_parts.append("revocacion_oficio_path = :revocacion_oficio_path")
        params["revocacion_oficio_path"] = str(rev_file_path.relative_to(STORAGE_ROOT))
    if has_rev_oficio_nombre:
        set_parts.append("revocacion_oficio_nombre_original = :revocacion_oficio_nombre_original")
        params["revocacion_oficio_nombre_original"] = rev_meta["nombre_original"]
    if has_revocada_por:
        set_parts.append("revocada_por_usuario_id = :revocada_por_usuario_id")
        params["revocada_por_usuario_id"] = current_user.id

    db.execute(
        text(f"UPDATE figura_cooperadora_detalle_autorizaciones SET {', '.join(set_parts)} WHERE id = :id"),
        params,
    )

    db.execute(
        text(
            """
            UPDATE figura_cooperadora_detalle_estados
            SET estatus_id = 2,
                edited_at = :edited_at,
                edited_date = :edited_date
            WHERE figura_cooperadora_id = :figura_cooperadora_id
              AND temporada_id = :temporada_id
              AND estatus_id = 1
            """
        ),
        {
            "figura_cooperadora_id": int(row["figura_cooperadora_id"]),
            "temporada_id": int(row["temporada_id"]),
            "edited_at": now,
            "edited_date": today,
        },
    )

    db.commit()

    return AutorizacionFiguraRevocarResponse(
        autorizacion_id=autorizacion_id,
        revocada_at=now,
        revocada_por_usuario_id=current_user.id,
        revocacion_oficio_path=str(rev_file_path.relative_to(STORAGE_ROOT)),
    )


@router.get("/figura-cooperadora/oficio/{file_name}")
def descargar_oficio_autorizacion(
    file_name: str,
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    _ensure_super_admin(current_user)
    file_path = AUTH_OFICIOS_DIR / file_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")
    return FileResponse(path=str(file_path), filename=file_path.name)


@router.get("/figura-cooperadora/revocacion/oficio/{file_name}")
def descargar_oficio_revocacion(
    file_name: str,
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    _ensure_super_admin(current_user)
    file_path = AUTH_REVOCACIONES_DIR / file_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")
    return FileResponse(path=str(file_path), filename=file_path.name)
