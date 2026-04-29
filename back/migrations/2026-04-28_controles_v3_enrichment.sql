-- MIGRACION: enriquecimiento V3 de control_quimico + control_mecanico_cultural
-- Fecha: 2026-04-28
-- Sprint 4.B — operativos de aplicacion (productos quimicos, hospederos manuales).
--
-- Ambas tablas legacy estan vacias. Se agregan multi-tenant + audit V3.

START TRANSACTION;

ALTER TABLE control_quimico
  ADD COLUMN IF NOT EXISTS estado_id INT(10) UNSIGNED NULL AFTER area_id,
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1 AFTER estado_id,
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE control_quimico
  ADD KEY IF NOT EXISTS idx_cq_estado (estado_id),
  ADD KEY IF NOT EXISTS idx_cq_estatus (estatus_id),
  ADD KEY IF NOT EXISTS idx_cq_unidad (unidad_produccion_id),
  ADD KEY IF NOT EXISTS idx_cq_fecha (fecha_aplicacion),
  ADD KEY IF NOT EXISTS idx_cq_semana (numero_semana),
  ADD KEY IF NOT EXISTS idx_cq_area (area_id);

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_cq_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE control_quimico ADD CONSTRAINT fk_cq_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_cq_estado');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE control_quimico ADD CONSTRAINT fk_cq_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_cq_unidad');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE control_quimico ADD CONSTRAINT fk_cq_unidad FOREIGN KEY (unidad_produccion_id) REFERENCES unidades_produccion(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE control_mecanico_cultural
  ADD COLUMN IF NOT EXISTS estado_id INT(10) UNSIGNED NULL AFTER area_id,
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1 AFTER estado_id,
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE control_mecanico_cultural
  ADD KEY IF NOT EXISTS idx_cmc_estado (estado_id),
  ADD KEY IF NOT EXISTS idx_cmc_estatus (estatus_id),
  ADD KEY IF NOT EXISTS idx_cmc_unidad (unidad_produccion_id),
  ADD KEY IF NOT EXISTS idx_cmc_fecha (fecha),
  ADD KEY IF NOT EXISTS idx_cmc_semana (numero_semana),
  ADD KEY IF NOT EXISTS idx_cmc_hospedero (hospedero_id);

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_cmc_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE control_mecanico_cultural ADD CONSTRAINT fk_cmc_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_cmc_estado');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE control_mecanico_cultural ADD CONSTRAINT fk_cmc_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_cmc_unidad');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE control_mecanico_cultural ADD CONSTRAINT fk_cmc_unidad FOREIGN KEY (unidad_produccion_id) REFERENCES unidades_produccion(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;
