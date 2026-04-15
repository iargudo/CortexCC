// Mock data for CortexContactCenter frontend

export type ChannelType = "WHATSAPP" | "EMAIL" | "TEAMS" | "VOICE" | "WEBCHAT";
export type ConversationStatus = "WAITING" | "ASSIGNED" | "ACTIVE" | "ON_HOLD" | "WRAP_UP" | "RESOLVED" | "ABANDONED" | "TRANSFERRED";
export type AgentStatus = "ONLINE" | "AWAY" | "BUSY" | "OFFLINE" | "ON_BREAK";
export type SenderType = "CONTACT" | "AGENT" | "SYSTEM" | "BOT";
export type RoutingStrategy = "ROUND_ROBIN" | "LEAST_BUSY" | "SKILL_BASED" | "PRIORITY_BASED" | "LONGEST_IDLE";

export interface EscalationCredito {
  monto_vencido: number;
  dias_mora: number;
  producto: string;
}

export interface EscalationHistoryItem {
  role: string;
  content: string;
  timestamp?: string;
}

export interface EscalationContext {
  creditos?: EscalationCredito[];
  campana?: { nombre: string };
  agent_name?: string;
  source_system?: string;
  escalated_at?: string;
  metadata?: Record<string, unknown>;
  conversation_history?: EscalationHistoryItem[];
}

export interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  phone_wa?: string;
  teams_id?: string;
  source_system?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  sender_name?: string;
  content: string;
  content_type: string;
  is_internal: boolean;
  delivery_status: string;
  created_at: string;
  attachments?: { filename: string; mime_type: string; size_bytes: number; url?: string }[];
}

export interface Conversation {
  id: string;
  channel: ChannelType;
  contact: Contact;
  status: ConversationStatus;
  priority: number;
  subject?: string;
  source: string;
  escalation_reason?: string;
  escalation_context?: EscalationContext;
  queue_name: string;
  assigned_agent?: string;
  /** Usuario con asignación abierta; usar para saber si Aceptar/Rechazar aplica al agente logueado. */
  assigned_user_id?: string;
  last_message?: string;
  last_message_at: string;
  wait_time_seconds?: number;
  sla_percent?: number;
  unread_count: number;
  messages: Message[];
}

export interface Agent {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  status: AgentStatus;
  max_concurrent: number;
  active_conversations: number;
  skills: { name: string; proficiency: number }[];
  teams: string[];
  aht_seconds?: number;
  csat_avg?: number;
  resolved_today: number;
  status_since: string;
}

export interface Queue {
  id: string;
  name: string;
  description?: string;
  team?: string;
  routing_strategy: RoutingStrategy;
  waiting: number;
  active: number;
  agents_online: number;
  sla_percent: number;
  avg_wait_seconds: number;
  max_wait_seconds: number;
  is_active: boolean;
}

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  status: "active" | "inactive" | "error";
  conversations_today: number;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  member_count: number;
  leader?: string;
}

export interface Disposition {
  id: string;
  name: string;
  category: string;
  requires_note: boolean;
  is_active: boolean;
}

export interface SlaPolicy {
  id: string;
  name: string;
  first_response_seconds: number;
  resolution_seconds: number;
  warning_threshold_pct: number;
}

export interface QuickReply {
  id: string;
  shortcode: string;
  title: string;
  content: string;
  channel?: ChannelType;
  category?: string;
}

export type IntegrationAppMode = "SNAPSHOT" | "EMBED" | "ACTIONS";
export type IntegrationAuthType = "NONE" | "API_KEY" | "OAUTH2" | "JWT";
export type IntegrationBindingScopeType = "GLOBAL" | "CHANNEL" | "QUEUE" | "ROLE";

