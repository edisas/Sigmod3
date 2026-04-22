-- ==========================================================================
-- MIGRACION: Reglas de modulos por rol en solicitud de acceso
-- Fecha: 2026-03-09
-- ==========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

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

-- Backfill desde solicitud_accesos.modulo_id
INSERT IGNORE INTO solicitud_accesos_modulos (solicitud_id, modulo_id, estatus_id)
SELECT id, modulo_id, 1
FROM solicitud_accesos
WHERE modulo_id IS NOT NULL;

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
