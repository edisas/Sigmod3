-- MIGRACION: enriquecimiento V3 de muestreos_frutos
-- Fecha: 2026-04-28
-- Sprint 4.C — muestreo directo de frutos (corte de campo + diseccion).
--
-- Tabla legacy vacia. Se agrega multi-tenant + audit V3.

START TRANSACTION;

ALTER TABLE muestreos_frutos
  ADD COLUMN IF NOT EXISTS estado_id INT(10) UNSIGNED NULL AFTER area_id,
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1 AFTER estado_id,
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE muestreos_frutos
  ADD KEY IF NOT EXISTS idx_mf_estado (estado_id),
  ADD KEY IF NOT EXISTS idx_mf_estatus (estatus_id),
  ADD KEY IF NOT EXISTS idx_mf_unidad (unidad_produccion_id),
  ADD KEY IF NOT EXISTS idx_mf_fecha (fecha_muestreo),
  ADD KEY IF NOT EXISTS idx_mf_semana (numero_semana),
  ADD KEY IF NOT EXISTS idx_mf_variedad (variedad_id);

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_mf_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE muestreos_frutos ADD CONSTRAINT fk_mf_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_mf_estado');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE muestreos_frutos ADD CONSTRAINT fk_mf_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_mf_unidad');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE muestreos_frutos ADD CONSTRAINT fk_mf_unidad FOREIGN KEY (unidad_produccion_id) REFERENCES unidades_produccion(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;
