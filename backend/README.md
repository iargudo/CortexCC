# Cortex Contact — Backend

Node.js 20 + Express + TypeScript + Prisma (PostgreSQL) + Redis + BullMQ + Socket.IO.

**Multi-tenant:** database-per-tenant con base Master. Ver [docs/ESTANDAR_ARQUITECTURA_MULTITENANT.md](../docs/ESTANDAR_ARQUITECTURA_MULTITENANT.md).

## API base URL

All REST routes are served under the prefix configured in `API_PREFIX` (default **`/api`**).

Example: `POST http://localhost:3030/api/auth/login` with header `X-Tenant-Key: local`

The SPA should set `VITE_API_URL=http://localhost:3030/api` (include `/api`).

## PostgreSQL y Redis en local

No se usa Docker: debes tener **PostgreSQL** y **Redis** instalados y en ejecución en tu máquina.

1. Crea las bases de datos (ejemplo en `psql`):

```sql
CREATE USER cortexcontact WITH PASSWORD 'tu_password';
CREATE DATABASE cortexcc_master OWNER cortexcontact;
CREATE DATABASE cortexcontact OWNER cortexcontact;
```

2. Copia la configuración: `cp .env.example .env` y edita `MASTER_DATABASE_URL`, `DATABASE_URL`, `REDIS_URL`.

3. Bootstrap multi-tenant y datos demo:

```bash
npm install
npm run prisma:generate
SEED_LOCAL_TENANT=true npm run setup:master
npm run migrate:tenant
npm run seed:tenant    # opcional (demo)
npm run dev
```

Si Redis o Postgres usan otro host/puerto, reflejalo en `.env` (sin cambiar el puerto del backend salvo que lo decidas tú en `PORT`).

## Environment

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (default `3030`) |
| `MASTER_DATABASE_URL` | PostgreSQL Master (tabla `tenants`) — **obligatoria** |
| `DATABASE_URL` | BD tenant local — scripts CLI (`migrate:tenant`, `seed:tenant`) |
| `TENANT_DB_*` | Alternativa a `DATABASE_URL` para scripts por tenant |
| `REDIS_URL` | Redis for BullMQ and locks (local) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Min 32 characters each |
| `CORS_ORIGIN` | Browser origin for the frontend (e.g. `http://localhost:8080`) |
| `SOCKETIO_CORS_ORIGIN` | Optional; defaults to `CORS_ORIGIN` |
| `INTEGRATION_API_KEY` | `x-api-key` for `/integrations/*` |
| `ENABLE_JOBS` | Run BullMQ workers in the API process (`true`/`false`) |

## Scripts multi-tenant

```bash
npm run setup:master          # crea Master + tabla tenants
npm run migrate:tenant        # migra una BD tenant
npm run migrate:all-tenants   # migra todos los tenants activos
npm run seed:tenant           # seed en una BD tenant
```

## Avances recientes (API)

- **Multi-tenant:** header `X-Tenant-Key` en casi todas las rutas; JWT incluye `tenantKey`; `GET /tenants/resolve?host=`.
- **`POST /api/conversations`**: alta manual (contacto existente o inline), canal por `channel_id` o `channel_type`, cola opcional, `initial_message` opcional (encola envío outbound).
- **`GET /api/conversations/:id/context`**: contexto de escalamiento (`source`, `escalation_reason`, `escalation_context`, contacto/canal/cola).
- **`POST /api/auth/change-password`**: con sesión JWT; body `current_password`, `new_password` (mín. 8 caracteres); invalida refresh tokens.
- **Canales (admin)**: **`POST/DELETE /api/settings/channels`**, **`POST /api/settings/channels/:id/test`** (health del adapter).
- **WhatsApp webhook:** `POST /api/webhooks/:tenantKey/whatsapp/:channelId`
- **Outbound**: mensajes de agente no internos y envíos email pasan por cola **`outbound-messages`** (BullMQ); requiere **`ENABLE_JOBS=true`** en el mismo proceso que levanta el API, o ejecutar **`npm run worker`** aparte con Redis accesible.
- **Tiempo real**: al asignar por routing se emiten **`conversation:assigned`** (payload ampliado) y **`notification:new`** con forma compatible con `NEW_ASSIGNMENT` del README.

## Scripts

```bash
npm install
npm run prisma:generate
SEED_LOCAL_TENANT=true npm run setup:master
npm run migrate:tenant
npm run dev
npm run worker
npm run build && npm start
npm test
```

## Realtime

Socket.IO shares the HTTP server. Authenticate with JWT and tenant:

`socket.auth = { token: "<access_token>", tenantKey: "<tenant_key>" }`

Path default: `/socket.io` (`SOCKETIO_PATH`).
