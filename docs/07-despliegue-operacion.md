# Despliegue y operacion

## Componentes desplegables

- Backend API (`backend/`)
- Frontend web (`frontend/`)
- Asterisk en Docker (`deploy/asterisk/`)
- Script de provision/deploy AWS CLI (`deploy/aws/scripts/deploy-cortexcc-ec2.sh`)

## Entornos esperados

- **Local desarrollo**: backend + frontend + servicios (Postgres/Redis) + Asterisk opcional.
- **Servidor cloud**: backend/frontend en EC2, Asterisk en host dedicado o stack separado.

## Puertos operativos del proyecto

- Backend: `3030`
- Frontend: `8080`
- SIP UDP Asterisk: `5060`
- WSS SIP Asterisk: `8089`
- ARI Asterisk: `8088`
- RTP Asterisk: rango configurado en `.env` de `deploy/asterisk`

## Backend local

Pasos:

1. Copiar `backend/.env.example` a `backend/.env`.
2. Configurar `DATABASE_URL`, `REDIS_URL`, secretos JWT e integraciones.
3. Instalar dependencias y migrar:
   - `npm install`
   - `npx prisma migrate dev` (o `migrate deploy`)
   - `npx prisma generate`
4. Iniciar API: `npm run dev`.
5. Iniciar worker si se usa separado: `npm run worker`.

## Frontend local

Pasos:

1. Copiar `frontend/.env.example` a `frontend/.env`.
2. Configurar:
   - `VITE_API_URL`
   - `VITE_WS_URL`
   - `VITE_SOCKET_PATH`
3. Ejecutar:
   - `npm install`
   - `npm run dev`

## Asterisk en Docker

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
6. Provisiona Node.js + PM2.
7. Clona repo, build backend/frontend y crea `.env` runtime.
8. Ejecuta backend y frontend con PM2.

Nota:

- El script incluye una validacion para evitar cambiar puertos base del proyecto (`3030` backend y `8080` frontend).

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

## Operacion continua

- Rotar secretos periodicamente (`JWT_*`, API keys, credenciales de canal).
- Monitorear uso de CPU/memoria en backend y Asterisk.
- Respaldar base de datos y snapshots de configuraciones criticas.
- Mantener trazabilidad en `audit_logs`, `quality_evaluations`, `voice_calls`.
