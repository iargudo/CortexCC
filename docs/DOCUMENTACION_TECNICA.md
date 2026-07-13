# DOCUMENTACION TECNICA - CortexCC

Documento técnico consolidado del sistema **CortexCC**, orientado a desarrolladores, DevOps y arquitectos. Describe arquitectura, stack, módulos, modelo de datos, API, telefonía, despliegue y operación.

> Fuentes: `docs/02-arquitectura-tecnica.md`, `docs/03-backend-api-servicios.md`, `docs/04-frontend-modulos-flujos.md`, `docs/05-telefonia-asterisk-softphone.md`, `docs/06-modelo-datos-prisma.md`, `docs/07-despliegue-operacion.md`, `docs/08-manual-configuracion-cliente-nuevo.md`, código fuente de `backend/`, `frontend/` y `deploy/`.

---

## 1. Visión general de arquitectura

CortexCC es **multi-tenant database-per-tenant**: un despliegue atiende N empresas; cada una tiene su propia BD PostgreSQL. Una BD **Master** registra tenants y dominios.

```
  cliente-a.app.com ──┐
  ventas.clienteb.com ┼──► Frontend :8087 ──► Backend :3037 ──┬──► Master DB (tenants)
                        X-Tenant-Key                         ├──► BD tenant A
                                                           ├──► BD tenant B
                                                           ├──► Redis / BullMQ
                                                           └──► Asterisk (voz)
```

1. **Frontend web** (`frontend/`): SPA React + TypeScript + Vite (puerto 8087).
2. **Backend API** (`backend/`): Node.js + Express + Prisma + Socket.IO (puerto 3037).
3. **Telefonía** (`deploy/asterisk/`): Asterisk en Docker con SIP UDP, WSS, ARI y RTP.
4. **Despliegue Azure** (`deploy/azure/`): App Service + ACR + Docker.

> Los puertos `3037` (backend) y `8087` (frontend) están **fijados** y no deben cambiarse; el script de despliegue valida explícitamente esto.

---

## 2. Stack tecnológico

### Backend (`backend/package.json`)

- **Runtime**: Node.js 20+, TypeScript ESM (`"type": "module"`).
- **Framework**: Express 4.21.
- **ORM**: Prisma 6 (PostgreSQL).
- **Realtime**: Socket.IO 4.8.
- **Colas/Workers**: BullMQ 5 + ioredis 5.
- **Auth**: jsonwebtoken (JWT + refresh), bcryptjs.
- **Validación**: Zod (env + payloads críticos).
- **Email**: imapflow + mailparser (entrada), nodemailer 8 (salida).
- **Seguridad**: helmet, express-rate-limit, cors.
- **Uploads**: multer + csv-parse para imports.
- **Dev**: tsx, vitest.

### Frontend (`frontend/package.json`)

- **React 18.3** + **TypeScript** + **Vite**.
- **UI**: shadcn/ui sobre **Radix UI** primitives + Tailwind.
- **Router**: react-router-dom 6.
- **State/Data**: @tanstack/react-query 5.
- **Forms**: react-hook-form + @hookform/resolvers.
- **Charts**: recharts.
- **Realtime**: socket.io-client.
- **SIP/WebRTC**: SIP.js (en `useSipPhone`).
- **Sanitización**: dompurify (HTML de email entrante).

### Infraestructura

- **PostgreSQL Master** + **PostgreSQL por tenant** (aislamiento por BD, sin `TenantId` en tablas).
- **Redis** (DB lógica `/2`) como broker BullMQ y cache de locks.
- **Asterisk** PBX para SIP UDP + WebRTC + ARI.

---

## 3. Backend - estructura y capas

### 3.1 Layout de directorios (`backend/src/`)

