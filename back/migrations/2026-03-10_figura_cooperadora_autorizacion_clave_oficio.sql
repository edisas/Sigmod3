-- ============================================================
-- SIGMOD3 - Autorizacion Figura Cooperadora por Temporada
-- Fecha: 2026-03-10
-- Objetivo:
--   1) Agregar clave unica de autorizacion.
--   2) Persistir referencia del oficio escaneado.
-- ============================================================

ALTER TABLE figura_cooperadora_detalle_autorizaciones
  ADD COLUMN IF NOT EXISTS clave_autorizacion VARCHAR(20) NULL AFTER json_detalles_autorizacion,
  ADD COLUMN IF NOT EXISTS oficio_path VARCHAR(255) NULL AFTER clave_autorizacion,
  ADD COLUMN IF NOT EXISTS oficio_nombre_original VARCHAR(255) NULL AFTER oficio_path,
  ADD COLUMN IF NOT EXISTS observaciones TEXT NULL AFTER oficio_nombre_original,
  ADD COLUMN IF NOT EXISTS revocada_at DATETIME NULL AFTER observaciones,
  ADD COLUMN IF NOT EXISTS revocacion_motivo TEXT NULL AFTER revocada_at,
  ADD COLUMN IF NOT EXISTS revocacion_solicitante_nombre VARCHAR(200) NULL AFTER revocacion_motivo,
  ADD COLUMN IF NOT EXISTS revocacion_solicitante_cargo VARCHAR(200) NULL AFTER revocacion_solicitante_nombre,
  ADD COLUMN IF NOT EXISTS revocacion_oficio_path VARCHAR(255) NULL AFTER revocacion_solicitante_cargo,
  ADD COLUMN IF NOT EXISTS revocacion_oficio_nombre_original VARCHAR(255) NULL AFTER revocacion_oficio_path,
  ADD COLUMN IF NOT EXISTS revocada_por_usuario_id INT NULL AFTER revocacion_oficio_nombre_original;

UPDATE figura_cooperadora_detalle_autorizaciones
SET clave_autorizacion = CONCAT('AUT-LEGACY-', id)
WHERE (clave_autorizacion IS NULL OR clave_autorizacion = '');

ALTER TABLE figura_cooperadora_detalle_autorizaciones
  MODIFY COLUMN clave_autorizacion VARCHAR(20) NOT NULL,
  ADD UNIQUE KEY IF NOT EXISTS uk_fcda_clave_autorizacion (clave_autorizacion),
  ADD KEY IF NOT EXISTS idx_fcda_figura_temporada_estatus (figura_cooperadora_id, temporada_id, estatus_id),
  ADD KEY IF NOT EXISTS idx_fcda_revocada_por_usuario_id (revocada_por_usuario_id);

-- Alinear tipo de revocada_por_usuario_id al tipo real de usuarios.id
SET @usuarios_id_coltype := (
  SELECT COLUMN_TYPE
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'usuarios'
    AND column_name = 'id'
  LIMIT 1
);

SET @sql_sync_revocada_col := IF(
  @usuarios_id_coltype IS NOT NULL,
  CONCAT('ALTER TABLE figura_cooperadora_detalle_autorizaciones MODIFY COLUMN revocada_por_usuario_id ', @usuarios_id_coltype, ' NULL'),
  'SELECT 1'
);
PREPARE stmt_sync_revocada_col FROM @sql_sync_revocada_col;
EXECUTE stmt_sync_revocada_col;
DEALLOCATE PREPARE stmt_sync_revocada_col;

SET @has_fk_revocada_por := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'figura_cooperadora_detalle_autorizaciones'
    AND constraint_name = 'fk_fcda_revocada_por_usuario'
    AND constraint_type = 'FOREIGN KEY'
);

SET @sql_fk_revocada_por := IF(
  @has_fk_revocada_por = 0 AND @usuarios_id_coltype IS NOT NULL,
  'ALTER TABLE figura_cooperadora_detalle_autorizaciones ADD CONSTRAINT fk_fcda_revocada_por_usuario FOREIGN KEY (revocada_por_usuario_id) REFERENCES usuarios(id) ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_fk_revocada_por FROM @sql_fk_revocada_por;
EXECUTE stmt_fk_revocada_por;
DEALLOCATE PREPARE stmt_fk_revocada_por;
