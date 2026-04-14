# Backend: API y servicios

## Base tecnica

- Runtime: Node.js + TypeScript.
- Framework: Express.
- Prefijo API configurable con `API_PREFIX` (default `/api`).
- Entrada principal: `backend/src/server.ts`.
- Router principal: `backend/src/routes/api.ts`.

## Configuracion de entorno backend

Variables claves validadas en `backend/src/config/env.ts`:

- `PORT` (default `3030`)
- `API_PREFIX` (default `/api`)
- `CORS_ORIGIN` (default `http://localhost:8080`)
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `INTEGRATION_API_KEY`
- `ENABLE_JOBS`
- `SOCKETIO_PATH`

## Middleware y seguridad

- `helmet` para cabeceras de seguridad.
- `cors` con origen controlado por entorno.
- `express-rate-limit` en el router.
- `authMiddleware` para rutas privadas.
- `integrationApiKeyMiddleware` para entradas de integracion.
- `requirePermission` y `requireAnyPermission` para RBAC.

## Dominios funcionales (servicios)

- `auth.service.ts`: login, refresh, logout, perfil, estado de agente, cambio de password.
- `conversation.service.ts`: listado, detalle, ciclo de vida, mensajes y busqueda global.
- `contact.service.ts`: CRUD contacto, timeline, notas, tags, import/export.
- `dashboard.service.ts`: KPI en tiempo real.
- `report.service.ts`: reportes por volumen, productividad, SLA, CSAT y export CSV.
- `quality.service.ts`: pendientes de QA, historial y registro de evaluaciones.
- `integration.service.ts`: escalamiento desde sistemas externos.
- `inbound.service.ts` y `voiceInbound.service.ts`: ingestion y eventos entrantes.

## Endpoints relevantes por modulo

> Todas las rutas son relativas a `API_PREFIX`.

### Salud y autenticacion

- `GET /health`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `PUT /auth/profile`
- `PUT /auth/status`
- `POST /auth/change-password`

### Integraciones y webhooks

- `GET /integrations/status`
- `POST /integrations/agenthub/escalate`
- `POST /integrations/collect/escalate`
- `POST /integrations/voice/transfer`
- `POST /webhooks/whatsapp/:channelId`

### Conversaciones y mensajes

- `GET /conversations`
- `POST /conversations`
- `GET /conversations/:id`
- `GET /conversations/:id/context`
- `POST /conversations/:id/accept`
- `POST /conversations/:id/reject`
- `POST /conversations/:id/hold`
- `POST /conversations/:id/resume`
- `POST /conversations/:id/resolve`
- `POST /conversations/:id/transfer`
- `GET /conversations/:id/messages`
- `POST /conversations/:id/messages`
- `POST /conversations/:id/messages/email`

### Contactos

- `GET /contacts`
- `GET /contacts/:id`
- `POST /contacts`
- `PUT /contacts/:id`
- `DELETE /contacts/:id`
- `POST /contacts/import`
- `GET /contacts/export`
- `POST /contacts/merge`
- `GET /contacts/:id/timeline`
- `GET /contacts/:id/notes`
- `POST /contacts/:id/notes`
- `PUT /contacts/:id/tags`

### Agentes y usuarios

- `GET /agents`
- `GET /agents/online`
- `GET /agents/:id`
- `PUT /agents/:id/status`
- `GET /users`
- `POST /users`
- `PUT /users/:id`
- `PUT /users/:id/skills`

### Colas, routing y supervision

- `GET /queues`
- `GET /queues/live`
- `GET /queues/:id/waiting`
- `GET /queues/:id/active`
- `POST /queues`
- `PUT /queues/:id`
- `DELETE /queues/:id`
- `POST /routing/assign`
- `GET /routing/recommend`
- `POST /supervisor/force-assign`
- `GET /supervisor/live-board`

### Dashboard, reportes y calidad

- `GET /dashboard/stats`
- `GET /reports/volume`
- `GET /reports/productivity`
- `GET /reports/sla`
- `GET /reports/summary`
- `GET /reports/hourly`
- `GET /reports/csat`
- `GET /reports/export`
- `GET /quality/pending`
- `GET /quality/evaluations`
- `POST /quality/evaluations`

### Configuracion (settings)

- Canales: `GET/POST /settings/channels`, `PUT/DELETE /settings/channels/:id`, `POST /settings/channels/:id/test`
- Skills: `GET/POST /settings/skills`, `PUT/DELETE /settings/skills/:id`
- Teams: `GET/POST /settings/teams`, `PUT/DELETE /settings/teams/:id`
- Roles: `GET/POST /settings/roles`, `PUT/DELETE /settings/roles/:id`
- Dispositions: `GET/POST /settings/dispositions`, `PUT/DELETE /settings/dispositions/:id`
- Quick replies: `GET/POST /settings/quick-replies`, `PUT/DELETE /settings/quick-replies/:id`
- SLA policies: `GET/POST /settings/sla-policies`, `PUT/DELETE /settings/sla-policies/:id`
- Business hours: `GET/POST /settings/business-hours`, `PUT /settings/business-hours/:id`
- Email templates: `GET/POST /settings/email-templates`, `PUT/DELETE /settings/email-templates/:id`
- General: `GET/PUT /settings/general`
- Soporte softphone usuario: `GET/PUT /settings/softphone/me`

### Voz

- `POST /voice/calls/logs`: registra historial de llamadas por usuario autenticado, independiente de conversaciones.
- `GET /voice/calls/logs`: pagina historial de llamadas del usuario.
- `POST /voice/calls/events`: endpoint legacy ligado a `conversation_id` (mantenido por compatibilidad).

## Asincronia y jobs

- Workers se inician en el proceso API si `ENABLE_JOBS=true`.
- Alternativamente, proceso dedicado con script de worker.
- Cola usada para routing y post-procesos operativos.

## Eventos realtime relevantes

- `conversation:assigned`
- `notification:new`
- `message:new`
- `agent:status_changed`
- `queue:updated`
- `supervisor:live_update`

## Consideraciones operativas

- Mantener `INTEGRATION_API_KEY` fuera de repositorio.
- Garantizar conectividad estable con Redis para colas/notificaciones.
- Aplicar migraciones Prisma y `prisma generate` en cada despliegue.
