-- ==========================================================================
-- MIGRACION: Solicitud de Acceso SIGMOD Multiestado
-- Fecha: 2026-03-08
-- Objetivo:
--   1) Agregar catálogos para regionalización técnica y temporadas.
--   2) Soportar llenado automático de oficio por estado.
--   3) Registrar solicitud, PDF generado, código único y archivo firmado.
-- ==========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

-- --------------------------------------------------------------------------
-- 1) usuarios_detalle: normalizar activo -> estatus_id
-- --------------------------------------------------------------------------
ALTER TABLE usuarios_detalle
  ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NULL AFTER estado_id;

UPDATE usuarios_detalle
SET estatus_id = CASE WHEN activo = 1 THEN 1 ELSE 2 END
WHERE estatus_id IS NULL;

ALTER TABLE usuarios_detalle
  ADD KEY IF NOT EXISTS idx_usuarios_detalle_estatus_id (estatus_id),
  ADD CONSTRAINT fk_usuarios_detalle_estatus_id
    FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;

ALTER TABLE usuarios_detalle
  DROP COLUMN IF EXISTS activo,
  MODIFY estatus_id INT UNSIGNED NOT NULL DEFAULT 1;

-- --------------------------------------------------------------------------
-- 2) Catalogo: temporadas
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS temporadas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  nombre_corto VARCHAR(30) NOT NULL,
  estatus_id INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_temporadas_nombre_corto (nombre_corto),
  KEY idx_temporadas_estatus_id (estatus_id),
  CONSTRAINT fk_temporadas_estatus_id FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------------------------
-- 3) Catalogo: region_tecnica + detalle de estados por region
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS region_tecnica (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  funcionario_id INT UNSIGNED NOT NULL,
  estatus_id INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_region_tecnica_nombre (nombre),
  KEY idx_region_tecnica_funcionario_id (funcionario_id),
  KEY idx_region_tecnica_estatus_id (estatus_id),
  CONSTRAINT fk_region_tecnica_funcionario FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_region_tecnica_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS region_tecnica_detalle (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  region_id INT UNSIGNED NOT NULL,
  estado_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_region_tecnica_detalle (region_id, estado_id),
  KEY idx_region_tecnica_detalle_estado (estado_id),
  CONSTRAINT fk_region_tecnica_detalle_region FOREIGN KEY (region_id) REFERENCES region_tecnica(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_region_tecnica_detalle_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------------------------
-- 4) Catalogo: estados_detalle para C.c.p.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estados_detalle (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  estado_id INT UNSIGNED NOT NULL,
  refiaae_id INT UNSIGNED NOT NULL,
  ccmfe_id INT UNSIGNED NOT NULL,
  ricesav_id INT UNSIGNED NOT NULL,
  estatus_id INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_estados_detalle_estado (estado_id),
  KEY idx_estados_detalle_refiaae (refiaae_id),
  KEY idx_estados_detalle_ccmfe (ccmfe_id),
  KEY idx_estados_detalle_ricesav (ricesav_id),
  KEY idx_estados_detalle_estatus (estatus_id),
  CONSTRAINT fk_estados_detalle_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE,
  CONSTRAINT fk_estados_detalle_refiaae FOREIGN KEY (refiaae_id) REFERENCES funcionarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_estados_detalle_ccmfe FOREIGN KEY (ccmfe_id) REFERENCES funcionarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_estados_detalle_ricesav FOREIGN KEY (ricesav_id) REFERENCES funcionarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_estados_detalle_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------------------------
-- 5) Operativa: solicitud_accesos (un PDF por estado)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitud_accesos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  folio_grupo CHAR(36) NOT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  estado_id INT UNSIGNED NOT NULL,
  region_tecnica_id INT UNSIGNED NOT NULL,
  temporada_id INT UNSIGNED NOT NULL,
  lugar_emision VARCHAR(120) NOT NULL,
  fecha_solicitud DATE NOT NULL,
  fecha_inicio_servicios DATE NOT NULL,
  fecha_inicio_operacion DATE NOT NULL,
  tipo_solicitante VARCHAR(60) NOT NULL,
  municipios TEXT NOT NULL,
  modulo_captura VARCHAR(120) NOT NULL,
  correo_notificacion VARCHAR(254) NOT NULL,
  codigo_unico VARCHAR(24) NOT NULL,
  estatus_proceso VARCHAR(30) NOT NULL DEFAULT 'GENERADO',
  pdf_generado_path VARCHAR(255) NULL,
  pdf_firmado_path VARCHAR(255) NULL,
  archivo_firmado_nombre_original VARCHAR(255) NULL,
  fecha_carga_firmado DATETIME NULL,
  estatus_id INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_solicitud_accesos_codigo_unico (codigo_unico),
  KEY idx_solicitud_accesos_folio_grupo (folio_grupo),
  KEY idx_solicitud_accesos_usuario_id (usuario_id),
  KEY idx_solicitud_accesos_estado_id (estado_id),
  KEY idx_solicitud_accesos_region_tecnica_id (region_tecnica_id),
  KEY idx_solicitud_accesos_temporada_id (temporada_id),
  KEY idx_solicitud_accesos_estatus_proceso (estatus_proceso),
  KEY idx_solicitud_accesos_estatus_id (estatus_id),
  CONSTRAINT fk_solicitud_accesos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_solicitud_accesos_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE,
  CONSTRAINT fk_solicitud_accesos_region_tecnica FOREIGN KEY (region_tecnica_id) REFERENCES region_tecnica(id) ON UPDATE CASCADE,
  CONSTRAINT fk_solicitud_accesos_temporada FOREIGN KEY (temporada_id) REFERENCES temporadas(id) ON UPDATE CASCADE,
  CONSTRAINT fk_solicitud_accesos_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
