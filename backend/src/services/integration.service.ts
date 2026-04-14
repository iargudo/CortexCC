import type { Channel } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { mapChannelType } from "../lib/channelTypes.js";
import { canonicalPhone, phoneCandidates } from "../lib/phone.js";
import { createConversationFromEscalation } from "./conversation.service.js";

type IntegrationUiStatus = "connected" | "warning" | "disconnected";

function channelUiStatus(ch: Channel | undefined): IntegrationUiStatus {
  if (!ch) return "disconnected";
  if (ch.status === "active") return "connected";
  return "warning";
}

async function upsertContact(input: {
  phone?: string;
  name?: string;
  external_id?: string;
  source_system?: string;
}) {
  const phone = canonicalPhone(input.phone);
  const variants = phoneCandidates(phone);
  const existing =
    (variants.length > 0 &&
      (await prisma.contact.findFirst({
        where: {
          OR: [{ phone: { in: variants } }, { phone_wa: { in: variants } }],
        },
      }))) ||
    (input.external_id &&
      (await prisma.contact.findFirst({
        where: { external_id: input.external_id, source_system: input.source_system },
      })));

  if (existing) {
    return prisma.contact.update({
      where: { id: existing.id },
      data: {
        name: input.name ?? existing.name,
        phone: phone ?? existing.phone,
        phone_wa: phone ?? existing.phone_wa,
        external_id: input.external_id ?? existing.external_id,
        source_system: input.source_system ?? existing.source_system,
      },
    });
  }

  return prisma.contact.create({
    data: {
      name: input.name,
      phone,
      phone_wa: phone,
      external_id: input.external_id,
      source_system: input.source_system,
    },
  });
}

async function resolveChannel(channelType: string) {
  const type = mapChannelType(channelType);
  const ch = await prisma.channel.findFirst({ where: { type } });
  if (!ch) throw new HttpError(503, `No channel configured for ${type}`);
  return ch;
}

export async function handleAgentHubEscalation(body: {
  channel_type: string;
  contact: { phone?: string; name?: string; external_id?: string };
  conversation_ref_id?: string;
  escalation_reason?: string;
  context?: unknown;
  preferred_queue?: string;
  priority?: number;
}) {
  const channel = await resolveChannel(body.channel_type);
  const contact = await upsertContact({
    phone: body.contact.phone,
    name: body.contact.name,
    external_id: body.contact.external_id,
    source_system: "agenthub",
  });
  const id = await createConversationFromEscalation({
    channelId: channel.id,
    contactId: contact.id,
    queueId: body.preferred_queue,
    source: "agenthub_escalation",
    sourceRef: body.conversation_ref_id,
    reason: body.escalation_reason,
    context: body.context,
    priority: body.priority,
  });
  return { conversation_id: id };
}

export async function handleCollectEscalation(body: {
  channel_type: string;
  contact: { phone?: string; name?: string; external_id?: string };
  conversation_ref_id?: string;
  escalation_reason?: string;
  context?: unknown;
  preferred_queue?: string;
  priority?: number;
}) {
  const channel = await resolveChannel(body.channel_type);
  const contact = await upsertContact({
    phone: body.contact.phone,
    name: body.contact.name,
    external_id: body.contact.external_id,
    source_system: "collect",
  });
  const id = await createConversationFromEscalation({
    channelId: channel.id,
    contactId: contact.id,
    queueId: body.preferred_queue,
    source: "collect_escalation",
    sourceRef: body.conversation_ref_id,
    reason: body.escalation_reason,
    context: body.context,
    priority: body.priority,
  });
  return { conversation_id: id };
}

export async function handleVoiceTransfer(body: {
  channel_type: string;
  contact: { phone?: string; name?: string };
  conversation_ref_id?: string;
  escalation_reason?: string;
  context?: unknown;
  preferred_queue?: string;
  priority?: number;
}) {
  const channel = await resolveChannel(body.channel_type || "VOICE");
  const contact = await upsertContact({
    phone: body.contact.phone,
    name: body.contact.name,
    source_system: "voice",
  });
  const id = await createConversationFromEscalation({
    channelId: channel.id,
    contactId: contact.id,
    queueId: body.preferred_queue,
    source: "voice_escalation",
    sourceRef: body.conversation_ref_id,
    reason: body.escalation_reason,
    context: body.context,
    priority: body.priority ?? 1,
  });
  return { conversation_id: id };
}

