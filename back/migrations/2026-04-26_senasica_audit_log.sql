-- MIGRACION: tabla de auditoría para acciones del rol Administrador Senasica
-- Fecha: 2026-04-26
-- Sprint 1.5 fase 2 — rol nacional con dashboard consolidado.
--
-- Requerimiento: "todas sus ejecuciones con usuario, fecha hora, ip, acción,
-- usuario afectado y de ser posible la consulta sql ejecutada".
--
-- Esta tabla cubre cualquier acción ejecutada por usuarios con rol
-- "administrador senasica". Es separada del legacy_audit_log y de
-- catalogos_cambios_log para mantener trazabilidad clara y permitir
-- consultas/exportes específicos de esta capa.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS senasica_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL COMMENT 'Senasica que ejecuta la accion',
  fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_origen VARCHAR(45) NULL,
  metodo VARCHAR(10) NULL COMMENT 'GET/POST/PUT/PATCH/DELETE',
  path VARCHAR(255) NULL,
  accion VARCHAR(80) NOT NULL COMMENT 'switch-state, suspend-user, edit-tmimf, etc.',
  usuario_afectado_id INT UNSIGNED NULL,
  estado_afectado_id INT UNSIGNED NULL COMMENT 'estado en cuyo contexto opero la accion',
  recurso_tipo VARCHAR(60) NULL COMMENT 'usuarios, figura_cooperadora, tmimf, catalogo, etc.',
  recurso_id VARCHAR(60) NULL,
  datos_request JSON NULL,
  sql_query TEXT NULL COMMENT 'Query SQL ejecutada (si aplica)',
  resultado_status INT UNSIGNED NULL,
  observaciones TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_senasica_audit_usuario (usuario_id),
  KEY idx_senasica_audit_fecha (fecha_hora),
  KEY idx_senasica_audit_accion (accion),
  KEY idx_senasica_audit_usuario_afectado (usuario_afectado_id),
  KEY idx_senasica_audit_estado (estado_afectado_id),
  KEY idx_senasica_audit_recurso (recurso_tipo, recurso_id),
  CONSTRAINT fk_senasica_audit_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_senasica_audit_usuario_afectado FOREIGN KEY (usuario_afectado_id) REFERENCES usuarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_senasica_audit_estado FOREIGN KEY (estado_afectado_id) REFERENCES estados(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

COMMIT;
