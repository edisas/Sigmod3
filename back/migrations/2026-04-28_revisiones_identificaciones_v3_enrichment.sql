-- MIGRACION: enriquecimiento V3 de trampas_revisiones + identificaciones_trampa
-- Fecha: 2026-04-28
-- Sprint 2.3.B — captura semanal de revisiones e identificaciones de moscas.
--
-- trampas_revisiones: una fila por trampa por semana revisada. Indica
-- numero_semana, fecha, status_revision (ej. activa/sin colocar), tipo_producto,
-- días de exposición, observaciones, validado.
--
-- identificaciones_trampa: una fila por especie detectada en una revisión.
-- Una revisión puede tener múltiples identificaciones (una por especie con
-- conteos hembras/machos silvestre + estéril).
--
-- Ambas tablas existían vacías. Esta migración enriquece con audit V3.

START TRANSACTION;

-- =========================================================
-- (1) trampas_revisiones
-- =========================================================
ALTER TABLE trampas_revisiones
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1 AFTER validado,
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE trampas_revisiones
  ADD KEY IF NOT EXISTS idx_revisiones_trampa (trampa_id),
  ADD KEY IF NOT EXISTS idx_revisiones_estatus (estatus_id),
  ADD KEY IF NOT EXISTS idx_revisiones_semana (numero_semana),
  ADD KEY IF NOT EXISTS idx_revisiones_fecha (fecha_revision),
  ADD KEY IF NOT EXISTS idx_revisiones_status_rev (status_revision_id);

-- FK estatus
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_revisiones_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE trampas_revisiones ADD CONSTRAINT fk_revisiones_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK trampa
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_revisiones_trampa');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE trampas_revisiones ADD CONSTRAINT fk_revisiones_trampa FOREIGN KEY (trampa_id) REFERENCES trampas(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK status_revision (catálogo)
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_revisiones_status_revision');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE trampas_revisiones ADD CONSTRAINT fk_revisiones_status_revision FOREIGN KEY (status_revision_id) REFERENCES status_revision(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK usuario_id (quien capturó)
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_revisiones_usuario');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE trampas_revisiones ADD CONSTRAINT fk_revisiones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- UNIQUE (trampa_id, numero_semana) — una revisión por trampa por semana
ALTER TABLE trampas_revisiones
  ADD UNIQUE KEY IF NOT EXISTS uk_revisiones_trampa_semana (trampa_id, numero_semana);

-- =========================================================
-- (2) identificaciones_trampa
-- =========================================================
ALTER TABLE identificaciones_trampa
  ADD COLUMN IF NOT EXISTS estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1 AFTER usuario_id,
  ADD COLUMN IF NOT EXISTS created_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id INT(10) UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE identificaciones_trampa
  ADD KEY IF NOT EXISTS idx_ident_revision (revision_id),
  ADD KEY IF NOT EXISTS idx_ident_trampa (trampa_id),
  ADD KEY IF NOT EXISTS idx_ident_especie (especie_mosca_id),
  ADD KEY IF NOT EXISTS idx_ident_tecnico (tecnico_id),
  ADD KEY IF NOT EXISTS idx_ident_estatus (estatus_id),
  ADD KEY IF NOT EXISTS idx_ident_semana (numero_semana);

-- UNIQUE (revision_id, especie_mosca_id) — una identificación por especie por revisión
ALTER TABLE identificaciones_trampa
  ADD UNIQUE KEY IF NOT EXISTS uk_ident_revision_especie (revision_id, especie_mosca_id);

-- FKs
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_ident_estatus');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE identificaciones_trampa ADD CONSTRAINT fk_ident_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_ident_revision');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE identificaciones_trampa ADD CONSTRAINT fk_ident_revision FOREIGN KEY (revision_id) REFERENCES trampas_revisiones(id) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_ident_trampa');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE identificaciones_trampa ADD CONSTRAINT fk_ident_trampa FOREIGN KEY (trampa_id) REFERENCES trampas(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_ident_tecnico');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE identificaciones_trampa ADD CONSTRAINT fk_ident_tecnico FOREIGN KEY (tecnico_id) REFERENCES tramperos(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_ident_usuario');
SET @fk_sql := IF(@fk_exists=0, 'ALTER TABLE identificaciones_trampa ADD CONSTRAINT fk_ident_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;
