# DOCUMENTACION FUNCIONAL - CortexCC

Documento funcional consolidado del producto **CortexCC**, orientado a entender qué hace el sistema desde la perspectiva del usuario final (agentes, coordinadores, supervisores y administradores) y del negocio.

> **Manual operativo para administradores (paso a paso, sin tecnicismos):** [09-manual-administrador.md](./09-manual-administrador.md)

> Fuentes: `docs/01-vision-funcional.md`, `docs/04-frontend-modulos-flujos.md`, `docs/05-telefonia-asterisk-softphone.md`, `docs/09-manual-administrador.md`, código de `frontend/src/` y `backend/src/services/`.

---

## 1. Visión del producto

CortexCC es un **contact center omnicanal** que centraliza en una única operación las conversaciones provenientes de WhatsApp, Email, Microsoft Teams, Voz (SIP/WebRTC) y Webchat. Su propósito es:

- Unificar bandejas de atención dispersas en un solo cockpit operativo.
- Enrutar conversaciones de forma automática o manual según colas, skills, horarios y SLA.
- Integrar telefonía empresarial (Asterisk) directamente en el navegador del agente.
- Ofrecer supervisión en tiempo real, evaluación de calidad, reportería y marcación saliente.
- Conectarse con sistemas externos (bots, IVR, CRM, etc.) mediante escalamiento autenticado e apps embebidas en el inbox.

El sistema está diseñado para una operación **multi-rol** con segregación de responsabilidades por permisos (RBAC).

**Multi-tenant:** la plataforma puede dar servicio a varias empresas con un solo despliegue. Cada empresa accede por su URL (sin selector en el login); los datos están aislados en bases de datos separadas. El nombre de la organización aparece en la barra superior tras iniciar sesión.

**Administración de plataforma:** existe un panel separado (`/platform`) para alta y gestión de tenants y administradores de plataforma, con autenticación propia.

---

## 2. Perfiles de usuario

| Perfil | Responsabilidad principal | Capacidades destacadas |
|---|---|---|
| **Agente** | Atender conversaciones asignadas | Inbox omnicanal, softphone web, marcador (según permiso), respuestas rápidas, notas internas, transferencia, resolución con disposición |
| **Coordinador** | Supervisar el alcance de su equipo | Vista de colas/conversaciones acotada a sus equipos, apoyo operativo en asignación y monitoreo de equipo |
| **Supervisor** | Monitorear la operación y forzar acciones | Live board, monitoreo de agentes, asignación forzada, vista de colas en vivo, evaluaciones de calidad |
| **Administrador** | Configurar la plataforma | Canales, telefonía, colas, skills, equipos, roles, SLA, disposiciones, horarios, tags, integraciones, parámetros generales |
| **Admin de plataforma** | Gestionar el despliegue multi-tenant | Alta de tenants, dominios y administradores de plataforma (`/platform`) |

El acceso a cada módulo está controlado por permisos (`inbox`, `dashboard`, `supervisor`, `quality`, `reports`, `contacts`, `settings`) y se refleja en el menú lateral. El rol `admin` del tenant tiene acceso completo a los módulos del tenant.

Estados de presencia del agente: `ONLINE`, `BUSY`, `AWAY`, `ON_BREAK`, `FOLLOW_UP` (solo seguimiento), `OFFLINE`.

---

## 3. Mapa de módulos (navegación)

### Operación

| Módulo | Ruta | Función |
|---|---|---|
| Inbox | `/` | Bandeja omnicanal del agente |
| Dashboard | `/dashboard` | KPI operativos en tiempo casi real |
| Colas en vivo | `/queues-live` | Tablero por cola (espera / activas) |
| Supervisor | `/supervisor` | Live board, agentes y asignación forzada |
| Contactos | `/contacts` | CRM operativo |
| Calidad | `/quality` | Evaluaciones QA y grabaciones |
| Reportes | `/reports` | Analítica y exportación CSV |
| Marcador | `/dialer` | Campañas salientes y sesión de marcación |
| Mi perfil | `/profile` | Datos propios, estado y cambio de contraseña |

### Configuración

