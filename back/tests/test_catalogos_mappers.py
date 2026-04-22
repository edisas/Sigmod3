import unittest

from app.api.routes.catalogos import (
    to_estado_response,
    to_figura_cooperadora_response,
    to_localidad_response,
    to_municipio_response,
    to_tipo_fcoop_response,
)


class CatalogosMappersTestCase(unittest.TestCase):
    def test_to_estado_response(self) -> None:
        row = {"id": 7, "clave": "07", "nombre": "Chiapas", "abreviatura": "CHIS", "estatus_id": 1}
        item = to_estado_response(row)
        self.assertEqual(item.id, 7)
        self.assertEqual(item.clave, "07")
        self.assertEqual(item.nombre, "Chiapas")
        self.assertEqual(item.abreviatura, "CHIS")
        self.assertEqual(item.estatus_id, 1)

    def test_to_municipio_response(self) -> None:
        row = {
            "id": 10,
            "estado_id": 7,
            "clave": "001",
            "nombre": "Tuxtla",
            "clave_geo": "07001",
            "estatus_id": 1,
            "estado_nombre": "Chiapas",
        }
        item = to_municipio_response(row)
        self.assertEqual(item.id, 10)
        self.assertEqual(item.estado_id, 7)
        self.assertEqual(item.estado_nombre, "Chiapas")

    def test_to_localidad_response(self) -> None:
        row = {
            "id": 20,
            "municipio_id": 10,
            "estado_id": 7,
            "nombre": "Centro",
            "clave_geo": 700101,
            "latitud": 16.75,
            "longitud": -93.11,
            "altitud": 522,
            "estatus_id": 1,
            "municipio_nombre": "Tuxtla",
            "estado_nombre": "Chiapas",
        }
        item = to_localidad_response(row)
        self.assertEqual(item.id, 20)
        self.assertEqual(item.municipio_id, 10)
        self.assertEqual(item.estado_id, 7)
        self.assertEqual(item.municipio_nombre, "Tuxtla")

    def test_to_tipo_fcoop_response(self) -> None:
        row = {"id": 1, "nombre": "UV", "descripcion": "Unidad verificadora", "estatus_id": 1}
        item = to_tipo_fcoop_response(row)
        self.assertEqual(item.id, 1)
        self.assertEqual(item.nombre, "UV")
        self.assertEqual(item.estatus_id, 1)

    def test_to_figura_cooperadora_response(self) -> None:
        row = {
            "id": 99,
            "nombre": "Figura Sur",
            "nombre_corto": "FSUR",
            "tipo_figura_id": 1,
            "domicilio": "Av. Central 123",
            "localidad_id": 20,
            "municipio_id": 10,
            "estado_id": 7,
            "correo_electronico": "contacto@fcoop.mx",
            "telefono": "9610000000",
            "celular_contacto": "9611111111",
            "contacto_id": 55,
            "estatus_id": 1,
            "tipo_figura_nombre": "UV",
            "estado_nombre": "Chiapas",
            "municipio_nombre": "Tuxtla",
            "localidad_nombre": "Centro",
            "contacto_nombre": "Ing. Perez",
        }
        item = to_figura_cooperadora_response(row)
        self.assertEqual(item.id, 99)
        self.assertEqual(item.nombre, "Figura Sur")
        self.assertEqual(item.celular_contacto, "9611111111")
        self.assertEqual(item.contacto_nombre, "Ing. Perez")


if __name__ == "__main__":
    unittest.main()