```
backend/src/
├── app.ts              # createApp(): middlewares globales y montaje de router
├── server.ts           # Bootstrap HTTP + Socket.IO + workers opcionales
├── config/env.ts       # Validación Zod del entorno
├── routes/api.ts       # Router único con todos los endpoints (~2k líneas)
├── middleware/
│   ├── auth.ts                # authMiddleware + requireAuth (JWT)
│   ├── integrationAuth.ts     # x-api-key para integraciones M2M
│   ├── requirePermission.ts   # RBAC por capability
│   └── errorHandler.ts        # HttpError + manejador central
├── services/
│   ├── auth.service.ts             # Login, refresh, perfil, status
│   ├── conversation.service.ts     # Ciclo de vida de conversaciones
│   ├── conversationMapper.ts       # DTO mapping
│   ├── contact.service.ts          # CRUD + import/export + merge
│   ├── dashboard.service.ts        # KPIs realtime
│   ├── report.service.ts           # Reportes y export CSV
│   ├── quality.service.ts          # Evaluaciones de QA
│   ├── integration.service.ts      # Escalamiento + apps embed (864 líneas)
│   ├── inbound.service.ts          # Ingesta canales (whatsapp/teams)
│   ├── emailInbound.service.ts     # Procesamiento de email entrante
│   ├── emailPoller.service.ts      # Polling IMAP
│   ├── outbound.service.ts         # Despacho de mensajes salientes
│   ├── voiceInbound.service.ts     # Eventos de voz legacy
│   └── voiceAsterisk.service.ts    # Integración con Asterisk ARI
├── channels/
│   ├── ChannelAdapter.ts      # Interface base
│   ├── registry.ts            # Factory de adapters por tipo
│   ├── whatsapp/              # Cloud API + config validator
│   ├── email/                 # IMAP/SMTP + config validator
│   ├── voice/                 # Asterisk + config validator
│   ├── webchat/               # Embebido SDK
│   └── stub/                  # Adapter de pruebas
├── routing/
│   └── RoutingEngine.ts       # Motor de asignación con 5 estrategias
├── queue/
│   └── bull.ts                # Definición y enqueue de jobs BullMQ
├── workers/
│   ├── index.ts               # startWorkers() — ejecutado si ENABLE_JOBS
│   └── cli.ts                 # Worker standalone (npm run worker)
├── realtime/
│   └── socket.ts              # Socket.IO server + namespaces /webchat
├── lib/
│   ├── prisma.ts              # getPrisma() — cliente acotado al tenant del request
│   ├── masterPrisma.ts        # Cliente Master (tabla tenants)
│   ├── tenantContext.ts       # AsyncLocalStorage: getCurrentTenantKey()
│   ├── tenantConnectionManager.ts  # Pools Prisma por tenantKey
│   ├── socketRooms.ts         # Salas Socket.IO prefijadas por tenant
│   ├── redis.ts               # Locks Redis prefijados por tenant
│   ├── jwt.ts                 # JWT con tenantKey
│   └── channelTypes.ts        # Helpers de mapping de canal
├── middleware/
│   └── tenant.ts              # X-Tenant-Key obligatorio (excepciones documentadas)
├── routes/
│   └── tenants.ts             # resolve + current
└── utils/
    ├── asyncHandler.ts        # Wrapper para controllers async
    └── routeParams.ts         # Validación de UUID/params
```

### 3.2 Capa de transporte/API

`backend/src/app.ts`:

```ts
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(env.API_PREFIX, buildApiRouter(app));
app.use(errorHandler);
```

`backend/src/server.ts` levanta HTTP + Socket.IO en el mismo proceso. Si `ENABLE_JOBS=true`, además inicia workers BullMQ en el mismo proceso (recomendado solo para dev/single-node; para producción usar `npm run worker`).

### 3.3 Configuración de entorno (Zod)

Validado en `backend/src/config/env.ts`. Variables principales:

| Variable | Default | Notas |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `PORT` | `3037` | **Fijo** — no cambiar |
| `API_PREFIX` | `/api` | Prefijo de todas las rutas REST |
| `CORS_ORIGIN` | `http://localhost:8087` | Origen del SPA |
| `MASTER_DATABASE_URL` | — | BD Master (tabla `tenants`) — obligatoria en runtime |
| `DATABASE_URL` | — | BD tenant local — scripts CLI (`migrate:tenant`, `seed:tenant`) |
| `REDIS_URL` | `redis://localhost:6379/2` | DB lógica `/2` |
| `JWT_SECRET` | — | Mín 32 caracteres; access token |
| `JWT_EXPIRES_IN` | `15m` | Access token |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Vigencia refresh token en BD |
| `PLATFORM_JWT_SECRET` | derivado de `JWT_SECRET` | Opcional; panel `/platform` |
| `INTEGRATION_API_KEY` | — | Clave M2M para `x-api-key` |
| `ENABLE_JOBS` | `true` | Activa workers en proceso API |
| `QUEUE_CONCURRENCY` | `5` | Concurrencia BullMQ |
| `SOCKETIO_PATH` | `/socket.io` | Path de Socket.IO |
| `SOCKETIO_CORS_ORIGIN` | `CORS_ORIGIN` | CORS específico para WS |
| `PRISMA_LOG_QUERIES` | `false` | Activa logs SQL para depuración (solo scripts/tenant dev) |
| `STORAGE_PROVIDER` | `local` | `local`, `s3` o `azure` |
| `STORAGE_LOCAL_DIR` | `uploads` | Directorio local de adjuntos |
| `AZURE_STORAGE_CONNECTION_STRING` | — | Solo si `STORAGE_PROVIDER=azure` |
| `AZURE_STORAGE_CONTAINER` | `attachments` | Contenedor Azure Blob |

### 3.4 Seguridad

