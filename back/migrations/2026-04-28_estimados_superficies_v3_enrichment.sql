-- MIGRACION: enriquecimiento V3 de estimados_cosecha, bitacora_estimados_cosecha,
--            superficies_registradas, estados_fenologicos
-- Fecha: 2026-04-28
-- Sprint 3.B — datos productivos del huerto: superficies sembradas y
--              estimados de cosecha por variedad.
--
-- estimados_cosecha: una fila por (unidad_produccion, variedad). Se actualiza
-- en cada nuevo estimado y guarda snapshot en bitacora_estimados_cosecha.
-- Tiene saldo (kg movilizables restantes) que disminuye al emitir TMIMFs.
--
-- superficies_registradas: una fila por (unidad_produccion, variedad).
-- Hectáreas sembradas + estado fenológico actual + facturación.
--
-- estados_fenologicos: catálogo de fases del cultivo (floración, fructificación,
-- maduración, etc.). Se enriquece con estatus_id + clave humana.

START TRANSACTION;

-- =========================================================
-- (1) estimados_cosecha
-- =========================================================
ALTER TABLE estimados_cosecha
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1 AFTER kg_estimados,
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE estimados_cosecha
  ADD UNIQUE KEY IF NOT EXISTS uk_estimado_unidad_variedad (unidad_produccion_id, variedad_id),
  ADD KEY IF NOT EXISTS idx_estimado_estatus (estatus_id),
  ADD KEY IF NOT EXISTS idx_estimado_unidad (unidad_produccion_id),
  ADD KEY IF NOT EXISTS idx_estimado_variedad (variedad_id);

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_ec_unidad');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE estimados_cosecha ADD CONSTRAINT fk_ec_unidad FOREIGN KEY (unidad_produccion_id) REFERENCES unidades_produccion(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_ec_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE estimados_cosecha ADD CONSTRAINT fk_ec_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_ec_usuario_estimo');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE estimados_cosecha ADD CONSTRAINT fk_ec_usuario_estimo FOREIGN KEY (usuario_estimo_id) REFERENCES usuarios(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =========================================================
-- (2) bitacora_estimados_cosecha — solo audit de cambios
-- =========================================================
ALTER TABLE bitacora_estimados_cosecha
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS motivo VARCHAR(200) NULL AFTER kg_estimados;

ALTER TABLE bitacora_estimados_cosecha
  ADD KEY IF NOT EXISTS idx_bec_estimado (estimado_id),
  ADD KEY IF NOT EXISTS idx_bec_fecha (fecha_estimacion);

-- =========================================================
-- (3) superficies_registradas
-- =========================================================
ALTER TABLE superficies_registradas
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1 AFTER ejercicio_fiscal,
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE superficies_registradas
  ADD UNIQUE KEY IF NOT EXISTS uk_superficie_unidad_variedad (unidad_produccion_id, variedad_id),
  ADD KEY IF NOT EXISTS idx_superficie_estatus (estatus_id),
  ADD KEY IF NOT EXISTS idx_superficie_fenologia (fenologia_id);

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_superficie_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE superficies_registradas ADD CONSTRAINT fk_superficie_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_superficie_fenologia');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE superficies_registradas ADD CONSTRAINT fk_superficie_fenologia FOREIGN KEY (fenologia_id) REFERENCES estados_fenologicos(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =========================================================
-- (4) estados_fenologicos — catálogo simple
-- =========================================================
ALTER TABLE estados_fenologicos
  ADD COLUMN IF NOT EXISTS clave VARCHAR(40) NULL AFTER id,
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1 AFTER descripcion,
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE estados_fenologicos
  ADD KEY IF NOT EXISTS idx_fenologico_estatus (estatus_id);

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_fenologico_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE estados_fenologicos ADD CONSTRAINT fk_fenologico_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;
