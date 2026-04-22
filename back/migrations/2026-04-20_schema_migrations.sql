-- Migración: tabla de control de migraciones
-- Fecha: 2026-04-20
-- Propósito: fuente de verdad para saber qué archivos .sql ya se aplicaron.
-- Esta migración es la primera que debe correrse en una base nueva.

CREATE TABLE IF NOT EXISTS schema_migrations (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    filename     VARCHAR(160) NOT NULL,
    checksum     CHAR(64)     NOT NULL,
    applied_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_by   VARCHAR(80)  NULL,
    execution_ms INT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_schema_migrations_filename (filename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
