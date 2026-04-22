-- MIGRACION: Correcciones estructurales Fase 1 (criticas)
-- Fecha: 2026-03-10
-- Objetivo:
-- 1) Corregir typo domiclio -> domicilio
-- 2) Completar auditoria/indices/FKs de figura_cooperadora_detalle_*
-- 3) Completar FKs faltantes en catalogos base (estados/municipios/localidades)
--
-- La migracion es idempotente y evita crear FKs cuando hay huérfanos.

START TRANSACTION;

-- 0) Compatibilidad de nombre de columna en figura_cooperadora
SET @has_domicilio := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'figura_cooperadora'
    AND column_name = 'domicilio'
);
SET @has_domiclio := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'figura_cooperadora'
    AND column_name = 'domiclio'
);
SET @rename_sql := IF(
  @has_domicilio = 0 AND @has_domiclio = 1,
  'ALTER TABLE figura_cooperadora CHANGE COLUMN domiclio domicilio VARCHAR(300) NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @rename_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 1) Completar auditoria en figura_cooperadora_detalle_estados
ALTER TABLE figura_cooperadora_detalle_estados
  ADD COLUMN IF NOT EXISTS created_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS edited_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS created_date DATE NULL,
  ADD COLUMN IF NOT EXISTS edited_date DATE NULL;

-- 2) Indices minimos en tablas detalle figura cooperadora
ALTER TABLE figura_cooperadora_detalle_autorizaciones
  ADD KEY IF NOT EXISTS idx_fcda_figura (figura_cooperadora_id),
  ADD KEY IF NOT EXISTS idx_fcda_temporada (temporada_id),
  ADD KEY IF NOT EXISTS idx_fcda_funcionario (funcionario_autorizo_id),
  ADD KEY IF NOT EXISTS idx_fcda_estatus (estatus_id);

ALTER TABLE figura_cooperadora_detalle_estados
  ADD KEY IF NOT EXISTS idx_fcde_figura (figura_cooperadora_id),
  ADD KEY IF NOT EXISTS idx_fcde_estado (estado_id),
  ADD KEY IF NOT EXISTS idx_fcde_temporada (temporada_id),
  ADD KEY IF NOT EXISTS idx_fcde_estatus (estatus_id),
  ADD UNIQUE KEY IF NOT EXISTS uk_fcde_figura_estado_temporada (figura_cooperadora_id, estado_id, temporada_id);

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
  DECLARE v_local_nullable VARCHAR(3);
  DECLARE v_local_default TEXT;

  SELECT column_type
    INTO v_ref_column_type
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

    IF v_local_nullable IS NOT NULL THEN
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
  END IF;
END $$

DROP PROCEDURE IF EXISTS sp_add_fk_if_clean $$
CREATE PROCEDURE sp_add_fk_if_clean(
  IN p_local_table VARCHAR(64),
  IN p_local_column VARCHAR(64),
  IN p_ref_table VARCHAR(64),
  IN p_ref_column VARCHAR(64),
  IN p_fk_name VARCHAR(128),
  IN p_fk_tail VARCHAR(128)
)
BEGIN
  DECLARE v_fk_exists INT DEFAULT 0;
  DECLARE v_local_exists INT DEFAULT 0;
  DECLARE v_ref_exists INT DEFAULT 0;

  SELECT COUNT(*) INTO v_fk_exists
  FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = p_local_table
    AND constraint_name = p_fk_name
    AND constraint_type = 'FOREIGN KEY';

  SELECT COUNT(*) INTO v_local_exists
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = p_local_table
    AND column_name = p_local_column;

  SELECT COUNT(*) INTO v_ref_exists
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = p_ref_table
    AND column_name = p_ref_column;

  IF v_fk_exists = 0 AND v_local_exists = 1 AND v_ref_exists = 1 THEN
    SET @orphans := 0;
    SET @orph_sql := CONCAT(
      'SELECT COUNT(*) INTO @orphans ',
      'FROM `', p_local_table, '` l ',
      'LEFT JOIN `', p_ref_table, '` r ON r.`', p_ref_column, '` = l.`', p_local_column, '` ',
      'WHERE l.`', p_local_column, '` IS NOT NULL AND r.`', p_ref_column, '` IS NULL'
    );
    PREPARE stmt FROM @orph_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    IF @orphans = 0 THEN
      SET @fk_sql := CONCAT(
        'ALTER TABLE `', p_local_table, '` ',
        'ADD CONSTRAINT `', p_fk_name, '` FOREIGN KEY (`', p_local_column, '`) ',
        'REFERENCES `', p_ref_table, '` (`', p_ref_column, '`) ',
        p_fk_tail
      );
      PREPARE stmt FROM @fk_sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    END IF;
  END IF;
