-- ==========================================================================
-- MIGRACION: Normalizacion de status/estatus a estatus_id
-- Fecha: 2026-03-08
-- Nota: En el esquema no se detecto activo CHAR(1); se normalizan columnas
--       status/estatus de tipo ENUM/TINYINT que representan estatus de registro.
-- ==========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

-- Catalogo de estatus canonico
ALTER TABLE estatus
  ADD UNIQUE KEY IF NOT EXISTS uk_estatus_nombre (nombre);

INSERT INTO estatus (id, nombre, descripcion) VALUES
  (1, 'Activo', 'Registro activo'),
  (2, 'Inactivo', 'Registro inactivo'),
  (3, 'Cancelado', 'Registro cancelado')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), descripcion = VALUES(descripcion);

-- --------------------------------------------------------------------------
-- TABLAS CON status ENUM('A','I') / estatus ENUM('A','I') / TINYINT
-- --------------------------------------------------------------------------

-- usuarios.status -> usuarios.estatus_id
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE usuarios SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE usuarios
  ADD KEY IF NOT EXISTS idx_usuarios_estatus_id (estatus_id),
  ADD CONSTRAINT fk_usuarios_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE usuarios DROP COLUMN IF EXISTS status;
ALTER TABLE usuarios MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

-- verificador_movil.estatus -> estatus_id
ALTER TABLE verificador_movil ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE verificador_movil SET estatus_id = CASE estatus WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE verificador_movil
  ADD KEY IF NOT EXISTS idx_verificador_estatus_id (estatus_id),
  ADD CONSTRAINT fk_verificador_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE verificador_movil DROP COLUMN IF EXISTS estatus;
ALTER TABLE verificador_movil MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

-- tipo_identificacion.estatus (tinyint) -> estatus_id
ALTER TABLE tipo_identificacion ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE tipo_identificacion SET estatus_id = CASE estatus WHEN 1 THEN 1 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE tipo_identificacion
  ADD KEY IF NOT EXISTS idx_tipo_identificacion_estatus_id (estatus_id),
  ADD CONSTRAINT fk_tipo_identificacion_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE tipo_identificacion DROP COLUMN IF EXISTS estatus;
ALTER TABLE tipo_identificacion MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

