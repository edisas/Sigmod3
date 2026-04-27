-- MIGRACION: enriquecimiento V3 de tabla productores
-- Fecha: 2026-04-26
-- Sprint 2.1.A — estructura operativa: productores.
--
-- La tabla `productores` ya existe en la BD V3 (intento previo) con schema
-- razonable: tipo_persona, rfc, razon_social, dirección, contacto, audit
-- básico (created_at/edited_at/created_date/edited_date). Está vacía.
--
-- Esta migración la enriquece con:
--   - estatus_id (1=activo, 2=inactivo) + FK
--   - figura_cooperadora_id NULL + FK (opcional, asignación a figura)
--   - created_by_user_id, updated_by_user_id NULL + FK
--   - updated_at DATETIME NULL ON UPDATE
--   - UNIQUE rfc + índices
--
-- Sin DROP. La tabla está vacía pero su existencia preserva FKs que otras
-- tablas operativas (unidades_produccion vía nombre_propietario, futuro
-- productor_id) van a referenciar.

START TRANSACTION;

-- Columnas nuevas
ALTER TABLE productores
  ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER correo_electronico,
  ADD COLUMN IF NOT EXISTS figura_cooperadora_id INT UNSIGNED NULL AFTER estatus_id,
  ADD COLUMN IF NOT EXISTS created_by_user_id INT UNSIGNED NULL AFTER figura_cooperadora_id,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT UNSIGNED NULL AFTER created_by_user_id,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- Índices y unique
ALTER TABLE productores
  ADD UNIQUE KEY IF NOT EXISTS uk_productores_rfc (rfc),
  ADD KEY IF NOT EXISTS idx_productores_estado (estado_id),
  ADD KEY IF NOT EXISTS idx_productores_municipio (municipio_id),
  ADD KEY IF NOT EXISTS idx_productores_estatus (estatus_id),
  ADD KEY IF NOT EXISTS idx_productores_figura (figura_cooperadora_id),
  ADD KEY IF NOT EXISTS idx_productores_created_by (created_by_user_id),
  ADD KEY IF NOT EXISTS idx_productores_updated_by (updated_by_user_id);

-- FKs (idempotente: chequear information_schema antes de agregar)
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_productores_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE productores ADD CONSTRAINT fk_productores_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_productores_estado');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE productores ADD CONSTRAINT fk_productores_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_productores_municipio');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE productores ADD CONSTRAINT fk_productores_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_productores_figura');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE productores ADD CONSTRAINT fk_productores_figura FOREIGN KEY (figura_cooperadora_id) REFERENCES figura_cooperadora(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_productores_created_by');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE productores ADD CONSTRAINT fk_productores_created_by FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_productores_updated_by');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE productores ADD CONSTRAINT fk_productores_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

COMMIT;
