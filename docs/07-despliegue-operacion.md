# Despliegue y operacion

> **Guia completa para un cliente nuevo:** ver [08-manual-configuracion-cliente-nuevo.md](./08-manual-configuracion-cliente-nuevo.md) (orden de fases, configuracion en UI, canales, softphone e integraciones).

## Componentes desplegables

- Backend API (`backend/`)
- Frontend web (`frontend/`)
- Asterisk en Docker (`deploy/asterisk/`)
- Script de provision/deploy AWS CLI (`deploy/aws/scripts/deploy-cortexcc-ec2.sh`)
- Script de deploy Azure App Service + ACR (`deploy/azure/deploy-azure-prd-cortexcc.sh`)

## Entornos esperados

- **Local desarrollo**: backend + frontend + servicios (Postgres/Redis) + Asterisk opcional.
- **Servidor cloud**: backend/frontend en EC2, Asterisk en host dedicado o stack separado.

## Puertos operativos del proyecto

- Backend: `3030`
- Frontend: `8080`
- SIP UDP Asterisk: `5060`
- WSS SIP Asterisk: `8089`
- ARI Asterisk: `8088` interno en contenedor; puerto publico `ASTERISK_ARI_PUBLIC_PORT` (por defecto `8074` en `deploy/asterisk/.env`)
- RTP Asterisk: rango configurado en `.env` de `deploy/asterisk` (por defecto `10000`–`10100`)

## Multi-tenant: variables y scripts

### Variables backend

| Variable | Uso |
|---|---|
| `MASTER_DATABASE_URL` | BD Master (tabla `tenants`) — **obligatoria en runtime** |
| `DATABASE_URL` | BD del tenant local — scripts CLI y `SEED_LOCAL_TENANT` |
| `TENANT_DB_*` | Alternativa a `DATABASE_URL` para `migrate:tenant` / `seed:tenant` |

### Variables frontend (solo desarrollo)

| Variable | Uso |
|---|---|
| `VITE_TENANT_KEY` | Tenant en localhost (ej. `local`) |
| `VITE_TENANT_NAME` | Nombre visible (ej. `Desarrollo Local`) |

En produccion **no** definir `VITE_TENANT_KEY`; el tenant se resuelve por hostname.

### Scripts de migracion

```bash
# Primera vez: crear Master y registrar tenant local
SEED_LOCAL_TENANT=true npm run setup:master

# Migrar una BD tenant
npm run migrate:tenant

# Migrar todos los tenants activos (antes de cada release)
npm run migrate:all-tenants

# Seed en una BD tenant (demo/staging)
npm run seed:tenant
```

Orden en release con cambio de esquema: `build` → `test` → `migrate:all-tenants` → deploy.

## Backend local

Pasos:

1. Copiar `backend/.env.example` a `backend/.env`.
2. Configurar `MASTER_DATABASE_URL`, `DATABASE_URL` (tenant local), `REDIS_URL`, secretos JWT e integraciones.
3. Instalar dependencias:
   - `npm install`
   - `npm run prisma:generate` (genera clientes tenant + master)
4. Bootstrap multi-tenant (primera vez):
   - `SEED_LOCAL_TENANT=true npm run setup:master`
   - `npm run migrate:tenant`
5. Iniciar API: `npm run dev`.
6. Iniciar worker si se usa separado: `npm run worker`.

## Frontend local

Pasos:

1. Copiar `frontend/.env.example` a `frontend/.env`.
2. Configurar:
   - `VITE_API_URL`
   - `VITE_WS_URL`
   - `VITE_SOCKET_PATH`
   - `VITE_TENANT_KEY=local`
   - `VITE_TENANT_NAME=Desarrollo Local`
3. Ejecutar:
   - `npm install`
   - `npm run dev`

### Pruebas en LAN (otra máquina en la red)