| Módulo | Ruta | Función |
|---|---|---|
| Colas | `/settings/queues` | Routing, skills, SLA, horarios, overflow |
| Canales | `/settings/channels` | WhatsApp, Email, Webchat, Teams |
| Telefonía | `/settings/telephony` | PBX, softphone WSS y canal VOICE (ARI) |
| Equipos | `/settings/teams` | Equipos, miembros y coordinadores |
| Skills | `/settings/skills` | Catálogo y proficiency por agente |
| Roles | `/settings/roles` | Matrices de permisos |
| Usuarios | `/settings/users` | Altas, roles y concurrencia |
| Integraciones | `/settings/integrations` | Apps embebidas, bindings y escalamiento |
| General | `/settings/general` | Organización, disposiciones, SLA, respuestas rápidas, horarios, tags |

---

## 4. Capacidades funcionales principales

### 4.1 Bandeja omnicanal (Inbox)

Pantalla central del agente: `frontend/src/pages/InboxPage.tsx` con componentes `ConversationList`, `ChatArea`, `EmailThreadView`, `ContextPanel`.

- Vista unificada de conversaciones de **WhatsApp, Email, Teams, Voice y Webchat**.
- Tabs operativos:
  - **Mis conv.**: conversaciones con asignación activa del usuario.
  - **En cola**: conversaciones en estado `WAITING` (el coordinador ve las de sus equipos).
  - **Todas**: disponible para supervisor/admin (y alcance de equipo para coordinador).
- Filtros por canal y búsqueda.
- Diferenciación de UX por canal:
  - Estilo **chat** para mensajería instantánea y eventos de voz.
  - Estilo **hilo de correo** (`EmailThreadView`) con asunto, citas, CC/BCC y plantillas en la composición.
- Panel de contexto lateral con datos del contacto, escalamientos y apps integradas embebidas.
- Actualización en tiempo real vía Socket.IO (`message:new`, `conversation:assigned`, notificaciones) e invalidación de la lista REST; no depende de polling periódico del inbox.
- Softphone, búsqueda global y campana de notificaciones en la cabecera operativa.

### 4.2 Ciclo de vida de una conversación

Estados soportados (enum `ConversationStatus`):

`WAITING` → `ASSIGNED` → `ACTIVE` → `ON_HOLD` → `WRAP_UP` → `RESOLVED` | `ABANDONED` | `TRANSFERRED`

Acciones operativas disponibles desde la UI:

- **Aceptar** / **Rechazar** asignación.
- **Pausar** (`hold`) y **Reanudar** (`resume`).
- **Transferir** a otro agente o cola con razón y traza histórica (`Transfer`).
- **Resolver** seleccionando una **disposición** (`Disposition`) y notas de cierre.
- Indicadores de **SLA** (primer respuesta, resolución, breach).
- Opción de **CSAT** al cierre (registro operativo; el envío de encuesta por canal depende de la configuración del canal).

### 4.3 Gestión de contactos (CRM operativo)

Pantalla `ContactsPage` con drawer `ContactDetailDrawer`:

- CRUD de contactos (nombre, email, teléfono, WhatsApp, Teams ID, metadata libre).
- **Importación / exportación CSV** masiva.
- **Merge** de contactos duplicados.
- **Timeline** histórico de conversaciones por contacto.
- **Notas internas** (`ContactNote`) y **etiquetado** (`Tag`/`ContactTag`) para segmentación.
- Catálogo de tags administrable en **Configuración → General → Tags**.

### 4.4 Enrutamiento y asignación

Motor `RoutingEngine` con cinco estrategias seleccionables por cola:

- `ROUND_ROBIN`: rota por agentes disponibles según última asignación.
- `LEAST_BUSY`: prioriza al agente con menor carga activa.
- `SKILL_BASED`: prioriza por mayor coincidencia de skills.
- `PRIORITY_BASED`: usa puntaje de prioridad.
- `LONGEST_IDLE`: prioriza al agente que más tiempo lleva sin atender.

Operativamente:

- **Asignación automática** al ingresar conversación a la cola.
- **Asignación manual** desde supervisor / colas en vivo (`force-assign`) o desde el agente.
- **Transferencia** a usuario o cola, con razón y trazabilidad.
- **Vista en vivo de colas** (`QueuesLivePage`) para priorizar (actualización periódica).
- **Skills** ponderados por proficiency (1–10) y skills mínimos/obligatorios por cola.
- **Overflow**: si se supera `max_wait_seconds`, la conversación puede moverse a una cola de overflow (con mensaje opcional).
- **Horario de atención** por cola: fuera de horario puede enviarse mensaje automático (`out_of_hours_message`) y la conversación permanece encolada según política.

### 4.5 Supervisión y calidad

