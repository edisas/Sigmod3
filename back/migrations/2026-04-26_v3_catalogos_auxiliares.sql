-- MIGRACION: Catalogos auxiliares V3 nativos (10 catalogos + pivotes multi-estado)
-- Fecha: 2026-04-26
-- Sprint 1 fase 2 V3 nativa.
--
-- Catalogos: variedades, especies_mosca, vehiculos, hospederos,
-- tipos_aplicacion, aplicadores, areas, empaques, productos, status_revision.
--
-- Patron por catalogo:
--   tabla principal -> nacional, sin estado_id propio
--   pivote N:M      -> <catalogo>_estados (catalogo_id, estado_id)
--
-- Reglas de seguridad:
--   - Solo "administrador general" puede crear/editar/desactivar (validacion en API).
--   - Cada entrada del catalogo declara explicitamente en que estados aplica.
--   - Soft-delete via estatus_id = 2 (jamas DELETE fisico).
--   - Auditoria via tabla catalogos_cambios_log existente.
--
-- ============================================================================
-- IMPORTANTE: limpieza de schema previo
-- ============================================================================
-- Las 10 tablas catalogo existian en BD V3 con un schema distinto (intento de
-- migracion abandonado). Estaban VACIAS, asi como las 13 tablas operativas que
-- las referenciaban (tmimf, trampas, control_quimico, control_mecanico_cultural,
-- detallado_tmimf, estimados_cosecha, superficies_registradas,
-- detallado_larvas_empaque, identificaciones_laboratorio, identificaciones_trampa,
-- trampas_revisiones).
--
-- Esta migracion:
--   1) Drop 13 FKs entrantes desde operativas hacia las 10 catalogo viejas.
--   2) Drop las 10 tablas catalogo viejas.
--   3) Crea las 10 catalogo + 10 pivotes con el schema V3 definitivo.
--   4) Recrea las 13 FKs entrantes apuntando al nuevo schema (id INT UNSIGNED
--      preserva compatibilidad con las columnas FK existentes).
-- ============================================================================

START TRANSACTION;

-- ============================================================
-- (1) Drop FKs entrantes desde tablas operativas
-- ============================================================

ALTER TABLE control_quimico              DROP FOREIGN KEY IF EXISTS fk_cq_aplicador;
ALTER TABLE control_quimico              DROP FOREIGN KEY IF EXISTS fk_cq_tipo_aplicacion;
ALTER TABLE control_mecanico_cultural    DROP FOREIGN KEY IF EXISTS fk_cmc_hospedero;
ALTER TABLE detallado_larvas_empaque     DROP FOREIGN KEY IF EXISTS fk_dle_especie;
ALTER TABLE detallado_tmimf              DROP FOREIGN KEY IF EXISTS fk_det_variedad;
ALTER TABLE estimados_cosecha            DROP FOREIGN KEY IF EXISTS fk_ec_variedad;
ALTER TABLE identificaciones_laboratorio DROP FOREIGN KEY IF EXISTS fk_ident_lab_especie;
ALTER TABLE identificaciones_trampa      DROP FOREIGN KEY IF EXISTS fk_ident_especie;
ALTER TABLE superficies_registradas      DROP FOREIGN KEY IF EXISTS fk_superficie_variedad;
ALTER TABLE tmimf                        DROP FOREIGN KEY IF EXISTS fk_tmimf_vehiculo;
ALTER TABLE trampas                      DROP FOREIGN KEY IF EXISTS fk_trampas_area;
ALTER TABLE trampas                      DROP FOREIGN KEY IF EXISTS fk_trampas_hospedero;
ALTER TABLE trampas_revisiones           DROP FOREIGN KEY IF EXISTS fk_rev_status;

-- ============================================================
-- (2) Drop tablas catalogo viejas (todas vacias)
-- ============================================================

DROP TABLE IF EXISTS variedades;
DROP TABLE IF EXISTS especies_mosca;
DROP TABLE IF EXISTS vehiculos;
DROP TABLE IF EXISTS hospederos;
DROP TABLE IF EXISTS tipos_aplicacion;
DROP TABLE IF EXISTS aplicadores;
DROP TABLE IF EXISTS areas;
DROP TABLE IF EXISTS empaques;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS status_revision;

