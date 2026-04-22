"""
Rate limiter in-memory por IP con ventana deslizante.

Uso:
    from fastapi import Depends, Request
    from app.core.rate_limit import rate_limit

    @router.post("/login", dependencies=[Depends(rate_limit("login", max_attempts=5, window_seconds=900))])
    def login(...):
        ...

Simple y sin dependencias. No sobrevive reinicios del servicio — para este alcance es suficiente.
Si necesitas persistencia o compartir entre workers, hay que mover a Redis.
"""

from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from fastapi import HTTPException, Request, status

_buckets: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_lock = Lock()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def rate_limit(scope: str, max_attempts: int, window_seconds: int):
    """
    Crea una dependencia FastAPI que limita `max_attempts` intentos
    en `window_seconds` segundos por IP + scope.
    """

    def dependency(request: Request) -> None:
        now = monotonic()
        ip = _client_ip(request)
        key = (scope, ip)
        cutoff = now - window_seconds

        with _lock:
            bucket = _buckets[key]
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= max_attempts:
                retry_after = int(bucket[0] + window_seconds - now) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Demasiados intentos. Intenta de nuevo en {max(retry_after, 1)} segundos.",
                    headers={"Retry-After": str(max(retry_after, 1))},
                )
            bucket.append(now)

    return dependency
