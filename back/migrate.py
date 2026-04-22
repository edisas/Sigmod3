"""
Control de migraciones SQL para SIGMOD V3.

Uso (desde back/ con el venv activo):
    python migrate.py status                 # lista aplicadas vs pendientes
    python migrate.py apply                  # aplica todas las pendientes en orden
    python migrate.py apply --file NAME      # aplica solo una
    python migrate.py baseline               # marca todas las existentes como aplicadas (sin ejecutar)
    python migrate.py mark NAME              # marca manualmente una migración como aplicada
    python migrate.py verify                 # reporta archivos cuyo checksum cambió desde que se aplicaron

Las migraciones viven en docsRefactor/migrations/*.sql y se ordenan por nombre de archivo.
El registro de aplicadas vive en la tabla schema_migrations de la BD V3.
"""

from __future__ import annotations

import argparse
import getpass
import hashlib
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.engine import Engine  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.db import engine as v3_engine  # noqa: E402

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
BOOTSTRAP_MIGRATION = "2026-04-20_schema_migrations.sql"


def discover_migrations() -> list[Path]:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    return [f for f in files if f.is_file()]


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def ensure_table(engine: Engine) -> bool:
    with engine.connect() as c:
        exists = c.execute(
            text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema=DATABASE() AND table_name='schema_migrations'"
            )
        ).first()
    return exists is not None


def bootstrap_table(engine: Engine) -> None:
    sql = (MIGRATIONS_DIR / BOOTSTRAP_MIGRATION).read_text(encoding="utf-8")
    with engine.begin() as c:
        for stmt in split_statements(sql):
            c.execute(text(stmt))


def load_applied(engine: Engine) -> dict[str, dict]:
    with engine.connect() as c:
        rows = c.execute(
            text("SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename")
        ).mappings().all()
    return {r["filename"]: dict(r) for r in rows}


def split_statements(sql: str) -> list[str]:
    """Divide un archivo SQL en sentencias, respetando DELIMITER $$ ... $$."""
    delimiter = ";"
    buffer: list[str] = []
    statements: list[str] = []

    def flush() -> None:
        s = "".join(buffer).strip()
        if s and not _is_only_comment(s):
            statements.append(s)
        buffer.clear()

    for raw_line in sql.splitlines(keepends=True):
        stripped = raw_line.strip()
        if stripped.upper().startswith("DELIMITER "):
            flush()
            delimiter = stripped.split(None, 1)[1].strip()
            continue
        buffer.append(raw_line)
        joined = "".join(buffer).rstrip()
        if joined.endswith(delimiter):
            trimmed = joined[: -len(delimiter)]
            buffer.clear()
            buffer.append(trimmed)
            flush()

    flush()
    return statements


def _is_only_comment(s: str) -> bool:
    for line in s.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("--") or line.startswith("#") or line.startswith("/*"):
            continue
        return False
    return True


def cmd_status(engine: Engine) -> int:
    if not ensure_table(engine):
        print("schema_migrations no existe todavía. Ejecuta 'python migrate.py apply' para inicializar.")
        return 1
    applied = load_applied(engine)
    files = discover_migrations()
    total_ok = total_pending = total_changed = 0
    print(f"{'estado':<9} {'checksum':<8} {'aplicada':<19} archivo")
    print("-" * 90)
    for f in files:
        name = f.name
        current = sha256_of(f)
        rec = applied.get(name)
        if rec is None:
            print(f"{'PENDING':<9} {'-':<8} {'-':<19} {name}")
            total_pending += 1
            continue
        chk = "OK" if rec["checksum"] == current else "CHANGED"
        if chk == "CHANGED":
            total_changed += 1
        else:
            total_ok += 1
        applied_at = str(rec["applied_at"])[:19]
        print(f"{'APPLIED':<9} {chk:<8} {applied_at:<19} {name}")
    orphans = [name for name in applied if name not in {f.name for f in files}]
    for name in orphans:
        print(f"{'ORPHAN':<9} {'-':<8} {'-':<19} {name}  (registrado pero archivo no existe)")
    print("-" * 90)
    print(f"aplicadas: {total_ok} | modificadas: {total_changed} | pendientes: {total_pending} | huérfanas: {len(orphans)}")
    return 0


