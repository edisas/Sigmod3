"""Unit tests para app.core.security — hash/verify password y JWT access tokens."""

from datetime import datetime, timedelta, timezone

import pytest
from app.core.config import get_settings
from app.core.security import (
    ALGORITHM,
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)
from jose import jwt

UTC = timezone.utc  # compat py3.10


class TestPasswordHashing:
    def test_hash_produces_verifiable_digest(self) -> None:
        h = hash_password("secret123")
        assert h.startswith("$2")  # bcrypt signature
        assert verify_password("secret123", h) is True

    def test_wrong_password_fails_verification(self) -> None:
        h = hash_password("correct-password")
        assert verify_password("wrong-password", h) is False

    def test_hash_is_salted_same_input_different_digest(self) -> None:
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2
        assert verify_password("same", h1)
        assert verify_password("same", h2)

    def test_verify_against_malformed_hash_returns_false(self) -> None:
        # fallback defensivo: no debe lanzar excepción
        assert verify_password("anything", "not-a-bcrypt-hash") is False
        assert verify_password("anything", "") is False


class TestAccessToken:
    def test_token_roundtrip_preserves_subject(self) -> None:
        token = create_access_token(subject="42")
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "42"
        assert payload["scope"] == "access"

    def test_token_with_estado_activo(self) -> None:
        token = create_access_token(subject="7", estado_activo_id=25)
        payload = decode_token(token)
        assert payload is not None
        assert payload["estado_activo_id"] == 25

    def test_token_with_custom_scope(self) -> None:
        token = create_access_token(subject="99", scope="state_selection")
        payload = decode_token(token)
        assert payload is not None
        assert payload["scope"] == "state_selection"

    def test_decode_invalid_token_returns_none(self) -> None:
        assert decode_token("not.a.jwt") is None
        assert decode_token("") is None

    def test_decode_with_wrong_signature_returns_none(self) -> None:
        # token firmado con otra clave
        bogus = jwt.encode({"sub": "1", "exp": datetime.now(UTC) + timedelta(minutes=5)},
                           "different-secret", algorithm=ALGORITHM)
        assert decode_token(bogus) is None

    def test_expired_token_is_rejected(self) -> None:
        settings = get_settings()
        expired_payload = {
            "sub": "1",
            "scope": "access",
            "exp": datetime.now(UTC) - timedelta(minutes=1),
        }
        expired = jwt.encode(expired_payload, settings.secret_key, algorithm=ALGORITHM)
        assert decode_token(expired) is None

    def test_custom_expiration_minutes(self) -> None:
        # TTL explícito en minutos debe reflejarse en el exp del payload
        token = create_access_token(subject="1", expires_minutes=60)
        payload = decode_token(token)
        assert payload is not None
        exp = datetime.fromtimestamp(int(payload["exp"]), tz=UTC)
        now = datetime.now(UTC)
        delta = (exp - now).total_seconds()
        # ventana razonable: entre 55 y 61 minutos
        assert 55 * 60 < delta < 61 * 60


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
