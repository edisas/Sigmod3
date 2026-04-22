# Migraciones SIGMOD V3

Carpeta de migraciones SQL. Cada archivo es incremental, nombrado `YYYY-MM-DD_descripcion.sql` y se ordena por nombre.

## Control de migraciones

El CLI vive en [../migrate.py](../migrate.py). La fuente de verdad de qué está aplicado es la tabla `schema_migrations` en la BD V3 (filename + sha256 + timestamp).

### Uso

Desde `back/` con el venv activo:

```bash
python migrate.py status       # lista aplicadas vs pendientes (checksum OK/CHANGED)
python migrate.py apply        # aplica todas las pendientes en orden
python migrate.py apply --file 2026-04-21_algo.sql   # aplica una sola
python migrate.py baseline     # marca todas las existentes como aplicadas sin ejecutar
python migrate.py mark NAME    # marca una migración individual como aplicada
python migrate.py verify       # reporta archivos cuyo checksum cambió desde que se aplicaron
```

### Flujo normal

1. Crear archivo `YYYY-MM-DD_nombre.sql` en esta carpeta.
2. `python migrate.py status` para verlo como PENDING.
3. `python migrate.py apply` ejecuta la pendiente y la registra.
4. Commit del `.sql` al repo.

### Convenciones

- **Idempotencia:** preferir `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ON DUPLICATE KEY UPDATE`. Permite re-correr una migración sin dañar estado.
- **Transacciones:** envolver en `START TRANSACTION;` / `COMMIT;` cuando sean varias sentencias relacionadas. El CLI además usa `engine.begin()` por archivo.
- **DELIMITER:** el splitter del CLI respeta bloques `DELIMITER $$ ... $$` para procedures.
- **No tocar migraciones ya aplicadas:** si necesitas corregir algo aplicado, crea una nueva migración. El comando `verify` alerta si alguien modificó un archivo ya aplicado.

### Bootstrap

En una BD nueva:

1. Asegúrate de que la BD existe y el `.env` apunta a ella.
2. `python migrate.py apply` — la primera vez crea `schema_migrations` automáticamente y aplica todo lo pendiente.

En una BD ya operativa (como `admin_sigmod3` hoy):

1. `python migrate.py baseline` registra todas las migraciones del folder como aplicadas sin ejecutarlas.
2. Los siguientes cambios ya entran por `apply`.

### Notas

- La tabla `legacy_databases` fue creada originalmente por `Base.metadata.create_all` del ORM y quedó con tipos ligeramente distintos a los del `.sql` (`INT(11)` vs `INT UNSIGNED`, charset `utf8mb3` vs `utf8mb4`). Mientras `create_all` siga activo en `back/app/main.py`, existirá ese riesgo. Fase 0 del ROADMAP lo contempla.
- El control de migraciones **no sustituye** al schema maestro `sigmod_v3_optimizado.sql` — ese sigue siendo la referencia para levantar BDs nuevas desde cero si se prefiere sin pasar por migraciones incrementales.