def cmd_apply(engine: Engine, only: str | None = None) -> int:
    if not ensure_table(engine):
        print("Creando tabla schema_migrations...")
        bootstrap_table(engine)
        _record(engine, BOOTSTRAP_MIGRATION, sha256_of(MIGRATIONS_DIR / BOOTSTRAP_MIGRATION), 0)
    applied = load_applied(engine)
    files = discover_migrations()
    target = [f for f in files if f.name not in applied]
    if only:
        target = [f for f in target if f.name == only]
        if not target:
            print(f"'{only}' no está entre las pendientes.")
            return 1
    if not target:
        print("No hay migraciones pendientes.")
        return 0

    for f in target:
        print(f"→ aplicando {f.name} ...")
        sql = f.read_text(encoding="utf-8")
        started = time.time()
        try:
            with engine.begin() as c:
                for stmt in split_statements(sql):
                    c.execute(text(stmt))
        except Exception as exc:  # noqa: BLE001
            print(f"  ✗ falló: {exc}")
            return 1
        elapsed_ms = int((time.time() - started) * 1000)
        _record(engine, f.name, sha256_of(f), elapsed_ms)
        print(f"  ✓ aplicada en {elapsed_ms} ms")
    return 0


def cmd_baseline(engine: Engine) -> int:
    if not ensure_table(engine):
        print("Creando tabla schema_migrations...")
        bootstrap_table(engine)
    applied = load_applied(engine)
    files = discover_migrations()
    new = 0
    for f in files:
        if f.name in applied:
            continue
        _record(engine, f.name, sha256_of(f), None)
        print(f"  marcada como aplicada: {f.name}")
        new += 1
    print(f"\nBaseline listo: {new} migración(es) registrada(s) sin ejecutar.")
    return 0


def cmd_mark(engine: Engine, filename: str) -> int:
    path = MIGRATIONS_DIR / filename
    if not path.is_file():
        print(f"Archivo no encontrado: {filename}")
        return 1
    if not ensure_table(engine):
        bootstrap_table(engine)
    _record(engine, filename, sha256_of(path), None)
    print(f"Marcada como aplicada: {filename}")
    return 0


def cmd_verify(engine: Engine) -> int:
    if not ensure_table(engine):
        print("schema_migrations no existe.")
        return 1
    applied = load_applied(engine)
    files = {f.name: f for f in discover_migrations()}
    changed = 0
    for name, rec in applied.items():
        f = files.get(name)
        if f is None:
            print(f"  ORPHAN   {name}  (archivo no existe)")
            continue
        current = sha256_of(f)
        if current != rec["checksum"]:
            print(f"  CHANGED  {name}")
            print(f"             registrado: {rec['checksum']}")
            print(f"             actual:     {current}")
            changed += 1
    if changed == 0:
        print("Sin cambios detectados en migraciones aplicadas.")
        return 0
    print(f"\n{changed} archivo(s) con checksum distinto al registrado.")
    return 2


def _record(engine: Engine, filename: str, checksum: str, execution_ms: int | None) -> None:
    user = _applied_by()
    with engine.begin() as c:
        c.execute(
            text(
                "INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms) "
                "VALUES (:f, :c, :u, :e) "
                "ON DUPLICATE KEY UPDATE checksum=VALUES(checksum), applied_by=VALUES(applied_by), "
                "execution_ms=VALUES(execution_ms)"
            ),
            {"f": filename, "c": checksum, "u": user, "e": execution_ms},
        )


def _applied_by() -> str:
    try:
        return f"{getpass.getuser()}@{os.uname().nodename}"[:80]
    except Exception:  # noqa: BLE001
        return "unknown"


def main() -> int:
    parser = argparse.ArgumentParser(description="Control de migraciones SIGMOD V3")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status", help="Muestra estado de cada migración")
    apply_p = sub.add_parser("apply", help="Aplica migraciones pendientes")
    apply_p.add_argument("--file", dest="only", help="Solo aplicar este archivo")
    sub.add_parser("baseline", help="Marca todas las migraciones existentes como aplicadas (sin ejecutar)")
    mark_p = sub.add_parser("mark", help="Marca una migración individual como aplicada")
    mark_p.add_argument("filename")
    sub.add_parser("verify", help="Reporta migraciones cuyo archivo cambió desde su aplicación")

    args = parser.parse_args()

    settings = get_settings()
    print(f"Base: {settings.database_url.split('@')[-1].split('?')[0]}")

    if args.command == "status":
        return cmd_status(v3_engine)
    if args.command == "apply":
        return cmd_apply(v3_engine, only=args.only)
    if args.command == "baseline":
        return cmd_baseline(v3_engine)
    if args.command == "mark":
        return cmd_mark(v3_engine, args.filename)
    if args.command == "verify":
        return cmd_verify(v3_engine)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
