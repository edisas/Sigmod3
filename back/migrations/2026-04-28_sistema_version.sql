-- MIGRACION: tabla sistema_version
-- Fecha: 2026-04-28
-- Sistema de versionado V3 expuesto en el sidebar.
-- Formato: v{major}.{minor}.{patch}
--   major = 3 (tercera generacion SIGMOD)
--   minor = 00 mientras solo este en staging; 01+ a partir del primer deploy
--           a produccion
--   patch = numero consecutivo de deploy (incrementa con cada deploy exitoso)
--
-- La tabla guarda dos versiones independientes (staging + produccion).
-- Tabla de UNA SOLA FILA (id=1).

START TRANSACTION;

CREATE TABLE IF NOT EXISTS sistema_version (
  id INT(10) UNSIGNED NOT NULL DEFAULT 1,
  staging_major INT(10) UNSIGNED NOT NULL DEFAULT 3,
  staging_minor INT(10) UNSIGNED NOT NULL DEFAULT 0,
  staging_patch INT(10) UNSIGNED NOT NULL DEFAULT 0,
  produccion_major INT(10) UNSIGNED NULL,
  produccion_minor INT(10) UNSIGNED NULL,
  produccion_patch INT(10) UNSIGNED NULL,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO sistema_version (id, staging_major, staging_minor, staging_patch, updated_at)
VALUES (1, 3, 0, 90, NOW())
ON DUPLICATE KEY UPDATE id = id;

COMMIT;
