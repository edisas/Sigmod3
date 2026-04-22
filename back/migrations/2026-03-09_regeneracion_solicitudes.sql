-- ==========================================================================
-- MIGRACION: Regeneracion editable de solicitudes y control de vigencia
-- Fecha: 2026-03-09
-- ==========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

ALTER TABLE solicitud_accesos
  ADD COLUMN IF NOT EXISTS vigente TINYINT(1) NULL DEFAULT 1 AFTER estatus_proceso,
  ADD COLUMN IF NOT EXISTS recibido_por_admin_id INT UNSIGNED NULL AFTER fecha_carga_firmado,
  ADD COLUMN IF NOT EXISTS fecha_recepcion_admin DATETIME NULL AFTER recibido_por_admin_id,
  ADD KEY IF NOT EXISTS idx_solicitud_accesos_vigente (vigente),
  ADD KEY IF NOT EXISTS idx_solicitud_accesos_recibido_admin (recibido_por_admin_id),
  ADD CONSTRAINT fk_solicitud_accesos_recibido_admin FOREIGN KEY (recibido_por_admin_id) REFERENCES usuarios(id) ON UPDATE CASCADE;

-- Mantener 1 sola solicitud vigente por usuario/estado/temporada
UPDATE solicitud_accesos sa
JOIN (
  SELECT usuario_id, estado_id, temporada_id, MAX(id) AS keep_id
  FROM solicitud_accesos
  WHERE estatus_id = 1
  GROUP BY usuario_id, estado_id, temporada_id
) x ON x.usuario_id = sa.usuario_id
   AND x.estado_id = sa.estado_id
   AND x.temporada_id = sa.temporada_id
SET sa.vigente = CASE WHEN sa.id = x.keep_id THEN 1 ELSE NULL END
WHERE sa.estatus_id = 1;

ALTER TABLE solicitud_accesos
  ADD UNIQUE KEY IF NOT EXISTS uk_solicitud_vigente_usuario_estado_temporada (usuario_id, estado_id, temporada_id, vigente);

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
