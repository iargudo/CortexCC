# Modelo de datos (Prisma)

## Fuente

Modelo tomado de `backend/prisma/schema.prisma`.

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
- `OrganizationSettings` centraliza defaults globales (incluyendo parametros SIP).

## Flujo de migraciones sugerido

1. Actualizar `schema.prisma`.
2. Ejecutar `npx prisma migrate dev` (o `migrate deploy` en produccion).
3. Ejecutar `npx prisma generate`.
4. Reiniciar procesos API/worker.
