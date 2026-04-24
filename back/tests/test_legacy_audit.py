"""Unit tests para app.core.legacy_audit — serialización JSON de tipos especiales."""

import json
from datetime import date, datetime
from decimal import Decimal

from app.core.legacy_audit import _json_default, _to_json


class TestJsonDefault:
    def test_date_serialized_as_iso(self) -> None:
        assert _json_default(date(2026, 4, 22)) == "2026-04-22"

    def test_datetime_serialized_as_iso(self) -> None:
        dt = datetime(2026, 4, 22, 15, 30, 0)
        assert _json_default(dt) == "2026-04-22T15:30:00"

    def test_decimal_serialized_as_string(self) -> None:
        assert _json_default(Decimal("3.14159")) == "3.14159"
        assert _json_default(Decimal("0")) == "0"

    def test_unknown_type_falls_back_to_str(self) -> None:
        class Custom:
            def __str__(self) -> str:
                return "custom-value"

        assert _json_default(Custom()) == "custom-value"


class TestToJson:
    def test_none_returns_none(self) -> None:
        assert _to_json(None) is None

    def test_empty_dict_returns_empty_object(self) -> None:
        assert _to_json({}) == "{}"

    def test_simple_dict_roundtrip(self) -> None:
        payload = {"folio": 42, "nombre": "ruta"}
        serialized = _to_json(payload)
        assert serialized is not None
        back = json.loads(serialized)
        assert back == payload

    def test_dict_with_date_and_decimal(self) -> None:
        payload = {
            "fecha": date(2026, 1, 15),
            "ts": datetime(2026, 1, 15, 12, 0, 0),
            "cantidad": Decimal("1234.56"),
            "nombre": "ejemplo",
        }
        s = _to_json(payload)
        assert s is not None
        back = json.loads(s)
        assert back["fecha"] == "2026-01-15"
        assert back["ts"] == "2026-01-15T12:00:00"
        assert back["cantidad"] == "1234.56"
        assert back["nombre"] == "ejemplo"

    def test_preserves_unicode(self) -> None:
        # ensure_ascii=False → caracteres españoles y acentos se mantienen legibles
        s = _to_json({"ruta": "Acción fitosanitaria ñandú"})
        assert s is not None
        assert "Acción" in s  # no escape \u00f3
        assert "ñandú" in s

    def test_nested_structures(self) -> None:
        payload = {
            "outer": {
                "inner_list": [1, 2, Decimal("3.5")],
                "inner_date": date(2026, 3, 1),
            }
        }
        s = _to_json(payload)
        assert s is not None
        back = json.loads(s)
        assert back["outer"]["inner_list"] == [1, 2, "3.5"]
        assert back["outer"]["inner_date"] == "2026-03-01"