- **`tenantMiddleware`** exige `X-Tenant-Key` (excepto `/health`, `/tenants/resolve`, webhooks con `:tenantKey` en path).
- **JWT access** (15m) incluye `tenantKey`; debe coincidir con el header.
- **Refresh token** rotativo persistido como `token_hash` en `refresh_tokens` (por BD tenant).
- **`authMiddleware`** verifica access token + tenant y popula `req.authUser`.
- **`integrationApiKeyMiddleware`** verifica `x-api-key` contra `INTEGRATION_API_KEY` para endpoints `/integrations/*` y webhooks.
- **`requirePermission(name)`** y **`requireAnyPermission([...])`** consultan los permisos JSON del rol del usuario (modelo `Role.permissions`).
- **`helmet`** con `crossOriginResourcePolicy: cross-origin` para permitir embed apps.
- **Rate limit** aplicado al router principal vía `express-rate-limit`.
- **Permisos** definidos en `Role.permissions` como JSON con capabilities granulares.

### 3.5 RBAC y permisos

El modelo `Role` almacena `permissions` como JSON. El middleware `requirePermission(capability)` hace lookup contra `req.authUser.roles[*].permissions` y rechaza si no existe la capability requerida. `requireAnyPermission([a, b, c])` permite OR lógico. Los roles `admin` y `supervisor` tienen short-circuits en algunos endpoints (ver helper `isSupervisor` en `routes/api.ts`).

---

## 4. API REST

> Todas las rutas son relativas a `API_PREFIX` (default `/api`).

### 4.1 Salud y autenticación

```
GET    /health
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /auth/me
PUT    /auth/profile
PUT    /auth/status
POST   /auth/change-password
```

### 4.2 Conversaciones y mensajes

```
GET    /conversations
POST   /conversations
GET    /conversations/:id
GET    /conversations/:id/context
POST   /conversations/:id/accept
POST   /conversations/:id/reject
POST   /conversations/:id/hold
POST   /conversations/:id/resume
POST   /conversations/:id/resolve
POST   /conversations/:id/transfer
GET    /conversations/:id/messages
POST   /conversations/:id/messages
POST   /conversations/:id/messages/email
GET    /conversations/:id/integrations
```

### 4.3 Contactos

```
GET    /contacts
GET    /contacts/:id
POST   /contacts
PUT    /contacts/:id
DELETE /contacts/:id
POST   /contacts/import          # multipart CSV
GET    /contacts/export          # CSV
POST   /contacts/merge
GET    /contacts/:id/timeline
GET    /contacts/:id/notes
POST   /contacts/:id/notes
PUT    /contacts/:id/tags
```

### 4.4 Agentes y usuarios

```
GET    /agents
GET    /agents/online
GET    /agents/:id
PUT    /agents/:id/status
GET    /users
POST   /users
PUT    /users/:id
PUT    /users/:id/skills
```

### 4.5 Colas, routing y supervisión

```
GET    /queues
GET    /queues/live
GET    /queues/:id/waiting
GET    /queues/:id/active
POST   /queues
PUT    /queues/:id
DELETE /queues/:id
POST   /routing/assign
GET    /routing/recommend
POST   /supervisor/force-assign
GET    /supervisor/live-board
```

### 4.6 Dashboard, reportería y calidad

```
GET    /dashboard/stats
GET    /reports/volume
GET    /reports/productivity
GET    /reports/sla
GET    /reports/summary
GET    /reports/hourly
GET    /reports/csat
GET    /reports/export
GET    /quality/pending
GET    /quality/evaluations
POST   /quality/evaluations
```

### 4.6 Tenants (multi-tenant)

```
GET    /tenants/resolve?host=   # sin X-Tenant-Key; público por hostname
GET    /tenants/current         # con X-Tenant-Key + JWT
```

### 4.7 Integraciones y webhooks

```
GET    /integrations/status                               # X-Tenant-Key + x-api-key
POST   /integrations/escalate                             # X-Tenant-Key + x-api-key
GET    /settings/integration-apps
POST   /settings/integration-apps
POST   /settings/integration-apps/bootstrap-real-examples
PUT    /settings/integration-apps/:id
DELETE /settings/integration-apps/:id
GET    /settings/integration-bindings
POST   /settings/integration-bindings
PUT    /settings/integration-bindings/:id
DELETE /settings/integration-bindings/:id
POST   /webhooks/:tenantKey/whatsapp/:channelId           # tenant en path (sin header)
```

#### SSO Embed para apps externas

`GET /conversations/:id/integrations` retorna las apps embed visibles para esa conversación e inyecta autenticación en `embed_url` según `auth_type`:

- **`JWT`**: firma HS256 corto con claims `actor`, `conversation`, `contact`. Config: `auth_query_param`, `jwt_expires_in`, `jwt_issuer`, `jwt_audience`, `jwt_signing_secret` (fallback a `credentials_ref` / `auth_credential_value`).
- **`API_KEY`**: inyecta credencial en query (`api_key` por defecto, override con `auth_query_param`). Fuente: `config.auth_credential_value`, `credentials_ref` o `config.api_key`.
- **`OAUTH2`**: inyecta `access_token` preconfigurado (param por defecto `access_token`).

### 4.8 Settings (admin)

