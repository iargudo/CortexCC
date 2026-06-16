# DOCUMENTACION FUNCIONAL - CortexCC

Documento funcional consolidado del producto **CortexCC**, orientado a entender qué hace el sistema desde la perspectiva del usuario final (agentes, supervisores y administradores) y del negocio.

> **Manual operativo para administradores (paso a paso, sin tecnicismos):** [09-manual-administrador.md](./09-manual-administrador.md)

> Fuentes: `docs/01-vision-funcional.md`, `docs/04-frontend-modulos-flujos.md`, `docs/05-telefonia-asterisk-softphone.md`, `docs/09-manual-administrador.md`, código de `frontend/src/` y `backend/src/services/`.

---

## 1. Visión del producto

CortexCC es un **contact center omnicanal** que centraliza en una única operación las conversaciones provenientes de WhatsApp, Email, Microsoft Teams, Voz (SIP/WebRTC) y Webchat. Su propósito es:

- Unificar bandejas de atención dispersas en un solo cockpit operativo.
- Enrutar conversaciones de forma automática o manual según colas, skills y SLA.
- Integrar telefonía empresarial (Asterisk) directamente en el navegador del agente.
- Ofrecer supervisión en tiempo real, evaluación de calidad y reportería operativa.
- Conectarse con sistemas externos (CortexAgentHub, Collect, Voice transfer, etc.) mediante escalamiento autenticado.

El sistema está diseñado para una operación **multi-rol** con segregación de responsabilidades por permisos (RBAC).

**Multi-tenant:** la plataforma puede dar servicio a varias empresas con un solo despliegue. Cada empresa accede por su URL (sin selector en el login); los datos están aislados en bases de datos separadas. El nombre de la organización aparece en la barra superior tras iniciar sesión.

---

## 2. Perfiles de usuario

| Perfil | Responsabilidad principal | Capacidades destacadas |
|---|---|---|
| **Agente** | Atender conversaciones asignadas | Inbox omnicanal, softphone web, respuestas rápidas, notas internas, transferencia, resolución con disposición |
| **Supervisor** | Monitorear la operación y forzar acciones | Live board, monitoreo de agentes, asignación forzada, vista de colas en vivo, evaluaciones de calidad |
| **Administrador** | Configurar la plataforma | Canales, colas, skills, equipos, roles, SLA, dispositions, plantillas de email, integraciones, parámetros generales |

El acceso a cada módulo está controlado por permisos vía middleware `requirePermission` / `requireAnyPermission` y se refleja en el frontend habilitando o deshabilitando rutas.

---

## 3. Capacidades funcionales principales

### 3.1 Bandeja omnicanal (Inbox)

Pantalla central del agente: `frontend/src/pages/InboxPage.tsx` con componentes `ConversationList`, `ChatArea`, `EmailThreadView`, `ContextPanel`.

- Vista unificada de conversaciones de **WhatsApp, Email, Teams, Voice y Webchat**.
- Tabs operativos: **Mías**, **Cola**, **Todas**.
- Filtros por canal, estado y búsqueda global.
- Diferenciación de UX por canal:
  - Estilo **chat** para mensajería instantánea y eventos de voz.
  - Estilo **hilo de correo** (`EmailThreadView`) con asunto, citas, CC/BCC y plantillas para email.
- Panel de contexto lateral con datos del contacto, escalamientos y apps integradas embebidas.

### 3.2 Ciclo de vida de una conversación

Estados soportados (enum `ConversationStatus`):

`WAITING` → `ASSIGNED` → `ACTIVE` → `ON_HOLD` → `WRAP_UP` → `RESOLVED` | `ABANDONED` | `TRANSFERRED`

Acciones operativas disponibles desde la UI:

- **Aceptar** / **Rechazar** asignación.
- **Pausar** (`hold`) y **Reanudar** (`resume`).
- **Transferir** a otro agente o cola con razón y traza histórica (`Transfer`).
- **Resolver** seleccionando una **disposición** (`Disposition`) y notas de cierre.
- Indicadores de **SLA** (primer respuesta, resolución, breach).
- **CSAT** opcional al cierre.

