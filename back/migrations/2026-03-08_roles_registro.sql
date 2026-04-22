-- ==========================================================================
-- MIGRACION: Roles de registro y vinculacion a solicitudes
-- Fecha: 2026-03-08
-- ==========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  descripcion VARCHAR(255) DEFAULT NULL,
  mostrar_en_registro TINYINT UNSIGNED NOT NULL DEFAULT 2 COMMENT '1=Si,2=No',
  estatus_id INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_roles_nombre (nombre),
  KEY idx_roles_mostrar_en_registro (mostrar_en_registro),
  KEY idx_roles_estatus_id (estatus_id),
  CONSTRAINT fk_roles_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO roles (nombre, descripcion, mostrar_en_registro, estatus_id)
VALUES
  ('Administrador General', 'Super Administrador de el sistema', 2, 1),
  ('Administrador Estatal', 'Administrador General de un Estado', 2, 1),
  ('Supervisor de Figura Cooperadora', 'Supervisor de Figura Cooperadora para uno o mas estados', 2, 1),
  ('Capturista', 'Capturista para un estado', 1, 1),
  ('Profesional Fitosanitario Autorizado', 'PFA para uno o mas estados', 1, 1),
  ('Identificador', 'Identificador para uno o mas estados', 1, 1),
  ('Tercero Especialista Fitosanitario', 'TEF para uno o mas estados', 1, 1)
ON DUPLICATE KEY UPDATE
  descripcion = VALUES(descripcion),
  mostrar_en_registro = VALUES(mostrar_en_registro),
  estatus_id = VALUES(estatus_id);

ALTER TABLE solicitud_accesos
  ADD COLUMN IF NOT EXISTS rol_id INT UNSIGNED NULL AFTER temporada_id,
  ADD KEY IF NOT EXISTS idx_solicitud_accesos_rol_id (rol_id),
  ADD CONSTRAINT fk_solicitud_accesos_rol_id FOREIGN KEY (rol_id) REFERENCES roles(id) ON UPDATE CASCADE;

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