```
# Channels
GET/POST /settings/channels
PUT/DELETE /settings/channels/:id
POST /settings/channels/:id/test

# Skills, Teams, Roles, Dispositions, Quick replies, SLA policies,
# Business hours, Email templates, General
GET/POST /settings/<resource>
PUT/DELETE /settings/<resource>/:id

# Softphone del usuario actual
GET/PUT /settings/softphone/me

# Telefonía PBX unificada (host Asterisk + softphone org + ARI)
GET/PUT /settings/telephony
```

### 4.9 Voz

```
POST /voice/calls/logs           # Historial por usuario (independiente)
GET  /voice/calls/logs           # Paginado
POST /voice/calls/events         # Legacy, ligado a conversation_id
```

---

## 5. Realtime (Socket.IO)

`backend/src/realtime/socket.ts`:

- **Auth handshake**: token JWT en `socket.handshake.auth.token` o query param.
- **Salas (rooms)**:
  - `user:<userId>` — join automático en conexión.
  - `conversation:<id>` — join/leave on demand.
  - `queue:<id>` — join al unirse a colas.

### 5.1 Eventos cliente → servidor

| Evento | Payload | Acción |
|---|---|---|
| `agent:set_status` | `{ status }` | Actualiza `users.status` y emite `agent:status_changed` global |
| `conversation:join` | `{ conversationId }` | Une al room de la conversación |
| `conversation:leave` | `{ conversationId }` | Sale del room |
| `agent:join_queues` | `{ queueIds: [] }` | Une a rooms de colas |

### 5.2 Eventos servidor → cliente

| Evento | Cuándo se emite |
|---|---|
| `conversation:assigned` | Al asignar (auto o manual) — emitido a `user:<targetUserId>` |
| `notification:new` | Asignaciones nuevas o transferencias recibidas |
| `message:new` | Mensaje nuevo en conversación — emitido a `conversation:<id>` |
| `agent:status_changed` | Cambio de estado de agente — broadcast |
| `queue:updated` | Cambio en cola — emitido a `queue:<id>` |
| `supervisor:live_update` | Eventos relevantes para live board — broadcast |

### 5.3 Namespace adicional

- **`/webchat`**: namespace dedicado para clientes embebidos de webchat público (emite `webchat:ready` al conectar).

---

## 6. Asincronía y workers

- **`backend/src/queue/bull.ts`**: define la cola y `enqueueRouting(conversationId)`.
- **`backend/src/workers/index.ts`**: `startWorkers(io)` registra procesadores de:
  - Routing post-creación de conversación.
  - Reintentos de delivery de mensajes salientes.
  - Cálculo de SLA breach diferido.
- **Modos de ejecución**:
  - In-process: `ENABLE_JOBS=true` (default en dev).
  - Standalone: `npm run worker` (recomendado para producción).
- **Concurrencia**: `QUEUE_CONCURRENCY` (default 5).
- **Locks**: `assignLock(conversationId, ttlSec)` en Redis evita asignaciones duplicadas.

---

## 7. Modelo de datos (Prisma)

Esquema en `backend/prisma/schema.prisma` (~590 líneas). PostgreSQL con `@map` snake_case.

### 7.1 Entidades principales

#### Usuarios y seguridad

- **`User`** (`users`): credenciales, perfil, `sip_extension`/`sip_password`, `status`, `max_concurrent`.
- **`Role`** (`roles`): permisos como JSON arbitrario.
- **`UserRole`** (`user_roles`): N:M user ↔ role.
- **`RefreshToken`** (`refresh_tokens`): hash + `expires_at`, cascada al borrar usuario.
- **`AuditLog`** (`audit_logs`): trazabilidad genérica `actor / action / entity / metadata`.
- **`Skill`** + **`UserSkill`**: catálogo + asignación con `proficiency` 1–10.
- **`Team`** + **`TeamMember`**: equipos operativos.

#### Operación de contact center

- **`Contact`** (`contacts`): `external_id` + `source_system`, email, phone, phone_wa, teams_id, metadata libre.
- **`Conversation`** (`conversations`):
  - FK: `channel_id`, `contact_id`, `queue_id?`, `sla_policy_id?`, `disposition_id?`.
  - Estado: `status` (enum), `priority`, `source`, `source_ref_id`.
  - Escalamiento: `escalation_reason`, `escalation_context` JSON.
  - SLA: `sla_first_response_at`, `sla_resolution_at`, `sla_breached`.
  - Métricas: `wait_time_seconds`, `handle_time_seconds`, `first_response_seconds`.
  - Cierre: `csat_score`, `csat_comment`, `wrap_up_notes`, `resolved_at`.
  - UI: `unread_agent_count`, `last_message_preview`, `last_message_at`.
  - Índices: `[status, queue_id]`, `[contact_id]`, `[source, source_ref_id]`.