### 3.3 Gestión de contactos (CRM operativo)

Pantalla `ContactsPage` con drawer `ContactDetailDrawer`:

- CRUD de contactos (nombre, email, teléfono, WhatsApp, Teams ID, metadata libre).
- **Importación / exportación CSV** masiva.
- **Merge** de contactos duplicados.
- **Timeline** histórico de conversaciones por contacto.
- **Notas internas** (`ContactNote`) y **etiquetado** (`Tag`/`ContactTag`) para segmentación.

### 3.4 Enrutamiento y asignación

Motor `RoutingEngine` con cinco estrategias seleccionables por cola:

- `ROUND_ROBIN`: rota por agentes disponibles según última asignación.
- `LEAST_BUSY`: prioriza al agente con menor carga activa.
- `SKILL_BASED`: prioriza por mayor coincidencia de skills.
- `PRIORITY_BASED`: usa puntaje de prioridad.
- `LONGEST_IDLE`: prioriza al agente que más tiempo lleva sin atender.

Operativamente:

- **Asignación automática** al ingresar conversación a la cola.
- **Asignación manual** desde supervisor (`force-assign`) o desde el agente.
- **Transferencia** a usuario o cola, con razón y trazabilidad.
- **Vista en vivo de colas** (`QueuesLivePage`) para priorizar.
- **Skills** ponderados por proficiency (1-10) y skills mínimos por cola.

### 3.5 Supervisión y calidad

- **Live Board** (`SupervisorPage`): conversaciones en espera, agentes online, ocupación por cola.
- **Monitoreo de agente** (`SupervisorMonitorDialog`).
- **Evaluaciones de calidad** (`QualityPage`) con rúbrica fija:
  - Saludo, Empatía, Resolución, Cierre + comentario.
  - Score consolidado por evaluación.
- **Pendientes de QA** y **historial** de evaluaciones por agente/canal.

### 3.6 Reportería y dashboard

- **Dashboard** (`DashboardPage`) con KPI en tiempo real: conversaciones activas, en espera, agentes online, SLA.
- **Reports** (`ReportsPage`):
  - Volumen por canal y franja horaria.
  - Productividad por agente.
  - Cumplimiento SLA.
  - CSAT.
  - Resumen ejecutivo.
  - Exportación CSV.

### 3.7 Telefonía integrada (Softphone web)

Widget embebido en la cabecera operativa: `SoftphoneWidget` + `useSipPhone`.

- Registro **SIP sobre WebRTC (WSS)** contra Asterisk.
- Llamadas entrantes/salientes con control de **mute, hold, hangup**.
- **Auto-apertura** del widget ante llamada entrante en `ringing`.
- Llamadas internas entre extensiones de agentes y asistente.
- Historial de llamadas persistido en `voice_calls`, **independiente de las conversaciones omnicanal**.
- Configuración personal por usuario en el widget softphone (extensión/contraseña).
- Configuración **organizacional del PBX** en **Configuración → Telefonía**: un `pbx_host` deriva `sip_server` (WSS) y `ariBaseUrl` (ARI del canal VOICE).

Extensiones disponibles (Asterisk local en Docker):

| Extensión | Tipo | Uso | Usuario | Password |
|---|---|---|---|---|
| `1000` | Stasis/ARI | Asistente de IA | — | — |
| `6001` | SIP UDP | Softphone tradicional desktop/hardware | `6001` | `6001pass` |
| `7001` | WebRTC (WSS) | Softphone web (navegador) | `7001` | `7001pass` |
| `8001` | SIP UDP | Softphone móvil/desktop (Zoiper, etc.) | `8001` | `8001pass` |

Parámetros típicos del softphone web (7001):

- `server`: `wss://localhost:8089/ws`
- `realm`: `localhost`
- `extension`: `7001`
- `password`: `7001pass`

