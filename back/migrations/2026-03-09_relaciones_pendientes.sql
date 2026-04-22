-- ==========================================================================
-- MIGRACION: Relaciones pendientes sobre estado actual admin_sigmod3
-- Fecha: 2026-03-09
-- Fuente revisada: admin_sigmod3_estructura.sql
-- ==========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

-- --------------------------------------------------------------------------
-- 1) Detalle N:N solicitud <-> modulos (faltante en estructura actual)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitud_accesos_modulos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  solicitud_id INT UNSIGNED NOT NULL,
  modulo_id INT UNSIGNED NOT NULL,
  estatus_id INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_solicitud_modulo (solicitud_id, modulo_id),
  KEY idx_solicitud_modulos_solicitud (solicitud_id),
  KEY idx_solicitud_modulos_modulo (modulo_id),
  KEY idx_solicitud_modulos_estatus (estatus_id),
  CONSTRAINT fk_solicitud_modulos_solicitud FOREIGN KEY (solicitud_id) REFERENCES solicitud_accesos(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_solicitud_modulos_modulo FOREIGN KEY (modulo_id) REFERENCES modulos(id) ON UPDATE CASCADE,
  CONSTRAINT fk_solicitud_modulos_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO solicitud_accesos_modulos (solicitud_id, modulo_id, estatus_id)
SELECT id, modulo_id, 1
FROM solicitud_accesos
WHERE modulo_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- 2) modulos: relaciones pendientes hacia municipios/localidades
--    (en dump solo existen FK a estados y estatus)
-- --------------------------------------------------------------------------
ALTER TABLE modulos
  MODIFY municipio_id INT UNSIGNED NULL,
  MODIFY localidad_id INT UNSIGNED NULL;

-- Limpiar registros huerfanos para permitir FK
UPDATE modulos mo
LEFT JOIN municipios mu ON mu.id = mo.municipio_id
SET mo.municipio_id = NULL
WHERE mo.municipio_id IS NOT NULL
  AND mu.id IS NULL;

UPDATE modulos mo
LEFT JOIN localidades lo ON lo.id = mo.localidad_id
SET mo.localidad_id = NULL
WHERE mo.localidad_id IS NOT NULL
  AND lo.id IS NULL;

ALTER TABLE modulos
  ADD KEY IF NOT EXISTS idx_modulos_municipio_id (municipio_id),
  ADD KEY IF NOT EXISTS idx_modulos_localidad_id (localidad_id);

-- Agregar FK solo si aun no existen
SET @has_fk_mod_municipio := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'modulos'
    AND CONSTRAINT_NAME = 'fk_modulos_municipio'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_fk_mod_municipio := IF(
  @has_fk_mod_municipio = 0,
  'ALTER TABLE modulos ADD CONSTRAINT fk_modulos_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt_fk_mod_municipio FROM @sql_fk_mod_municipio;
EXECUTE stmt_fk_mod_municipio;
DEALLOCATE PREPARE stmt_fk_mod_municipio;

SET @has_fk_mod_localidad := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'modulos'
    AND CONSTRAINT_NAME = 'fk_modulos_localidad'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_fk_mod_localidad := IF(
  @has_fk_mod_localidad = 0,
  'ALTER TABLE modulos ADD CONSTRAINT fk_modulos_localidad FOREIGN KEY (localidad_id) REFERENCES localidades(id) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt_fk_mod_localidad FROM @sql_fk_mod_localidad;
EXECUTE stmt_fk_mod_localidad;
DEALLOCATE PREPARE stmt_fk_mod_localidad;

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
