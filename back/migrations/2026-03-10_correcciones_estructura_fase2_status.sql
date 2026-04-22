-- MIGRACION: Correcciones estructurales Fase 2 (normalizacion activo/status -> estatus_id)
-- Fecha: 2026-03-10

START TRANSACTION;

-- Colonias: activo -> estatus_id
ALTER TABLE colonias
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1;

UPDATE colonias
SET estatus_id = CASE
  WHEN IFNULL(activo, 1) = 1 THEN 1
  ELSE 2
END
WHERE estatus_id IS NULL OR estatus_id = 0;

ALTER TABLE colonias
  ADD KEY IF NOT EXISTS idx_colonias_estatus_id (estatus_id);

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'colonias'
    AND constraint_name = 'fk_colonias_estatus_id'
    AND constraint_type = 'FOREIGN KEY'
);
SET @fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE colonias ADD CONSTRAINT fk_colonias_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Unidades de produccion: activo -> estatus_id (si no existe)
ALTER TABLE unidades_produccion
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1;

UPDATE unidades_produccion
SET estatus_id = CASE
  WHEN IFNULL(activo, 1) = 1 THEN 1
  ELSE 2
END
WHERE estatus_id IS NULL OR estatus_id = 0;

ALTER TABLE unidades_produccion
  ADD KEY IF NOT EXISTS idx_up_estatus_id (estatus_id);

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'unidades_produccion'
    AND constraint_name = 'fk_up_estatus_id'
    AND constraint_type = 'FOREIGN KEY'
);
SET @fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE unidades_produccion ADD CONSTRAINT fk_up_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Depositos: status enum('A','I','C') -> estatus_id
ALTER TABLE depositos
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1;

-- Mapeo sugerido: A=1 (Activo), I=2 (Inactivo), C=3 (Cancelado/Cancelada)
UPDATE depositos
SET estatus_id = CASE
  WHEN status = 'A' THEN 1
  WHEN status = 'I' THEN 2
  WHEN status = 'C' THEN 3
  ELSE 1
END
WHERE estatus_id IS NULL OR estatus_id = 0;

ALTER TABLE depositos
  ADD KEY IF NOT EXISTS idx_depositos_estatus_id (estatus_id);

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'depositos'
    AND constraint_name = 'fk_depositos_estatus_id'
    AND constraint_type = 'FOREIGN KEY'
);
SET @fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE depositos ADD CONSTRAINT fk_depositos_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;
