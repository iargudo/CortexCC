# Modelo de datos (Prisma)

## Arquitectura multi-tenant

CortexCC usa **database-per-tenant**: el aislamiento es por base de datos, no por columna `TenantId`.

| Base | Schema Prisma | Contenido |
|---|---|---|
| **Master** | `backend/prisma/master.schema.prisma` | Solo tabla `tenants` (registro de empresas, dominios, credenciales BD) |
| **Tenant** | `backend/prisma/schema.prisma` | Esquema completo de negocio (usuarios, conversaciones, canales, etc.) |

Cada empresa tiene su propia BD tenant con el **mismo esquema**. `OrganizationSettings` mantiene `id: "default"` (una fila por BD).

### Tabla `tenants` (solo Master)

| Campo | Descripcion |
|---|---|
| `tenant_key` | Identificador interno (ej. `cliente-a`, `local`) |
| `display_name` | Nombre visible en UI |
| `subdomain` | Subdominio (ej. `cliente-a` → `cliente-a.tuplataforma.com`) |
| `custom_domain` | Dominio custom (ej. `ventas.clientec.com`) |
| `database_host/port/user/password/name` | Credenciales de la BD del tenant |
| `is_active` | `false` deshabilita el tenant |

La Master **no** recibe migraciones de negocio. Solo `setup:master` crea su esquema.

## Fuente (esquema de negocio)

Modelo tomado de `backend/prisma/schema.prisma` (aplicado en cada BD tenant).

## Entidades nucleares

### Usuarios y seguridad

- `User` (`users`)
- `Role` (`roles`)
- `UserRole` (`user_roles`)
- `RefreshToken` (`refresh_tokens`)
- `AuditLog` (`audit_logs`)

Relaciones clave:

- Un usuario puede tener multiples roles.
- Un usuario puede emitir mensajes, evaluaciones, notas y llamadas de voz.

### Operacion de contacto center

- `Contact` (`contacts`)
- `Conversation` (`conversations`)
- `Message` (`messages`)
- `Attachment` (`attachments`)
- `ConversationAssignment` (`conversation_assignments`)
- `Transfer` (`transfers`)

Relaciones clave:

- Una conversacion pertenece a un contacto y un canal.
- Una conversacion tiene multiples mensajes y asignaciones historicas.
- Mensajes pueden tener adjuntos.

### Enrutamiento y configuracion operativa

- `Queue` (`queues`)
- `QueueChannel` (`queue_channels`)
- `QueueSkill` (`queue_skills`)
- `Skill` (`skills`)
- `UserSkill` (`user_skills`)
- `SlaPolicy` (`sla_policies`)
- `Disposition` (`dispositions`)
- `Team` (`teams`)
- `TeamMember` (`team_members`)

### Configuracion de plataforma

- `Channel` (`channels`)
- `QuickReply` (`quick_replies`)
- `BusinessHours` (`business_hours`)
- `EmailTemplate` (`email_templates`)
- `OrganizationSettings` (`organization_settings`)

### Calidad

- `QualityEvaluation` (`quality_evaluations`)

### Voz desacoplada de conversaciones

- `VoiceCall` (`voice_calls`)

Campos relevantes:

- `external_call_id`
- `remote_uri`
- `remote_display_name`
- `direction`
- `state`
- `started_at`
- `ended_at`
- `duration_seconds`
- `metadata`
- `user_id` opcional

Indices:

- `[user_id, created_at]`
- `[external_call_id]`

## Enumeraciones principales

- `AgentStatus`: `ONLINE`, `AWAY`, `BUSY`, `OFFLINE`, `ON_BREAK`.
- `ChannelType`: `WHATSAPP`, `EMAIL`, `TEAMS`, `VOICE`, `WEBCHAT`.
- `ConversationStatus`: `WAITING`, `ASSIGNED`, `ACTIVE`, `ON_HOLD`, `WRAP_UP`, `RESOLVED`, `ABANDONED`, `TRANSFERRED`.
- `RoutingStrategy`: `ROUND_ROBIN`, `LEAST_BUSY`, `SKILL_BASED`, `PRIORITY_BASED`, `LONGEST_IDLE`.
- `SenderType`: `CONTACT`, `AGENT`, `SYSTEM`, `BOT`.
- `ContentType`: `TEXT`, `IMAGE`, `FILE`, `AUDIO`, `VIDEO`, `EMAIL`, `VOICE_CALL`, `SYSTEM_EVENT`, `CSAT_REQUEST`.

## Reglas de modelado destacadas

- Uso de `@map` para nombres fisicos de tabla en snake_case.
- Uso de `@updatedAt` para control de actualizacion automatica.
- Indices en entidades criticas (`conversations`, `messages`, `contacts`, `voice_calls`).
- Relaciones con `onDelete` segun criticidad:
  - `Cascade` para entidades hijas operativas.
  - `SetNull` para historial de voz vinculado a usuario.

## Observaciones de integridad

- `Conversation` permite trazabilidad de SLA (`sla_first_response_at`, `sla_resolution_at`, `sla_breached`).
- `Message` soporta metadata email y campos de voz/transcripcion.
- `OrganizationSettings` centraliza defaults globales, incluyendo **`pbx_host`** (host Asterisk unificado), parámetros SIP del softphone y rango de extensiones.
- El canal `VOICE` (`channels.config`) guarda credenciales ARI; **`ariBaseUrl` se deriva de `pbx_host`** al guardar telefonía.

## Flujo de migraciones sugerido

1. Actualizar `backend/prisma/schema.prisma` (esquema de negocio).
2. Desarrollo: `npx prisma migrate dev` contra una BD tenant de prueba.
3. `npm run prisma:generate`.
4. Release: `npm run migrate:all-tenants` en **cada BD tenant activa** antes del deploy.
5. Reiniciar procesos API/worker.

La base Master solo se actualiza con `npm run setup:master` (cambios en `master.schema.prisma`). Nunca aplicar migraciones de negocio en Master.

### Alta de tenant nuevo

1. Crear BD vacia en PostgreSQL.
2. `npm run migrate:tenant` (con `TENANT_DB_*` o `DATABASE_URL`).
3. `npm run seed:tenant` (opcional, demo/staging).
4. INSERT en Master (`tenants`) con dominio + credenciales + `is_active=true`.
5. Registrar hostname en DNS apuntando al despliegue frontend unico.