export interface IntegrationApp {
  id: string;
  key: string;
  name: string;
  icon: string;
  mode: IntegrationAppMode;
  auth_type: IntegrationAuthType;
  base_url?: string | null;
  credentials_ref?: string | null;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IntegrationBinding {
  id: string;
  app_id: string;
  app_key: string;
  app_name: string;
  scope_type: IntegrationBindingScopeType;
  scope_id?: string | null;
  placement: string;
  sort_order: number;
  is_visible: boolean;
  rules?: Record<string, unknown>;
}

export interface ConversationIntegrationRuntimeApp {
  id: string;
  key: string;
  name: string;
  icon: string;
  mode: IntegrationAppMode;
  view_mode: "INLINE" | "MODAL" | "EXTERNAL_TAB";
  match_explain: string;
  sort_order: number;
  embed_url?: string;
  snapshot?: { label: string; value: string }[];
  actions?: { id: string; label: string; action_key: string }[];
}

export interface ConversationIntegrationsWorkspace {
  conversation_id: string;
  source: string;
  source_ref_id?: string | null;
  escalation_reason?: string | null;
  escalation_context?: Record<string, unknown> | null;
  channel: { type: ChannelType; name: string };
  queue: { id: string; name: string } | null;
  contact: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    phone_wa?: string | null;
    source_system?: string | null;
  };
  apps: ConversationIntegrationRuntimeApp[];
}

export interface BusinessHours {
  id: string;
  name: string;
  timezone: string;
  schedule: Record<string, { start: string; end: string }[]>;
}

// ==================== MOCK DATA ====================

export const mockContacts: Contact[] = [
  { id: "c1", name: "Juan Pérez", phone: "+593991234567", phone_wa: "+593991234567", email: "juan@email.com", tags: ["VIP", "Mora"], source_system: "collect" },
  { id: "c2", name: "María López", email: "maria.lopez@empresa.com", phone: "+593987654321", tags: ["Nuevo"], source_system: "agenthub" },
  { id: "c3", name: "Carlos Ruiz", phone: "+593976543210", tags: ["Recurrente"], source_system: "voice" },
  { id: "c4", name: "Ana Martínez", email: "ana.martinez@corp.com", teams_id: "teams-user-1", tags: ["Enterprise"], source_system: "direct" },
  { id: "c5", name: "Pedro Gómez", phone: "+593965432109", phone_wa: "+593965432109", tags: ["Cobranza"], source_system: "collect" },
  { id: "c6", name: "Laura Sánchez", email: "laura.s@startup.io", tags: [], source_system: "agenthub" },
  { id: "c7", name: "Roberto Díaz", phone: "+593954321098", tags: ["Soporte"], source_system: "direct" },
  { id: "c8", name: "Carmen Torres", email: "carmen@business.ec", phone: "+593943210987", tags: ["VIP"], source_system: "collect" },
];