- **Live Board** (`SupervisorPage`): conversaciones en espera, agentes online, ocupación por cola; alcance por equipo para coordinadores.
- **Monitoreo de agente** (`SupervisorMonitorDialog`).
- **Evaluaciones de calidad** (`QualityPage`) con rúbrica fija:
  - Saludo, Empatía, Resolución, Cierre + comentario.
  - Score consolidado por evaluación.
- Tabs: **Evaluaciones**, **Pendientes**, **Por agente**, **Grabaciones** (revisión de grabaciones de voz).
- **Pendientes de QA** e historial de evaluaciones por agente/canal.

### 4.6 Reportería y dashboard

- **Dashboard** (`DashboardPage`) con KPI operativos: conversaciones activas, en espera, agentes online, SLA, CSAT, AHT, abandono/transferencia, volumen 24 h y desglose por canal/cola/agente.
- **Reports** (`ReportsPage`):
  - Volumen por canal y franja horaria.
  - Productividad por agente.
  - Cumplimiento SLA / colas.
  - CSAT.
  - **Embudo de conversión** (disposiciones marcadas como conversión).
  - Resumen ejecutivo.
  - Exportación CSV.

### 4.7 Marcador saliente (campañas)

Módulo `DialerCampaignsPage` (`/dialer`):

- Creación y gestión de **campañas** con modos `PREVIEW`, `PROGRESSIVE` y `PREDICTIVE`.
- Estados de campaña: `DRAFT`, `ACTIVE`, `PAUSED`, `COMPLETED`, `ARCHIVED`.
- Carga de contactos (selección CRM e importación CSV), estadísticas y sesión de agente.
- El agente con permiso de inbox puede unirse a una campaña activa y marcar (especialmente en modo preview).
- La administración de campañas requiere permiso de configuración o el alcance definido en roles.

### 4.8 Telefonía integrada (Softphone web)

Widget embebido en la cabecera operativa: `SoftphoneWidget` + `useSipPhone`.

- Registro **SIP sobre WebRTC (WSS)** contra Asterisk.
- Llamadas entrantes/salientes con control de **mute, hold, hangup**.
- **Auto-apertura** del widget ante llamada entrante en `ringing`.
- Llamadas internas entre extensiones de agentes.
- Historial de llamadas persistido en `voice_calls`, **independiente de las conversaciones omnicanal**.
- Configuración personal por usuario en el widget softphone (extensión/contraseña).
- Configuración **organizacional del PBX** en **Configuración → Telefonía**: un `pbx_host` deriva `sip_server` (WSS) y `ariBaseUrl` (ARI del canal VOICE). El canal de voz se administra desde Telefonía, no se crea como canal genérico en Canales.

Detalle de parámetros SIP/WebRTC y extensiones de laboratorio: ver [05-telefonia-asterisk-softphone.md](./05-telefonia-asterisk-softphone.md).

### 4.9 Canales

Tipos soportados en el modelo: `WHATSAPP`, `EMAIL`, `TEAMS`, `VOICE`, `WEBCHAT`.

| Canal | Dónde se configura | Notas operativas |
|---|---|---|
| WhatsApp | Configuración → Canales | Proveedores configurables (p. ej. UltraMsg, Twilio, 360dialog); webhook por tenant/canal |
| Email | Configuración → Canales | Ingreso por webhook o poller IMAP; salida SMTP; UX de hilo en inbox |
| Webchat | Configuración → Canales | Canal de chat web para ingreso de conversaciones |
| Teams | Configuración → Canales | Alta y filtrado en UI; la integración operativa completa depende del conector disponible |
| Voice | Configuración → Telefonía | Softphone + ARI/Asterisk |

Cada canal (excepto Voice en la alta genérica) admite prueba de configuración desde la UI de Canales antes de activarlo.

### 4.10 Integraciones externas y apps en inbox

- **Escalamiento entrante**: sistemas externos crean/actualizan conversación vía `POST /integrations/escalate` con `x-api-key`.
- **Apps integradas embebidas** en el panel de contexto del inbox (`integration_apps` + `integration_app_bindings`):
  - Modos: `SNAPSHOT` (datos de solo lectura), `EMBED` (iframe con SSO), `ACTIONS` (acciones invocables).
  - Auth: `NONE`, `API_KEY`, `OAUTH2`, `JWT` (token corto firmado HS256 con claims de actor/conversación/contacto).
  - Inyección automática de credenciales en `embed_url` según `auth_type`.
  - Bindings por scope: `GLOBAL`, `CHANNEL`, `QUEUE`, `ROLE`.