/** Estado agregado para la pantalla de integraciones (JWT + permiso settings). */
export async function getIntegrationsUiSummary(): Promise<{
  integrations: {
    id: string;
    name: string;
    description: string;
    status: IntegrationUiStatus;
    lastSync: string;
    stats: Record<string, string | number>;
    endpoint: string;
  }[];
}> {
  const channels = await prisma.channel.findMany();
  const pick = (type: Channel["type"]) => channels.find((c) => c.type === type);
  const wa = pick("WHATSAPP");
  const teams = pick("TEAMS");
  const voiceCh = pick("VOICE");

  const last = (ch: Channel | undefined) =>
    ch?.updated_at
      ? `Actualizado ${ch.updated_at.toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}`
      : "Sin canal configurado";

  return {
    integrations: [
      {
        id: "agenthub",
        name: "CortexAgentHub",
        description: "Agentes IA multi-canal — Origen de escalamientos IA",
        status: "connected",
        lastSync: "Webhooks operativos",
        stats: {},
        endpoint:
          process.env.AGENTHUB_PUBLIC_URL ?? "https://app-back-cortexagenthub-prd-001.azurewebsites.net",
      },
      {
        id: "collect",
        name: "CortexCollect",
        description: "Sistema de cobranza — Escalamiento de campañas",
        status: "connected",
        lastSync: "Webhooks operativos",
        stats: {},
        endpoint: process.env.COLLECT_PUBLIC_URL ?? "https://cortexcollect-api.azurewebsites.net",
      },
      {
        id: "cortexvoice",
        name: "CortexVoice",
        description: "Asistente de voz IA — Transferencia de llamadas",
        status: "connected",
        lastSync: "Webhooks operativos",
        stats: {},
        endpoint: process.env.VOICE_PUBLIC_URL ?? "https://cortexvoice-api.azurewebsites.net",
      },
      {
        id: "asterisk",
        name: "Asterisk PBX",
        description: "Central telefónica — WebRTC y SIP",
        status: channelUiStatus(voiceCh),
        lastSync: last(voiceCh),
        stats: {},
        endpoint: (voiceCh?.config as { sip_endpoint?: string })?.sip_endpoint ?? "wss://pbx.empresa.com/ws",
      },
      {
        id: "ultramsg",
        name: "UltraMsg (WhatsApp)",
        description: "Proveedor WhatsApp Business API",
        status: channelUiStatus(wa),
        lastSync: last(wa),
        stats: {},
        endpoint: "https://api.ultramsg.com",
      },
      {
        id: "graph",
        name: "Microsoft Graph (Teams)",
        description: "API de Microsoft Teams — Bot Framework",
        status: channelUiStatus(teams),
        lastSync: last(teams),
        stats: {},
        endpoint: "https://graph.microsoft.com",
      },
    ],
  };
}

/** Asistentes IA de demostración para el diálogo de asignación (sin motor real aún). */
export function getAiAssistantsPreview(): {
  agents: {
    id: string;
    name: string;
    type: string;
    status: string;
    capacity: string;
    avgResolutionTime: string;
    csatAvg: number;
    specialties: string[];
  }[];
} {
  return {
    agents: [
      {
        id: "ai-1",
        name: "AgentHub IA",
        type: "general",
        status: "active",
        capacity: "ilimitada",
        avgResolutionTime: "45s",
        csatAvg: 4.2,
        specialties: ["FAQ", "Consultas generales", "Estado de cuenta"],
      },
      {
        id: "ai-2",
        name: "Collect Bot",
        type: "collections",
        status: "active",
        capacity: "ilimitada",
        avgResolutionTime: "60s",
        csatAvg: 3.8,
        specialties: ["Cobranza", "Planes de pago", "Negociación"],
      },
      {
        id: "ai-3",
        name: "Soporte Técnico IA",
        type: "tech",
        status: "active",
        capacity: "ilimitada",
        avgResolutionTime: "90s",
        csatAvg: 4.0,
        specialties: ["API", "Integración", "Errores técnicos"],
      },
    ],
  };
}
