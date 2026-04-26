"""Tests unitarios del modulo catalogos_auxiliares.

Cubren:
- Estructura del dict CATALOGOS_AUX (10 catalogos, slugs unicos, specs validos).
- Validacion de schemas Pydantic (pattern de clave, longitudes).
- Registro de rutas en la app FastAPI (7 rutas bajo /catalogos/auxiliares).
- RBAC: helpers _ensure_read_access / _ensure_write_access.

No requieren conexion a DB.
"""

import unittest
from unittest.mock import MagicMock

# Import app.main FIRST to materialize the catalogos.py module before its
# late-import block runs catalogos_auxiliares — otherwise direct import of
# catalogos_auxiliares triggers a circular partial-init error.
import app.main  # noqa: F401
from app.api.routes.catalogos_auxiliares import (
    CATALOGOS_AUX,
    CatalogoAuxSpec,
    _ensure_read_access,
    _ensure_write_access,
    _is_admin_general,
    _resolve_spec,
)
from app.schemas import CatalogAuxBase, CatalogAuxCreate, CatalogAuxUpdate
from fastapi import HTTPException
from pydantic import ValidationError


class CatalogosAuxStructureTest(unittest.TestCase):
    def test_count_is_ten(self) -> None:
        self.assertEqual(len(CATALOGOS_AUX), 10)

    def test_all_slugs_unique(self) -> None:
        slugs = [s.slug for s in CATALOGOS_AUX.values()]
        self.assertEqual(len(slugs), len(set(slugs)))

    def test_all_tables_unique(self) -> None:
        tables = [s.table for s in CATALOGOS_AUX.values()]
        self.assertEqual(len(tables), len(set(tables)))

    def test_all_pivot_tables_unique(self) -> None:
        pivots = [s.pivot_table for s in CATALOGOS_AUX.values()]
        self.assertEqual(len(pivots), len(set(pivots)))

    def test_each_spec_has_required_fields(self) -> None:
        for spec in CATALOGOS_AUX.values():
            self.assertIsInstance(spec, CatalogoAuxSpec)
            self.assertTrue(spec.slug)
            self.assertTrue(spec.label)
            self.assertTrue(spec.table)
            self.assertTrue(spec.pivot_table)
            self.assertTrue(spec.pivot_fk)
            # Convencion: pivote = <table>_estados
            self.assertTrue(spec.pivot_table.endswith("_estados"))

    def test_expected_slugs_present(self) -> None:
        expected = {
            "variedades", "especies-mosca", "vehiculos", "hospederos",
            "tipos-aplicacion", "aplicadores", "areas", "empaques",
            "productos", "status-revision",
        }
        self.assertEqual(set(CATALOGOS_AUX.keys()), expected)

    def test_resolve_spec_known_slug(self) -> None:
        spec = _resolve_spec("variedades")
        self.assertEqual(spec.table, "variedades")

    def test_resolve_spec_unknown_slug_raises_404(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            _resolve_spec("inexistente")
        self.assertEqual(ctx.exception.status_code, 404)

    def test_resolve_spec_blocks_sql_injection_attempt(self) -> None:
        # Aseguramos que payloads maliciosos no resuelvan a un spec.
        for payload in ["'; DROP TABLE", "../etc/passwd", "variedades; --", ""]:
            with self.assertRaises(HTTPException):
                _resolve_spec(payload)


class CatalogAuxSchemaTest(unittest.TestCase):
    def test_clave_lowercase_alnum_passes(self) -> None:
        item = CatalogAuxBase(clave="ataulfo", nombre="Ataúlfo")
        self.assertEqual(item.clave, "ataulfo")

    def test_clave_with_dash_and_underscore_passes(self) -> None:
        item = CatalogAuxBase(clave="manila_2", nombre="Manila 2")
        self.assertEqual(item.clave, "manila_2")
        item2 = CatalogAuxBase(clave="kent-rojo", nombre="Kent rojo")
        self.assertEqual(item2.clave, "kent-rojo")

    def test_clave_uppercase_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            CatalogAuxBase(clave="Ataulfo", nombre="x")

    def test_clave_with_space_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            CatalogAuxBase(clave="ataulfo manila", nombre="x")

    def test_clave_empty_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            CatalogAuxBase(clave="", nombre="x")

    def test_clave_too_long_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            CatalogAuxBase(clave="a" * 41, nombre="x")

    def test_create_default_estados_aplicables_empty(self) -> None:
        item = CatalogAuxCreate(clave="x", nombre="x")
        self.assertEqual(item.estados_aplicables, [])

    def test_update_default_estados_aplicables_none(self) -> None:
        item = CatalogAuxUpdate(clave="x", nombre="x")
        self.assertIsNone(item.estados_aplicables)

    def test_estados_aplicables_max_length(self) -> None:
        with self.assertRaises(ValidationError):
            CatalogAuxCreate(clave="x", nombre="x", estados_aplicables=list(range(65)))


class CatalogAuxRBACTest(unittest.TestCase):
    def _user(self, rol: str) -> MagicMock:
        u = MagicMock()
        u.rol = rol
        return u

    def test_admin_general_can_read(self) -> None:
        _ensure_read_access(self._user("Administrador General"))

    def test_admin_general_can_write(self) -> None:
        _ensure_write_access(self._user("Administrador General"))

    def test_admin_can_write(self) -> None:
        _ensure_write_access(self._user("admin"))

    def test_admin_estatal_can_read(self) -> None:
        _ensure_read_access(self._user("Administrador Estatal"))

    def test_admin_estatal_cannot_write(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            _ensure_write_access(self._user("Administrador Estatal"))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_other_role_cannot_read(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            _ensure_read_access(self._user("monitor"))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_is_admin_general_true_for_admin_general(self) -> None:
        self.assertTrue(_is_admin_general(self._user("Administrador General")))

    def test_is_admin_general_false_for_estatal(self) -> None:
        self.assertFalse(_is_admin_general(self._user("Administrador Estatal")))

    def test_role_normalization_handles_whitespace_and_case(self) -> None:
        _ensure_write_access(self._user("  ADMINISTRADOR GENERAL  "))


class CatalogAuxRoutesRegistrationTest(unittest.TestCase):
    def test_seven_routes_registered_under_catalogos_auxiliares(self) -> None:
        from app.main import app

        routes = [r.path for r in app.routes if "/catalogos/auxiliares" in r.path]
        self.assertEqual(len(routes), 7)

    def test_route_paths_are_well_formed(self) -> None:
        from app.main import app

        paths = {r.path for r in app.routes if "/catalogos/auxiliares" in r.path}
        expected = {
            "/api/v1/catalogos/auxiliares/",
            "/api/v1/catalogos/auxiliares/{slug}",
            "/api/v1/catalogos/auxiliares/{slug}/listado",
            "/api/v1/catalogos/auxiliares/{slug}/{registro_id}",
        }
        self.assertEqual(paths, expected)


if __name__ == "__main__":
    unittest.main()
