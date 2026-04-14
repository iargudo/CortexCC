import type {
  Attachment,
  Channel,
  ChannelType,
  Contact,
  Conversation,
  Message,
  Tag,
} from "@prisma/client";

const contentTypeToApi = (ct: string): string => {
  switch (ct) {
    case "EMAIL":
      return "HTML";
    case "FILE":
      return "DOCUMENT";
    case "SYSTEM_EVENT":
      return "SYSTEM_EVENT";
    case "IMAGE":
      return "IMAGE";
    case "AUDIO":
      return "AUDIO";
    case "VOICE_CALL":
      return "AUDIO";
    default:
      return "TEXT";
  }
};

export function mapMessage(m: Message & { attachments?: Attachment[]; sender?: { first_name: string; last_name: string } | null }) {
  return {
    id: m.id,
    conversation_id: m.conversation_id,
    sender_type: m.sender_type,
    sender_name:
      m.sender_type === "AGENT" && m.sender
        ? `${m.sender.first_name} ${m.sender.last_name}`.trim()
        : undefined,
    content: m.content,
    content_type: contentTypeToApi(m.content_type),
    is_internal: m.is_internal,
    delivery_status: m.delivery_status,
    created_at: m.created_at.toISOString(),
    attachments: m.attachments?.map((a) => ({
      filename: a.filename,
      mime_type: a.mime_type,
      size_bytes: a.size_bytes,
      url: a.storage_url,
    })),
  };
}

export function mapContact(c: Contact & { tags: { tag: Tag }[] }) {
  return {
    id: c.id,
    name: c.name ?? "",
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
    phone_wa: c.phone_wa ?? undefined,
    teams_id: c.teams_id ?? undefined,
    source_system: c.source_system ?? undefined,
    tags: c.tags.map((t) => t.tag.name),
    metadata: (c.metadata as Record<string, unknown>) ?? undefined,
  };
}

export function mapChannelTypeToApi(t: ChannelType): string {
  return t;
}

/** Agente con asignación abierta (ended_at null), si existe. */
export type ActiveAssigneeInfo = {
  displayName: string | null;
  userId: string | null;
};

export function mapConversation(
  conv: Conversation & {
    channel: Channel;
    contact: Contact & { tags: { tag: Tag }[] };
    queue: { name: string } | null;
    messages: (Message & { attachments?: Attachment[]; sender?: { first_name: string; last_name: string } | null })[];
  },
  activeAssignee?: ActiveAssigneeInfo | null
) {
  const lastMsg = conv.messages[conv.messages.length - 1];
  return {
    id: conv.id,
    channel: mapChannelTypeToApi(conv.channel.type),
    contact: mapContact(conv.contact),
    status: conv.status,
    priority: conv.priority,
    subject: conv.subject ?? undefined,
    source: conv.source,
    escalation_reason: conv.escalation_reason ?? undefined,
    escalation_context: conv.escalation_context ?? undefined,
    queue_name: conv.queue?.name ?? "",
    assigned_agent: activeAssignee?.displayName ?? undefined,
    assigned_user_id: activeAssignee?.userId ?? undefined,
    last_message: conv.last_message_preview ?? lastMsg?.content,
    last_message_at: (conv.last_message_at ?? lastMsg?.created_at ?? conv.created_at).toISOString(),
    wait_time_seconds: conv.wait_time_seconds ?? undefined,
    sla_percent: undefined,
    unread_count: conv.unread_agent_count,
    messages: conv.messages.map(mapMessage),
  };
}
