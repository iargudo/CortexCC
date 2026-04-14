# Cortex Contact Center

> Sistema de Contact Center Omnicanal con soporte para múltiples canales de comunicación, enrutamiento inteligente, supervisión en tiempo real, telefonía SIP/WebRTC y calidad de servicio.

---

## Tabla de Contenidos

1. [Arquitectura General](#arquitectura-general)
2. [Modelo de Datos](#modelo-de-datos)
3. [Autenticación y Autorización](#autenticación-y-autorización)
4. [Módulos Funcionales](#módulos-funcionales)
5. [API Requerida por el Backend](#api-requerida-por-el-backend)
6. [Telefonía SIP/WebRTC](#telefonía-sipwebrtc)
7. [Notificaciones en Tiempo Real](#notificaciones-en-tiempo-real)
8. [Integraciones Externas](#integraciones-externas)

---

## 1. Arquitectura General

### Stack Frontend
- **Framework**: React 18 + TypeScript 5
- **Bundler**: Vite 5
- **Estilos**: Tailwind CSS v3 + shadcn/ui
- **Estado global**: Zustand (auth, SIP)
- **Fetch/cache**: TanStack React Query v5
- **Ruteo**: React Router DOM v6
- **Gráficos**: Recharts
- **Telefonía**: SIP.js 0.21.2 (WebRTC)
- **Notificaciones**: Sonner (toasts) + Web Notifications API + Web Audio API

### Stack Backend (recomendado)
- **Runtime**: Node.js 20+ (TypeScript) o Python 3.11+
- **Base de datos**: PostgreSQL 15+ (persistencia principal)
- **Cache / Colas en tiempo real**: Redis 7+ (Sorted Sets, Pub/Sub, Streams)
- **Job Queue**: BullMQ sobre Redis (workers de routing, reintentos, scheduling)
- **WebSocket**: Socket.IO o ws nativo (notificaciones en tiempo real)
- **PBX / Telefonía**: Asterisk 20+ o FreeSWITCH (SIP trunk)
- **API Gateway**: Express / Fastify / NestJS
- **Autenticación**: JWT + refresh tokens (o Supabase Auth)

### Infraestructura de Colas con Redis + BullMQ

El sistema de colas es el corazón del routing en Cortex Contact Center. A continuación se detalla la arquitectura completa:

#### ¿Por qué Redis?
- **Latencia sub-milisegundo** para operaciones de cola (ZADD, ZPOPMIN)
- **Sorted Sets** permiten ordenar por prioridad + timestamp de llegada
- **Pub/Sub** para notificar en tiempo real a los agentes conectados
- **TTL nativo** para expiración automática de SLA
- **Streams** para event sourcing de cambios de estado

#### Estructura de Claves Redis

```
# Cola de espera por queue (Sorted Set)
# Score = priority * 1000000 + timestamp_seconds
queue:{queue_id}:waiting          → ZSET { conversation_id: score }

# Conversaciones activas por agente (Set)
agent:{agent_id}:active           → SET { conversation_id, ... }

# Estado del agente (Hash)
agent:{agent_id}:status           → HASH { status, available_slots, last_activity, skills[] }

# Métricas en tiempo real por cola (Hash, TTL 60s, se renueva cada tick)
queue:{queue_id}:metrics          → HASH { waiting, active, avg_wait, sla_percent }

# Bloqueo de asignación (para evitar race conditions)
lock:assign:{conversation_id}    → STRING (con TTL 5s, usando SET NX EX)

# Canal Pub/Sub para notificaciones
channel:notifications:{agent_id}  → PUB/SUB
channel:queue:{queue_id}:updates  → PUB/SUB
channel:supervisor:live            → PUB/SUB
```

#### BullMQ — Definición de Queues y Workers

```typescript
// ==========================================
// Queue: conversation-routing
// Procesa nuevas conversaciones y las asigna
// ==========================================
interface RoutingJob {
  conversation_id: string;
  queue_id: string;
  channel: ChannelType;
  priority: number;
  skills_required: string[];
  source: "direct" | "collect_escalation" | "agenthub_escalation" | "voice_escalation";
  max_wait_seconds: number;        // SLA máximo de espera
  retry_count?: number;
}

// Worker: conversation-routing
// 1. Lee la estrategia de routing de la cola (round_robin, skill_based, least_busy, manual)
// 2. Busca agentes disponibles en Redis (agent:*:status)
// 3. Filtra por skills si routing = skill_based
// 4. Asigna al agente seleccionado (mueve de queue:waiting a agent:active)
// 5. Publica evento via Pub/Sub al agente y supervisor
// 6. Si no hay agentes → deja en cola y programa reintento en 10s

// ==========================================
// Queue: sla-monitor
// Vigila tiempos de espera y dispara alertas
// ==========================================
interface SlaMonitorJob {
  conversation_id: string;
  queue_id: string;
  entered_at: number;             // timestamp de entrada a la cola
  max_wait_seconds: number;
  warning_threshold: number;      // % del SLA para warning (ej: 70%)
  critical_threshold: number;     // % del SLA para critical (ej: 90%)
}

// Worker: sla-monitor
// 1. Calcula tiempo transcurrido vs max_wait
// 2. Si > warning_threshold → publica SLA_WARNING al supervisor
// 3. Si > critical_threshold → publica SLA_BREACH, escala prioridad
// 4. Si > max_wait_seconds → ejecuta overflow (transferir a otra cola o voicemail)

// ==========================================
// Queue: post-conversation
// Tareas post-resolución
// ==========================================
interface PostConversationJob {
  conversation_id: string;
  agent_id: string;
  resolution: string;
  tags: string[];
  satisfaction_score?: number;
}

// Worker: post-conversation
// 1. Persiste conversación completa en PostgreSQL
// 2. Actualiza métricas del agente (conversations_handled, avg_handle_time)
// 3. Actualiza métricas de la cola (sla_percent, avg_wait)
// 4. Si tiene QA automático → encola evaluación
// 5. Libera slot del agente en Redis
```

#### Flujo Completo de una Conversación

```
1. ENTRADA
   ├─ WhatsApp webhook / Email IMAP / Chat widget / Llamada SIP
   └─ API normaliza → POST /api/conversations

2. ENCOLAMIENTO
   ├─ Se determina cola destino (por canal, skills, horario)
   ├─ ZADD queue:{id}:waiting {score} {conv_id}
   ├─ Se encola job en BullMQ "conversation-routing"
   └─ Se encola job en BullMQ "sla-monitor" (delayed, check cada 10s)

3. ROUTING (BullMQ Worker)
   ├─ Lee estrategia de la cola
   ├─ round_robin → siguiente agente en rotación
   ├─ skill_based → filtra por skills match, selecciona menos ocupado
   ├─ least_busy → agente con menos conversaciones activas
   ├─ manual → solo asignación por supervisor (skip auto-assign)
   ├─ SET NX lock:assign:{conv_id} (evitar doble asignación)
   ├─ ZREM queue:{id}:waiting {conv_id}
   ├─ SADD agent:{agent_id}:active {conv_id}
   └─ PUBLISH channel:notifications:{agent_id} → NEW_ASSIGNMENT

4. EN ATENCIÓN
   ├─ Agente responde via WebSocket
   ├─ Mensajes se persisten en PostgreSQL en tiempo real
   ├─ Supervisor puede: LISTEN / WHISPER / BARGE (para voz)
   └─ Transferencia → re-encola en nueva cola o agente directo

5. RESOLUCIÓN
   ├─ Agente marca como resuelto
   ├─ Se encola job en BullMQ "post-conversation"
   ├─ SREM agent:{agent_id}:active {conv_id}
   ├─ Actualiza HASH agent:{agent_id}:status (available_slots++)
   └─ Si hay conversaciones en espera → trigger nuevo routing
```

#### Configuración Redis recomendada

```yaml
# redis.conf (producción)
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1          # RDB snapshot cada 15min si ≥1 cambio
appendonly yes       # AOF para durabilidad
appendfsync everysec
tcp-keepalive 60

# Sentinel o Redis Cluster para alta disponibilidad
# Mínimo 3 nodos en producción
```

#### Variables de Entorno Backend

```env
# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=secret
REDIS_DB=0

# PostgreSQL
DATABASE_URL=postgresql://user:pass@localhost:5432/cortex_cc

# BullMQ
BULLMQ_CONCURRENCY=10          # Workers concurrentes por queue
BULLMQ_RETRY_ATTEMPTS=3
BULLMQ_RETRY_DELAY=5000        # ms entre reintentos

# SLA defaults
DEFAULT_SLA_WARNING_PERCENT=70
DEFAULT_SLA_CRITICAL_PERCENT=90
DEFAULT_MAX_WAIT_SECONDS=120

# WebSocket
WS_PORT=3001
WS_PING_INTERVAL=30000

# SIP
SIP_SERVER=pbx.cortexcontactcenter.com
SIP_WS_PORT=8089
```

### Estructura de Rutas

| Ruta | Página | Rol mínimo | Descripción |
|------|--------|------------|-------------|
| `/login` | LoginPage | público | Autenticación de usuarios |
| `/` | InboxPage | agent | Bandeja de entrada omnicanal |
| `/dashboard` | DashboardPage | agent | Dashboard de métricas en tiempo real |
| `/queues-live` | QueuesLivePage | supervisor | Monitoreo de colas en tiempo real |
| `/supervisor` | SupervisorPage | supervisor | Panel de supervisión de agentes |
| `/contacts` | ContactsPage | agent | Gestión de contactos/CRM |
| `/quality` | QualityPage | supervisor | Evaluación de calidad (QA) |
| `/reports` | ReportsPage | supervisor | Reportes y analíticas avanzadas |
| `/profile` | ProfilePage | agent | Perfil del agente |
| `/settings/queues` | SettingsQueuesPage | admin | Configuración de colas |
| `/settings/channels` | SettingsChannelsPage | admin | Configuración de canales |
| `/settings/teams` | SettingsTeamsPage | admin | Gestión de equipos |
| `/settings/skills` | SettingsSkillsPage | admin | Gestión de habilidades |
| `/settings/roles` | RolesPage | admin | Gestión de roles y permisos |
| `/settings/integrations` | IntegrationsPage | admin | Integraciones externas |
| `/settings/general` | SettingsGeneralPage | admin | Configuración general |

---

## 2. Modelo de Datos

### 2.1 Contact (Contacto)

Representa a un cliente/persona que interactúa con el contact center.

```typescript
interface Contact {
  id: string;                    // UUID
  name: string;                  // Nombre completo
  email?: string;                // Email de contacto
  phone?: string;                // Teléfono principal
  phone_wa?: string;             // Número de WhatsApp (puede diferir del phone)
  teams_id?: string;             // ID en Microsoft Teams
  source_system?: string;        // Sistema de origen: "collect" | "agenthub" | "voice" | "direct"
  tags: string[];                // Etiquetas: ["VIP", "Mora", "Enterprise", etc.]
  metadata?: Record<string, any>; // Datos adicionales flexibles
}
```

**Funcionalidades del frontend sobre Contact:**
- Listado con búsqueda por nombre/email/teléfono
- Creación manual de contactos (formulario con nombre, email, teléfono, tags)
- Importación masiva (CSV) — UI lista, backend debe procesar archivo
- Exportación de contactos — UI lista, backend debe generar archivo
- Merge/deduplicación de contactos (seleccionar 2 contactos → fusionar)
- Drawer de detalle expandido con:
  - Timeline de interacciones (historial de conversaciones pasadas)
  - Notas internas editables
  - Tags editables (agregar/eliminar)
  - Datos del sistema de origen

### 2.2 Conversation (Conversación)

Representa una interacción entre un contacto y el contact center.

```typescript
interface Conversation {
  id: string;                        // UUID
  channel: ChannelType;              // Canal de comunicación
  contact: Contact;                  // Contacto asociado (FK → Contact)
  status: ConversationStatus;        // Estado actual
  priority: number;                  // 1 (máx urgencia) a 10 (mín)
  subject?: string;                  // Asunto (solo para EMAIL)
  source: string;                    // Origen: "direct" | "collect_escalation" | "agenthub_escalation" | "voice_escalation"
  escalation_reason?: string;        // Razón de escalamiento (si aplica)
  escalation_context?: {             // Contexto del sistema que escaló
    creditos?: Array<{               // Para escalaciones de cobranza
      monto_vencido: number;
      dias_mora: number;
      producto: string;
    }>;
    campana?: {                      // Campaña de origen
      nombre: string;
    };
  };
  queue_name: string;                // Cola asignada (FK → Queue.name)
  assigned_agent?: string;           // Agente asignado (FK → Agent.name)
  last_message?: string;             // Preview del último mensaje
  last_message_at: string;           // ISO timestamp del último mensaje
  wait_time_seconds?: number;        // Tiempo en cola (solo estado WAITING)
  sla_percent?: number;              // % del SLA consumido (0-100)
  unread_count: number;              // Mensajes no leídos
  messages: Message[];               // Mensajes del hilo
}
```

**Tipos enumerados:**

```typescript
type ChannelType = "WHATSAPP" | "EMAIL" | "TEAMS" | "VOICE" | "WEBCHAT";

type ConversationStatus = 
  | "WAITING"      // En cola, sin agente asignado
  | "ASSIGNED"     // Asignada a agente, pendiente de aceptar
  | "ACTIVE"       // En atención activa
  | "ON_HOLD"      // En espera (pausada por agente)
  | "WRAP_UP"      // Post-atención (agente documentando)
  | "RESOLVED"     // Resuelta
  | "ABANDONED"    // Abandonada por el contacto
  | "TRANSFERRED"; // Transferida a otro agente/cola
```

**Funcionalidades del frontend sobre Conversation:**
- **Inbox con 3 tabs**: "Mías" (asignadas al agente), "En cola" (WAITING), "Todas"
- **Filtros por canal**: WhatsApp, Email, Teams, Voz, WebChat
- **Vista diferenciada por canal**:
  - **Chat (WhatsApp/Teams/WebChat/Voice)**: Burbujas de mensaje estilo chat
  - **Email**: Vista de hilo de correo con headers (De/Para/Fecha), adjuntos, acciones (Responder/Responder a todos/Reenviar)
- **Acciones sobre conversación**:
  - Aceptar/Rechazar (cuando status = ASSIGNED)
  - Poner en espera (ON_HOLD) / Retomar
  - Transferir (a agente/supervisor/IA/automático)
  - Resolver (con disposición y nota)
- **Indicador de typing** (simulado en frontend, el backend debe enviar vía WebSocket)
- **Notas internas** (mensajes con `is_internal: true`, visibles solo para agentes)
- **Respuestas rápidas** (slash commands: escribir `/` muestra menú)

### 2.3 Message (Mensaje)

```typescript
interface Message {
  id: string;                    // UUID
  conversation_id: string;       // FK → Conversation
  sender_type: SenderType;       // Quién envía
  sender_name?: string;          // Nombre visible del remitente
  content: string;               // Contenido del mensaje (texto o HTML)
  content_type: string;          // "TEXT" | "HTML" | "SYSTEM_EVENT" | "IMAGE" | "AUDIO" | "DOCUMENT"
  is_internal: boolean;          // true = nota interna (solo visible para agentes)
  delivery_status: string;       // "sent" | "delivered" | "read" | "failed"
  created_at: string;            // ISO timestamp
  attachments?: Array<{          // Archivos adjuntos
    filename: string;
    mime_type: string;
    size_bytes: number;
    url?: string;                // URL de descarga (debe proveer el backend)
  }>;
}

type SenderType = "CONTACT" | "AGENT" | "SYSTEM" | "BOT";
```

**Comportamiento del frontend:**
- Mensajes `SYSTEM` se muestran como eventos centrados (pill gris)
- Mensajes `BOT` se muestran con icono de bot y badge
- Mensajes `AGENT` con `is_internal: true` se muestran con fondo amarillo y badge "Nota interna"
- Mensajes de `CONTACT` se alinean a la izquierda, de `AGENT` a la derecha
- `delivery_status` se muestra como checks (✓ delivered, ✓✓ read)
- Los adjuntos se muestran como chips con icono según mime_type y tamaño

### 2.4 Agent (Agente)

```typescript
interface Agent {
  id: string;
  name: string;
  email: string;
  avatar?: string;               // URL de avatar
  status: AgentStatus;
  max_concurrent: number;        // Máximo de conversaciones simultáneas
  active_conversations: number;  // Conversaciones activas actuales
  skills: Array<{
    name: string;                // Nombre de la habilidad
    proficiency: number;         // Nivel de competencia (1-10)
  }>;
  teams: string[];               // Equipos a los que pertenece
  aht_seconds?: number;          // Average Handle Time en segundos
  csat_avg?: number;             // CSAT promedio (1-5)
  resolved_today: number;        // Conversaciones resueltas hoy
  status_since: string;          // ISO timestamp desde cuándo está en el status actual
}

type AgentStatus = "ONLINE" | "AWAY" | "BUSY" | "OFFLINE" | "ON_BREAK";
```

**Funcionalidades del frontend sobre Agent:**
- Card de agente con status badge de colores
- Indicador de carga visual (Progress bar: active/max)
- Cambio de status propio desde el header (dropdown)
- Vista de supervisor: monitoreo de todos los agentes con KPIs
- Perfil editable: nombre, email, max_concurrent, status

### 2.5 Queue (Cola)

```typescript
interface Queue {
  id: string;
  name: string;
  description?: string;
  team?: string;                   // Equipo asociado
  routing_strategy: RoutingStrategy;
  waiting: number;                 // Conversaciones en espera
  active: number;                  // Conversaciones activas
  agents_online: number;           // Agentes conectados
  sla_percent: number;             // % de cumplimiento de SLA
  avg_wait_seconds: number;        // Tiempo promedio de espera
  max_wait_seconds: number;        // Tiempo máximo de espera configurado
  is_active: boolean;              // Cola activa/inactiva
}

type RoutingStrategy = 
  | "ROUND_ROBIN"     // Distribución equitativa secuencial
  | "LEAST_BUSY"      // Al agente con menor carga actual
  | "SKILL_BASED"     // Según habilidades requeridas
  | "PRIORITY_BASED"  // Prioriza agentes con mejor rendimiento
  | "LONGEST_IDLE";   // Al agente que lleva más tiempo libre
```

**Funcionalidades del frontend sobre Queue:**
- **Settings**: CRUD de colas con configuración de estrategia, equipo, SLA, activación
- **Queues Live** (supervisor): Vista en tiempo real con:
  - Cards por cola: waiting/active, SLA bar, agentes online
  - Lista de conversaciones en espera por cola
  - Botón de asignación rápida desde la cola
  - Ordenamiento por prioridad y tiempo en espera

### 2.6 Channel (Canal)

```typescript
interface Channel {
  id: string;
  name: string;
  type: ChannelType;              // "WHATSAPP" | "EMAIL" | "TEAMS" | "VOICE" | "WEBCHAT"
  status: "active" | "inactive" | "error";
  conversations_today: number;
}
```

**Configuración por canal en Settings:**
- **WhatsApp**: Número de teléfono, API key, webhook URL, templates de mensajes
- **Email**: Servidor SMTP/IMAP, email de soporte, firma
- **Microsoft Teams**: Tenant ID, Client ID, canal vinculado
- **Voz**: Integración SIP (ver sección Telefonía)
- **WebChat**: Widget embebible, color primario, mensaje de bienvenida, código de embebido

### 2.7 Otros Modelos

```typescript
interface Skill {
  id: string;
  name: string;
  category: string;   // "tema" | "idioma" | "técnico"
}

interface Team {
  id: string;
  name: string;
  description?: string;
  member_count: number;
  leader?: string;
}

interface Disposition {
  id: string;
  name: string;
  category: string;       // "resuelto" | "no_resuelto" | "seguimiento" | "spam"
  requires_note: boolean; // Si requiere nota obligatoria al cerrar
  is_active: boolean;
}

interface SlaPolicy {
  id: string;
  name: string;
  first_response_seconds: number;   // Tiempo máximo para primera respuesta
  resolution_seconds: number;       // Tiempo máximo para resolución
  warning_threshold_pct: number;    // % para activar warning (ej: 80)
}

interface QuickReply {
  id: string;
  shortcode: string;      // Ej: "/saludo", "/horarios"
  title: string;
  content: string;         // Contenido con variables: {agente}, {contacto}
  channel?: ChannelType;   // Si es específico de un canal
  category?: string;
}

interface BusinessHours {
  id: string;
  name: string;
  timezone: string;        // Ej: "America/Guayaquil"
  schedule: Record<string, Array<{ start: string; end: string }>>;
  // Ej: { monday: [{ start: "08:00", end: "18:00" }], ... }
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;          // Con variables: "RE: Factura #{{numero_factura}}"
  body: string;             // Con variables: "Estimado/a {{nombre_contacto}}..."
  category: string;         // "general" | "facturación" | "cobranza" | "soporte"
  variables: string[];      // Variables extraídas: ["nombre_contacto", "numero_factura"]
}
```

---

## 3. Autenticación y Autorización

### 3.1 Login

**Flujo actual (mock):**
- Formulario: email + contraseña
- Validación: contraseña ≥ 4 caracteres
- El rol se deduce del email: contiene "admin" → admin, "super" → supervisor, default → agent

**Lo que debe implementar el backend:**
- Autenticación real (JWT o session-based)
- Endpoint: `POST /auth/login` → `{ email, password }` → `{ token, user }`
- Endpoint: `POST /auth/logout`
- Validación de credenciales contra DB
- Refresh tokens

### 3.2 Modelo de Usuario Autenticado

```typescript
interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: "admin" | "supervisor" | "agent";
  status: AgentStatus;
  max_concurrent: number;
}
```

### 3.3 Roles y Permisos

El frontend tiene una página de gestión de roles (`/settings/roles`) con:
- CRUD de roles
- Matriz de permisos por módulo: Inbox, Dashboard, Supervisión, Calidad, Reportes, Contactos, Configuración

**Roles predefinidos:**
| Rol | Inbox | Dashboard | Supervisor | Quality | Reports | Contacts | Settings |
|-----|-------|-----------|------------|---------|---------|----------|----------|
| admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| supervisor | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| agent | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |

---

## 4. Módulos Funcionales

### 4.1 Inbox (Bandeja de Entrada)

**Componentes:** `InboxPage`, `ConversationList`, `ChatArea`, `EmailThreadView`, `ContextPanel`

#### Panel Izquierdo: Lista de Conversaciones
- Tabs: Mías / En Cola / Todas
- Filtro por canal (WhatsApp, Email, etc.)
- Cada item muestra: avatar, nombre, preview del último mensaje, timestamp, badge de canal, indicador de prioridad, contador de no leídos, badge de status, % SLA

#### Panel Central: Área de Chat/Email
- **Para chat (WhatsApp/Teams/WebChat/Voice):**
  - Burbujas de mensajes con alineación (izquierda=contacto, derecha=agente)
  - Indicador de typing (3 dots animados)
  - Slash commands: escribir `/` abre menú de respuestas rápidas filtrable
  - Adjuntos
  - Notas internas (tab "Nota interna" en el compositor)

- **Para email:**
  - Vista de hilo con emails colapsables/expandibles
  - Cada email muestra: avatar, De/Para, fecha/hora, cuerpo completo, adjuntos
  - Acciones por email: Responder / Responder a todos / Reenviar
  - Compositor de email: campos Para, CC, Asunto
  - Barra de herramientas rich text: Bold, Italic, Underline, Strikethrough, List, Align, Link
  - **Selector de plantillas de email**: botón "Plantilla" en toolbar que abre popover con búsqueda y selección de templates, inserta asunto + cuerpo automáticamente

#### Panel Derecho: Panel de Contexto (ContextPanel)
- Sidebar fijo (w-72) con scroll independiente
- **Info del contacto**: Nombre, sistema de origen, teléfono, email, tags
- **Contexto de escalamiento** (si la conversación fue escalada):
  - Origen (Collect, AgentHub, etc.)
  - Razón de escalamiento
  - Datos de créditos (monto vencido, días mora, producto) — para cobranza
  - Campaña de origen
  - Enlace a historial completo → abre `ContactDetailDrawer`
- **Info de conversación**: Canal, cola, fecha creación, tiempo en cola
- **Respuestas rápidas**: Botones con shortcodes disponibles

#### Panel Detalle de Contacto (ContactDetailDrawer)
- Se abre desde el ContextPanel o desde ContactsPage
- Tabs: Info / Timeline / Notas
- **Tab Info**: Datos del contacto, tags editables (agregar/eliminar), sistema de origen, metadata
- **Tab Timeline**: Lista de interacciones pasadas (conversaciones activas + históricas) con canal, asunto, fecha, status
- **Tab Notas**: Notas internas del contacto con timestamp y autor

#### Diálogos del Inbox
- **TransferDialog / AssignDialog**: Derivación de conversaciones (ver sección 4.6)
- **ResolveDialog**: Cierre con disposición (dropdown de dispositions) y nota opcional

### 4.2 Dashboard

**Componentes:** `DashboardPage`

KPIs en tiempo real (cards):
- Agentes en línea / total
- Conversaciones en cola
- Conversaciones activas
- Resueltas hoy
- Tiempo de espera promedio (segundos)
- AHT - Average Handle Time (minutos)
- SLA compliance (%)
- CSAT promedio (/5)

Gráficos:
- **Volumen 24h**: AreaChart con distribución horaria de conversaciones
- **Distribución por canal**: PieChart con % por canal
- **Estado de colas**: Tabla con waiting, active, agents_online, SLA por cola
- **Estado de agentes**: Cards con status, carga, skills por agente

Funcionalidad: Modo pantalla completa (fullscreen toggle)

**Datos requeridos del backend:**
```typescript
interface DashboardStats {
  agents_online: number;
  agents_total: number;
  conversations_waiting: number;
  conversations_active: number;
  conversations_resolved_today: number;
  avg_wait_seconds: number;
  avg_handle_seconds: number;
  sla_compliance: number;         // 0-100
  csat_avg: number;               // 1-5
  abandonment_rate: number;       // %
  transfer_rate: number;          // %
  escalations_from_ai: number;
  volume_24h: Array<{ hour: string; count: number }>;
  channel_breakdown: Array<{
    channel: ChannelType;
    count: number;
    percentage: number;
  }>;
}
```

### 4.3 Reportes y Analíticas

**Componentes:** `ReportsPage`

Tabs:
1. **Volumen**: Gráfico de barras de volumen diario por canal (últimos 7 días), distribución horaria
2. **Productividad**: Tabla de agentes con: conversaciones atendidas, AHT, CSAT, FCR (First Call Resolution), estado actual
3. **SLA**: Tabla de colas con: total atendido, cumplimiento SLA (%), tiempo promedio de espera, barra visual de SLA

Funcionalidad: Botón de exportar (el backend debe generar CSV/Excel)

### 4.4 Supervisión

**Componentes:** `SupervisorPage`, `SupervisorMonitorDialog`

#### Panel de Supervisor
- **KPI cards**: Agentes online, conversaciones activas, en espera, atendidas por IA
- **Cards de agente**: Por cada agente muestra:
  - Status con badge de color
  - Barra de carga (Progress bar: active/max)
  - Skills asignados
  - Botón de acción: "Asignar" para derivar conversación al agente
- **Tabla de conversaciones activas**: Con columnas de contacto, canal, agente, cola, prioridad, SLA, acciones
- **Acciones de supervisor**: Monitor (escuchar), Asignar, Transferir

#### Monitoreo de llamadas (SupervisorMonitorDialog)
Tres modos de supervisión para llamadas activas:
- **Escuchar (Listen)**: Solo audio del agente y contacto, sin que sepan
- **Susurrar (Whisper)**: Audio al agente solamente, el contacto no escucha
- **Irrumpir (Barge)**: Conferencia a 3 vías, todos escuchan

UI del monitor:
- Duración de la llamada en tiempo real
- Controles: Mute, Volume slider
- Botones para cambiar entre modos
- Indicador visual del modo activo

### 4.5 Colas en Tiempo Real

**Componentes:** `QueuesLivePage`

- Cards por cola: nombre, waiting/active count, agentes online, SLA con Progress bar, avg wait time
- Lista de conversaciones en espera por cola seleccionada:
  - Cada item: nombre del contacto, canal, prioridad, tiempo en espera
  - Botón de asignar → abre AssignDialog
- Ordenamiento por prioridad y tiempo de espera

### 4.6 Sistema de Derivación/Asignación

**Componentes:** `AssignDialog`, `TransferDialog`

El AssignDialog es el componente central de enrutamiento, usado tanto desde Supervisor como desde el Inbox (vía TransferDialog).

#### 4 modos de derivación:

**1. Automático:**
- Selección de estrategia de enrutamiento:
  - Round Robin: distribución secuencial equitativa
  - Menos ocupado: al agente con menor carga
  - Por habilidades: según skills del caso
  - Por prioridad: al agente con mejor rendimiento
  - Mayor tiempo libre: al que lleva más sin atender
- Criterios adicionales (toggles):
  - Considerar habilidades (skills)
  - Respetar capacidad máxima
  - Respetar horario laboral
- Muestra agente recomendado con preview de carga
- Si no hay agentes disponibles → mensaje de advertencia

**2. Agente (manual):**
- Lista de agentes con:
  - Status badge (ONLINE/BUSY/AWAY)
  - Barra de carga visual (%)
  - Skills asignados
  - Conversaciones activas/máximo
- Agentes "llenos" aparecen deshabilitados
- Ordenados por menor carga

**3. Supervisor:**
- Lista de supervisores disponibles
- Status y carga de cada uno

**4. IA (Asistente Virtual):**
- Lista de bots IA disponibles:
  - AgentHub IA: FAQ, consultas generales, estado de cuenta
  - Collect Bot: cobranza, planes de pago, negociación
  - Soporte Técnico IA: API, integración, errores técnicos
- Cada bot muestra: capacidad, tiempo promedio de resolución, CSAT promedio, especialidades

Todos los modos incluyen campo de razón/nota (opcional) y selección de cola destino.

**Datos requeridos del backend para routing automático:**
```typescript
POST /routing/assign
{
  conversation_id: string;
  strategy: RoutingStrategy;
  target_type: "auto" | "agent" | "supervisor" | "ai";
  target_id?: string;           // ID del agente/supervisor/IA si es manual
  queue_id?: string;            // Cola destino
  consider_skills: boolean;
  consider_load: boolean;
  respect_schedule: boolean;
  reason?: string;
}
```

### 4.7 Calidad (QA)

**Componentes:** `QualityPage`

Tabs:
1. **Evaluar**: Lista de conversaciones resueltas pendientes de evaluación
2. **Historial**: Evaluaciones realizadas con scores

#### Formulario de Evaluación
Categorías con puntaje 1-10 cada una:
- **Saludo y presentación** (peso: 25%)
- **Empatía y tono** (peso: 25%)
- **Resolución del problema** (peso: 30%)
- **Cierre y despedida** (peso: 20%)

Cada categoría usa un Slider (1-10). Score total = promedio ponderado.
Incluye campo de comentarios del evaluador.

**Modelo de evaluación:**
```typescript
interface QualityEvaluation {
  id: string;
  conversation_id: string;
  agent: string;
  contact: string;
  channel: ChannelType;
  score: number;                // 0-100
  categories: {
    saludo: number;             // 1-10
    empatia: number;            // 1-10
    resolucion: number;         // 1-10
    cierre: number;             // 1-10
  };
  comment: string;
  evaluator: string;
  date: string;
}
```

### 4.8 Contactos / CRM

**Componentes:** `ContactsPage`, `ContactDetailDrawer`

- Lista de contactos con búsqueda por nombre/email/teléfono
- Cards de contacto con: avatar (iniciales), nombre, email, teléfono, tags, sistema de origen
- Acciones:
  - **Nuevo contacto**: Formulario con nombre, email, teléfono, tags
  - **Importar**: Upload de CSV con mapeo de columnas
  - **Exportar**: Descarga de todos los contactos
  - **Merge**: Seleccionar 2 contactos → fusionar (elegir qué datos conservar)
  - **Ver detalle**: Abre ContactDetailDrawer con timeline, notas, historial

### 4.9 Perfil del Agente

**Componentes:** `ProfilePage`

- Editar nombre y email
- Cambiar status: ONLINE, AWAY, BUSY, ON_BREAK, OFFLINE
- Configurar max_concurrent (conversaciones simultáneas)
- Ver rol asignado
- Guardar cambios

### 4.10 Configuración

#### Colas (SettingsQueuesPage)
- CRUD de colas
- Campos: nombre, descripción, equipo, estrategia de routing, SLA, estado activo/inactivo

#### Canales (SettingsChannelsPage)
- Configuración por tipo de canal (WhatsApp, Email, Teams, Voice, WebChat)
- Cada canal muestra: status, conversaciones del día, configuración específica
- WebChat: preview del widget + código de embebido

#### Equipos (SettingsTeamsPage)
- CRUD de equipos
- Campos: nombre, descripción, líder
- Asignación de miembros

#### Habilidades (SettingsSkillsPage)
- CRUD de skills
- Categorización: tema, idioma, técnico

#### Roles (RolesPage)
- CRUD de roles
- Matriz de permisos por módulo
- Asignación de permisos granulares

#### Integraciones (IntegrationsPage)
- Cards de integraciones disponibles: CRM, ERP, WhatsApp Business API, Asterisk PBX
- Status de conexión por integración
- Configuración de API keys y endpoints

#### General (SettingsGeneralPage)
- Nombre de la empresa
- Timezone
- Idioma
- Horarios de operación (BusinessHours)
- Disposiciones (CRUD de disposition codes)
- Respuestas rápidas (CRUD de quick replies)
- Políticas de SLA

### 4.11 Plantillas de Email

**Componentes:** `EmailTemplates.tsx`

- CRUD de plantillas de email
- Cada plantilla tiene: nombre, categoría, asunto, cuerpo
- Soporte para variables dinámicas: `{{nombre_contacto}}`, `{{numero_factura}}`, etc.
- Detección automática de variables al editar
- Selector de plantillas integrado en el compositor de email del Inbox
- Categorías: general, facturación, cobranza, soporte

---

## 5. API Requerida por el Backend

### 5.1 Autenticación

```
POST   /auth/login                     { email, password } → { token, user }
POST   /auth/logout                    
GET    /auth/me                        → AuthUser
PUT    /auth/profile                   { name, email, max_concurrent }
PUT    /auth/status                    { status: AgentStatus }
```

### 5.2 Conversaciones

```
GET    /conversations                  ?tab=mine|queue|all&channel=WHATSAPP&status=ACTIVE&page=1&limit=20
GET    /conversations/:id              → Conversation (con messages)
POST   /conversations/:id/accept       Aceptar conversación asignada
POST   /conversations/:id/reject       Rechazar conversación asignada
POST   /conversations/:id/hold         Poner en espera
POST   /conversations/:id/resume       Retomar de espera
POST   /conversations/:id/resolve      { disposition_id, note? }
POST   /conversations/:id/transfer     { target_type, target_id, queue_id?, reason? }
```

### 5.3 Mensajes

```
GET    /conversations/:id/messages     ?page=1&limit=50
POST   /conversations/:id/messages     { content, content_type, is_internal, attachments? }
POST   /conversations/:id/messages/email  { to, cc?, subject, body, attachments? }
```

### 5.4 Contactos

```
GET    /contacts                       ?search=query&page=1&limit=20
GET    /contacts/:id                   → Contact con timeline
POST   /contacts                       { name, email?, phone?, tags }
PUT    /contacts/:id                   { ...partial Contact }
DELETE /contacts/:id
POST   /contacts/import                multipart/form-data (CSV)
GET    /contacts/export                → CSV/Excel download
POST   /contacts/merge                 { source_id, target_id }
GET    /contacts/:id/timeline          → Array de interacciones pasadas
GET    /contacts/:id/notes             → Array de notas internas
POST   /contacts/:id/notes             { content }
PUT    /contacts/:id/tags              { tags: string[] }
```

### 5.5 Agentes

```
GET    /agents                         → Agent[] (todos los agentes)
GET    /agents/online                  → Agent[] (solo online/busy)
GET    /agents/:id                     → Agent detallado
PUT    /agents/:id/status              { status: AgentStatus }
```

### 5.6 Colas

```
GET    /queues                         → Queue[]
GET    /queues/live                    → Queue[] con stats en tiempo real
GET    /queues/:id/waiting             → Conversation[] en espera
POST   /queues                         { name, description, team, routing_strategy, ... }
PUT    /queues/:id                     { ...partial Queue }
DELETE /queues/:id
```

### 5.7 Routing / Asignación

```
POST   /routing/assign                 { conversation_id, strategy, target_type, target_id?, ... }
GET    /routing/recommend              ?conversation_id=X&strategy=LEAST_BUSY → Agent recomendado
```

### 5.8 Calidad

```
GET    /quality/evaluations            ?agent=X&date_from=Y&date_to=Z
GET    /quality/pending                → Conversaciones pendientes de evaluación
POST   /quality/evaluations            { conversation_id, categories, comment }
```

### 5.9 Reportes

```
GET    /reports/volume                 ?date_from=X&date_to=Y&group_by=day|hour|channel
GET    /reports/productivity           ?date_from=X&date_to=Y → Métricas por agente
GET    /reports/sla                    ?date_from=X&date_to=Y → Métricas de SLA por cola
GET    /reports/export                 ?type=volume|productivity|sla&format=csv|xlsx
```

### 5.10 Dashboard

```
GET    /dashboard/stats                → DashboardStats (tiempo real)
WS     /dashboard/live                 WebSocket para actualización en tiempo real
```

### 5.11 Configuración

```
# Canales
GET    /settings/channels              → Channel[]
PUT    /settings/channels/:id          { config específica del canal }

# Skills
GET    /settings/skills                → Skill[]
POST   /settings/skills                { name, category }
PUT    /settings/skills/:id
DELETE /settings/skills/:id

# Teams
GET    /settings/teams                 → Team[]
POST   /settings/teams                 { name, description, leader }
PUT    /settings/teams/:id
DELETE /settings/teams/:id

# Roles
GET    /settings/roles                 → Role[]
POST   /settings/roles                 { name, permissions }
PUT    /settings/roles/:id
DELETE /settings/roles/:id

# Dispositions
GET    /settings/dispositions          → Disposition[]
POST   /settings/dispositions
PUT    /settings/dispositions/:id
DELETE /settings/dispositions/:id

# Quick Replies
GET    /settings/quick-replies         → QuickReply[]
POST   /settings/quick-replies
PUT    /settings/quick-replies/:id
DELETE /settings/quick-replies/:id

# SLA Policies
GET    /settings/sla-policies          → SlaPolicy[]
POST   /settings/sla-policies
PUT    /settings/sla-policies/:id
DELETE /settings/sla-policies/:id

# Business Hours
GET    /settings/business-hours        → BusinessHours[]
POST   /settings/business-hours
PUT    /settings/business-hours/:id

# Email Templates
GET    /settings/email-templates       → EmailTemplate[]
POST   /settings/email-templates
PUT    /settings/email-templates/:id
DELETE /settings/email-templates/:id

# General
GET    /settings/general               → { company_name, timezone, language, ... }
PUT    /settings/general
```

---

## 6. Telefonía SIP/WebRTC

### Stack
- **Librería**: SIP.js 0.21.2
- **Protocolo**: SIP sobre WebSocket (WSS)
- **Media**: WebRTC (audio only)
- **Compatible con**: Asterisk, FreeSWITCH

### Configuración SIP (SipConfig)

```typescript
interface SipConfig {
  server: string;           // WSS URI: "wss://pbx.example.com:8089/ws"
  realm: string;            // Dominio SIP
  extension: string;        // Extensión/usuario SIP
  password: string;         // Contraseña SIP
  displayName: string;      // Nombre mostrado en caller ID
  stunServers: string[];    // STUN/TURN servers (default: stun.l.google.com:19302)
  iceGatheringTimeout: number; // Timeout ICE en ms (default: 5000)
}
```

### Funcionalidades implementadas

| Función | Descripción | Método SIP.js |
|---------|-------------|---------------|
| Registrar | Conectar al servidor SIP | `UserAgent.start()` + `Registerer.register()` |
| Des-registrar | Desconectar del servidor | `Registerer.unregister()` + `UserAgent.stop()` |
| Llamar | Llamada saliente | `Inviter` + `invite()` |
| Contestar | Aceptar llamada entrante | `Invitation.accept()` |
| Rechazar | Rechazar llamada entrante | `Invitation.reject()` |
| Colgar | Terminar llamada activa | `Session.bye()` / `Inviter.cancel()` |
| Mute/Unmute | Silenciar micrófono | `RTCPeerConnection.getSenders()` → track.enabled |
| Hold/Unhold | Poner en espera | Toggle de tracks + estado |
| DTMF | Enviar tonos | `RTCDTMFSender.insertDTMF()` |
| Transferencia ciega | Blind transfer | `Session.refer()` |

### Widget de Softphone (SoftphoneWidget)

UI flotante con:
- **Estado de registro**: indicador visual (verde=registrado, amarillo=registrando, rojo=error)
- **Dialpad**: Teclado numérico para marcar
- **Llamada activa**: Timer, nombre del contacto, botones de Mute/Hold/DTMF/Transfer/Hangup
- **Llamada entrante**: Notificación con botones Aceptar/Rechazar
- **Historial**: Últimas llamadas con dirección, duración, timestamp
- **Configuración**: Formulario para server WSS, realm, extensión, password, STUN

### Estado del Softphone (Zustand Store)

```typescript
interface SipState {
  config: SipConfig;
  registrationState: "unregistered" | "registering" | "registered" | "error";
  registrationError: string | null;
  currentCall: CallInfo | null;
  callHistory: CallHistoryEntry[];  // Últimas 100 llamadas
  isConfigOpen: boolean;
}
```

### Requisitos del PBX (Asterisk/FreeSWITCH)

El PBX debe exponer:
1. **WebSocket (WSS)** en un puerto seguro (ej: 8089)
2. **Certificado SSL** válido para WSS
3. **Extensiones SIP** configuradas para WebRTC
4. **Codecs**: Opus preferido, G.711 como fallback
5. **ICE/STUN/TURN** configurado para NAT traversal

---

## 7. Notificaciones en Tiempo Real

### Hook: `useRealtimeNotifications`

El frontend implementa un sistema de notificaciones que el backend debe alimentar vía WebSocket o SSE:

**Tipos de eventos esperados:**
1. **Nueva conversación asignada**: Toast + sonido + notificación del navegador
2. **Warning de SLA**: Cuando una conversación supera el threshold de SLA
3. **Transferencia recibida**: Cuando se recibe una transferencia de otro agente
4. **Mensaje nuevo**: En conversaciones activas del agente

**Sonido**: Generado con Web Audio API (OscillatorNode, 2 tonos secuenciales)

**Formato esperado del backend (WebSocket):**
```typescript
interface RealtimeEvent {
  type: "NEW_ASSIGNMENT" | "SLA_WARNING" | "TRANSFER_RECEIVED" | "NEW_MESSAGE";
  conversation_id: string;
  data: {
    contact_name?: string;
    channel?: ChannelType;
    queue?: string;
    sla_percent?: number;
    from_agent?: string;
    message_preview?: string;
  };
  timestamp: string;
}
```

---

## 8. Integraciones Externas

El frontend tiene UI de configuración para las siguientes integraciones:

| Integración | Tipo | Campos configurables |
|-------------|------|---------------------|
| CRM Externo | API REST | API URL, API Key, Sync interval |
| ERP | API REST | API URL, API Key |
| WhatsApp Business API | API | Phone Number ID, Access Token, Webhook Verify Token |
| Asterisk PBX | WebSocket SIP | WSS URL, Realm, Templates de extensión |
| Email (SMTP/IMAP) | Protocolo | Host, Port, User, Password, TLS |
| Microsoft Teams | OAuth | Tenant ID, Client ID, Client Secret |

---

## Notas para el Backend

### Tiempo Real
- Se recomienda WebSocket (Socket.IO o nativo) para:
  - Dashboard live stats
  - Cola de mensajes entrantes
  - Notificaciones de eventos
  - Status de agentes
  - Actualizaciones de SLA

### Almacenamiento de Archivos
- Adjuntos de mensajes (PDF, imágenes, documentos)
- Importación/exportación de contactos (CSV)
- Avatares de agentes
- Se recomienda object storage (S3, Supabase Storage, etc.)

### Escalamiento desde Sistemas Externos
El sistema recibe conversaciones escaladas desde:
- **Collect** (sistema de cobranza): Incluye datos de créditos, mora, producto
- **AgentHub** (chatbot IA): Incluye razón de escalamiento y contexto conversacional
- **IVR/Voice**: Llamadas transferidas del IVR

Cada escalamiento incluye `source`, `escalation_reason` y opcionalmente `escalation_context` con datos estructurados del sistema origen.

### Seguridad
- Tokens JWT con expiración y refresh
- RBAC (Role-Based Access Control) con la matriz de permisos definida
- Rate limiting en APIs
- Sanitización de inputs (especialmente en mensajes HTML de email)
- Encriptación de credenciales SIP y API keys
- Audit log de acciones de supervisor (monitor, transfer, barge)

### Multitenancy
- El frontend no implementa multitenancy actualmente
- Si se requiere, el backend debe agregar tenant_id a todas las tablas y APIs
