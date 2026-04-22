from threading import Lock
from urllib.parse import quote_plus

from sqlalchemy import create_engine, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db import SessionLocal
from app.models import LegacyDatabase

_engines: dict[str, Engine] = {}
_session_factories: dict[str, sessionmaker] = {}
_lock = Lock()


def resolve_database_name(clave: str) -> str:
    with SessionLocal() as db:
        row = db.execute(
            select(LegacyDatabase).where(LegacyDatabase.clave == clave, LegacyDatabase.activo == 1)
        ).scalar_one_or_none()
        if row is None:
            raise LookupError(f"Legacy database '{clave}' no registrada o inactiva")
        return row.database_name


def _build_url(database_name: str) -> str:
    s = get_settings()
    user = quote_plus(s.legacy_db_user)
    password = quote_plus(s.legacy_db_password)
    return (
        f"mysql+pymysql://{user}:{password}@{s.legacy_db_host}:{s.legacy_db_port}"
        f"/{database_name}?charset=utf8mb4"
    )


def get_engine(clave: str) -> Engine:
    clave = clave.upper().strip()
    with _lock:
        engine = _engines.get(clave)
        if engine is not None:
            return engine
        database_name = resolve_database_name(clave)
        engine = create_engine(
            _build_url(database_name),
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=5,
            pool_recycle=1800,
        )
        _engines[clave] = engine
        _session_factories[clave] = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        return engine


def get_session(clave: str) -> Session:
    get_engine(clave)
    return _session_factories[clave.upper().strip()]()


def list_available_bases() -> list[dict[str, str]]:
    with SessionLocal() as db:
        rows = db.execute(
            select(LegacyDatabase.clave, LegacyDatabase.nombre_estado)
            .where(LegacyDatabase.activo == 1)
            .order_by(LegacyDatabase.nombre_estado.asc())
        ).all()
        return [{"clave": r[0], "nombre_estado": r[1]} for r in rows]
