"""
Bitácora centralizada de escrituras a BDs legacy (SIGMOD 2).

Cada operación de corrección que V3 aplica sobre alguna de las 8 BDs legacy se
persiste en la tabla `legacy_audit_log` de V3 con diff completo (JSON
antes/después), operador, tabla afectada y número de registros.

Contratos:
- El registro del log NO participa en la transacción legacy. Primero commiteas
  legacy; si commiteó con éxito, llamas `record_legacy_write`. Si el log falla,
  se loggea pero no se revierte la escritura legacy (la auditoría es best-effort
  informativa; nunca debe bloquear una corrección ya confirmada).
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Mapping

from sqlalchemy import text

from app.db import SessionLocal

log = logging.getLogger(__name__)


def _json_default(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


def _to_json(payload: Mapping[str, Any] | None) -> str | None:
    if payload is None:
        return None
    return json.dumps(dict(payload), default=_json_default, ensure_ascii=False)


def record_legacy_write(
    *,
    estado_clave: str,
    database_name: str,
    usuario_legacy_clave: int | None,
    usuario_legacy_nick: str | None,
    tabla: str,
    operacion: str,
    registro_pk: str | int,
    campos_antes: Mapping[str, Any] | None,
    campos_despues: Mapping[str, Any] | None,
    registros_afectados: int = 1,
) -> None:
    """Persiste una entrada en `legacy_audit_log`. Nunca lanza: si falla, sólo loggea."""
    try:
        with SessionLocal() as db:
            db.execute(
                text(
                    """
                    INSERT INTO legacy_audit_log
                        (estado_clave, database_name, usuario_legacy_clave, usuario_legacy_nick,
                         tabla, operacion, registro_pk, campos_antes, campos_despues, registros_afectados)
                    VALUES
                        (:estado_clave, :database_name, :usuario_legacy_clave, :usuario_legacy_nick,
                         :tabla, :operacion, :registro_pk, :campos_antes, :campos_despues, :registros_afectados)
                    """
                ),
                {
                    "estado_clave": estado_clave.upper()[:3],
                    "database_name": database_name,
                    "usuario_legacy_clave": usuario_legacy_clave,
                    "usuario_legacy_nick": usuario_legacy_nick,
                    "tabla": tabla,
                    "operacion": operacion.upper(),
                    "registro_pk": str(registro_pk),
                    "campos_antes": _to_json(campos_antes),
                    "campos_despues": _to_json(campos_despues),
                    "registros_afectados": int(registros_afectados),
                },
            )
            db.commit()
    except Exception:
        log.exception("No se pudo registrar escritura legacy en legacy_audit_log")
