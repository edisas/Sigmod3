-- ==========================================================================
-- MIGRACION: SIGMOD V3 MULTIESTADO
-- Fecha: 2026-03-08
-- Objetivo:
--   1) Unificar operación nacional por estado dentro de una sola base.
--   2) Habilitar usuarios con acceso a múltiples estados.
--   3) Garantizar aislamiento por estado en tablas críticas.
-- ==========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

-- --------------------------------------------------------------------------
-- 1) USUARIOS: Campos para autenticación moderna + relación multestado
-- --------------------------------------------------------------------------
-- Renombrar nick -> nombre_usuario
ALTER TABLE usuarios
  CHANGE COLUMN nick nombre_usuario VARCHAR(50) NOT NULL;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS email VARCHAR(254) NULL AFTER nombre_usuario,
  ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'admin' AFTER email,
  ADD COLUMN IF NOT EXISTS facility VARCHAR(120) NULL AFTER rol;

-- Recomendado: llenar email para usuarios existentes antes de activar NOT NULL.
-- Ejemplo: UPDATE usuarios SET email = CONCAT(nombre_usuario, '@local.sigmod.mx') WHERE email IS NULL;

-- Índices únicos de correo.
ALTER TABLE usuarios
  ADD UNIQUE KEY uk_usuarios_email (email);

CREATE TABLE IF NOT EXISTS usuarios_detalle (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  estado_id INT UNSIGNED NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_usuarios_detalle_usuario_estado (usuario_id, estado_id),
  KEY idx_usuarios_detalle_usuario (usuario_id),
  KEY idx_usuarios_detalle_estado (estado_id),
  CONSTRAINT fk_usuarios_detalle_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_usuarios_detalle_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Si existe la tabla anterior (usuario_estados), mover datos:
SET @has_old_user_states := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'usuario_estados'
);
SET @copy_sql := IF(
  @has_old_user_states > 0,
  'INSERT IGNORE INTO usuarios_detalle (usuario_id, estado_id, activo, created_at) SELECT usuario_id, estado_id, activo, created_at FROM usuario_estados',
  'SELECT 1'
);
PREPARE stmt_copy_user_states FROM @copy_sql;
EXECUTE stmt_copy_user_states;
DEALLOCATE PREPARE stmt_copy_user_states;

-- Backfill inicial desde usuarios.estado_id legado.
INSERT IGNORE INTO usuarios_detalle (usuario_id, estado_id, activo)
SELECT id, estado_id, 1
FROM usuarios
WHERE estado_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- 2) MODULOS: Aislamiento por estado
-- --------------------------------------------------------------------------
ALTER TABLE modulos
  ADD COLUMN IF NOT EXISTS estado_id INT UNSIGNED NULL AFTER estatus_id,
  ADD KEY idx_modulos_estado (estado_id),
  ADD CONSTRAINT fk_modulos_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE;

-- Backfill automático por clave INEGI (clave_estado -> estados.clave)
UPDATE modulos m
INNER JOIN estados e ON e.clave = m.clave_estado
SET m.estado_id = e.id
WHERE m.estado_id IS NULL AND m.clave_estado IS NOT NULL AND m.clave_estado <> '';

-- Fallback por nombre de estado (si aplica en tus datos)
UPDATE modulos m
INNER JOIN estados e ON UPPER(TRIM(e.nombre)) = UPPER(TRIM(m.estado))
SET m.estado_id = e.id
WHERE m.estado_id IS NULL AND m.estado IS NOT NULL AND m.estado <> '';

-- --------------------------------------------------------------------------
-- 3) RUTAS: Aislamiento por estado
-- --------------------------------------------------------------------------
ALTER TABLE rutas
  ADD COLUMN IF NOT EXISTS estado_id INT UNSIGNED NULL AFTER modulo_id,
  ADD KEY idx_rutas_estado (estado_id),
  ADD CONSTRAINT fk_rutas_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE;

UPDATE rutas r
INNER JOIN modulos m ON m.id = r.modulo_id
SET r.estado_id = m.estado_id
WHERE r.estado_id IS NULL;

-- --------------------------------------------------------------------------
-- 4) UNIDADES_PRODUCCION: clave única por estado (no global)
-- --------------------------------------------------------------------------
-- Backfill estado en unidades desde ruta
UPDATE unidades_produccion up
INNER JOIN rutas r ON r.id = up.ruta_id
SET up.estado_id = r.estado_id
WHERE up.estado_id IS NULL AND r.estado_id IS NOT NULL;