### 3.8 Integraciones externas y SSO embed

- **Escalamiento entrante**: sistemas externos crean/actualizan conversación vía `POST /integrations/escalate` con `x-api-key`.
- **Apps integradas embebidas** en el panel de contexto del inbox (`integration_apps` + `integration_app_bindings`):
  - Modos: `SNAPSHOT` (datos de solo lectura), `EMBED` (iframe con SSO), `ACTIONS` (acciones invocables).
  - Auth: `NONE`, `API_KEY`, `OAUTH2`, `JWT` (token corto firmado HS256 con claims de actor/conversación/contacto).
  - Inyección automática de credenciales en `embed_url` según `auth_type`.
  - Bindings por scope: `GLOBAL`, `CHANNEL`, `QUEUE`, `ROLE`.

### 3.9 Configuración (Settings)

Páginas administrativas (`frontend/src/pages/settings/`):

- **Channels**: alta de canales por tipo (`WHATSAPP`, `EMAIL`, `TEAMS`, `VOICE`, `WEBCHAT`) con prueba de configuración.
- **Telefonía**: host PBX unificado, softphone organizacional (WSS/SIP) y credenciales ARI del canal VOICE en una sola pantalla.
- **Queues**: estrategia de routing, prioridad, overflow, horarios, SLA.
- **Skills** y **Teams**: catálogo de skills y equipos operativos.
- **Users**: alta de usuarios y asignación de skills.
- **Roles**: definición de permisos JSON-based.
- **Dispositions**: catálogo de cierres con categoría y nota obligatoria opcional.
- **Quick replies**: respuestas rápidas con shortcode, por canal y categoría.
- **SLA policies**: tiempos de primera respuesta y resolución, threshold de warning.
- **Business hours**: zona horaria, calendario semanal y feriados.
- **Email templates**: plantillas con variables.
- **General**: nombre de empresa, idioma, timezone, disposiciones, SLA, respuestas rápidas y horarios.
- **Integration apps / Bindings**: catálogo de apps externas y reglas de visibilidad.

---

## 4. Flujos funcionales críticos

### Flujo A — Escalamiento externo a atención humana

1. Sistema externo (ej. CortexAgentHub, bot, IVR) invoca `POST /integrations/escalate` con clave de integración.
2. Backend resuelve o crea el `Contact` (por `external_id + source_system`, email o teléfono).
3. Crea o actualiza `Conversation` con `source`, `source_ref_id`, `escalation_reason` y `escalation_context`.
4. La conversación entra a la cola correspondiente (estado `WAITING`).
5. `RoutingEngine` ejecuta la estrategia configurada y emite `conversation:assigned` vía Socket.IO.
6. El agente la recibe en su Inbox, la acepta y la atiende.
7. Al cerrar, registra disposición, notas y opcionalmente CSAT.

### Flujo B — Login y operación diaria del agente

1. Login en `LoginPage` (JWT + refresh token).
2. `AuthBootstrap` carga perfil, roles y permisos.
3. UI habilita módulos según RBAC.
4. Se establece conexión Socket.IO autenticada con `token`.
5. Agente cambia su estado (`ONLINE`, `BUSY`, `AWAY`, `ON_BREAK`, `OFFLINE`) — emite `agent:set_status`.
6. Recibe asignaciones en tiempo real, atiende conversaciones, registra notas, transfiere o resuelve.

### Flujo C — Llamada interna SIP/WebRTC

1. Agente abre el softphone (auto-registro con extensión `7001` por defecto).
2. WSS contra Asterisk (`wss://<host>:8089/ws`).
3. Marca extensión destino (`1000` IA, `6001`, `7001`, `8001`).
4. Asterisk enruta por dialplan `from-internal`.
5. Audio bidireccional vía RTP/WebRTC (DTLS-SRTP, ICE).
6. El frontend reporta inicio/fin/estado a `POST /voice/calls/logs` → `voice_calls`.

### Flujo D — Atención de email

