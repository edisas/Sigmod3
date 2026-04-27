-- MIGRACION: enriquecimiento V3 de tabla unidades_produccion
-- Fecha: 2026-04-26
-- Sprint 2.1.B — estructura operativa: unidades de producción (huertos sv01_sv02).
--
-- La tabla unidades_produccion ya existe en V3 con un schema MUY rico (60+
-- columnas) heredado del intento previo. Está vacía. Conserva el campo
-- numero_inscripcion VARCHAR(20) que es la clave histórica del legacy.
--
-- Esta migración la enriquece con:
--   - productor_id (FK a productores.id, INT UNSIGNED, NULL durante captura)
--   - created_by_user_id, updated_by_user_id (audit)
--   - figura_cooperadora_id (NULL, INT signed por compat con figura_cooperadora.id)
--   - UNIQUE en numero_inscripcion (clave de negocio única)
-- + FKs e índices.

START TRANSACTION;

-- Columnas nuevas
ALTER TABLE unidades_produccion
  ADD COLUMN IF NOT EXISTS productor_id INT(10) UNSIGNED NULL AFTER nombre_propietario,
  ADD COLUMN IF NOT EXISTS figura_cooperadora_id INT NULL AFTER productor_id,
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL;

-- Asegurar tipo correcto de figura_cooperadora_id (match figura_cooperadora.id INT(11) signed)
ALTER TABLE unidades_produccion MODIFY COLUMN figura_cooperadora_id INT(11) NULL;

-- UNIQUE + índices
ALTER TABLE unidades_produccion
  ADD UNIQUE KEY IF NOT EXISTS uk_unidades_produccion_ni (numero_inscripcion),
  ADD KEY IF NOT EXISTS idx_unidades_productor (productor_id),
  ADD KEY IF NOT EXISTS idx_unidades_figura (figura_cooperadora_id),
  ADD KEY IF NOT EXISTS idx_unidades_estado (estado_id),
  ADD KEY IF NOT EXISTS idx_unidades_municipio (municipio_id),
  ADD KEY IF NOT EXISTS idx_unidades_estatus (estatus_id),
  ADD KEY IF NOT EXISTS idx_unidades_created_by (created_by_user_id),
  ADD KEY IF NOT EXISTS idx_unidades_updated_by (updated_by_user_id);

-- FK productor
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_unidades_productor');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE unidades_produccion ADD CONSTRAINT fk_unidades_productor FOREIGN KEY (productor_id) REFERENCES productores(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK figura_cooperadora
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_unidades_figura');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE unidades_produccion ADD CONSTRAINT fk_unidades_figura FOREIGN KEY (figura_cooperadora_id) REFERENCES figura_cooperadora(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK estatus
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_unidades_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE unidades_produccion ADD CONSTRAINT fk_unidades_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK estado
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_unidades_estado');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE unidades_produccion ADD CONSTRAINT fk_unidades_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK municipio
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_unidades_municipio');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE unidades_produccion ADD CONSTRAINT fk_unidades_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK created_by
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_unidades_created_by');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE unidades_produccion ADD CONSTRAINT fk_unidades_created_by FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK updated_by
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_unidades_updated_by');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE unidades_produccion ADD CONSTRAINT fk_unidades_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;