const makeMessages = (convId: string, channel: ChannelType, source: string): Message[] => {
  // Email conversations get email-style messages
  if (channel === "EMAIL") {
    const base: Message[] = [];
    if (source.includes("escalation")) {
      base.push(
        { id: `${convId}-m0`, conversation_id: convId, sender_type: "SYSTEM", content: "Conversación escalada desde AgentHub", content_type: "SYSTEM_EVENT", is_internal: false, delivery_status: "sent", created_at: "2026-04-10T08:30:00Z" },
      );
    }
    base.push(
      {
        id: `${convId}-m1`, conversation_id: convId, sender_type: "CONTACT",
        content: "Estimado equipo de soporte,\n\nMe comunico con ustedes porque he identificado una inconsistencia en la factura #1234 correspondiente al periodo marzo 2026.\n\nEl monto total facturado es de $1,850.00 USD, sin embargo según mi registro de consumo, el monto correcto debería ser de $1,250.00 USD. La diferencia de $600.00 parece corresponder a un cargo duplicado por el servicio Premium.\n\nAdjunto la factura en cuestión y mi registro de pagos anteriores para su revisión.\n\nQuedo atenta a su respuesta.\n\nSaludos cordiales,\nMaría López\nGerente de Operaciones\nEmpresa ABC S.A.",
        content_type: "HTML", is_internal: false, delivery_status: "read", created_at: "2026-04-10T08:35:00Z",
        attachments: [
          { filename: "Factura_1234_Marzo2026.pdf", mime_type: "application/pdf", size_bytes: 245760 },
          { filename: "Historial_Pagos_2026.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size_bytes: 89600 },
        ],
      },
      {
        id: `${convId}-m2`, conversation_id: convId, sender_type: "AGENT", sender_name: "Ana García",
        content: "Verificar en el sistema de facturación si efectivamente hay un cargo duplicado del servicio Premium. Revisar con el departamento de finanzas si es necesario.",
        content_type: "TEXT", is_internal: true, delivery_status: "sent", created_at: "2026-04-10T08:42:00Z",
      },
      {
        id: `${convId}-m3`, conversation_id: convId, sender_type: "AGENT", sender_name: "Ana García",
        content: "Estimada María,\n\nGracias por comunicarse con nosotros y por adjuntar la documentación correspondiente.\n\nHe revisado su cuenta y efectivamente puedo confirmar que existe un cargo duplicado por el servicio Premium en su factura #1234. Procederemos a generar una nota de crédito por $600.00 USD.\n\nEl ajuste se verá reflejado en su próximo estado de cuenta. Adjunto la nota de crédito preliminar para su registro.\n\n¿Hay algo adicional en lo que pueda asistirle?\n\nSaludos,\nAna García\nEspecialista de Soporte\nCortexContactCenter",
        content_type: "HTML", is_internal: false, delivery_status: "delivered", created_at: "2026-04-10T08:55:00Z",
        attachments: [
          { filename: "NotaCredito_NC-0892.pdf", mime_type: "application/pdf", size_bytes: 128000 },
        ],
      },
    );
    return base;
  }

  // Chat-style messages for other channels
  const base: Message[] = [];
  if (source.includes("escalation")) {
    base.push(
      { id: `${convId}-m1`, conversation_id: convId, sender_type: "BOT", sender_name: "Asistente IA", content: "Buenos días, ¿en qué puedo ayudarle?", content_type: "TEXT", is_internal: false, delivery_status: "read", created_at: "2026-04-10T09:00:00Z" },
      { id: `${convId}-m2`, conversation_id: convId, sender_type: "CONTACT", content: "Necesito hablar con una persona real", content_type: "TEXT", is_internal: false, delivery_status: "read", created_at: "2026-04-10T09:01:00Z" },
      { id: `${convId}-m3`, conversation_id: convId, sender_type: "BOT", sender_name: "Asistente IA", content: "Entiendo, le transfiero con un agente humano de inmediato.", content_type: "TEXT", is_internal: false, delivery_status: "read", created_at: "2026-04-10T09:01:30Z" },
      { id: `${convId}-m4`, conversation_id: convId, sender_type: "SYSTEM", content: "Conversación escalada a agente humano", content_type: "SYSTEM_EVENT", is_internal: false, delivery_status: "sent", created_at: "2026-04-10T09:01:35Z" },
    );
  }
  base.push(
    { id: `${convId}-m5`, conversation_id: convId, sender_type: "AGENT", sender_name: "Tú", content: "Hola, soy agente de soporte. ¿En qué puedo ayudarle?", content_type: "TEXT", is_internal: false, delivery_status: "read", created_at: "2026-04-10T09:02:00Z" },
    { id: `${convId}-m6`, conversation_id: convId, sender_type: "CONTACT", content: "Tengo un problema con mi factura del mes pasado, me cobraron de más.", content_type: "TEXT", is_internal: false, delivery_status: "read", created_at: "2026-04-10T09:03:00Z" },
    { id: `${convId}-m7`, conversation_id: convId, sender_type: "AGENT", sender_name: "Tú", content: "Déjeme verificar su cuenta. Un momento por favor.", content_type: "TEXT", is_internal: false, delivery_status: "delivered", created_at: "2026-04-10T09:03:30Z" },
    { id: `${convId}-m8`, conversation_id: convId, sender_type: "AGENT", sender_name: "Tú", content: "Revisar factura #4521 - monto parece duplicado", content_type: "TEXT", is_internal: true, delivery_status: "sent", created_at: "2026-04-10T09:04:00Z" },
  );
  return base;
};

export const mockConversations: Conversation[] = [
  {
    id: "conv-1", channel: "WHATSAPP", contact: mockContacts[0], status: "ACTIVE", priority: 3,
    source: "collect_escalation", escalation_reason: "Cliente disputa deuda y requiere negociación",
    escalation_context: { creditos: [{ monto_vencido: 1500, dias_mora: 45, producto: "Crédito personal" }], campana: { nombre: "Mora 30-60" } },
    queue_name: "Cobranza", assigned_agent: "Ana García", last_message: "Tengo un problema con mi factura...",
    last_message_at: "2026-04-10T09:03:00Z", sla_percent: 45, unread_count: 1,
    messages: makeMessages("conv-1", "WHATSAPP", "collect_escalation"),
  },
  {
    id: "conv-2", channel: "EMAIL", contact: mockContacts[1], status: "ACTIVE", priority: 5,
    subject: "RE: Factura #1234 - Consulta",
    source: "agenthub_escalation", escalation_reason: "Cliente solicita hablar con humano",
    queue_name: "Soporte", assigned_agent: "Ana García", last_message: "Adjunto la factura para su revisión",
    last_message_at: "2026-04-10T08:55:00Z", sla_percent: 60, unread_count: 0,
    messages: makeMessages("conv-2", "EMAIL", "agenthub_escalation"),
  },
  {
    id: "conv-3", channel: "VOICE", contact: mockContacts[2], status: "WAITING", priority: 1,
    source: "voice_escalation", escalation_reason: "Caller requested human agent",
    queue_name: "Ventas", last_message: "Llamada en espera",
    last_message_at: "2026-04-10T09:10:00Z", wait_time_seconds: 45, sla_percent: 30, unread_count: 0,
    messages: [],
  },
  {
    id: "conv-4", channel: "TEAMS", contact: mockContacts[3], status: "ACTIVE", priority: 4,
    source: "direct", queue_name: "Enterprise", assigned_agent: "Carlos Méndez",
    last_message: "¿Podrían revisar la integración API?",
    last_message_at: "2026-04-10T08:45:00Z", sla_percent: 55, unread_count: 2,
    messages: makeMessages("conv-4", "TEAMS", "direct"),
  },
  {
    id: "conv-5", channel: "WEBCHAT", contact: mockContacts[5], status: "WAITING", priority: 5,
    source: "agenthub_escalation", escalation_reason: "Consulta técnica compleja",
    queue_name: "Soporte Técnico", last_message: "Necesito ayuda con la API",
    last_message_at: "2026-04-10T09:08:00Z", wait_time_seconds: 120, sla_percent: 75, unread_count: 1,
    messages: [],
  },
  {
    id: "conv-6", channel: "WHATSAPP", contact: mockContacts[4], status: "ON_HOLD", priority: 2,
    source: "collect_escalation", escalation_reason: "Negociación de convenio de pago",
    queue_name: "Cobranza", assigned_agent: "Ana García", last_message: "Esperando confirmación del supervisor",
    last_message_at: "2026-04-10T08:30:00Z", sla_percent: 85, unread_count: 0,
    messages: makeMessages("conv-6", "WHATSAPP", "collect_escalation"),
  },
  {
    id: "conv-7", channel: "EMAIL", contact: mockContacts[6], status: "WRAP_UP", priority: 6,
    source: "direct", queue_name: "Soporte",
    assigned_agent: "Luis Herrera", last_message: "Gracias por su ayuda",
    last_message_at: "2026-04-10T08:00:00Z", sla_percent: 100, unread_count: 0,
    messages: makeMessages("conv-7", "EMAIL", "direct"),
  },
  {
    id: "conv-8", channel: "WHATSAPP", contact: mockContacts[7], status: "RESOLVED", priority: 3,
    source: "collect_escalation", queue_name: "Cobranza", assigned_agent: "Ana García",
    last_message: "Convenio registrado exitosamente",
    last_message_at: "2026-04-10T07:30:00Z", sla_percent: 50, unread_count: 0,
    messages: makeMessages("conv-8", "WHATSAPP", "collect_escalation"),
  },
];

export const mockAgents: Agent[] = [
  { id: "a1", name: "Ana García", email: "ana@cortex.com", status: "ONLINE", max_concurrent: 5, active_conversations: 3, skills: [{ name: "Cobranza", proficiency: 9 }, { name: "Español", proficiency: 10 }], teams: ["Cobranza"], aht_seconds: 420, csat_avg: 4.5, resolved_today: 12, status_since: "2026-04-10T07:00:00Z" },
  { id: "a2", name: "Carlos Méndez", email: "carlos@cortex.com", status: "ONLINE", max_concurrent: 5, active_conversations: 1, skills: [{ name: "Soporte Técnico", proficiency: 8 }, { name: "English", proficiency: 7 }], teams: ["Soporte"], aht_seconds: 380, csat_avg: 4.7, resolved_today: 8, status_since: "2026-04-10T07:30:00Z" },
  { id: "a3", name: "Luis Herrera", email: "luis@cortex.com", status: "BUSY", max_concurrent: 4, active_conversations: 4, skills: [{ name: "Ventas", proficiency: 9 }, { name: "Soporte", proficiency: 6 }], teams: ["Ventas"], aht_seconds: 510, csat_avg: 4.2, resolved_today: 6, status_since: "2026-04-10T08:15:00Z" },
  { id: "a4", name: "Diana Flores", email: "diana@cortex.com", status: "AWAY", max_concurrent: 5, active_conversations: 0, skills: [{ name: "Cobranza", proficiency: 7 }, { name: "Español", proficiency: 10 }], teams: ["Cobranza"], aht_seconds: 450, csat_avg: 4.3, resolved_today: 4, status_since: "2026-04-10T09:00:00Z" },
  { id: "a5", name: "Roberto Paz", email: "roberto@cortex.com", status: "ON_BREAK", max_concurrent: 5, active_conversations: 0, skills: [{ name: "Enterprise", proficiency: 8 }, { name: "English", proficiency: 9 }], teams: ["Enterprise"], aht_seconds: 600, csat_avg: 4.8, resolved_today: 3, status_since: "2026-04-10T09:05:00Z" },
  { id: "a6", name: "Sofía Vega", email: "sofia@cortex.com", status: "OFFLINE", max_concurrent: 5, active_conversations: 0, skills: [{ name: "Soporte", proficiency: 8 }], teams: ["Soporte"], aht_seconds: 340, csat_avg: 4.6, resolved_today: 0, status_since: "2026-04-10T06:00:00Z" },
];

export const mockQueues: Queue[] = [
  { id: "q1", name: "Cobranza", description: "Cola de cobranza y negociación", team: "Cobranza", routing_strategy: "SKILL_BASED", waiting: 3, active: 5, agents_online: 2, sla_percent: 82, avg_wait_seconds: 90, max_wait_seconds: 300, is_active: true },
  { id: "q2", name: "Soporte", description: "Soporte general", team: "Soporte", routing_strategy: "LEAST_BUSY", waiting: 1, active: 3, agents_online: 2, sla_percent: 91, avg_wait_seconds: 45, max_wait_seconds: 300, is_active: true },
  { id: "q3", name: "Ventas", description: "Consultas de ventas", team: "Ventas", routing_strategy: "ROUND_ROBIN", waiting: 2, active: 4, agents_online: 1, sla_percent: 75, avg_wait_seconds: 120, max_wait_seconds: 180, is_active: true },
  { id: "q4", name: "Enterprise", description: "Clientes enterprise", team: "Enterprise", routing_strategy: "PRIORITY_BASED", waiting: 0, active: 1, agents_online: 1, sla_percent: 95, avg_wait_seconds: 30, max_wait_seconds: 120, is_active: true },
  { id: "q5", name: "Soporte Técnico", description: "Soporte técnico avanzado", routing_strategy: "SKILL_BASED", waiting: 1, active: 2, agents_online: 1, sla_percent: 88, avg_wait_seconds: 60, max_wait_seconds: 300, is_active: true },
];

export const mockChannels: Channel[] = [
  { id: "ch1", name: "WhatsApp Principal", type: "WHATSAPP", status: "active", conversations_today: 45 },
  { id: "ch2", name: "Email Soporte", type: "EMAIL", status: "active", conversations_today: 23 },
  { id: "ch3", name: "Microsoft Teams", type: "TEAMS", status: "active", conversations_today: 8 },
  { id: "ch4", name: "Línea Telefónica", type: "VOICE", status: "active", conversations_today: 15 },
  { id: "ch5", name: "WebChat Sitio Web", type: "WEBCHAT", status: "active", conversations_today: 12 },
];

export const mockSkills: Skill[] = [
  { id: "s1", name: "Cobranza", category: "tema" },
  { id: "s2", name: "Soporte Técnico", category: "tema" },
  { id: "s3", name: "Ventas", category: "tema" },
  { id: "s4", name: "Enterprise", category: "tema" },
  { id: "s5", name: "Español", category: "idioma" },
  { id: "s6", name: "English", category: "idioma" },
];

export const mockTeams: Team[] = [
  { id: "t1", name: "Cobranza", description: "Equipo de cobranza y negociación", member_count: 5, leader: "Ana García" },
  { id: "t2", name: "Soporte", description: "Soporte general y técnico", member_count: 4, leader: "Carlos Méndez" },
  { id: "t3", name: "Ventas", description: "Equipo de ventas", member_count: 3, leader: "Luis Herrera" },
  { id: "t4", name: "Enterprise", description: "Clientes enterprise", member_count: 2, leader: "Roberto Paz" },
];

export const mockDispositions: Disposition[] = [
  { id: "d1", name: "Resuelto - Primera llamada", category: "resuelto", requires_note: false, is_active: true },
  { id: "d2", name: "Resuelto - Seguimiento", category: "resuelto", requires_note: true, is_active: true },
  { id: "d3", name: "No resuelto - Escalado", category: "no_resuelto", requires_note: true, is_active: true },
  { id: "d4", name: "No resuelto - Cliente desistió", category: "no_resuelto", requires_note: false, is_active: true },
  { id: "d5", name: "Convenio de pago", category: "seguimiento", requires_note: true, is_active: true },
  { id: "d6", name: "Spam", category: "spam", requires_note: false, is_active: true },
];

export const mockSlaPolicies: SlaPolicy[] = [
  { id: "sla1", name: "Chat Estándar", first_response_seconds: 60, resolution_seconds: 480, warning_threshold_pct: 80 },
  { id: "sla2", name: "Email Estándar", first_response_seconds: 14400, resolution_seconds: 86400, warning_threshold_pct: 80 },
  { id: "sla3", name: "Voz Urgente", first_response_seconds: 30, resolution_seconds: 900, warning_threshold_pct: 70 },
  { id: "sla4", name: "Enterprise Premium", first_response_seconds: 30, resolution_seconds: 300, warning_threshold_pct: 70 },
];

export const mockQuickReplies: QuickReply[] = [
  { id: "qr1", shortcode: "/saludo", title: "Saludo inicial", content: "Buenos días, mi nombre es {agente}. ¿En qué puedo ayudarle hoy?", category: "general" },
  { id: "qr2", shortcode: "/horarios", title: "Horarios de atención", content: "Nuestros horarios de atención son de lunes a viernes de 8:00 a 18:00.", category: "info" },
  { id: "qr3", shortcode: "/espera", title: "Solicitar espera", content: "Un momento por favor, estoy verificando la información.", category: "general" },
  { id: "qr4", shortcode: "/transferir", title: "Aviso de transferencia", content: "Voy a transferirlo con un especialista que podrá ayudarle mejor.", category: "general" },
  { id: "qr5", shortcode: "/despedida", title: "Despedida", content: "¿Hay algo más en lo que pueda ayudarle? De no ser así, le deseo un excelente día.", category: "general" },
  { id: "qr6", shortcode: "/cobranza_saludo", title: "Saludo cobranza", content: "Buenos días {contacto}, le contactamos respecto a su crédito {producto}.", channel: "WHATSAPP", category: "cobranza" },
];

export const mockBusinessHours: BusinessHours[] = [
  { id: "bh1", name: "Horario General", timezone: "America/Guayaquil", schedule: { monday: [{ start: "08:00", end: "18:00" }], tuesday: [{ start: "08:00", end: "18:00" }], wednesday: [{ start: "08:00", end: "18:00" }], thursday: [{ start: "08:00", end: "18:00" }], friday: [{ start: "08:00", end: "18:00" }] } },
  { id: "bh2", name: "Horario Extendido", timezone: "America/Guayaquil", schedule: { monday: [{ start: "07:00", end: "21:00" }], tuesday: [{ start: "07:00", end: "21:00" }], wednesday: [{ start: "07:00", end: "21:00" }], thursday: [{ start: "07:00", end: "21:00" }], friday: [{ start: "07:00", end: "21:00" }], saturday: [{ start: "08:00", end: "14:00" }] } },
];

// Dashboard stats
export const mockDashboardStats = {
  agents_online: 3,
  agents_total: 6,
  conversations_waiting: 7,
  conversations_active: 15,
  conversations_resolved_today: 33,
  avg_wait_seconds: 85,
  avg_handle_seconds: 432,
  sla_compliance: 84,
  csat_avg: 4.4,
  abandonment_rate: 3.2,
  transfer_rate: 11.5,
  escalations_from_ai: 28,
  volume_24h: [
    { hour: "00", count: 2 }, { hour: "01", count: 1 }, { hour: "02", count: 0 },
    { hour: "03", count: 0 }, { hour: "04", count: 1 }, { hour: "05", count: 3 },
    { hour: "06", count: 5 }, { hour: "07", count: 12 }, { hour: "08", count: 18 },
    { hour: "09", count: 22 }, { hour: "10", count: 25 }, { hour: "11", count: 20 },
    { hour: "12", count: 15 }, { hour: "13", count: 18 }, { hour: "14", count: 21 },
    { hour: "15", count: 19 }, { hour: "16", count: 16 }, { hour: "17", count: 10 },
    { hour: "18", count: 6 }, { hour: "19", count: 4 }, { hour: "20", count: 3 },
    { hour: "21", count: 2 }, { hour: "22", count: 1 }, { hour: "23", count: 1 },
  ],
  channel_breakdown: [
    { channel: "WHATSAPP" as ChannelType, count: 45, percentage: 43 },
    { channel: "EMAIL" as ChannelType, count: 23, percentage: 22 },
    { channel: "VOICE" as ChannelType, count: 15, percentage: 15 },
    { channel: "WEBCHAT" as ChannelType, count: 12, percentage: 12 },
    { channel: "TEAMS" as ChannelType, count: 8, percentage: 8 },
  ],
};
