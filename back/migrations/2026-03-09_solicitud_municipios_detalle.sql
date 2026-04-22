-- ==========================================================================
-- MIGRACION: Municipios multiseleccion por solicitud de acceso
-- Fecha: 2026-03-09
-- ==========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

CREATE TABLE IF NOT EXISTS solicitud_accesos_municipios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  solicitud_id INT UNSIGNED NOT NULL,
  municipio_id INT UNSIGNED NOT NULL,
  estatus_id INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_solicitud_municipio (solicitud_id, municipio_id),
  KEY idx_solicitud_municipio_solicitud (solicitud_id),
  KEY idx_solicitud_municipio_municipio (municipio_id),
  KEY idx_solicitud_municipio_estatus (estatus_id),
  CONSTRAINT fk_solicitud_municipio_solicitud FOREIGN KEY (solicitud_id) REFERENCES solicitud_accesos(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_solicitud_municipio_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_solicitud_municipio_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
