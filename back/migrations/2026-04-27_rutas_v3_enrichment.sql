-- MIGRACION: enriquecimiento V3 de tabla rutas
-- Fecha: 2026-04-27
-- Sprint 2.2 — estructura operativa: rutas de trampeo.
--
-- La tabla rutas ya existe en V3 (vacía) con schema decente: nombre, modulo_id,
-- estado_id, dia_revision, capturista_id, trampero_id, estatus_id, created_by,
-- audit. FKs ya creadas a usuarios, estados, estatus, modulos, tramperos.
--
-- Esta migración la enriquece para alinearse con el patrón Sprint 2:
--   - updated_by_user_id (audit V3 — created_by ya existe)
--   - figura_cooperadora_id INT(11) signed (match figura_cooperadora.id)
--   - updated_at DATETIME ON UPDATE
--   - UNIQUE (estado_id, nombre) — evitar duplicados de ruta dentro de un estado
--   - Índices de búsqueda

START TRANSACTION;

ALTER TABLE rutas
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL AFTER created_by,
  ADD COLUMN IF NOT EXISTS figura_cooperadora_id INT NULL AFTER trampero_id,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- Asegura que figura_cooperadora_id es INT(11) signed (match figura_cooperadora.id).
ALTER TABLE rutas MODIFY COLUMN figura_cooperadora_id INT(11) NULL;

-- UNIQUE + índices
ALTER TABLE rutas
  ADD UNIQUE KEY IF NOT EXISTS uk_rutas_estado_nombre (estado_id, nombre),
  ADD KEY IF NOT EXISTS idx_rutas_estatus (estatus_id),
  ADD KEY IF NOT EXISTS idx_rutas_modulo (modulo_id),
  ADD KEY IF NOT EXISTS idx_rutas_capturista (capturista_id),
  ADD KEY IF NOT EXISTS idx_rutas_trampero (trampero_id),
  ADD KEY IF NOT EXISTS idx_rutas_figura (figura_cooperadora_id),
  ADD KEY IF NOT EXISTS idx_rutas_updated_by (updated_by_user_id);

-- FK figura_cooperadora
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_rutas_figura');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE rutas ADD CONSTRAINT fk_rutas_figura FOREIGN KEY (figura_cooperadora_id) REFERENCES figura_cooperadora(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK updated_by
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_rutas_updated_by');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE rutas ADD CONSTRAINT fk_rutas_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK capturista (si no existe)
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_rutas_capturista');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE rutas ADD CONSTRAINT fk_rutas_capturista FOREIGN KEY (capturista_id) REFERENCES usuarios(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;
