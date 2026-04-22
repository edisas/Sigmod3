# SIGMOD Backend (FastAPI)

Backend base para SIGMOD V3 con autenticación JWT y MariaDB.

## Requisitos

- Python 3.10+

## Configuración rápida

```bash
cd back
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # ajustar DATABASE_URL y credenciales legacy
python migrate.py apply         # aplica migraciones pendientes (obligatorio antes de arrancar)
uvicorn app.main:app --reload --port 8000
```

El backend **no crea tablas al arrancar**. Todo cambio de schema pasa por una migración en
[../docsRefactor/migrations/](../docsRefactor/migrations/) y se aplica con el CLI de migraciones.
Ver [../docsRefactor/migrations/README.md](../docsRefactor/migrations/README.md) para el detalle del flujo.

## Configurar MariaDB

En `back/.env` define `DATABASE_URL` con formato SQLAlchemy:

```bash
DATABASE_URL=mysql+pymysql://USUARIO:PASSWORD@HOST:3306/NOMBRE_BD?charset=utf8mb4
```

Ejemplo:

```bash
DATABASE_URL=mysql+pymysql://sigmod_user:tu_password@127.0.0.1:3306/sigmod_v3?charset=utf8mb4
```

## Endpoints

- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/select-state`
- `GET /api/v1/auth/me`

## Flujo de auth multiestado

1. `POST /auth/login` valida credenciales.
2. Si el usuario tiene 1 estado, responde `access_token` directamente.
3. Si tiene múltiples estados, responde:
   - `requires_state_selection=true`
   - `state_selection_token`
   - `available_states`
4. `POST /auth/select-state` con `state_selection_token + estado_id` devuelve el `access_token` final.
5. El token final incluye `estado_activo_id` y el backend filtra por ese estado.

## Migración multiestado (BD)

Ejecuta primero:

`/Users/jaime.robles/dev/sigmod3/docsRefactor/migrations/2026-03-08_multiestado.sql`

Esta migración crea `usuarios_detalle` para permisos de estados por usuario y renombra `usuarios.nick` a `usuarios.nombre_usuario`.

Después ejecuta:

`/Users/jaime.robles/dev/sigmod3/docsRefactor/migrations/2026-03-08_normalizacion_estatus_id.sql`

Esta migración normaliza columnas `status/estatus` a `estatus_id` con FK hacia `estatus`.

## Notas

- El schema se gestiona **exclusivamente** vía el CLI `python migrate.py` y los archivos en `docsRefactor/migrations/`.
- Swagger UI: `http://localhost:8000/docs`
