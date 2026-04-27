-- MIGRACION: agrega columna participa_sigmod a estados
-- Fecha: 2026-04-26
-- Sprint 1.5 fase 2.
--
-- Algunos estados existen en la BD pero no participan en el proyecto SIGMOD
-- (no operan trampeo, muestreo, etc.). Estos no deben aparecer en el selector
-- de estado al login, ni en multi-select de catálogos auxiliares, ni en listas
-- de asignación de usuarios.
--
-- Default 1 (todos participan) para preservar comportamiento actual; admin
-- general desmarca uno por uno desde /catalogos/estados.
--
-- Notas:
-- - estatus_id (1=activo, 2=inactivo) y participa_sigmod son ortogonales:
--   un estado puede estar activo pero no participar (oculto al usuario común
--   pero recuperable), o participar y luego desactivarse (baja temporal).
-- - El listado del catálogo muestra todos por default; el filtro automático
--   (login / multi-select) requiere AMBOS: estatus_id=1 AND participa_sigmod=1.

START TRANSACTION;

ALTER TABLE estados
  ADD COLUMN IF NOT EXISTS participa_sigmod TINYINT(1) NOT NULL DEFAULT 1 AFTER estatus_id;

-- Asegura que registros preexistentes queden marcados como participantes.
UPDATE estados SET participa_sigmod = 1 WHERE participa_sigmod IS NULL;

ALTER TABLE estados
  ADD KEY IF NOT EXISTS idx_estados_participa (participa_sigmod);

COMMIT;