1. Email entra por **webhook** o **poller IMAP** (`emailPoller.service.ts`, `emailInbound.service.ts`).
2. Se crea o reutiliza conversación por `email_message_id` / `email_in_reply_to`.
3. Vista como **hilo** con asunto, CC/BCC y mensaje raíz.
4. Respuesta con editor + plantillas (`email_templates`).
5. Envío saliente vía SMTP, persistencia del mensaje y tracking operativo.

### Flujo E — Atención de WhatsApp

1. Mensaje entra por `POST /webhooks/:tenantKey/whatsapp/:channelId` (el tenant va en la URL del webhook).
2. `inboundService` resuelve contacto por teléfono / `phone_wa`.
3. Crea o continúa conversación abierta del canal WhatsApp.
4. Notifica al agente asignado vía Socket.IO (`message:new`).
5. Respuestas salen por adapter del canal (`backend/src/channels/whatsapp/`).

### Flujo F — Resolución y QA

1. Agente cierra conversación con `Resolve` (disposición + notas + CSAT opcional).
2. Conversación pasa a `WRAP_UP` y luego `RESOLVED`.
3. Aparece en cola de QA (`/quality/pending`).
4. Supervisor evalúa con rúbrica (saludo, empatía, resolución, cierre).
5. Se persiste `QualityEvaluation` y se refleja en reportería.

---

## 5. Reglas funcionales relevantes

- **RBAC** estricto por permiso a nivel de endpoint y de UI.
- **Eventos de voz** pueden existir sin `conversation_id` → historial independiente en `voice_calls`.
- **Integraciones externas** usan `INTEGRATION_API_KEY` dedicada; nunca tokens de usuario.
- **Configuración de canal** validable y testeable desde `Settings → Channels` antes de activarla.
- **SLA breach** se calcula automáticamente sobre `sla_first_response_at` y `sla_resolution_at`.
- **Mensajes internos** (`is_internal=true`) no se envían al contacto, solo se ven entre agentes.
- **Refresh token** rotativo con hash en `refresh_tokens`; logout invalida la sesión activa.
- Las **conversaciones cerradas** se reabren automáticamente si el contacto vuelve a escribir antes de un umbral, según canal.

---

## 6. KPIs funcionales soportados

- Conversaciones en espera y activas por canal y cola.
- Tiempo promedio de espera y de manejo.
- Cumplimiento SLA (% dentro y fuera de objetivo).
- Productividad por agente (atendidas, resueltas, AHT).
- Tendencia de volumen por franja horaria.
- Score de calidad por agente y canal.
- CSAT por conversación, agente y canal.
- Llamadas de voz por dirección (entrante/saliente) y duración.

---

## 7. Glosario funcional

| Término | Significado |
|---|---|
| **Conversación** | Hilo persistente entre un contacto y la operación, con estado y canal asociado |
| **Cola** | Punto de entrada virtual con estrategia de routing y SLA propios |
| **Skill** | Capacidad del agente con nivel 1–10, usado por `SKILL_BASED` |
| **Disposition** | Motivo categorizado de cierre de conversación |
| **Wrap-up** | Tiempo post-llamada/conversación para registrar disposición y notas |
| **SLA breach** | Incumplimiento del tiempo objetivo de primera respuesta o resolución |
| **Embed app** | Aplicación externa renderizada en iframe en el contexto del agente |
| **Escalamiento** | Entrega de un caso desde un sistema externo (bot, IVR, etc.) a un agente humano |
| **Live board** | Tablero del supervisor con estado en vivo de colas y agentes |

---

## 8. Alcance funcional fuera de la versión actual

Aspectos no cubiertos hoy y susceptibles a futuras versiones:

- WFM (planificación de turnos) automatizado.
- Marcador predictivo / progresivo saliente.
- Encuestas CSAT post-llamada por SMS/WhatsApp automáticas.
- Speech analytics y transcripción en vivo (existen campos `transcription` pero no pipeline activo).
- Forecasting basado en histórico.

