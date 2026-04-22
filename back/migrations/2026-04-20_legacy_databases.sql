-- Migración: catálogo de bases de datos legacy (SIGMOD 2)
-- Fecha: 2026-04-20
-- Propósito: registrar las 8 BDs V2 por estado de la república para que el
-- módulo Legacy resuelva dinámicamente el database_name en runtime.
-- Credenciales (host/user/password) viven en .env del backend, no aquí.

CREATE TABLE IF NOT EXISTS legacy_databases (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    clave         CHAR(3)      NOT NULL,
    nombre_estado VARCHAR(60)  NOT NULL,
    database_name VARCHAR(80)  NOT NULL,
    activo        TINYINT(1)   NOT NULL DEFAULT 1,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_legacy_databases_clave (clave),
    UNIQUE KEY uk_legacy_databases_database_name (database_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO legacy_databases (clave, nombre_estado, database_name, activo) VALUES
    ('CHP', 'Chiapas',   'chiapas_2026',   1),
    ('OAX', 'Oaxaca',    'oaxaca_2026',    1),
    ('GRO', 'Guerrero',  'guerrero_2026',  1),
    ('MIC', 'Michoacán', 'michoacan_2026', 1),
    ('COL', 'Colima',    'colima_2026',    1),
    ('JAL', 'Jalisco',   'jalisco_2026',   1),
    ('NAY', 'Nayarit',   'nayarit_2026',   1),
    ('SIN', 'Sinaloa',   'sinaloa_2026',   1)
ON DUPLICATE KEY UPDATE
    nombre_estado = VALUES(nombre_estado),
    database_name = VALUES(database_name),
    activo        = VALUES(activo);