END $$

DELIMITER ;

-- 3) Sincronizar tipos para FKs faltantes/criticadas
CALL sp_sync_fk_column_type('estados', 'estatus_id', 'estatus', 'id');
CALL sp_sync_fk_column_type('municipios', 'estatus_id', 'estatus', 'id');
CALL sp_sync_fk_column_type('localidades', 'estado_id', 'estados', 'id');
CALL sp_sync_fk_column_type('localidades', 'estatus_id', 'estatus', 'id');

CALL sp_sync_fk_column_type('figura_cooperadora_detalle_autorizaciones', 'figura_cooperadora_id', 'figura_cooperadora', 'id');
CALL sp_sync_fk_column_type('figura_cooperadora_detalle_autorizaciones', 'temporada_id', 'temporadas', 'id');
CALL sp_sync_fk_column_type('figura_cooperadora_detalle_autorizaciones', 'funcionario_autorizo_id', 'funcionarios', 'id');
CALL sp_sync_fk_column_type('figura_cooperadora_detalle_autorizaciones', 'estatus_id', 'estatus', 'id');

CALL sp_sync_fk_column_type('figura_cooperadora_detalle_estados', 'figura_cooperadora_id', 'figura_cooperadora', 'id');
CALL sp_sync_fk_column_type('figura_cooperadora_detalle_estados', 'estado_id', 'estados', 'id');
CALL sp_sync_fk_column_type('figura_cooperadora_detalle_estados', 'temporada_id', 'temporadas', 'id');
CALL sp_sync_fk_column_type('figura_cooperadora_detalle_estados', 'estatus_id', 'estatus', 'id');

-- 4) Crear FKs faltantes cuando no haya huérfanos
CALL sp_add_fk_if_clean('estados', 'estatus_id', 'estatus', 'id', 'fk_estados_estatus', 'ON UPDATE CASCADE');
CALL sp_add_fk_if_clean('municipios', 'estatus_id', 'estatus', 'id', 'fk_municipios_estatus_id', 'ON UPDATE CASCADE');
CALL sp_add_fk_if_clean('localidades', 'estado_id', 'estados', 'id', 'fk_localidades_estado', 'ON UPDATE CASCADE');
CALL sp_add_fk_if_clean('localidades', 'estatus_id', 'estatus', 'id', 'fk_localidades_estatus', 'ON UPDATE CASCADE');

CALL sp_add_fk_if_clean('figura_cooperadora_detalle_autorizaciones', 'figura_cooperadora_id', 'figura_cooperadora', 'id', 'fk_fcda_figura', 'ON UPDATE CASCADE');
CALL sp_add_fk_if_clean('figura_cooperadora_detalle_autorizaciones', 'temporada_id', 'temporadas', 'id', 'fk_fcda_temporada', 'ON UPDATE CASCADE');
CALL sp_add_fk_if_clean('figura_cooperadora_detalle_autorizaciones', 'funcionario_autorizo_id', 'funcionarios', 'id', 'fk_fcda_funcionario', 'ON UPDATE CASCADE');
CALL sp_add_fk_if_clean('figura_cooperadora_detalle_autorizaciones', 'estatus_id', 'estatus', 'id', 'fk_fcda_estatus', 'ON UPDATE CASCADE');

CALL sp_add_fk_if_clean('figura_cooperadora_detalle_estados', 'figura_cooperadora_id', 'figura_cooperadora', 'id', 'fk_fcde_figura', 'ON DELETE CASCADE ON UPDATE CASCADE');
CALL sp_add_fk_if_clean('figura_cooperadora_detalle_estados', 'estado_id', 'estados', 'id', 'fk_fcde_estado', 'ON UPDATE CASCADE');
CALL sp_add_fk_if_clean('figura_cooperadora_detalle_estados', 'temporada_id', 'temporadas', 'id', 'fk_fcde_temporada', 'ON UPDATE CASCADE');
CALL sp_add_fk_if_clean('figura_cooperadora_detalle_estados', 'estatus_id', 'estatus', 'id', 'fk_fcde_estatus', 'ON UPDATE CASCADE');

DROP PROCEDURE IF EXISTS sp_add_fk_if_clean;
DROP PROCEDURE IF EXISTS sp_sync_fk_column_type;

COMMIT;
