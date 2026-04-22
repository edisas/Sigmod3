-- MIGRACION: Catalogos base (estados, municipios, localidades) + bitacora de cambios
-- Fecha: 2026-03-10

START TRANSACTION;

-- Normalizacion de estructura minima de catalogos
ALTER TABLE estados
  ADD COLUMN IF NOT EXISTS abreviatura VARCHAR(10) NOT NULL DEFAULT '' AFTER nombre,
  ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER abreviatura;

ALTER TABLE municipios
  ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER clave_geo;

ALTER TABLE localidades
  ADD COLUMN IF NOT EXISTS municipio_id INT UNSIGNED NULL AFTER id,
  ADD COLUMN IF NOT EXISTS estado_id INT UNSIGNED NOT NULL AFTER nombre,
  ADD COLUMN IF NOT EXISTS clave_geo INT UNSIGNED NOT NULL DEFAULT 0 AFTER estado_id,
  ADD COLUMN IF NOT EXISTS latitud DOUBLE NULL AFTER clave_geo,
  ADD COLUMN IF NOT EXISTS longitud DOUBLE NULL AFTER latitud,
  ADD COLUMN IF NOT EXISTS altitud DOUBLE NULL AFTER longitud,
  ADD COLUMN IF NOT EXISTS estatus_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER altitud;

-- Indices/FKs recomendadas para catalogos
ALTER TABLE estados
  ADD UNIQUE KEY IF NOT EXISTS uk_estados_clave (clave),
  ADD KEY IF NOT EXISTS idx_estados_estatus (estatus_id),
  ADD CONSTRAINT fk_estados_estatus_id
    FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;

ALTER TABLE municipios
  ADD UNIQUE KEY IF NOT EXISTS uk_municipios_estado_clave (estado_id, clave),
  ADD KEY IF NOT EXISTS idx_municipios_estado (estado_id),
  ADD KEY IF NOT EXISTS idx_municipios_estatus (estatus_id),
  ADD CONSTRAINT fk_municipios_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE,
  ADD CONSTRAINT fk_municipios_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;

ALTER TABLE localidades
  ADD KEY IF NOT EXISTS idx_localidades_estado (estado_id),
  ADD KEY IF NOT EXISTS idx_localidades_municipio (municipio_id),
  ADD KEY IF NOT EXISTS idx_localidades_estatus (estatus_id),
  ADD CONSTRAINT fk_localidades_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON UPDATE CASCADE,
  ADD CONSTRAINT fk_localidades_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_localidades_estatus FOREIGN KEY (estatus_id) REFERENCES estatus(id) ON UPDATE CASCADE;

-- Bitacora de cambios de catalogos
CREATE TABLE IF NOT EXISTS catalogos_cambios_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  catalogo VARCHAR(40) NOT NULL,
  registro_id INT UNSIGNED NOT NULL,
  accion VARCHAR(20) NOT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  estado_activo_id INT UNSIGNED NULL,
  datos_anteriores JSON NULL,
  datos_nuevos JSON NULL,
  ip_origen VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_catalogos_log_catalogo_registro (catalogo, registro_id),
  KEY idx_catalogos_log_usuario (usuario_id),
  KEY idx_catalogos_log_fecha (created_at),
  KEY idx_catalogos_log_estado_activo (estado_activo_id),
  CONSTRAINT fk_catalogos_log_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON UPDATE CASCADE,
  CONSTRAINT fk_catalogos_log_estado_activo FOREIGN KEY (estado_activo_id) REFERENCES estados(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

COMMIT;