- **`Message`** (`messages`): `sender_type` (enum), `content_type` (enum), email metadata (`email_message_id`, `email_in_reply_to`, `email_subject`, `email_cc`, `email_bcc`), voz (`call_recording_url`, `call_duration_seconds`, `transcription`), `delivery_status`, `is_internal`. Índice `[conversation_id, created_at]`.
- **`Attachment`** (`attachments`): adjuntos por mensaje.
- **`ConversationAssignment`** (`conversation_assignments`): histórico de asignaciones (assigned_at / accepted_at / ended_at / reason).
- **`Transfer`** (`transfers`): `from_user_id`, `from_queue_id`, `to_user_id`, `to_queue_id`, `transfer_type`, `reason`.
- **`ContactNote`** + **`Tag`** + **`ContactTag`**: notas y etiquetado de contactos.

#### Enrutamiento y configuración

- **`Queue`** (`queues`): `routing_strategy` (enum), `priority`, `max_wait_seconds`, `overflow_queue_id`, `schedule` JSON, `out_of_hours_message`, `sla_policy_id`, `is_active`.
- **`QueueChannel`** (`queue_channels`): N:M cola ↔ canal.
- **`QueueSkill`** (`queue_skills`): skills requeridos con `min_level` y `mandatory`.
- **`SlaPolicy`** (`sla_policies`): tiempos de primera respuesta y resolución, threshold de warning.
- **`Disposition`** (`dispositions`): catálogo de cierres con `requires_note`.

#### Configuración de plataforma

- **`Channel`** (`channels`): nombre, tipo, status, `config` JSON con credenciales del canal, cache de conversaciones del día.
- **`QuickReply`** (`quick_replies`): por canal, categoría y owner.
- **`BusinessHours`** (`business_hours`): timezone, schedule JSON, holidays.
- **`EmailTemplate`** (`email_templates`): asunto, body, variables.
- **`OrganizationSettings`** (`organization_settings`): defaults globales, **`pbx_host`** (host Asterisk unificado), parámetros SIP softphone y rango de extensiones.
- **`IntegrationApp`** + **`IntegrationAppBinding`**: catálogo de apps embed con bindings por scope.

#### Calidad y voz

- **`QualityEvaluation`** (`quality_evaluations`): rúbrica fija (saludo, empatía, resolución, cierre) + score + comment.
- **`VoiceCall`** (`voice_calls`): historial **desacoplado** de conversaciones. Campos: `external_call_id`, `remote_uri`, `remote_display_name`, `direction`, `state`, `started_at`, `ended_at`, `duration_seconds`, `metadata` JSON, `user_id?`. Índices: `[user_id, created_at]`, `[external_call_id]`. `onDelete: SetNull` sobre user.

### 7.2 Enums clave

```prisma
enum AgentStatus        { ONLINE, AWAY, BUSY, OFFLINE, ON_BREAK }
enum ChannelType        { WHATSAPP, EMAIL, TEAMS, VOICE, WEBCHAT }
enum ConversationStatus { WAITING, ASSIGNED, ACTIVE, ON_HOLD, WRAP_UP,
                          RESOLVED, ABANDONED, TRANSFERRED }
enum RoutingStrategy    { ROUND_ROBIN, LEAST_BUSY, SKILL_BASED,
                          PRIORITY_BASED, LONGEST_IDLE }
enum SenderType         { CONTACT, AGENT, SYSTEM, BOT }
enum ContentType        { TEXT, IMAGE, FILE, AUDIO, VIDEO, EMAIL,
                          VOICE_CALL, SYSTEM_EVENT, CSAT_REQUEST }
enum IntegrationAppMode { SNAPSHOT, EMBED, ACTIONS }
enum IntegrationAuthType{ NONE, API_KEY, OAUTH2, JWT }
enum IntegrationBindingScopeType { GLOBAL, CHANNEL, QUEUE, ROLE }
```

### 7.3 Migraciones (multi-tenant)

Esquemas Prisma:

- `prisma/schema.prisma` — negocio (cada BD tenant)
- `prisma/master.schema.prisma` — solo tabla `tenants`

```bash
npm run prisma:generate           # genera clientes tenant + master
SEED_LOCAL_TENANT=true npm run setup:master   # primera vez: Master + tenant local
npm run bootstrap:tenant          # solo deploy: primer tenant (TENANT_* en env)
npm run migrate:tenant            # una BD tenant (TENANT_DB_* o DATABASE_URL)
npm run migrate:all-tenants       # todos los tenants activos (antes de cada release)
npm run seed:tenant               # datos demo en una BD tenant
npx prisma migrate dev            # desarrollo: nueva migración contra BD de prueba
```

La Master **no** recibe migraciones de negocio.

Scripts en `backend/scripts/`:

| Script | Archivo | Uso |
|---|---|---|
| `bootstrap:tenant` | `bootstrap-tenant-env.ts` | Primer tenant en deploy (env). Operación: panel `/platform`. |
| `setup:master` | `setup-master.ts` | Bootstrap BD Master |
| `migrate:tenant` | `migrate-tenant.ts` | Migraciones en una BD tenant |
| `migrate:all-tenants` | `migrate-all-tenants.ts` | Migraciones en todos los tenants activos |

Scripts utilitarios adicionales:

