-- MIGRACION: enriquecimiento V3 de trampas + tramperos + tipos_trampa
-- Fecha: 2026-04-28
-- Sprint 2.3.A — capa operativa de trampas físicas.
--
-- 3 tablas existentes en V3 (vacías) con schemas decentes:
-- - tramperos: catálogo de personas que operan trampas (nombre, estatus, audit)
-- - tipos_trampa: catálogo nacional de tipos (Jackson, McPhail, etc.)
-- - trampas: tabla operativa rica (numero_trampa, ruta_id, unidad_produccion_id,
--   tipo_trampa_id, tecnico_id, hospedero_id, area_id, lat/lng, fechas, etc.)
--
-- Esta migración enriquece las 3 con audit cols V3 + FKs faltantes + UNIQUE.

START TRANSACTION;

-- =========================================================
-- (1) TRAMPEROS — catálogo de personas operadoras (por estado)
-- =========================================================
ALTER TABLE tramperos
  ADD COLUMN IF NOT EXISTS estado_id INT(10) UNSIGNED NULL AFTER nombre,
  ADD COLUMN IF NOT EXISTS figura_cooperadora_id INT NULL AFTER estado_id,
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE tramperos MODIFY COLUMN figura_cooperadora_id INT(11) NULL;

ALTER TABLE tramperos
  ADD UNIQUE KEY IF NOT EXISTS uk_tramperos_estado_nombre (estado_id, nombre),
  ADD KEY IF NOT EXISTS idx_tramperos_estado (estado_id),
  ADD KEY IF NOT EXISTS idx_tramperos_estatus (estatus_id),
  ADD KEY IF NOT EXISTS idx_tramperos_figura (figura_cooperadora_id);

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_tramperos_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE tramperos ADD CONSTRAINT fk_tramperos_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_tramperos_estado');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE tramperos ADD CONSTRAINT fk_tramperos_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_tramperos_figura');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE tramperos ADD CONSTRAINT fk_tramperos_figura FOREIGN KEY (figura_cooperadora_id) REFERENCES figura_cooperadora(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =========================================================
-- (2) TIPOS_TRAMPA — catálogo nacional (Jackson, McPhail, etc.)
-- =========================================================
ALTER TABLE tipos_trampa
  ADD COLUMN IF NOT EXISTS descripcion VARCHAR(200) NULL AFTER nombre,
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE tipos_trampa
  ADD UNIQUE KEY IF NOT EXISTS uk_tipos_trampa_nombre (nombre),
  ADD KEY IF NOT EXISTS idx_tipos_trampa_estatus (estatus_id);

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_tipos_trampa_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE tipos_trampa ADD CONSTRAINT fk_tipos_trampa_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =========================================================
-- (3) TRAMPAS — tabla operativa principal
-- =========================================================
ALTER TABLE trampas
  ADD COLUMN IF NOT EXISTS figura_cooperadora_id INT NULL AFTER unidad_produccion_id,
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE trampas MODIFY COLUMN figura_cooperadora_id INT(11) NULL;

ALTER TABLE trampas
  ADD UNIQUE KEY IF NOT EXISTS uk_trampas_estado_numero (estado_id, numero_trampa),
  ADD KEY IF NOT EXISTS idx_trampas_estatus (estatus_id),
  ADD KEY IF NOT EXISTS idx_trampas_ruta (ruta_id),
  ADD KEY IF NOT EXISTS idx_trampas_unidad (unidad_produccion_id),
  ADD KEY IF NOT EXISTS idx_trampas_estado (estado_id),
  ADD KEY IF NOT EXISTS idx_trampas_tipo (tipo_trampa_id),
  ADD KEY IF NOT EXISTS idx_trampas_tecnico (tecnico_id),
  ADD KEY IF NOT EXISTS idx_trampas_figura (figura_cooperadora_id);

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_trampas_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE trampas ADD CONSTRAINT fk_trampas_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_trampas_estado');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE trampas ADD CONSTRAINT fk_trampas_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_trampas_ruta');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE trampas ADD CONSTRAINT fk_trampas_ruta FOREIGN KEY (ruta_id) REFERENCES rutas(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_trampas_unidad');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE trampas ADD CONSTRAINT fk_trampas_unidad FOREIGN KEY (unidad_produccion_id) REFERENCES unidades_produccion(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_trampas_tipo');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE trampas ADD CONSTRAINT fk_trampas_tipo FOREIGN KEY (tipo_trampa_id) REFERENCES tipos_trampa(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_trampas_tecnico');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE trampas ADD CONSTRAINT fk_trampas_tecnico FOREIGN KEY (tecnico_id) REFERENCES tramperos(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_trampas_figura');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE trampas ADD CONSTRAINT fk_trampas_figura FOREIGN KEY (figura_cooperadora_id) REFERENCES figura_cooperadora(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;
