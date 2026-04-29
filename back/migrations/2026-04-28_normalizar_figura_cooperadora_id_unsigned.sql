-- MIGRACION: normalizar figura_cooperadora.id a INT(10) UNSIGNED
-- Fecha: 2026-04-28
-- Sprint 10 — limpieza de deuda técnica.
--
-- La migración 2026-03-10_catalogo_figura_cooperadora.sql declaró id como
-- INT(11) signed por error (debió ser INT(10) UNSIGNED como el resto del
-- schema). Esto forzó a que TODAS las tablas que referencian a
-- figura_cooperadora.id usen INT(11) signed por compat con MariaDB.
--
-- Esta migración:
--   1. Drop las 8 FKs entrantes a figura_cooperadora.id.
--   2. ALTER cada columna figura_cooperadora_id en las 10 tablas afectadas
--      a INT(10) UNSIGNED (preservando NULL/NOT NULL).
--   3. ALTER figura_cooperadora.id a INT(10) UNSIGNED AUTO_INCREMENT.
--   4. Recrear las 8 FKs entrantes.
--   5. Crear FK faltante en funcionarios (drift previo).
--
-- Pre-condición verificada: figura_cooperadora.MAX(id) = 1, todos los IDs
-- son positivos. El cambio signed→unsigned no rompe datos.
--
-- Idempotente: cada FK check via information_schema, cada MODIFY es seguro
-- de re-aplicar (deja el tipo correcto si ya está bien).

START TRANSACTION;

-- =========================================================
-- (1) DROP FKs entrantes
-- =========================================================

ALTER TABLE figura_cooperadora_detalle_autorizaciones DROP FOREIGN KEY IF EXISTS fk_fcda_figura;
ALTER TABLE figura_cooperadora_detalle_estados        DROP FOREIGN KEY IF EXISTS fk_fcde_figura;
ALTER TABLE productores                               DROP FOREIGN KEY IF EXISTS fk_productores_figura;
ALTER TABLE rutas                                     DROP FOREIGN KEY IF EXISTS fk_rutas_figura;
ALTER TABLE trampas                                   DROP FOREIGN KEY IF EXISTS fk_trampas_figura;
ALTER TABLE tramperos                                 DROP FOREIGN KEY IF EXISTS fk_tramperos_figura;
ALTER TABLE unidades_produccion                       DROP FOREIGN KEY IF EXISTS fk_unidades_figura;
ALTER TABLE usuarios                                  DROP FOREIGN KEY IF EXISTS fk_usuarios_figura_cooperadora;

-- =========================================================
-- (2) ALTER tipo de columnas FK
-- =========================================================
-- Reglas de nullability (basado en schema histórico):
--   NOT NULL: figura_cooperadora_detalle_autorizaciones, figura_cooperadora_detalle_estados, modulos
--   NULL: productores, unidades_produccion, rutas, tramperos, trampas, usuarios, funcionarios

ALTER TABLE figura_cooperadora_detalle_autorizaciones MODIFY COLUMN figura_cooperadora_id INT(10) UNSIGNED NOT NULL;
ALTER TABLE figura_cooperadora_detalle_estados        MODIFY COLUMN figura_cooperadora_id INT(10) UNSIGNED NOT NULL;
ALTER TABLE productores                               MODIFY COLUMN figura_cooperadora_id INT(10) UNSIGNED NULL;
ALTER TABLE rutas                                     MODIFY COLUMN figura_cooperadora_id INT(10) UNSIGNED NULL;
ALTER TABLE trampas                                   MODIFY COLUMN figura_cooperadora_id INT(10) UNSIGNED NULL;
ALTER TABLE tramperos                                 MODIFY COLUMN figura_cooperadora_id INT(10) UNSIGNED NULL;
ALTER TABLE unidades_produccion                       MODIFY COLUMN figura_cooperadora_id INT(10) UNSIGNED NULL;
ALTER TABLE usuarios                                  MODIFY COLUMN figura_cooperadora_id INT(10) UNSIGNED NULL;
ALTER TABLE modulos                                   MODIFY COLUMN figura_cooperadora_id INT(10) UNSIGNED NOT NULL;
-- funcionarios ya está como INT(10) UNSIGNED — solo le agregamos FK más abajo.

-- =========================================================
-- (3) ALTER figura_cooperadora.id
-- =========================================================
ALTER TABLE figura_cooperadora MODIFY COLUMN id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT;

-- =========================================================
-- (4) Recrear FKs entrantes (con sus reglas originales)
-- =========================================================

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_fcda_figura');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE figura_cooperadora_detalle_autorizaciones ADD CONSTRAINT fk_fcda_figura FOREIGN KEY (figura_cooperadora_id) REFERENCES figura_cooperadora(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_fcde_figura');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE figura_cooperadora_detalle_estados ADD CONSTRAINT fk_fcde_figura FOREIGN KEY (figura_cooperadora_id) REFERENCES figura_cooperadora(id) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_productores_figura');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE productores ADD CONSTRAINT fk_productores_figura FOREIGN KEY (figura_cooperadora_id) REFERENCES figura_cooperadora(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_rutas_figura');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE rutas ADD CONSTRAINT fk_rutas_figura FOREIGN KEY (figura_cooperadora_id) REFERENCES figura_cooperadora(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_trampas_figura');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE trampas ADD CONSTRAINT fk_trampas_figura FOREIGN KEY (figura_cooperadora_id) REFERENCES figura_cooperadora(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_tramperos_figura');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE tramperos ADD CONSTRAINT fk_tramperos_figura FOREIGN KEY (figura_cooperadora_id) REFERENCES figura_cooperadora(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_unidades_figura');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE unidades_produccion ADD CONSTRAINT fk_unidades_figura FOREIGN KEY (figura_cooperadora_id) REFERENCES figura_cooperadora(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_usuarios_figura_cooperadora');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_figura_cooperadora FOREIGN KEY (figura_cooperadora_id) REFERENCES figura_cooperadora(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =========================================================
-- (5) FK faltante en funcionarios — DIFERIDA
-- =========================================================
-- funcionarios.figura_cooperadora_id (int(10) unsigned) ya estaba en
-- el tipo correcto pero sin FK. Tiene 4 filas con valores que NO
-- existen en figura_cooperadora (solo 1 fila id=1), así que crear la
-- FK rompe con errno 1452. Se omite hasta que se haga limpieza de
-- datos (UPDATE funcionarios SET figura_cooperadora_id = NULL para
-- los huérfanos, o crear las figura_cooperadora correspondientes).
-- Backlog: ver project_v3_backlog.md.

COMMIT;
