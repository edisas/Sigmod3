"""Unit tests para app.core.legacy_security — JWT del módulo legacy (scope 'legacy')."""

from datetime import UTC, datetime, timedelta

from app.core.config import get_settings
from app.core.legacy_security import (
    ALGORITHM,
    LEGACY_SCOPE,
    create_legacy_token,
    decode_legacy_token,
)
from jose import jwt


class TestLegacyToken:
    def test_token_roundtrip_preserves_claims(self) -> None:
        token = create_legacy_token(user_id=123, legacy_db="SIN", nivel=1)
        claims = decode_legacy_token(token)
        assert claims is not None
        assert claims["sub"] == "123"
        assert claims["legacy_db"] == "SIN"
        assert claims["nivel"] == 1
        assert claims["scope"] == LEGACY_SCOPE

    def test_token_across_all_states(self) -> None:
        for clave in ("SIN", "CHP", "OAX", "GRO", "MIC", "COL", "JAL", "NAY"):
            tok = create_legacy_token(user_id=1, legacy_db=clave, nivel=2)
            claims = decode_legacy_token(tok)
            assert claims is not None
            assert claims["legacy_db"] == clave

    def test_invalid_token_returns_none(self) -> None:
        assert decode_legacy_token("no-es-jwt") is None
        assert decode_legacy_token("") is None

    def test_non_legacy_scope_is_rejected(self) -> None:
        # JWT firmado con la misma clave pero con scope distinto no debe pasar
        settings = get_settings()
        payload = {
            "sub": "1",
            "legacy_db": "SIN",
            "nivel": 1,
            "scope": "access",  # scope de token V3, no legacy
            "exp": datetime.now(UTC) + timedelta(minutes=30),
        }
        tok = jwt.encode(payload, settings.legacy_secret_key, algorithm=ALGORITHM)
        assert decode_legacy_token(tok) is None

    def test_expired_legacy_token_is_rejected(self) -> None:
        settings = get_settings()
        expired = jwt.encode(
            {
                "sub": "1",
                "legacy_db": "SIN",
                "nivel": 1,
                "scope": LEGACY_SCOPE,
                "exp": datetime.now(UTC) - timedelta(minutes=1),
            },
            settings.legacy_secret_key,
            algorithm=ALGORITHM,
        )
        assert decode_legacy_token(expired) is None

    def test_token_signed_with_wrong_key_is_rejected(self) -> None:
        # Token firmado con la clave V3 (no legacy) debe fallar
        settings = get_settings()
        payload = {
            "sub": "1",
            "legacy_db": "SIN",
            "nivel": 1,
            "scope": LEGACY_SCOPE,
            "exp": datetime.now(UTC) + timedelta(minutes=30),
        }
        tok_v3 = jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)
        # Si las dos claves son distintas (típico en prod), debe retornar None
        if settings.secret_key != settings.legacy_secret_key:
            assert decode_legacy_token(tok_v3) is None
