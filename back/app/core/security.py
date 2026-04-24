from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from app.core.config import get_settings

ALGORITHM = "HS256"
UTC = timezone.utc  # compat py3.10 — datetime.UTC llegó en 3.11


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def create_access_token(subject: str, estado_activo_id: int | None = None, scope: str = "access", expires_minutes: int | None = None) -> str:
    settings = get_settings()
    ttl = expires_minutes if expires_minutes is not None else settings.access_token_expire_minutes
    expires_delta = timedelta(minutes=ttl)
    expire = datetime.now(UTC) + expires_delta
    payload: dict[str, str | int | datetime] = {"sub": subject, "exp": expire, "scope": scope}
    if estado_activo_id is not None:
        payload["estado_activo_id"] = estado_activo_id
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, str | int] | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        return None
    return payload
