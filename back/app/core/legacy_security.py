from datetime import datetime, timedelta, timezone

from app.core.config import get_settings
from jose import JWTError, jwt

ALGORITHM = "HS256"
LEGACY_SCOPE = "legacy"
UTC = timezone.utc  # compat py3.10 — datetime.UTC llegó en 3.11


def create_legacy_token(user_id: int, legacy_db: str, nivel: int) -> str:
    settings = get_settings()
    expire = datetime.now(UTC) + timedelta(minutes=settings.legacy_token_expire_minutes)
    payload = {
        "sub": str(user_id),
        "legacy_db": legacy_db,
        "nivel": nivel,
        "scope": LEGACY_SCOPE,
        "exp": expire,
    }
    return jwt.encode(payload, settings.legacy_secret_key, algorithm=ALGORITHM)


def decode_legacy_token(token: str) -> dict | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.legacy_secret_key, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("scope") != LEGACY_SCOPE:
        return None
    return payload
