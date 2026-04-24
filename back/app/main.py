import logging
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.router import router
from app.core.config import get_settings
from app.core.security import decode_token
from app.db import SessionLocal

settings = get_settings()
logger = logging.getLogger("uvicorn.error")

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix=settings.api_prefix)


def _resolve_user_from_authorization(authorization: str | None) -> tuple[str | None, int | None]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None, None

    token = authorization.split(" ", 1)[1].strip()
    claims = decode_token(token)
    if not claims or claims.get("scope") != "access":
        return None, None

    try:
        user_id = int(claims.get("sub"))
    except (TypeError, ValueError):
        return None, None

    db = SessionLocal()
    try:
        row = db.execute(
            text("SELECT id, nombre_usuario FROM usuarios WHERE id = :id LIMIT 1"),
            {"id": user_id},
        ).mappings().first()
        if not row:
            return None, user_id
        return str(row["nombre_usuario"]), int(row["id"])
    except Exception:
        return None, user_id
    finally:
        db.close()


@app.middleware("http")
async def audit_request_middleware(request, call_next):
    started_at = datetime.now()
    user_name, user_id = _resolve_user_from_authorization(request.headers.get("Authorization"))
    response = await call_next(request)

    user_label = user_name if user_name else "anonimo"
    if user_id is not None:
        user_label = f"{user_label}#{user_id}"

    logger.info(
        "AUDIT | %s | user=%s | %s %s | status=%s",
        started_at.strftime("%Y-%m-%d %H:%M:%S"),
        user_label,
        request.method,
        request.url.path,
        response.status_code,
    )
    return response


@app.get("/")
def root() -> dict[str, str]:
    return {"name": settings.app_name, "env": settings.env}
