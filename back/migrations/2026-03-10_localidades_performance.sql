-- MIGRACION: Ajustes de rendimiento para catalogo de localidades
-- Motivo: consultas lentas en listados con joins a estados/municipios

START TRANSACTION;

-- Indices claves para filtros y joins
ALTER TABLE localidades
  ADD KEY IF NOT EXISTS idx_localidades_estado (estado_id),
  ADD KEY IF NOT EXISTS idx_localidades_municipio (municipio_id),
  ADD KEY IF NOT EXISTS idx_localidades_estatus (estatus_id),
  ADD KEY IF NOT EXISTS idx_localidades_estado_estatus_id (estado_id, estatus_id, id);

ALTER TABLE municipios
  ADD KEY IF NOT EXISTS idx_municipios_estado_estatus (estado_id, estatus_id),
  ADD KEY IF NOT EXISTS idx_municipios_nombre (nombre);

ALTER TABLE estados
  ADD KEY IF NOT EXISTS idx_estados_nombre (nombre),
  ADD KEY IF NOT EXISTS idx_estados_estatus (estatus_id);

COMMIT;

-- Recomendacion operativa (ejecutar fuera de transaccion)
-- ANALYZE TABLE estados, municipios, localidades;
