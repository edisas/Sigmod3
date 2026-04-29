-- MIGRACION: enriquecimiento V3 de anexos_01
-- Fecha: 2026-04-28
-- Sprint 4.D — Anexo 01 del TMIMF: documento con datos de origen
-- (productor, ubicacion, superficies, plagas, medidas) que acompana
-- al certificado de movilizacion.
--
-- Tabla legacy vacia. Ya tiene estado_id NOT NULL. Falta estatus_id + audit V3.

START TRANSACTION;

ALTER TABLE anexos_01
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1 AFTER estado_id,
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE anexos_01
  ADD KEY IF NOT EXISTS idx_anx_estado (estado_id),
  ADD KEY IF NOT EXISTS idx_anx_estatus (estatus_id),
  ADD KEY IF NOT EXISTS idx_anx_productor (productor_id),
  ADD KEY IF NOT EXISTS idx_anx_municipio (municipio_id),
  ADD KEY IF NOT EXISTS idx_anx_fecha (fecha_emision);

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_anx_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE anexos_01 ADD CONSTRAINT fk_anx_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_anx_productor');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE anexos_01 ADD CONSTRAINT fk_anx_productor FOREIGN KEY (productor_id) REFERENCES productores(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_anx_estado');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE anexos_01 ADD CONSTRAINT fk_anx_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;
