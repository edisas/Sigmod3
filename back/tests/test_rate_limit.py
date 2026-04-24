"""Unit tests para app.core.rate_limit — ventana deslizante por IP + scope."""

from unittest.mock import MagicMock

import pytest
from app.core import rate_limit as rl
from fastapi import HTTPException


def _mock_request(ip: str = "1.2.3.4") -> MagicMock:
    req = MagicMock()
    req.headers = {}
    req.client = MagicMock()
    req.client.host = ip
    return req


class TestRateLimitBasic:
    def setup_method(self) -> None:
        # limpieza entre tests — los buckets son estado global
        rl._buckets.clear()

    def test_allows_up_to_max_attempts(self) -> None:
        dep = rl.rate_limit("test-allow", max_attempts=3, window_seconds=60)
        req = _mock_request("10.0.0.1")
        for _ in range(3):
            dep(req)  # no debe lanzar

    def test_blocks_after_max_attempts(self) -> None:
        dep = rl.rate_limit("test-block", max_attempts=2, window_seconds=60)
        req = _mock_request("10.0.0.2")
        dep(req)
        dep(req)
        with pytest.raises(HTTPException) as exc:
            dep(req)
        assert exc.value.status_code == 429
        assert "Retry-After" in exc.value.headers

    def test_different_ips_independent_buckets(self) -> None:
        dep = rl.rate_limit("test-ips", max_attempts=1, window_seconds=60)
        dep(_mock_request("10.0.0.3"))
        dep(_mock_request("10.0.0.4"))  # IP distinta, no bloqueado

    def test_different_scopes_independent_buckets(self) -> None:
        login = rl.rate_limit("login", max_attempts=1, window_seconds=60)
        register = rl.rate_limit("register", max_attempts=1, window_seconds=60)
        req = _mock_request("10.0.0.5")
        login(req)
        register(req)  # scope distinto, no bloqueado

    def test_expired_attempts_are_pruned(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Simulamos que han pasado window_seconds+1 entre llamadas
        current_time = [1000.0]
        monkeypatch.setattr(rl, "monotonic", lambda: current_time[0])

        dep = rl.rate_limit("test-prune", max_attempts=2, window_seconds=10)
        req = _mock_request("10.0.0.6")
        dep(req)
        dep(req)
        # Avanzamos 11 segundos — los dos anteriores deben expirar
        current_time[0] += 11
        dep(req)  # no debe bloquear
        dep(req)  # aún dentro
        with pytest.raises(HTTPException):
            dep(req)

    def test_forwarded_for_header_priority(self) -> None:
        dep = rl.rate_limit("test-xff", max_attempts=1, window_seconds=60)
        req = _mock_request("1.1.1.1")
        req.headers = {"x-forwarded-for": "5.5.5.5, 2.2.2.2"}
        dep(req)

        req2 = _mock_request("3.3.3.3")
        req2.headers = {"x-forwarded-for": "5.5.5.5"}
        with pytest.raises(HTTPException):
            dep(req2)  # misma IP del XFF, bloqueado

    def test_x_real_ip_header_fallback(self) -> None:
        dep = rl.rate_limit("test-realip", max_attempts=1, window_seconds=60)
        req = _mock_request("1.1.1.1")
        req.headers = {"x-real-ip": "7.7.7.7"}
        dep(req)

        req2 = _mock_request("9.9.9.9")
        req2.headers = {"x-real-ip": "7.7.7.7"}
        with pytest.raises(HTTPException):
            dep(req2)

    def test_retry_after_header_is_reasonable(self) -> None:
        dep = rl.rate_limit("test-retry", max_attempts=1, window_seconds=30)
        req = _mock_request("10.0.0.99")
        dep(req)
        with pytest.raises(HTTPException) as exc:
            dep(req)
        retry_after = int(exc.value.headers["Retry-After"])
        assert 1 <= retry_after <= 30
