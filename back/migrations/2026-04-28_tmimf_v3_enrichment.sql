-- MIGRACION: enriquecimiento V3 de tmimf + detallado_tmimf + cancelaciones
-- Fecha: 2026-04-28
-- Sprint 3.A — Tarjeta de Movimiento Interestatal de Mercancías Fitosanitarias.
--
-- Es la tabla más importante del legacy: cada TMIMF representa una emisión
-- de tarjeta para movilizar fruta entre estados. Cada TMIMF tiene N
-- detallados (uno por variedad/lote movilizado).
--
-- Tablas existentes en V3 (vacías):
--   tmimf (70+ cols) — folio único, vinculada a unidad_produccion, ruta,
--     vehículo, módulo emisor, mercado, funcionario que aprobó.
--   detallado_tmimf — variedad, cantidad_movilizada, saldo (resto sin
--     movilizar), cajas por tamaño, granel, tipo_vehiculo, placas.
--   cancelaciones — auditoría tipo_documento + motivo + usuario.
--
-- Esta migración agrega audit V3 (created_by_user_id, updated_by_user_id,
-- updated_at) + UNIQUE en folio_tmimf + FKs faltantes a unidad_produccion,
-- usuarios (varios), estado_fenologico (no existe aún, omitido).

START TRANSACTION;

-- =========================================================
-- (1) tmimf
-- =========================================================
ALTER TABLE tmimf
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL;

ALTER TABLE tmimf
  ADD UNIQUE KEY IF NOT EXISTS uk_tmimf_folio (folio_tmimf),
  ADD KEY IF NOT EXISTS idx_tmimf_unidad (unidad_produccion_id),
  ADD KEY IF NOT EXISTS idx_tmimf_tipo_tarjeta (tipo_tarjeta),
  ADD KEY IF NOT EXISTS idx_tmimf_fecha_emision (fecha_emision),
  ADD KEY IF NOT EXISTS idx_tmimf_estatus (estatus_id);

-- FK a unidad_produccion
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_tmimf_unidad');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE tmimf ADD CONSTRAINT fk_tmimf_unidad FOREIGN KEY (unidad_produccion_id) REFERENCES unidades_produccion(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK created_by
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_tmimf_created_by');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE tmimf ADD CONSTRAINT fk_tmimf_created_by FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK updated_by
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_tmimf_updated_by');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE tmimf ADD CONSTRAINT fk_tmimf_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =========================================================
-- (2) detallado_tmimf
-- =========================================================
ALTER TABLE detallado_tmimf
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE detallado_tmimf
  ADD KEY IF NOT EXISTS idx_det_tmimf (tmimf_id),
  ADD KEY IF NOT EXISTS idx_det_unidad (unidad_produccion_id),
  ADD KEY IF NOT EXISTS idx_det_estatus (estatus_id);

-- FK a unidad_produccion
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_det_tmimf_unidad');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE detallado_tmimf ADD CONSTRAINT fk_det_tmimf_unidad FOREIGN KEY (unidad_produccion_id) REFERENCES unidades_produccion(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =========================================================
-- (3) cancelaciones — solo audit V3 (tabla simple)
-- =========================================================
ALTER TABLE cancelaciones
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1 AFTER serie,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE cancelaciones
  ADD KEY IF NOT EXISTS idx_cancel_tipo_folio (tipo_documento, folio_documento),
  ADD KEY IF NOT EXISTS idx_cancel_fecha (fecha_cancelacion);

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_cancel_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE cancelaciones ADD CONSTRAINT fk_cancel_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;