-- ============================================================
-- (3) Crear schema definitivo: 10 catalogos + 10 pivotes
-- ============================================================

-- 1) variedades
CREATE TABLE variedades (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  clave VARCHAR(40) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by_user_id INT(10) UNSIGNED NULL,
  updated_by_user_id INT(10) UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_variedades_clave (clave),
  KEY idx_variedades_estatus (estatus_id),
  KEY idx_variedades_created_by (created_by_user_id),
  KEY idx_variedades_updated_by (updated_by_user_id),
  CONSTRAINT fk_variedades_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE,
  CONSTRAINT fk_variedades_created_by FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_variedades_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE variedades_estados (
  variedad_id INT(10) UNSIGNED NOT NULL,
  estado_id INT(10) UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (variedad_id, estado_id),
  KEY idx_variedades_estados_estado (estado_id),
  CONSTRAINT fk_variedades_estados_variedad FOREIGN KEY (variedad_id) REFERENCES variedades(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_variedades_estados_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- 2) especies_mosca
CREATE TABLE especies_mosca (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  clave VARCHAR(40) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by_user_id INT(10) UNSIGNED NULL,
  updated_by_user_id INT(10) UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_especies_mosca_clave (clave),
  KEY idx_especies_mosca_estatus (estatus_id),
  KEY idx_especies_mosca_created_by (created_by_user_id),
  KEY idx_especies_mosca_updated_by (updated_by_user_id),
  CONSTRAINT fk_especies_mosca_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE,
  CONSTRAINT fk_especies_mosca_created_by FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_especies_mosca_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE especies_mosca_estados (
  especie_mosca_id INT(10) UNSIGNED NOT NULL,
  estado_id INT(10) UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (especie_mosca_id, estado_id),
  KEY idx_especies_mosca_estados_estado (estado_id),
  CONSTRAINT fk_especies_mosca_estados_catalogo FOREIGN KEY (especie_mosca_id) REFERENCES especies_mosca(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_especies_mosca_estados_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- 3) vehiculos
CREATE TABLE vehiculos (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  clave VARCHAR(40) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by_user_id INT(10) UNSIGNED NULL,
  updated_by_user_id INT(10) UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_vehiculos_clave (clave),
  KEY idx_vehiculos_estatus (estatus_id),
  KEY idx_vehiculos_created_by (created_by_user_id),
  KEY idx_vehiculos_updated_by (updated_by_user_id),
  CONSTRAINT fk_vehiculos_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE,
  CONSTRAINT fk_vehiculos_created_by FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_vehiculos_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE vehiculos_estados (
  vehiculo_id INT(10) UNSIGNED NOT NULL,
  estado_id INT(10) UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (vehiculo_id, estado_id),
  KEY idx_vehiculos_estados_estado (estado_id),
  CONSTRAINT fk_vehiculos_estados_vehiculo FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_vehiculos_estados_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- 4) hospederos
CREATE TABLE hospederos (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  clave VARCHAR(40) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by_user_id INT(10) UNSIGNED NULL,
  updated_by_user_id INT(10) UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hospederos_clave (clave),
  KEY idx_hospederos_estatus (estatus_id),
  KEY idx_hospederos_created_by (created_by_user_id),
  KEY idx_hospederos_updated_by (updated_by_user_id),
  CONSTRAINT fk_hospederos_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE,
  CONSTRAINT fk_hospederos_created_by FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_hospederos_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE hospederos_estados (
  hospedero_id INT(10) UNSIGNED NOT NULL,
  estado_id INT(10) UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (hospedero_id, estado_id),
  KEY idx_hospederos_estados_estado (estado_id),
  CONSTRAINT fk_hospederos_estados_hospedero FOREIGN KEY (hospedero_id) REFERENCES hospederos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_hospederos_estados_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- 5) tipos_aplicacion
CREATE TABLE tipos_aplicacion (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  clave VARCHAR(40) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by_user_id INT(10) UNSIGNED NULL,
  updated_by_user_id INT(10) UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tipos_aplicacion_clave (clave),
  KEY idx_tipos_aplicacion_estatus (estatus_id),
  KEY idx_tipos_aplicacion_created_by (created_by_user_id),
  KEY idx_tipos_aplicacion_updated_by (updated_by_user_id),
  CONSTRAINT fk_tipos_aplicacion_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE,
  CONSTRAINT fk_tipos_aplicacion_created_by FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_tipos_aplicacion_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE tipos_aplicacion_estados (
  tipo_aplicacion_id INT(10) UNSIGNED NOT NULL,
  estado_id INT(10) UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tipo_aplicacion_id, estado_id),
  KEY idx_tipos_aplicacion_estados_estado (estado_id),
  CONSTRAINT fk_tipos_aplicacion_estados_catalogo FOREIGN KEY (tipo_aplicacion_id) REFERENCES tipos_aplicacion(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tipos_aplicacion_estados_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- 6) aplicadores
CREATE TABLE aplicadores (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  clave VARCHAR(40) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by_user_id INT(10) UNSIGNED NULL,
  updated_by_user_id INT(10) UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_aplicadores_clave (clave),
  KEY idx_aplicadores_estatus (estatus_id),
  KEY idx_aplicadores_created_by (created_by_user_id),
  KEY idx_aplicadores_updated_by (updated_by_user_id),
  CONSTRAINT fk_aplicadores_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE,
  CONSTRAINT fk_aplicadores_created_by FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_aplicadores_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE aplicadores_estados (
  aplicador_id INT(10) UNSIGNED NOT NULL,
  estado_id INT(10) UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (aplicador_id, estado_id),
  KEY idx_aplicadores_estados_estado (estado_id),
  CONSTRAINT fk_aplicadores_estados_aplicador FOREIGN KEY (aplicador_id) REFERENCES aplicadores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_aplicadores_estados_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- 7) areas
CREATE TABLE areas (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  clave VARCHAR(40) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by_user_id INT(10) UNSIGNED NULL,
  updated_by_user_id INT(10) UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_areas_clave (clave),
  KEY idx_areas_estatus (estatus_id),
  KEY idx_areas_created_by (created_by_user_id),
  KEY idx_areas_updated_by (updated_by_user_id),
  CONSTRAINT fk_areas_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE,
  CONSTRAINT fk_areas_created_by FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_areas_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE areas_estados (
  area_id INT(10) UNSIGNED NOT NULL,
  estado_id INT(10) UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (area_id, estado_id),
  KEY idx_areas_estados_estado (estado_id),
  CONSTRAINT fk_areas_estados_area FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_areas_estados_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- 8) empaques
CREATE TABLE empaques (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  clave VARCHAR(40) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by_user_id INT(10) UNSIGNED NULL,
  updated_by_user_id INT(10) UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_empaques_clave (clave),
  KEY idx_empaques_estatus (estatus_id),
  KEY idx_empaques_created_by (created_by_user_id),
  KEY idx_empaques_updated_by (updated_by_user_id),
  CONSTRAINT fk_empaques_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE,
  CONSTRAINT fk_empaques_created_by FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_empaques_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE empaques_estados (
  empaque_id INT(10) UNSIGNED NOT NULL,
  estado_id INT(10) UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (empaque_id, estado_id),
  KEY idx_empaques_estados_estado (estado_id),
  CONSTRAINT fk_empaques_estados_empaque FOREIGN KEY (empaque_id) REFERENCES empaques(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_empaques_estados_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- 9) productos
CREATE TABLE productos (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  clave VARCHAR(40) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by_user_id INT(10) UNSIGNED NULL,
  updated_by_user_id INT(10) UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_productos_clave (clave),
  KEY idx_productos_estatus (estatus_id),
  KEY idx_productos_created_by (created_by_user_id),
  KEY idx_productos_updated_by (updated_by_user_id),
  CONSTRAINT fk_productos_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE,
  CONSTRAINT fk_productos_created_by FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_productos_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE productos_estados (
  producto_id INT(10) UNSIGNED NOT NULL,
  estado_id INT(10) UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (producto_id, estado_id),
  KEY idx_productos_estados_estado (estado_id),
  CONSTRAINT fk_productos_estados_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_productos_estados_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- 10) status_revision
CREATE TABLE status_revision (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  clave VARCHAR(40) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  estatus_id INT(10) UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by_user_id INT(10) UNSIGNED NULL,
  updated_by_user_id INT(10) UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_status_revision_clave (clave),
  KEY idx_status_revision_estatus (estatus_id),
  KEY idx_status_revision_created_by (created_by_user_id),
  KEY idx_status_revision_updated_by (updated_by_user_id),
  CONSTRAINT fk_status_revision_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE,
  CONSTRAINT fk_status_revision_created_by FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_status_revision_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES usuarios(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE status_revision_estados (
  status_revision_id INT(10) UNSIGNED NOT NULL,
  estado_id INT(10) UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (status_revision_id, estado_id),
  KEY idx_status_revision_estados_estado (estado_id),
  CONSTRAINT fk_status_revision_estados_catalogo FOREIGN KEY (status_revision_id) REFERENCES status_revision(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_status_revision_estados_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- ============================================================
-- (4) Recrear FKs entrantes desde tablas operativas
-- ============================================================

ALTER TABLE control_quimico
  ADD CONSTRAINT fk_cq_aplicador FOREIGN KEY (aplicador_id) REFERENCES aplicadores(id) ON UPDATE CASCADE,
  ADD CONSTRAINT fk_cq_tipo_aplicacion FOREIGN KEY (tipo_aplicacion_id) REFERENCES tipos_aplicacion(id) ON UPDATE CASCADE;

ALTER TABLE control_mecanico_cultural
  ADD CONSTRAINT fk_cmc_hospedero FOREIGN KEY (hospedero_id) REFERENCES hospederos(id) ON UPDATE CASCADE;

ALTER TABLE detallado_larvas_empaque
  ADD CONSTRAINT fk_dle_especie FOREIGN KEY (especie_mosca_id) REFERENCES especies_mosca(id) ON UPDATE CASCADE;

ALTER TABLE detallado_tmimf
  ADD CONSTRAINT fk_det_variedad FOREIGN KEY (variedad_id) REFERENCES variedades(id) ON UPDATE CASCADE;

ALTER TABLE estimados_cosecha
  ADD CONSTRAINT fk_ec_variedad FOREIGN KEY (variedad_id) REFERENCES variedades(id) ON UPDATE CASCADE;

ALTER TABLE identificaciones_laboratorio
  ADD CONSTRAINT fk_ident_lab_especie FOREIGN KEY (especie_mosca_id) REFERENCES especies_mosca(id) ON UPDATE CASCADE;

ALTER TABLE identificaciones_trampa
  ADD CONSTRAINT fk_ident_especie FOREIGN KEY (especie_mosca_id) REFERENCES especies_mosca(id) ON UPDATE CASCADE;

ALTER TABLE superficies_registradas
  ADD CONSTRAINT fk_superficie_variedad FOREIGN KEY (variedad_id) REFERENCES variedades(id) ON UPDATE CASCADE;

ALTER TABLE tmimf
  ADD CONSTRAINT fk_tmimf_vehiculo FOREIGN KEY (tipo_transporte_id) REFERENCES vehiculos(id) ON UPDATE CASCADE;

ALTER TABLE trampas
  ADD CONSTRAINT fk_trampas_area FOREIGN KEY (area_id) REFERENCES areas(id) ON UPDATE CASCADE,
  ADD CONSTRAINT fk_trampas_hospedero FOREIGN KEY (hospedero_id) REFERENCES hospederos(id) ON UPDATE CASCADE;

ALTER TABLE trampas_revisiones
  ADD CONSTRAINT fk_rev_status FOREIGN KEY (status_revision_id) REFERENCES status_revision(id) ON UPDATE CASCADE;

COMMIT;
