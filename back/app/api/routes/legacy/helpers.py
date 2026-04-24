"""
Helpers compartidos del paquete `app.api.routes.legacy`.

Extraídos de correcciones.py, correcciones_muestreo.py y catalogos.py — antes
estaban duplicados en cada archivo. Todos son utilidades puras de lectura
(no escriben a la BD).
"""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session


def resolver_legacy_user(session: Session, claims: dict) -> tuple[int | None, str | None]:
    """Lee `usuarios.{clave, nick}` de la BD legacy para enriquecer auditoría.

    Devuelve `(clave, nick)` del usuario loggeado según el JWT legacy (campo
    `sub`). Si la clave no existe en `usuarios`, regresa `(clave, None)`. Si el
    JWT no tiene `sub` válido, regresa `(None, None)`.
    """
    try:
        clave = int(claims.get("sub", 0))
    except (TypeError, ValueError):
        return None, None
    row = session.execute(
        text("SELECT clave, nick FROM usuarios WHERE clave = :c"),
        {"c": clave},
    ).mappings().first()
    return (int(row["clave"]), str(row["nick"] or "")) if row else (clave, None)


def estado_clave_y_db(claims: dict) -> tuple[str, str]:
    """Resuelve `('SIN', 'sinaloa_2026')` desde el JWT legacy para auditoría.

    Si la clave de legacy_db no existe en el catálogo V3, `database_name`
    regresa vacío — pero nunca lanza.
    """
    # import local para evitar ciclo: app.core.legacy_db → app.db → ...
    from app.core.legacy_db import resolve_database_name

    clave = str(claims.get("legacy_db", "")).upper()[:3]
    try:
        db_name = resolve_database_name(clave)
    except Exception:
        db_name = ""
    return clave, db_name


def to_int_or_none(value) -> int | None:
    """Convierte a int tolerando None, strings con espacios y valores inválidos."""
    if value is None:
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def fechas_semana(session: Session, no_semana_folio: int) -> tuple[date | None, date | None]:
    """Retorna `(fecha_inicio, fecha_final)` de una semana por su folio.

    Importante: `no_semana_folio` es el FOLIO en la tabla `semanas`, NO el
    número 1–52 del año. Si el folio no existe regresa `(None, None)`.
    """
    row = session.execute(
        text("SELECT fecha_inicio, fecha_final FROM semanas WHERE folio = :f"),
        {"f": no_semana_folio},
    ).mappings().first()
    if not row:
        return None, None
    return row["fecha_inicio"], row["fecha_final"]


def validar_fecha_en_semana(
    fecha_muestreo: date,
    fecha_inicio: date | None,
    fecha_final: date | None,
    no_semana: int,
) -> None:
    """Valida que `fecha_muestreo` caiga dentro de la semana de la TMIMF.

    Si `(fecha_inicio, fecha_final)` es `(None, None)` — por ejemplo cuando el
    folio de la semana no se pudo resolver — la validación NO bloquea (decisión
    defensiva: preferir no bloquear correcciones a perder data por un fallo
    del catálogo). En cualquier otro caso, una fecha fuera del rango lanza
    `HTTPException(400)` con mensaje descriptivo para mostrar al usuario.
    """
    if fecha_inicio is None or fecha_final is None:
        return
    if fecha_muestreo < fecha_inicio or fecha_muestreo > fecha_final:
        raise HTTPException(
            status_code=400,
            detail=(
                f"fecha_muestreo {fecha_muestreo.isoformat()} está fuera de la semana "
                f"{no_semana} ({fecha_inicio.isoformat()} a {fecha_final.isoformat()}). "
                "Ajusta la fecha."
            ),
        )