- `db:clear-conversations`: limpia conversaciones para entorno de pruebas.
- `db:normalize-contact-phones`: normaliza formato de teléfonos.

---

## 8. Routing Engine

`backend/src/routing/RoutingEngine.ts`:

```ts
export class RoutingEngine {
  constructor(private prisma: PrismaClient, private io: SocketIOServer | null) {}
  async routeConversation(conversationId: string): Promise<void> {
    const locked = await assignLock(conversationId, 5);
    if (!locked) return;
    // 1. Lee la conversación + cola + skills requeridos
    // 2. Construye AgentScore[] (activeCount, lastAssignedAt, lastEndedAt, skillScore, priorityScore)
    // 3. Filtra por agentes ONLINE, dentro de max_concurrent y con skills mínimos
    // 4. Ordena con rankAgentsByStrategy(agents, strategy)
    // 5. Asigna y emite eventos Socket.IO
  }
}
```

Fórmula de ranking por estrategia (`rankAgentsByStrategy`):

| Estrategia | Criterio de orden |
|---|---|
| `ROUND_ROBIN` | `lastAssignedAt asc`, `activeCount asc` |
| `LEAST_BUSY` | `activeCount asc`, `skillScore desc`, `lastAssignedAt asc` |
| `SKILL_BASED` | `skillScore desc`, `activeCount asc` |
| `LONGEST_IDLE` | `lastEndedAt asc` |
| `PRIORITY_BASED` | `priorityScore desc`, `activeCount asc`, `skillScore desc` |

Locks Redis (`assignLock`/`releaseAssignLock`) garantizan exclusión mutua a 5s para evitar doble asignación.

---

## 9. Frontend - estructura y módulos

### 9.1 Layout (`frontend/src/`)

```
frontend/src/
├── main.tsx                # Bootstrap Vite
├── App.tsx                 # Router + providers (QueryClient, Theme)
├── index.css / App.css
├── components/
│   ├── AppLayout.tsx       # Shell con sidebar + header
│   ├── AppSidebar.tsx      # Navegación principal
│   ├── HeaderBar.tsx       # Topbar + softphone widget + status
│   ├── AuthBootstrap.tsx   # Carga perfil + permisos al iniciar
│   ├── inbox/
│   │   ├── ConversationList.tsx
│   │   ├── ChatArea.tsx
│   │   ├── EmailThreadView.tsx
│   │   ├── ContextPanel.tsx       # Embed apps + datos contacto
│   │   ├── AssignDialog.tsx
│   │   ├── TransferDialog.tsx
│   │   └── ResolveDialog.tsx
│   ├── softphone/
│   │   ├── SoftphoneWidget.tsx    # UI de llamada
│   │   └── SoftphoneConfig.tsx    # Configuración SIP por usuario
│   ├── supervisor/
│   │   └── SupervisorMonitorDialog.tsx
│   ├── contacts/
│   │   └── ContactDetailDrawer.tsx
│   ├── email/                     # Editor + preview email
│   └── ui/                        # shadcn/ui primitives
├── pages/
│   ├── LoginPage.tsx
│   ├── InboxPage.tsx
│   ├── DashboardPage.tsx
│   ├── QueuesLivePage.tsx
│   ├── SupervisorPage.tsx
│   ├── ContactsPage.tsx
│   ├── QualityPage.tsx
│   ├── ReportsPage.tsx
│   ├── ProfilePage.tsx
│   ├── IntegrationsPage.tsx
│   ├── RolesPage.tsx
│   └── settings/
│       ├── SettingsChannelsPage.tsx
│       ├── SettingsQueuesPage.tsx
│       ├── SettingsSkillsPage.tsx
│       ├── SettingsTeamsPage.tsx
│       ├── SettingsUsersPage.tsx
│       └── SettingsGeneralPage.tsx
├── hooks/
│   └── useSipPhone.ts             # SIP.js + WebRTC + estado del call
├── stores/                        # Zustand stores (auth, inbox, sip)
├── lib/                           # api client, socket client, utils
└── data/                          # Mocks/seeds para dev
```

### 9.2 Estado y datos

- **React Query** para cache server-state (queries de conversaciones, contactos, settings, dashboard).
- **Zustand** (estimado por convención `stores/`) para estado local persistente: auth, sesión SIP, filtros de inbox.
- **socket.io-client** para subscripciones realtime que invalidan queries de React Query.

### 9.3 Configuración de entorno frontend

`frontend/.env`:

```env
VITE_API_URL=http://localhost:3037/api
VITE_WS_URL=http://localhost:3037
VITE_SOCKET_PATH=/socket.io
```

La UI requiere que backend y WebSocket sean alcanzables y que CORS sea compatible (`CORS_ORIGIN` debe coincidir con el origen real del frontend).

### 9.4 Softphone web (`useSipPhone`)