Ver detalle en [05-telefonia-asterisk-softphone.md](./05-telefonia-asterisk-softphone.md#pruebas-en-lan-desarrollo).

**Un solo comando** (desde la raíz del repo):

```bash
./scripts/set-lan-ip.sh              # detecta IP; actualiza .env, BD y Asterisk
./scripts/set-lan-ip.sh 192.168.x.x  # IP explícita
```

Luego reinicia backend y frontend. Accede por **`https://<IP-LAN>:8080`** (HTTPS obligatorio para softphone WebRTC).

Resumen manual si no usas el script:

1. **Master DB:** `UPDATE tenants SET custom_domain = '<IP-LAN>' WHERE tenant_key = 'local';`
2. **Backend:** `CORS_ORIGIN` y `SOCKETIO_CORS_ORIGIN` = `https://<IP-LAN>:8080`
3. **Frontend:** `VITE_API_URL=https://<IP-LAN>:8080/api`, `VITE_WS_URL=https://<IP-LAN>:8080`
4. **Telefonía PBX:** `pbx_host=<IP-LAN>`, puertos `8089` (WSS) y `8074` (ARI) — vía **Configuración → Telefonía** o `PUT /settings/telephony`; el script `set-lan-ip.sh` actualiza también `channels` VOICE
5. **Asterisk:** `external_signaling_address` / `external_media_address` = IP LAN; firewall 8080, 8089, RTP.

> Sin HTTPS, el registro SIP puede funcionar pero las llamadas WebRTC fallan (el navegador bloquea el micrófono en `http://192.168.x.x`).

Ubicacion:

- Compose: `deploy/asterisk/docker-compose.asterisk.yml`
- Configuracion: `deploy/asterisk/conf/*.conf`

Pasos:

1. Copiar `deploy/asterisk/.env.example` a `deploy/asterisk/.env`.
2. Ajustar puertos y direccion de red externa (SIP/RTP) segun host.
3. Levantar:
   - `docker compose -f deploy/asterisk/docker-compose.asterisk.yml --env-file deploy/asterisk/.env up -d`
4. Validar healthcheck y registros SIP.

## AWS CLI (script automatizado CortexCC)

Script:

- `deploy/aws/scripts/deploy-cortexcc-ec2.sh`

Comportamiento:

1. Carga variables desde `deploy/aws/.env`.
2. Valida requeridos (region, AMI, repo, puertos, DB/Redis, etc).
3. Crea/par utiliza key pair.
4. Crea security group con ingress para `22`, `3030`, `8080`.
5. Lanza instancia EC2.
6. Sustituye `REPLACE_PUBLIC_IP` / `PUBLIC_IP` en URLs (`CORS_ORIGIN`, `VITE_*`, etc.) con la IP publica real.
7. Provisiona Node.js + PM2.
8. Clona repo, build backend/frontend y crea `.env` runtime.
9. Ejecuta `npm run prisma:generate` (tenant + master).
10. Si `RUN_SETUP_MASTER=true`, ejecuta `SEED_LOCAL_TENANT=true npm run setup:master`.
11. Ejecuta `npm run migrate:all-tenants` (no `db push` ni migrate contra una sola BD).
12. Si `RUN_PRISMA_SEED=true`, ejecuta `npm run seed:tenant`.
11. Ejecuta backend y frontend con PM2 y valida `GET /api/health`.

Nota:

- El script incluye una validacion para evitar cambiar puertos base del proyecto (`3030` backend y `8080` frontend).
- `RUN_PRISMA_SEED` por defecto es `false`; activarlo solo en demo/staging.

## Azure App Service (Docker + ACR)

Script:

- `deploy/azure/deploy-azure-prd-cortexcc.sh`

Configuracion:

1. `cp deploy/azure/.env.example deploy/azure/.env` (recursos Azure, `MASTER_DATABASE_URL`, `DATABASE_URL`, `REDIS_NAME`, secretos).
2. Opcional: `cp deploy/azure/.azure-config.example deploy/azure/.azure-config` tras `az login`.
3. Postgres existente en Azure (`DATABASE_URL`); Redis lo crea el script si `MANAGE_REDIS=true`.
4. Ejecutar desde la raiz del repo: `./deploy/azure/deploy-azure-prd-cortexcc.sh`.

Comportamiento:

1. Crea o reutiliza Resource Group, registra providers (`Microsoft.Cache`, etc.).
2. Crea o reutiliza **Azure Cache for Redis** (`REDIS_NAME`) y genera `REDIS_URL` con SSL (`rediss://...:6380/DB`).
3. Crea App Service Plan, dos Web Apps y ACR.
4. Construye imagenes `backend/Dockerfile` y `frontend/Dockerfile` (linux/amd64) y las publica en ACR.
5. Configura App Settings del backend (`MASTER_DATABASE_URL`, `DATABASE_URL`, `REDIS_URL`, JWT, `INTEGRATION_API_KEY`, puerto `3030`).
6. Habilita WebSockets en el backend para Socket.IO.
7. Build del frontend con `VITE_API_URL` / `VITE_WS_URL` apuntando al backend en Azure.
8. Al arrancar el contenedor backend ejecuta `migrate:all-tenants` (entrypoint Docker; seed si `RUN_PRISMA_SEED=true`).
9. Frontend: un despliegue; registrar hostnames de cada tenant en DNS apuntando al mismo Web App (sin `VITE_TENANT_KEY` en build prod).
9. Valida `GET {BACKEND_URL}/api/health`.

Variables Redis en `deploy/azure/.env`:

- `MANAGE_REDIS=true` (default): el script crea/usa el cache y rellena `REDIS_URL`.
- `MANAGE_REDIS=false`: debes definir `REDIS_URL` manualmente.
- `SKIP_REDIS_CREATE=true`: no crea Redis; falla si no existe (util si ya lo tienes).

Puertos en Azure (contenedor):

- Backend: `3030` (`WEBSITES_PORT=3030`)
- Frontend: `8080` (`WEBSITES_PORT=8080`)

## Checklist de validacion post despliegue

### API

- `GET /api/health` responde `ok: true`.
- Login y refresh token funcionales.
- Socket.IO conecta con token valido.

### Frontend

- Carga de login sin errores CORS.
- Navegacion por modulos segun rol.
- Inbox muestra conversaciones y acciones.

### Voz

- Registro SIP correcto para extension web.
- Llamadas internas entre extensiones disponibles.
- Audio bidireccional validado.
- Eventos persisten en `voice_calls`.

### Persistencia

- Migraciones aplicadas y cliente Prisma actualizado.
- Redis disponible para cola/workers.

## Configuracion post-despliegue (resumen)

Tras levantar backend y frontend, el administrador debe completar la configuracion operativa en la UI. El detalle paso a paso esta en [08-manual-configuracion-cliente-nuevo.md](./08-manual-configuracion-cliente-nuevo.md#8-fase-6--configuración-en-la-ui-administrador).

Orden recomendado:

1. **General** (`/settings/general`): disposiciones, SLA, respuestas rapidas, horarios; parametros SIP globales via API.
2. **Equipos y skills** (`/settings/teams`, `/settings/skills`).
3. **Colas** (`/settings/queues`): estrategia de routing, canales vinculados.
4. **Usuarios y roles**: cuentas reales, permisos, asignacion de skills.
5. **Canales** (`/settings/channels`): WhatsApp, Email, Voz, Webchat, Teams; probar cada uno antes de activar.
6. **Softphone**: asignar extensiones a agentes y exportar endpoints a Asterisk.
7. **Integraciones** (`/settings/integrations`): escalamiento externo (`POST /integrations/escalate`) y apps embebidas.

## Operacion continua

- Rotar secretos periodicamente (`JWT_*`, API keys, credenciales de canal).
- Monitorear uso de CPU/memoria en backend y Asterisk.
- Respaldar base de datos y snapshots de configuraciones criticas.
- Mantener trazabilidad en `audit_logs`, `quality_evaluations`, `voice_calls`.