-- tablas catalogo/operativas con status A/I
ALTER TABLE hospederos ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE hospederos SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE hospederos ADD KEY IF NOT EXISTS idx_hospederos_estatus_id (estatus_id), ADD CONSTRAINT fk_hospederos_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE hospederos DROP COLUMN IF EXISTS status;
ALTER TABLE hospederos MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE tipos_colecta ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE tipos_colecta SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE tipos_colecta ADD KEY IF NOT EXISTS idx_tipos_colecta_estatus_id (estatus_id), ADD CONSTRAINT fk_tipos_colecta_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE tipos_colecta DROP COLUMN IF EXISTS status;
ALTER TABLE tipos_colecta MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE tipos_aplicacion ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE tipos_aplicacion SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE tipos_aplicacion ADD KEY IF NOT EXISTS idx_tipos_aplicacion_estatus_id (estatus_id), ADD CONSTRAINT fk_tipos_aplicacion_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE tipos_aplicacion DROP COLUMN IF EXISTS status;
ALTER TABLE tipos_aplicacion MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE tipos_trampa ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE tipos_trampa SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE tipos_trampa ADD KEY IF NOT EXISTS idx_tipos_trampa_estatus_id (estatus_id), ADD CONSTRAINT fk_tipos_trampa_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE tipos_trampa DROP COLUMN IF EXISTS status;
ALTER TABLE tipos_trampa MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE modulos DROP COLUMN IF EXISTS status;
ALTER TABLE modulos MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE funcionarios SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE funcionarios ADD KEY IF NOT EXISTS idx_funcionarios_estatus_id (estatus_id), ADD CONSTRAINT fk_funcionarios_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE funcionarios DROP COLUMN IF EXISTS status;
ALTER TABLE funcionarios MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE aplicadores ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE aplicadores SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE aplicadores ADD KEY IF NOT EXISTS idx_aplicadores_estatus_id (estatus_id), ADD CONSTRAINT fk_aplicadores_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE aplicadores DROP COLUMN IF EXISTS status;
ALTER TABLE aplicadores MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE ejecutores_mecanicos ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE ejecutores_mecanicos SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE ejecutores_mecanicos ADD KEY IF NOT EXISTS idx_ejecutores_estatus_id (estatus_id), ADD CONSTRAINT fk_ejecutores_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE ejecutores_mecanicos DROP COLUMN IF EXISTS status;
ALTER TABLE ejecutores_mecanicos MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE muestreadores ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE muestreadores SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE muestreadores ADD KEY IF NOT EXISTS idx_muestreadores_estatus_id (estatus_id), ADD CONSTRAINT fk_muestreadores_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE muestreadores DROP COLUMN IF EXISTS status;
ALTER TABLE muestreadores MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE tramperos ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE tramperos SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE tramperos ADD KEY IF NOT EXISTS idx_tramperos_estatus_id (estatus_id), ADD CONSTRAINT fk_tramperos_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE tramperos DROP COLUMN IF EXISTS status;
ALTER TABLE tramperos MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE rutas ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE rutas SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE rutas ADD KEY IF NOT EXISTS idx_rutas_estatus_id (estatus_id), ADD CONSTRAINT fk_rutas_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE rutas DROP COLUMN IF EXISTS status;
ALTER TABLE rutas MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE bloques_aspersion ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE bloques_aspersion SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE bloques_aspersion ADD KEY IF NOT EXISTS idx_bloques_asp_estatus_id (estatus_id), ADD CONSTRAINT fk_bloques_asp_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE bloques_aspersion DROP COLUMN IF EXISTS status;
ALTER TABLE bloques_aspersion MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE bloques_liberacion ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE bloques_liberacion SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE bloques_liberacion ADD KEY IF NOT EXISTS idx_bloques_lib_estatus_id (estatus_id), ADD CONSTRAINT fk_bloques_lib_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE bloques_liberacion DROP COLUMN IF EXISTS status;
ALTER TABLE bloques_liberacion MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE unidades_empaque ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE unidades_empaque SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE unidades_empaque ADD KEY IF NOT EXISTS idx_unidades_empaque_estatus_id (estatus_id), ADD CONSTRAINT fk_unidades_empaque_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE unidades_empaque DROP COLUMN IF EXISTS status;
ALTER TABLE unidades_empaque MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE solicitantes ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE solicitantes SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE solicitantes ADD KEY IF NOT EXISTS idx_solicitantes_estatus_id (estatus_id), ADD CONSTRAINT fk_solicitantes_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE solicitantes DROP COLUMN IF EXISTS status;
ALTER TABLE solicitantes MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE destinatarios ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE destinatarios SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE destinatarios ADD KEY IF NOT EXISTS idx_destinatarios_estatus_id (estatus_id), ADD CONSTRAINT fk_destinatarios_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE destinatarios DROP COLUMN IF EXISTS status;
ALTER TABLE destinatarios MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE trampas ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE trampas SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE trampas ADD KEY IF NOT EXISTS idx_trampas_estatus_id (estatus_id), ADD CONSTRAINT fk_trampas_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE trampas DROP COLUMN IF EXISTS status;
ALTER TABLE trampas MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE camaras_maduracion ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE camaras_maduracion SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE camaras_maduracion ADD KEY IF NOT EXISTS idx_camaras_estatus_id (estatus_id), ADD CONSTRAINT fk_camaras_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE camaras_maduracion DROP COLUMN IF EXISTS status;
ALTER TABLE camaras_maduracion MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE noticias ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE noticias SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE noticias ADD KEY IF NOT EXISTS idx_noticias_estatus_id (estatus_id), ADD CONSTRAINT fk_noticias_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE noticias DROP COLUMN IF EXISTS status;
ALTER TABLE noticias MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

-- Tablas con status A/I/C
ALTER TABLE unidades_produccion ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE unidades_produccion SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 WHEN 'C' THEN 3 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE unidades_produccion ADD KEY IF NOT EXISTS idx_up_estatus_id (estatus_id), ADD CONSTRAINT fk_up_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE unidades_produccion DROP COLUMN IF EXISTS status;
ALTER TABLE unidades_produccion MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE tmimf ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE tmimf SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 WHEN 'C' THEN 3 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE tmimf ADD KEY IF NOT EXISTS idx_tmimf_estatus_id (estatus_id), ADD CONSTRAINT fk_tmimf_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE tmimf DROP COLUMN IF EXISTS status;
ALTER TABLE tmimf MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE detallado_tmimf ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL;
UPDATE detallado_tmimf SET estatus_id = CASE status WHEN 'A' THEN 1 WHEN 'I' THEN 2 WHEN 'C' THEN 3 ELSE 2 END WHERE estatus_id IS NULL;
ALTER TABLE detallado_tmimf ADD KEY IF NOT EXISTS idx_det_tmimf_estatus_id (estatus_id), ADD CONSTRAINT fk_det_tmimf_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;
ALTER TABLE detallado_tmimf DROP COLUMN IF EXISTS status;
ALTER TABLE detallado_tmimf MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