- **SIP.js** sobre **WSS** (`wss://<asterisk-host>:8089/ws`).
- Registro automático con extensión y password del usuario (`User.sip_extension` / `sip_password`) o configuración manual en `Settings → Softphone`.
- Manejo de eventos: `registered`, `unregistered`, `invite`, `terminated`.
- Soporte de **DTLS-SRTP**, **ICE**, STUN configurable (`stun:stun.l.google.com:19302` por defecto).
- Auto-apertura del widget en `ringing` desde `HeaderBar`.
- Reporte de estado al backend en `POST /voice/calls/logs` (started, answered, ended con duración).

---

## 10. Telefonía Asterisk

> Configuración en `deploy/asterisk/conf/`, compose en `deploy/asterisk/docker-compose.asterisk.yml`.

### 10.1 Topología

| Extensión | Tipo | Uso |
|---|---|---|
| `1000` | Stasis (ARI) | Asistente de IA externo |
| `6001` | SIP UDP | Softphone tradicional desktop/hardware (`6001pass`) |
| `7001` | WebRTC (WSS) | Softphone web del frontend (`7001pass`) |
| `8001` | SIP UDP | App móvil/desktop tipo Zoiper (`8001pass`) |

### 10.2 Puertos

| Puerto | Protocolo | Uso |
|---|---|---|
| `5060` | UDP | SIP UDP |
| `8088` | TCP | ARI HTTP (dentro del contenedor) |
| `8089` | TCP | WSS SIP (WebRTC) |
| `ASTERISK_RTP_START`–`ASTERISK_RTP_END` | UDP | RTP media |

Notas (dev local con Docker):

- El ARI HTTP del contenedor (`8088`) está mapeado en el host como **`8074`** (ej. `http://localhost:8074/ari/asterisk/info`).
- El WSS SIP usa path típico **`/ws`** (ej. `wss://localhost:8089/ws`).

### 10.3 Dialplan (`extensions.conf`, contexto `from-internal`)

```
exten => 1000,1,Stasis(ai-assistant)
exten => 6001,1,Dial(PJSIP/6001,30)
exten => 7001,1,Dial(PJSIP/7001,30)
exten => 8001,1,Dial(PJSIP/8001,30)
```

### 10.4 PJSIP destacable

- `transport-udp`: define `external_signaling_address` y `external_media_address` que **deben** apuntar a IP/FQDN alcanzable por clientes externos al contenedor (loopback rompe el audio).
- `transport-wss`: para WebRTC con `webrtc=yes`, `media_encryption=dtls`, `ice_support=yes`, `rtcp_mux=yes`.
- `from_user` + `from_domain=localhost` para compatibilidad con SIP.js.
- Para `7001`: `max_contacts=5`, `remove_existing=no`, `remove_unavailable=no`, `qualify_frequency=0` para reducir flapping de registro en navegadores.

### 10.5 Integración con backend

- Frontend reporta eventos a `POST /api/voice/calls/logs` → tabla `voice_calls`.
- `voiceAsterisk.service.ts` consume **ARI** para originar/controlar canales y para flujos del asistente IA.
- Historial de voz **desacoplado** de `conversations` para no contaminar la bandeja omnicanal.

### 10.6 Troubleshooting

1. `pjsip show contacts` en CLI Asterisk para verificar registros.
2. Confirmar INVITE al destino correcto.
3. Validar IP en SDP (no debe ser loopback interna del contenedor).
4. Confirmar rango RTP abierto en firewall/security group.
5. Revisar certificados TLS si falla WSS (si es self-signed, el navegador debe “confiar” el cert para que `wss://` conecte).
6. Probar cruzado: `6001 ↔ 7001`, `7001 ↔ 8001`, `6001 ↔ 8001`, y `→ 1000` para IA.

---

## 11. Despliegue

> **Guía completa para un cliente nuevo (infraestructura + UI + canales + voz):** [08-manual-configuracion-cliente-nuevo.md](./08-manual-configuracion-cliente-nuevo.md).  
> **Alta de tenant adicional:** panel `{frontend}/platform/tenants` o API `POST /api/platform/tenants`.

### 11.1 Local

**Backend:**

```bash
cd backend
cp .env.example .env             # MASTER_DATABASE_URL, DATABASE_URL, REDIS_URL, secretos
npm install
npm run prisma:generate
SEED_LOCAL_TENANT=true npm run setup:master
npm run migrate:tenant
npm run dev                      # puerto 3037
# opcional, worker dedicado:
npm run worker
```

**Frontend:**

```bash
cd frontend
cp .env.example .env             # VITE_API_URL, VITE_TENANT_KEY=local (solo localhost)
npm install
npm run dev                      # puerto 8087; HTTPS automático si existen deploy/asterisk/keys/*.pem
```

**Pruebas en LAN:** `./scripts/set-lan-ip.sh` — alinea IP en `.env`, BD y Asterisk. Acceder por `https://<IP-LAN>:8087`. Ver `docs/05-telefonia-asterisk-softphone.md`.

**Asterisk:**

```bash
cd deploy/asterisk
cp .env.example .env             # ajustar ASTERISK_*_PORT, RTP range, IPs externas
docker compose -f docker-compose.asterisk.yml --env-file .env up -d
```