### 4.11 Configuración (Settings)

Páginas administrativas (`frontend/src/pages/settings/`):

- **Channels**: alta de canales `WHATSAPP`, `EMAIL`, `WEBCHAT`, `TEAMS` con prueba de configuración.
- **Telefonía**: host PBX unificado, softphone organizacional (WSS/SIP) y credenciales ARI del canal VOICE.
- **Queues**: estrategia de routing, prioridad, overflow, vínculo a horario de atención, mensaje fuera de horario, SLA y skills requeridos.
- **Skills** y **Teams**: catálogo de skills (con proficiency 1–10 por agente) y equipos operativos (miembro / coordinador).
- **Users**: alta de usuarios, roles (`agent`, `coordinator`, `supervisor`, `admin`) y `max_concurrent`.
- **Roles**: definición de permisos por clave funcional.
- **General**:
  - Organización (nombre, idioma, timezone).
  - **Disposiciones**: categoría, nota obligatoria opcional y flag de **conversión** (para embudo).
  - **SLA policies**: primera respuesta, resolución y umbral de warning.
  - **Respuestas rápidas**: shortcode, canal y categoría.
  - **Business hours**: zona horaria, calendario semanal y feriados (asignables a colas).
  - **Tags**: catálogo para contactos.
- **Integration apps / Bindings**: catálogo de apps externas y reglas de visibilidad.
- Plantillas de email disponibles en la composición del hilo de correo del inbox.

---

## 5. Flujos funcionales críticos

### Flujo A — Escalamiento externo a atención humana

1. Sistema externo (bot, IVR, CRM u otra plataforma) invoca `POST /integrations/escalate` con clave de integración.
2. Backend resuelve o crea el `Contact` (por `external_id + source_system`, email o teléfono).
3. Crea o actualiza `Conversation` con `source`, `source_ref_id`, `escalation_reason` y `escalation_context`.
4. La conversación entra a la cola correspondiente (estado `WAITING`).
5. Si aplica horario de atención / overflow, se ejecutan las políticas de cola.
6. `RoutingEngine` ejecuta la estrategia configurada y emite `conversation:assigned` vía Socket.IO.
7. El agente la recibe en su Inbox, la acepta y la atiende.
8. Al cerrar, registra disposición, notas y opcionalmente CSAT.

### Flujo B — Login y operación diaria del agente

1. Login en `LoginPage` (JWT + refresh token) desde la URL del tenant.
2. `AuthBootstrap` carga perfil, roles y permisos.
3. UI habilita módulos según RBAC.
4. Se establece conexión Socket.IO autenticada con `token`.
5. Agente cambia su estado (`ONLINE`, `BUSY`, `AWAY`, `ON_BREAK`, `FOLLOW_UP`, `OFFLINE`).
6. Recibe asignaciones y mensajes en tiempo real, atiende conversaciones, registra notas, transfiere o resuelve.
7. Puede unirse a campañas del **Marcador** si tiene permiso y hay campañas activas.

### Flujo C — Llamada SIP/WebRTC

1. Agente registra el softphone (extensión/credenciales del usuario u organización).
2. WSS contra Asterisk (`wss://<host>:8089/ws` u host configurado en Telefonía).
3. Realiza o recibe llamadas con mute/hold/hangup.
4. Audio bidireccional vía RTP/WebRTC (DTLS-SRTP, ICE).
5. El frontend reporta inicio/fin/estado a la API de voz → `voice_calls` / grabaciones visibles en Calidad.

### Flujo D — Atención de email

1. Email entra por **webhook** o **poller IMAP** (`emailPoller.service.ts`, `emailInbound.service.ts`).
2. Se crea o reutiliza conversación por `email_message_id` / `email_in_reply_to`.
3. Vista como **hilo** con asunto, CC/BCC y mensaje raíz.
4. Respuesta con editor + plantillas.
5. Envío saliente vía SMTP, persistencia del mensaje y tracking operativo.

### Flujo E — Atención de WhatsApp

1. Mensaje entra por `POST /webhooks/:tenantKey/whatsapp/:channelId` (el tenant va en la URL del webhook).
2. `inboundService` resuelve contacto por teléfono / `phone_wa`.
3. Crea o continúa conversación abierta del canal WhatsApp.
4. Notifica al agente asignado vía Socket.IO (`message:new`) y refresca la bandeja.
5. Respuestas salen por adapter del canal (`backend/src/channels/whatsapp/`).

### Flujo F — Resolución y QA

