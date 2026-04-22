-- ============================================================
-- SIGMOD3 - Registro de usuario vinculado a Figura Cooperadora
-- Fecha: 2026-03-10
-- ============================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS figura_cooperadora_id INT NULL AFTER estado_id,
  ADD KEY IF NOT EXISTS idx_usuarios_figura_cooperadora_id (figura_cooperadora_id);

-- Alinear tipo de usuarios.figura_cooperadora_id con figura_cooperadora.id
SET @figura_id_coltype := (
  SELECT COLUMN_TYPE
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'figura_cooperadora'
    AND column_name = 'id'
  LIMIT 1
);

SET @sql_sync_usuario_figura := IF(
  @figura_id_coltype IS NOT NULL,
  CONCAT('ALTER TABLE usuarios MODIFY COLUMN figura_cooperadora_id ', @figura_id_coltype, ' NULL'),
  'SELECT 1'
);
PREPARE stmt_sync_usuario_figura FROM @sql_sync_usuario_figura;
EXECUTE stmt_sync_usuario_figura;
DEALLOCATE PREPARE stmt_sync_usuario_figura;

SET @has_fk_usuario_figura := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'usuarios'
    AND constraint_name = 'fk_usuarios_figura_cooperadora'
    AND constraint_type = 'FOREIGN KEY'
);

SET @sql_fk_usuario_figura := IF(
  @has_fk_usuario_figura = 0 AND @figura_id_coltype IS NOT NULL,
  'ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_figura_cooperadora FOREIGN KEY (figura_cooperadora_id) REFERENCES figura_cooperadora(id) ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_fk_usuario_figura FROM @sql_fk_usuario_figura;
EXECUTE stmt_fk_usuario_figura;
DEALLOCATE PREPARE stmt_fk_usuario_figura;