Archivos:

- `deploy/asterisk/docker-compose.asterisk.yml`: compose usado para el contenedor `asterisk`.
- `deploy/asterisk/conf/`: `pjsip.conf`, `extensions.conf`, `http.conf`, `ari.conf`, `rtp.conf` (montados read-only).
- `deploy/asterisk/keys/`: certificados TLS locales (no versionados). Ver `deploy/asterisk/keys/README.md`.

Nota importante (red/audio):

- En `deploy/asterisk/conf/pjsip.conf`, actualiza `external_signaling_address`, `external_media_address`, `media_address` y `local_net` para que coincidan con tu LAN/IP real; si no, puedes tener **audio de un solo lado** o SDP anunciando IPs incorrectas.
- Para probar softphone desde otra PC en LAN, el frontend debe servirse por **HTTPS** en el puerto 8087 (Vite dev + certificados en `deploy/asterisk/keys/`). Con `http://192.168.x.x` el registro SIP puede funcionar pero las llamadas no (micrófono bloqueado).

### 11.3 Checklist de validación post-deploy

**API:**

- [ ] `GET /api/health` retorna `{ ok: true }`.
- [ ] Login y refresh funcionan.
- [ ] Socket.IO conecta con token válido.

**Frontend:**

- [ ] Login carga sin errores CORS.
- [ ] Navegación por módulos según rol.
- [ ] Inbox muestra conversaciones y permite acciones.

**Voz:**

- [ ] Registro SIP correcto para extensión web.
- [ ] Llamadas internas entre `6001`, `7001`, `8001` funcionan.
- [ ] Audio bidireccional confirmado.
- [ ] Eventos persistidos en `voice_calls`.

**Persistencia:**

- [ ] Migraciones aplicadas y `prisma generate` ejecutado.
- [ ] Redis disponible para cola/workers.

---

## 12. Operación continua

- **Rotación de secretos** periódica: `JWT_SECRET`, `PLATFORM_JWT_SECRET` (si se usa distinto), `INTEGRATION_API_KEY`, credenciales de canales.
- **Monitoreo**: CPU/memoria de backend y Asterisk; lag de cola BullMQ; conexiones Socket.IO; cola de workers.
- **Backups**: snapshots de PostgreSQL y respaldo de configuraciones críticas.
- **Trazabilidad**: revisar `audit_logs`, `quality_evaluations`, `voice_calls` y logs PM2.
- **Logging Prisma**: `PRISMA_LOG_QUERIES=true` solo para depuración puntual.

---

## 13. Pruebas

- **Backend**: `vitest` con archivos `*.test.ts` (ej. `requirePermission.test.ts`, `RoutingEngine.test.ts`). Ejecutar con `npm test` en `backend/`.
- **Frontend**: `vitest` configurado, ejecutar con `npm test` en `frontend/`.
- **Entorno de test**: schema relajado para `env.ts` (`NODE_ENV=test` no aborta el proceso).

---

## 14. Patrones técnicos a respetar

- **No cambiar puertos** `3037` y `8087`. Validar con `cat backend/.env` y `cat frontend/.env` antes de levantar servicios.
- **Validar entorno con Zod** ante cualquier nueva variable. Romper en arranque si falta una crítica.
- **Permisos JSON** en `Role.permissions`: cualquier endpoint nuevo debe declarar `requirePermission`.
- **Multi-tenant**: toda petición API con `X-Tenant-Key`; JWT con `tenantKey`; `getPrisma()` nunca recibe tenant como parámetro.
- **Eventos Socket.IO**: salas prefijadas `tenant:{key}:user:`, `tenant:{key}:conversation:`, `tenant:{key}:queue:`.
- **Migraciones Prisma**: `migrate:all-tenants` antes de cada release; nunca editar migraciones aplicadas.
- **Adapters de canal**: cualquier canal nuevo se implementa siguiendo `ChannelAdapter` y se registra en `registry.ts`. Debe tener un `config validator` (`<channel>/config.ts`).
- **Voice independiente**: nuevos eventos de voz NO deben crear conversaciones; usan `voice_calls`.
- **Errores HTTP**: usar `HttpError` desde `middleware/errorHandler.ts` y `asyncHandler` para controllers.

---

## 15. Diagrama de flujo de datos

```
Cliente externo (bot, IVR, AgentHub)
      │  x-api-key
      ▼
POST /api/integrations/escalate ──► integration.service.ts
                                        │
                                        ▼
                              prisma.contact.upsert()
                              prisma.conversation.create() (status WAITING)
                                        │
                                        ▼
                              enqueueRouting(id) ──► BullMQ (Redis)
                                                       │
                                                       ▼
                                            Worker → RoutingEngine
                                                       │
                                                       ▼
                                            assignLock + asignación
                                                       │
                                                       ▼
                                  Socket.IO emite a user:<id>, queue:<id>
                                                       │
                                                       ▼
                                  Frontend invalida React Query → UI actualiza
```