-- Ajuste de unicidad para evitar choque entre estados
ALTER TABLE unidades_produccion
  DROP INDEX uk_up_numero_inscripcion,
  ADD UNIQUE KEY uk_up_estado_numero_inscripcion (estado_id, numero_inscripcion);

-- --------------------------------------------------------------------------
-- 5) TRAMPAS: Aislamiento por estado
-- --------------------------------------------------------------------------
ALTER TABLE trampas
  ADD COLUMN IF NOT EXISTS estado_id INT UNSIGNED NULL AFTER unidad_produccion_id,
  ADD KEY idx_trampas_estado (estado_id),
  ADD CONSTRAINT fk_trampas_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE;

UPDATE trampas t
LEFT JOIN rutas r ON r.id = t.ruta_id
LEFT JOIN unidades_produccion up ON up.id = t.unidad_produccion_id
SET t.estado_id = COALESCE(r.estado_id, up.estado_id)
WHERE t.estado_id IS NULL;

-- --------------------------------------------------------------------------
-- 6) TMIMF: Aislamiento por estado y folios por estado
-- --------------------------------------------------------------------------
ALTER TABLE tmimf
  ADD COLUMN IF NOT EXISTS estado_id INT UNSIGNED NULL AFTER modulo_emisor_id,
  ADD KEY idx_tmimf_estado (estado_id),
  ADD CONSTRAINT fk_tmimf_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE;

UPDATE tmimf t
LEFT JOIN modulos m ON m.id = t.modulo_emisor_id
LEFT JOIN rutas r ON r.id = t.ruta_id
LEFT JOIN unidades_produccion up ON up.id = t.unidad_produccion_id
SET t.estado_id = COALESCE(m.estado_id, r.estado_id, up.estado_id)
WHERE t.estado_id IS NULL;

ALTER TABLE tmimf
  DROP INDEX uk_tmimf_folio,
  DROP INDEX uk_tmimf_movilizacion,
  ADD UNIQUE KEY uk_tmimf_estado_folio (estado_id, folio_tmimf),
  ADD UNIQUE KEY uk_tmimf_estado_movilizacion (estado_id, clave_movilizacion);

-- --------------------------------------------------------------------------
-- 7) DETALLADO_TMIMF: filtro rápido por estado
-- --------------------------------------------------------------------------
ALTER TABLE detallado_tmimf
  ADD COLUMN IF NOT EXISTS estado_id INT UNSIGNED NULL AFTER tmimf_id,
  ADD KEY idx_det_tmimf_estado (estado_id),
  ADD CONSTRAINT fk_det_tmimf_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE;

UPDATE detallado_tmimf d
INNER JOIN tmimf t ON t.id = d.tmimf_id
SET d.estado_id = t.estado_id
WHERE d.estado_id IS NULL;

-- --------------------------------------------------------------------------
-- 8) Validación previa a endurecer NOT NULL
-- --------------------------------------------------------------------------
-- Ejecuta estas consultas y valida que den 0 antes de hacer NOT NULL:
-- SELECT COUNT(*) FROM modulos WHERE estado_id IS NULL;
-- SELECT COUNT(*) FROM rutas WHERE estado_id IS NULL;
-- SELECT COUNT(*) FROM unidades_produccion WHERE estado_id IS NULL;
-- SELECT COUNT(*) FROM trampas WHERE estado_id IS NULL;
-- SELECT COUNT(*) FROM tmimf WHERE estado_id IS NULL;
-- SELECT COUNT(*) FROM detallado_tmimf WHERE estado_id IS NULL;

-- Si todo está limpio, aplicar endurecimiento (descomentar):
-- ALTER TABLE modulos MODIFY estado_id INT UNSIGNED NOT NULL;
-- ALTER TABLE rutas MODIFY estado_id INT UNSIGNED NOT NULL;
-- ALTER TABLE unidades_produccion MODIFY estado_id INT UNSIGNED NOT NULL;
-- ALTER TABLE trampas MODIFY estado_id INT UNSIGNED NOT NULL;
-- ALTER TABLE tmimf MODIFY estado_id INT UNSIGNED NOT NULL;
-- ALTER TABLE detallado_tmimf MODIFY estado_id INT UNSIGNED NOT NULL;

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
