-- ==========================================================================
-- MIGRACION: ampliar usuarios.rol de VARCHAR(20) a VARCHAR(50)
-- Fecha: 2026-04-25
-- Motivo: "Administrador General" (21 chars) se truncaba a "Administrador
-- Genera", rompiendo los guards `ALLOWED_ROLES` en catalogos.py,
-- configuracion_sistema.py y autorizaciones.py que comparan contra
-- "administrador general" exacto. Los demás roles legítimos cuentan ≤ 38
-- chars ("Profesional Fitosanitario Autorizado") — VARCHAR(50) cubre todos
-- con margen.
-- ==========================================================================

SET NAMES utf8mb4;

ALTER TABLE usuarios MODIFY COLUMN rol VARCHAR(50) NOT NULL DEFAULT 'admin';

-- Re-aplica el rol completo a usuarios que quedaron truncados.
UPDATE usuarios SET rol = 'Administrador General' WHERE rol = 'Administrador Genera';
UPDATE usuarios SET rol = 'Profesional Fitosanitario Autorizado'
  WHERE rol IN ('Profesional Fitosanit', 'Profesional Fitosanita', 'Profesional Fitosanitar');
UPDATE usuarios SET rol = 'Tercero Especialista Fitosanitario'
  WHERE rol IN ('Tercero Especialista', 'Tercero Especialista F', 'Tercero Especialista Fito');
UPDATE usuarios SET rol = 'Supervisor de Figura Cooperadora'
  WHERE rol IN ('Supervisor de Figura', 'Supervisor de Figura C', 'Supervisor de Figura Co');
