-- Migración: bitácora centralizada de escrituras a BDs legacy (SIGMOD 2).
-- Fecha: 2026-04-23
-- Propósito: toda operación de corrección que V3 aplique sobre alguna de las 8
-- BDs legacy se registra aquí con diff completo (antes/después en JSON) para
-- auditoría cross-estado. La primera tabla que la va a usar es cat_rutas
-- (corrección de módulo/PFA con cascada a trampas.folio_tecnico).

CREATE TABLE IF NOT EXISTS legacy_audit_log (
    id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    fecha                  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado_clave           CHAR(3)         NOT NULL,
    database_name          VARCHAR(80)     NOT NULL,
    usuario_legacy_clave   INT             NULL,
    usuario_legacy_nick    VARCHAR(60)     NULL,
    tabla                  VARCHAR(80)     NOT NULL,
    operacion              VARCHAR(20)     NOT NULL,
    registro_pk            VARCHAR(80)     NOT NULL,
    campos_antes           JSON            NULL,
    campos_despues         JSON            NULL,
    registros_afectados    INT             NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY idx_legacy_audit_fecha        (fecha),
    KEY idx_legacy_audit_estado       (estado_clave),
    KEY idx_legacy_audit_tabla        (tabla),
    KEY idx_legacy_audit_usuario      (usuario_legacy_nick),
    KEY idx_legacy_audit_estado_tabla (estado_clave, tabla, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
