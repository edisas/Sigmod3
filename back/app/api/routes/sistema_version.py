"""Sistema de versionado V3.

Tabla de una sola fila (id=1) con dos triples de version:
  staging_major.staging_minor.staging_patch
  produccion_major.produccion_minor.produccion_patch

Expuesto en el sidebar inferior. Endpoint publico (no requiere auth)
para que el frontend pueda mostrarlo incluso antes del login.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db

router = APIRouter()


def _fmt(major: int | None, minor: int | None, patch: int | None) -> str | None:
    if major is None or minor is None or patch is None:
        return None
    return f"v{major}.{minor:02d}.{patch:03d}"


@router.get("")
def get_sistema_version(db: Session = Depends(get_db)) -> dict[str, object]:
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
