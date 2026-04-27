"""Helpers para el rol Administrador Senasica.

Centraliza:
- Detección del rol.
- Función de auditoría rica (acción + usuario afectado + IP + SQL opcional).
- Lista de roles con privilegios elevados (incluyendo Senasica).
"""

from __future__ import annotations

import json
from typing import Any

from app.models import User
from sqlalchemy import text
from sqlalchemy.orm import Session

SENASICA_ROLE = "administrador senasica"

# Roles que pueden modificar datos en general (write-level access).
# Senasica tiene los mismos privilegios que admin general pero cross-state.
ELEVATED_ROLES = {"admin", "administrador general", "administrador senasica"}


def is_senasica(user: User) -> bool:
    return (user.rol or "").strip().lower() == SENASICA_ROLE


def is_elevated(user: User) -> bool:
    return (user.rol or "").strip().lower() in ELEVATED_ROLES


def audit_senasica(
    db: Session,
    *,
    user: User,
    accion: str,
    metodo: str | None = None,
    path: str | None = None,
    usuario_afectado_id: int | None = None,
    estado_afectado_id: int | None = None,
    recurso_tipo: str | None = None,
    recurso_id: str | None = None,
    datos_request: dict[str, Any] | None = None,
    sql_query: str | None = None,
    resultado_status: int | None = None,
    ip_origen: str | None = None,
    observaciones: str | None = None,
) -> None:
    """Registra una acción del rol Senasica en `senasica_audit_log`.

    Solo registra si el usuario tiene el rol Administrador Senasica. Para otros
    roles es no-op (la auditoría sigue ocurriendo en sus tablas correspondientes:
    catalogos_cambios_log para catálogos, legacy_audit_log para legacy, etc.).

    No hace commit — el caller es responsable de manejar la transacción.
    """
    if not is_senasica(user):
        return
    db.execute(
        text(
            """
            INSERT INTO senasica_audit_log (
                usuario_id, ip_origen, metodo, path, accion,
                usuario_afectado_id, estado_afectado_id,
                recurso_tipo, recurso_id, datos_request, sql_query,
                resultado_status, observaciones
            ) VALUES (
                :usuario_id, :ip_origen, :metodo, :path, :accion,
                :usuario_afectado_id, :estado_afectado_id,
                :recurso_tipo, :recurso_id, :datos_request, :sql_query,
                :resultado_status, :observaciones
            )
            """
        ),
        {
            "usuario_id": user.id,
            "ip_origen": ip_origen,
            "metodo": metodo,
            "path": path,
            "accion": accion,
            "usuario_afectado_id": usuario_afectado_id,
            "estado_afectado_id": estado_afectado_id,
            "recurso_tipo": recurso_tipo,
            "recurso_id": recurso_id,
            "datos_request": json.dumps(datos_request, ensure_ascii=False) if datos_request else None,
            "sql_query": sql_query,
            "resultado_status": resultado_status,
            "observaciones": observaciones,
        },
    )
