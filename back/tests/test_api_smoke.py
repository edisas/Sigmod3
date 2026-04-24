"""Smoke tests — endpoints públicos deben responder sin auth.
No tocan la DB; solo verifican que FastAPI registra las rutas y la app arranca."""

from app.main import app
from fastapi.testclient import TestClient


def test_health_endpoint_responds_ok() -> None:
    client = TestClient(app)
    r = client.get("/api/v1/health")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "status" in body
    assert body["status"] in {"ok", "healthy", "up"}


def test_openapi_schema_is_served() -> None:
    client = TestClient(app)
    r = client.get("/openapi.json")
    assert r.status_code == 200
    schema = r.json()
    assert "paths" in schema
    assert len(schema["paths"]) > 50  # la app tiene 100+ rutas hoy


def test_protected_endpoint_rejects_without_token() -> None:
    # /api/v1/legacy/catalogos/rutas requiere token legacy
    client = TestClient(app)
    r = client.get("/api/v1/legacy/catalogos/rutas")
    assert r.status_code == 401


def test_login_endpoint_exists() -> None:
    # Esperamos 422 (body faltante) o 400, NO 404. Confirma que la ruta está cableada.
    client = TestClient(app)
    r = client.post("/api/v1/auth/login", json={})
    assert r.status_code in {400, 422}, f"got {r.status_code}: {r.text}"


def test_legacy_login_endpoint_exists() -> None:
    client = TestClient(app)
    r = client.post("/api/v1/legacy/auth/login", json={})
    assert r.status_code in {400, 422}, f"got {r.status_code}: {r.text}"