1. Agente cierra conversación con `Resolve` (disposición + notas + CSAT opcional).
2. Conversación pasa a `WRAP_UP` y luego `RESOLVED`.
3. Aparece en cola de QA (`/quality/pending`) según reglas operativas.
4. Supervisor evalúa con rúbrica (saludo, empatía, resolución, cierre) o revisa grabaciones.
5. Se persiste `QualityEvaluation` y se refleja en reportería / embudo si la disposición es de conversión.

### Flujo G — Campaña saliente (Marcador)

1. Administrador crea campaña, define modo (preview / progresivo / predictivo) y carga contactos.
2. Activa la campaña.
3. Agente abre **Marcador**, se une a la campaña y obtiene el siguiente contacto.
4. En preview, marca desde la UI / softphone; en modos progresivo/predictivo el motor encola marcaciones según la estrategia.
5. El resultado alimenta estadísticas de campaña y puede asociarse a la operación de voz/contacto.

---

## 6. Reglas funcionales relevantes

- **RBAC** estricto por permiso a nivel de endpoint y de UI.
- **Coordinadores** operan con alcance de equipo (colas, tablero y conversaciones de sus equipos).
- **Eventos de voz** pueden existir sin `conversation_id` → historial independiente en `voice_calls`.
- **Integraciones externas** usan `INTEGRATION_API_KEY` dedicada; nunca tokens de usuario.
- **Configuración de canal** validable y testeable desde `Settings → Channels` antes de activarla (Voice vía Telefonía).
- **SLA breach** se calcula automáticamente sobre `sla_first_response_at` y `sla_resolution_at`.
- **Mensajes internos** (`is_internal=true`) no se envían al contacto, solo se ven entre agentes.
- **Refresh token** rotativo con hash en `refresh_tokens`; logout invalida la sesión activa.
- Las **conversaciones cerradas** se reabren automáticamente si el contacto vuelve a escribir antes de un umbral, según canal.
- **Horario de atención** y **overflow** se evalúan al encolar / esperar en cola.
- El **inbox** se actualiza por eventos realtime + refetch; las pantallas de supervisor/colas en vivo también usan refresco periódico.

---

## 7. KPIs funcionales soportados

- Conversaciones en espera y activas por canal y cola.
- Tiempo promedio de espera y de manejo (AHT).
- Cumplimiento SLA (% dentro y fuera de objetivo).
- Productividad por agente (atendidas, resueltas, AHT).
- Tendencia de volumen por franja horaria.
- Score de calidad por agente y canal.
- CSAT por conversación, agente y canal.
- Embudo / conversiones por disposición.
- Llamadas de voz por dirección (entrante/saliente) y duración.
- Estadísticas de campañas del marcador.

---

## 8. Glosario funcional

| Término | Significado |
|---|---|
| **Conversación** | Hilo persistente entre un contacto y la operación, con estado y canal asociado |
| **Cola** | Punto de entrada virtual con estrategia de routing, horario, overflow y SLA propios |
| **Skill** | Capacidad del agente con nivel 1–10, usado por `SKILL_BASED` |
| **Disposition** | Motivo categorizado de cierre de conversación; puede marcarse como conversión |
| **Wrap-up** | Tiempo post-llamada/conversación para registrar disposición y notas |
| **SLA breach** | Incumplimiento del tiempo objetivo de primera respuesta o resolución |
| **Embed app** | Aplicación externa renderizada en iframe en el contexto del agente |
| **Escalamiento** | Entrega de un caso desde un sistema externo (bot, IVR, CRM, etc.) a un agente humano |
| **Live board** | Tablero del supervisor con estado en vivo de colas y agentes |
| **Marcador** | Módulo de campañas salientes (preview / progresivo / predictivo) |
| **Coordinador** | Perfil con supervisión acotada a los equipos donde está nombrado |

---

## 9. Alcance funcional fuera de la versión actual o parcial

Aspectos no cubiertos hoy, incompletos o susceptibles a futuras versiones:

- WFM (planificación de turnos) automatizado.
- Encuestas CSAT post-contacto enviadas automáticamente por todos los canales.
- Speech analytics y transcripción en vivo (existen campos `transcription` pero no pipeline activo).
- Forecasting basado en histórico.
- Conector Microsoft Teams con paridad operativa completa respecto a WhatsApp/Email/Voice.
- Administración avanzada de plantillas de email como pantalla dedicada en Configuración (el uso en composición de email sí está disponible).
