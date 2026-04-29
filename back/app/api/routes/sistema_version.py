"""Sistema de versionado V3.

Tabla de una sola fila (id=1) con dos triples de version:
  staging_major.staging_minor.staging_patch
  produccion_major.produccion_minor.produccion_patch

Expuesto en el sidebar inferior. GET es publico (no requiere auth)
para que el frontend pueda mostrarlo incluso antes del login. PATCH
requiere rol admin para actualizar tras cada deploy exitoso.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models import User

router = APIRouter()

ADMIN_ROLES = {"admin", "administrador general", "administrador senasica"}


def _fmt(major: int | None, minor: int | None, patch: int | None) -> str | None:
    if major is None or minor is None or patch is None:
        return None
    return f"v{major}.{minor:02d}.{patch:03d}"


def _read_row(db: Session) -> dict[str, object]:
    row = db.execute(text(
        "SELECT staging_major, staging_minor, staging_patch, "
        "produccion_major, produccion_minor, produccion_patch, updated_at "
        "FROM sistema_version WHERE id = 1"
    )).mappings().first()
    if not row:
        return {"staging": None, "produccion": None}
    staging = {
        "major": int(row["staging_major"]),
        "minor": int(row["staging_minor"]),
        "patch": int(row["staging_patch"]),
        "formatted": _fmt(int(row["staging_major"]), int(row["staging_minor"]), int(row["staging_patch"])),
    }
    p_major = row.get("produccion_major")
    produccion: dict[str, object] | None = None
    if p_major is not None:
        produccion = {
            "major": int(p_major),
            "minor": int(row["produccion_minor"]),
            "patch": int(row["produccion_patch"]),
            "formatted": _fmt(int(p_major), int(row["produccion_minor"]), int(row["produccion_patch"])),
        }
    return {
        "staging": staging,
        "produccion": produccion,
        "updated_at": row.get("updated_at").isoformat() if row.get("updated_at") else None,
    }


@router.get("")
def get_sistema_version(db: Session = Depends(get_db)) -> dict[str, object]:
    return _read_row(db)


class VersionUpdatePayload(BaseModel):
    env: Literal["staging", "produccion"]
    major: int | None = Field(default=None, ge=0)
    minor: int | None = Field(default=None, ge=0)
    patch: int = Field(ge=0)


@router.patch("")
def update_sistema_version(
    payload: VersionUpdatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, object]:
    if (current_user.rol or "").strip().lower() not in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo administradores")

    if payload.env == "staging":
        sets = ["staging_patch = :patch"]
        params: dict[str, object] = {"patch": payload.patch}
        if payload.major is not None:
            sets.append("staging_major = :major"); params["major"] = payload.major
        if payload.minor is not None:
            sets.append("staging_minor = :minor"); params["minor"] = payload.minor
    else:
        sets = ["produccion_patch = :patch"]
        params = {"patch": payload.patch}
        if payload.major is not None:
            sets.append("produccion_major = :major"); params["major"] = payload.major
        if payload.minor is not None:
            sets.append("produccion_minor = :minor"); params["minor"] = payload.minor

    db.execute(text(f"UPDATE sistema_version SET {', '.join(sets)}, updated_at = NOW() WHERE id = 1"), params)
    db.commit()
    return _read_row(db)
