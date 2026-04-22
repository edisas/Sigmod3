-- MIGRACION: Catalogo Tipos de Figura Cooperadora (FCOOP)
-- Fecha: 2026-03-10

START TRANSACTION;

CREATE TABLE IF NOT EXISTS figura_cooperadora_tipo (
  id INT(11) NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(50) NOT NULL,
  descripcion VARCHAR(300) NOT NULL,
  estatus_id INT(10) UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_figura_cooperadora_tipo_estatus (estatus_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

ALTER TABLE figura_cooperadora_tipo
  ADD COLUMN IF NOT EXISTS nombre VARCHAR(50) NOT NULL,
  ADD COLUMN IF NOT EXISTS descripcion VARCHAR(300) NOT NULL,
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE figura_cooperadora_tipo
  MODIFY COLUMN estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE figura_cooperadora_tipo
  ADD KEY IF NOT EXISTS idx_figura_cooperadora_tipo_estatus (estatus_id);

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'figura_cooperadora_tipo'
    AND CONSTRAINT_NAME = 'fk_figura_cooperadora_tipo_estatus'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE figura_cooperadora_tipo ADD CONSTRAINT fk_figura_cooperadora_tipo_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;
