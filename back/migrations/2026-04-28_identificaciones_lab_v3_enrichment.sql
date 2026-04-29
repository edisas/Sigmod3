-- MIGRACION: enriquecimiento V3 de identificaciones_laboratorio
-- Fecha: 2026-04-28
-- Sprint 4.A — disecciones de muestras de fruta (laboratorio).
--
-- A diferencia de identificaciones_trampa (vinculadas a una revisión de
-- trampa), las identificaciones de laboratorio son disecciones DIRECTAS
-- sobre muestras de fruta, con conteo de larvas por estadio (1e, 2e, 3e).
--
-- Tabla existente vacía. Se agrega estado_id para multi-tenant + audit V3.

START TRANSACTION;

ALTER TABLE identificaciones_laboratorio
  ADD COLUMN IF NOT EXISTS estado_id INT(10) UNSIGNED NULL AFTER area_id,
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1 AFTER estado_id,
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE identificaciones_laboratorio
  ADD KEY IF NOT EXISTS idx_lab_estado (estado_id),
  ADD KEY IF NOT EXISTS idx_lab_estatus (estatus_id),
  ADD KEY IF NOT EXISTS idx_lab_especie (especie_mosca_id),
  ADD KEY IF NOT EXISTS idx_lab_fecha (fecha_diseccion),
  ADD KEY IF NOT EXISTS idx_lab_semana (numero_semana),
  ADD KEY IF NOT EXISTS idx_lab_area (area_id);

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_lab_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE identificaciones_laboratorio ADD CONSTRAINT fk_lab_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_lab_estado');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE identificaciones_laboratorio ADD CONSTRAINT fk_lab_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_lab_area');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE identificaciones_laboratorio ADD CONSTRAINT fk_lab_area FOREIGN KEY (area_id) REFERENCES areas(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_lab_usuario');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE identificaciones_laboratorio ADD CONSTRAINT fk_lab_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;
