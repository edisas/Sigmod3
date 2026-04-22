-- MIGRACION: Campos globales de auditoria de fechas
-- Fecha: 2026-03-10
-- Objetivo: agregar en TODAS las tablas:
--   created_at DATETIME NULL
--   edited_at  DATETIME NULL
--   created_date DATE NULL
--   edited_date  DATE NULL
--
-- Nota: script idempotente. No sobreescribe columnas existentes.

START TRANSACTION;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_add_global_audit_date_columns $$
CREATE PROCEDURE sp_add_global_audit_date_columns()
BEGIN
  DECLARE v_done INT DEFAULT 0;
  DECLARE v_table VARCHAR(128);

  DECLARE cur CURSOR FOR
    SELECT t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema = DATABASE()
      AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

  OPEN cur;

  read_loop: LOOP
    FETCH cur INTO v_table;
    IF v_done = 1 THEN
      LEAVE read_loop;
    END IF;

    SET @sql_stmt = CONCAT(
      'ALTER TABLE `', v_table, '` ',
      'ADD COLUMN IF NOT EXISTS `created_at` DATETIME NULL, ',
      'ADD COLUMN IF NOT EXISTS `edited_at` DATETIME NULL, ',
      'ADD COLUMN IF NOT EXISTS `created_date` DATE NULL, ',
      'ADD COLUMN IF NOT EXISTS `edited_date` DATE NULL'
    );

    PREPARE stmt FROM @sql_stmt;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END LOOP;

  CLOSE cur;
END $$

DELIMITER ;

CALL sp_add_global_audit_date_columns();
DROP PROCEDURE IF EXISTS sp_add_global_audit_date_columns;

COMMIT;
