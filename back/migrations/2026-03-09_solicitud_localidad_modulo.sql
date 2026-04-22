-- ==========================================================================
-- MIGRACION: Solicitud acceso con localidad y modulo catalogados
-- Fecha: 2026-03-09
-- ==========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

CREATE TABLE IF NOT EXISTS usuarios_modulos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  modulo_id INT UNSIGNED NOT NULL,
  estatus_id INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_usuarios_modulos_usuario_modulo (usuario_id, modulo_id),
  KEY idx_usuarios_modulos_usuario (usuario_id),
  KEY idx_usuarios_modulos_modulo (modulo_id),
  KEY idx_usuarios_modulos_estatus (estatus_id),
  CONSTRAINT fk_usuarios_modulos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_usuarios_modulos_modulo FOREIGN KEY (modulo_id) REFERENCES modulos(id) ON UPDATE CASCADE,
  CONSTRAINT fk_usuarios_modulos_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Backfill inicial desde referencia_modulo legacy
INSERT IGNORE INTO usuarios_modulos (usuario_id, modulo_id, estatus_id)
SELECT u.id, m.id, 1
FROM usuarios u
JOIN modulos m ON LPAD(TRIM(m.serie), 6, '0') = LPAD(TRIM(u.referencia_modulo), 6, '0')
WHERE u.referencia_modulo IS NOT NULL
  AND TRIM(u.referencia_modulo) <> ''
  AND m.serie IS NOT NULL
  AND TRIM(m.serie) <> '';

ALTER TABLE solicitud_accesos
  ADD COLUMN IF NOT EXISTS localidad_id INT UNSIGNED NULL AFTER estado_id,
  ADD COLUMN IF NOT EXISTS modulo_id INT UNSIGNED NULL AFTER rol_id,
  ADD KEY IF NOT EXISTS idx_solicitud_localidad (localidad_id),
  ADD KEY IF NOT EXISTS idx_solicitud_modulo (modulo_id),
  ADD CONSTRAINT fk_solicitud_localidad FOREIGN KEY (localidad_id) REFERENCES localidades(id) ON UPDATE CASCADE,
  ADD CONSTRAINT fk_solicitud_modulo FOREIGN KEY (modulo_id) REFERENCES modulos(id) ON UPDATE CASCADE;

-- Backfill por nombre (cuando exista coincidencia exacta)
UPDATE solicitud_accesos sa
LEFT JOIN localidades l ON UPPER(TRIM(l.nombre)) = UPPER(TRIM(sa.lugar_emision))
LEFT JOIN municipios m ON m.id = l.municipio_id
SET sa.localidad_id = l.id
WHERE sa.localidad_id IS NULL
  AND l.id IS NOT NULL
  AND m.estado_id = sa.estado_id;

UPDATE solicitud_accesos sa
LEFT JOIN modulos mo ON UPPER(TRIM(mo.nombre)) = UPPER(TRIM(sa.modulo_captura))
SET sa.modulo_id = mo.id
WHERE sa.modulo_id IS NULL
  AND mo.id IS NOT NULL;

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
