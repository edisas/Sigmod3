-- MIGRACION: Catalogo Figura Cooperadora
-- Fecha: 2026-03-10

START TRANSACTION;

CREATE TABLE IF NOT EXISTS figura_cooperadora (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(200) NOT NULL,
  nombre_corto VARCHAR(30) NOT NULL,
  tipo_figura_id INT(10) UNSIGNED NOT NULL,
  domicilio VARCHAR(300) NOT NULL,
  localidad_id INT(10) UNSIGNED NOT NULL,
  municipio_id INT(10) UNSIGNED NOT NULL,
  estado_id INT(10) UNSIGNED NOT NULL,
  correo_electronico VARCHAR(100) NOT NULL,
  telefono VARCHAR(50) NOT NULL,
  celular_contacto VARCHAR(30) NOT NULL,
  contacto_id INT(10) UNSIGNED NOT NULL COMMENT 'relacion con tabla funcionarios',
  estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NULL,
  edited_at DATETIME NULL,
  created_date DATE NULL,
  edited_date DATE NULL,
  PRIMARY KEY (id),
  KEY idx_figura_cooperadora_tipo (tipo_figura_id),
  KEY idx_figura_cooperadora_estado (estado_id),
  KEY idx_figura_cooperadora_municipio (municipio_id),
  KEY idx_figura_cooperadora_localidad (localidad_id),
  KEY idx_figura_cooperadora_contacto (contacto_id),
  KEY idx_figura_cooperadora_estatus (estatus_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

ALTER TABLE figura_cooperadora
  ADD COLUMN IF NOT EXISTS nombre VARCHAR(200) NOT NULL,
  ADD COLUMN IF NOT EXISTS nombre_corto VARCHAR(30) NOT NULL,
  ADD COLUMN IF NOT EXISTS tipo_figura_id INT(10) UNSIGNED NOT NULL,
  ADD COLUMN IF NOT EXISTS domicilio VARCHAR(300) NOT NULL,
  ADD COLUMN IF NOT EXISTS localidad_id INT(10) UNSIGNED NOT NULL,
  ADD COLUMN IF NOT EXISTS municipio_id INT(10) UNSIGNED NOT NULL,
  ADD COLUMN IF NOT EXISTS estado_id INT(10) UNSIGNED NOT NULL,
  ADD COLUMN IF NOT EXISTS correo_electronico VARCHAR(100) NOT NULL,
  ADD COLUMN IF NOT EXISTS telefono VARCHAR(50) NOT NULL,
  ADD COLUMN IF NOT EXISTS celular_contacto VARCHAR(30) NOT NULL,
  ADD COLUMN IF NOT EXISTS contacto_id INT(10) UNSIGNED NOT NULL,
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE figura_cooperadora
  MODIFY COLUMN tipo_figura_id INT NOT NULL,
  MODIFY COLUMN localidad_id INT NOT NULL,
  MODIFY COLUMN municipio_id INT NOT NULL,
  MODIFY COLUMN estado_id INT NOT NULL,
  MODIFY COLUMN contacto_id INT NOT NULL,
  MODIFY COLUMN estatus_id INT NOT NULL DEFAULT 1;

-- Compatibilidad legacy: renombrar "domiclio" -> "domicilio" si aplica
SET @has_domicilio := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'figura_cooperadora'
    AND COLUMN_NAME = 'domicilio'
);
SET @has_domiclio := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'figura_cooperadora'
    AND COLUMN_NAME = 'domiclio'
);
SET @rename_sql := IF(
  @has_domicilio = 0 AND @has_domiclio = 1,
  'ALTER TABLE figura_cooperadora CHANGE COLUMN domiclio domicilio VARCHAR(300) NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @rename_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE figura_cooperadora
  ADD KEY IF NOT EXISTS idx_figura_cooperadora_tipo (tipo_figura_id),
  ADD KEY IF NOT EXISTS idx_figura_cooperadora_estado (estado_id),
  ADD KEY IF NOT EXISTS idx_figura_cooperadora_municipio (municipio_id),
  ADD KEY IF NOT EXISTS idx_figura_cooperadora_localidad (localidad_id),
  ADD KEY IF NOT EXISTS idx_figura_cooperadora_contacto (contacto_id),
  ADD KEY IF NOT EXISTS idx_figura_cooperadora_estatus (estatus_id);

-- Sincroniza tipo de columna local con la columna referenciada para evitar FK error 150.
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_sync_fk_column_type $$
CREATE PROCEDURE sp_sync_fk_column_type(
  IN p_local_table VARCHAR(64),
  IN p_local_column VARCHAR(64),
  IN p_ref_table VARCHAR(64),
  IN p_ref_column VARCHAR(64)
)
BEGIN
  DECLARE v_ref_column_type VARCHAR(128);
  DECLARE v_ref_nullable VARCHAR(3);
  DECLARE v_local_nullable VARCHAR(3);
  DECLARE v_local_default TEXT;

  SELECT column_type, is_nullable
    INTO v_ref_column_type, v_ref_nullable
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = p_ref_table
    AND column_name = p_ref_column
  LIMIT 1;

  IF v_ref_column_type IS NOT NULL THEN
    SELECT is_nullable, column_default
      INTO v_local_nullable, v_local_default
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = p_local_table
      AND column_name = p_local_column
    LIMIT 1;

    SET @null_sql := IF(v_local_nullable = 'YES', 'NULL', 'NOT NULL');
    SET @default_sql := IF(v_local_default IS NULL, '', CONCAT(' DEFAULT ', QUOTE(v_local_default)));
    SET @alter_sql := CONCAT(
      'ALTER TABLE `', p_local_table, '` MODIFY COLUMN `', p_local_column, '` ',
      v_ref_column_type, ' ', @null_sql, @default_sql
    );

    PREPARE stmt FROM @alter_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DELIMITER ;

CALL sp_sync_fk_column_type('figura_cooperadora', 'tipo_figura_id', 'figura_cooperadora_tipo', 'id');
CALL sp_sync_fk_column_type('figura_cooperadora', 'estado_id', 'estados', 'id');
CALL sp_sync_fk_column_type('figura_cooperadora', 'municipio_id', 'municipios', 'id');
CALL sp_sync_fk_column_type('figura_cooperadora', 'localidad_id', 'localidades', 'id');
CALL sp_sync_fk_column_type('figura_cooperadora', 'contacto_id', 'funcionarios', 'id');
CALL sp_sync_fk_column_type('figura_cooperadora', 'estatus_id', 'estatus', 'id');

DROP PROCEDURE IF EXISTS sp_sync_fk_column_type;

-- FK: tipo figura
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'figura_cooperadora'
    AND CONSTRAINT_NAME = 'fk_figura_cooperadora_tipo'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE figura_cooperadora ADD CONSTRAINT fk_figura_cooperadora_tipo FOREIGN KEY (tipo_figura_id) REFERENCES figura_cooperadora_tipo(id) ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK: estado
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'figura_cooperadora'
    AND CONSTRAINT_NAME = 'fk_figura_cooperadora_estado'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE figura_cooperadora ADD CONSTRAINT fk_figura_cooperadora_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK: municipio
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'figura_cooperadora'
    AND CONSTRAINT_NAME = 'fk_figura_cooperadora_municipio'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE figura_cooperadora ADD CONSTRAINT fk_figura_cooperadora_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK: localidad
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'figura_cooperadora'
    AND CONSTRAINT_NAME = 'fk_figura_cooperadora_localidad'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE figura_cooperadora ADD CONSTRAINT fk_figura_cooperadora_localidad FOREIGN KEY (localidad_id) REFERENCES localidades(id) ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK: contacto funcionario
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'figura_cooperadora'
    AND CONSTRAINT_NAME = 'fk_figura_cooperadora_contacto'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE figura_cooperadora ADD CONSTRAINT fk_figura_cooperadora_contacto FOREIGN KEY (contacto_id) REFERENCES funcionarios(id) ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK: estatus
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'figura_cooperadora'
    AND CONSTRAINT_NAME = 'fk_figura_cooperadora_estatus'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE figura_cooperadora ADD CONSTRAINT fk_figura_cooperadora_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;
