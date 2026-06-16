import { Prisma } from "@prisma/client";
import { getPrisma } from "../lib/prisma.js";
import { canonicalPhone, phoneCandidates } from "../lib/phone.js";
import { HttpError } from "../middleware/errorHandler.js";
import { mapContact } from "./conversationMapper.js";

const ONGOING_STATUSES = ["WAITING", "ASSIGNED", "ACTIVE", "ON_HOLD"] as const;

export type ContactInteractionKind = "conversation" | "voice_call";

export type ContactInteractionMessageDto = {
  content: string;
  created_at: string;
  sender_type: string;
  content_type: string;
};

export type ContactInteractionDto = {
  id: string;
  kind: ContactInteractionKind;
  occurred_at: string;
  channel_type: string | null;
  status: string;
  preview: string | null;
  conversation_id: string | null;
  subject: string | null;
  duration_seconds: number | null;
  direction: string | null;
  queue_name: string | null;
  csat_score: number | null;
  handle_time_seconds: number | null;
  message_count: number | null;
  recent_messages: ContactInteractionMessageDto[] | null;
};

export type ContactInteractionsResult = {
  contact_ids: string[];
  merged_contact_count: number;
  items: ContactInteractionDto[];
  stats: {
    total_interactions: number;
    active_count: number;
    avg_csat: number | null;
    avg_handle_time_minutes: number | null;
  };
};

export async function listContacts(search: string | undefined, page: number, limit: number) {
  const skip = (page - 1) * limit;
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};
  const [rows, total] = await Promise.all([
    getPrisma().contact.findMany({
      where,
      include: { tags: { include: { tag: true } } },
      skip,
      take: limit,
      orderBy: { updated_at: "desc" },
    }),
    getPrisma().contact.count({ where }),
  ]);
  return { data: rows.map(mapContact), meta: { page, limit, total } };
}

export async function getContact(id: string) {
  const c = await getPrisma().contact.findUnique({
    where: { id },
    include: { tags: { include: { tag: true } } },
  });
  if (!c) throw new HttpError(404, "Not found");
  return mapContact(c);
}

export async function createContact(data: {
  name: string;
  email?: string;
  phone?: string;
  tags?: string[];
}) {
  const tagRecords =
    data.tags?.length ?
      await Promise.all(
        data.tags.map(async (name) => {
          const t = await getPrisma().tag.upsert({
            where: { name },
            create: { name },
            update: {},
          });
          return t;
        })
      )
    : [];

  const c = await getPrisma().contact.create({
    data: {
      name: data.name,
      email: data.email,
      phone: canonicalPhone(data.phone) ?? undefined,
      phone_wa: canonicalPhone(data.phone) ?? undefined,
      tags: {
        create: tagRecords.map((t) => ({ tag_id: t.id })),
      },
    },
    include: { tags: { include: { tag: true } } },
  });
  return mapContact(c);
}

export async function updateContact(
  id: string,
  data: Partial<{ name: string; email: string | null; phone: string | null; phone_wa: string | null }>
) {
  const normalizedPhone = data.phone === undefined ? undefined : canonicalPhone(data.phone);
  const normalizedPhoneWa = data.phone_wa === undefined ? undefined : canonicalPhone(data.phone_wa);
  const c = await getPrisma().contact.update({
    where: { id },
    data: {
      ...data,
      ...(normalizedPhone !== undefined ? { phone: normalizedPhone } : {}),
      ...(normalizedPhoneWa !== undefined ? { phone_wa: normalizedPhoneWa } : {}),
    },
    include: { tags: { include: { tag: true } } },
  });
  return mapContact(c);
}

export async function deleteContact(id: string) {
  await getPrisma().contact.delete({ where: { id } });
}

export async function mergeContacts(sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new HttpError(400, "Cannot merge same contact");
  const [src, tgt] = await Promise.all([
    getPrisma().contact.findUnique({ where: { id: sourceId }, include: { tags: true } }),
    getPrisma().contact.findUnique({ where: { id: targetId }, include: { tags: true } }),
  ]);
  if (!src || !tgt) throw new HttpError(404, "Contact not found");

  await getPrisma().$transaction(async (tx) => {
    await tx.conversation.updateMany({ where: { contact_id: sourceId }, data: { contact_id: targetId } });
    for (const ct of src.tags) {
      await tx.contactTag.upsert({
        where: { contact_id_tag_id: { contact_id: targetId, tag_id: ct.tag_id } },
        create: { contact_id: targetId, tag_id: ct.tag_id },
        update: {},
      });
    }
    await tx.contact.delete({ where: { id: sourceId } });
  });

  const merged = await getPrisma().contact.findUnique({
    where: { id: targetId },
    include: { tags: { include: { tag: true } } },
  });
  return mapContact(merged!);
}

export async function listNotes(contactId: string) {
  return getPrisma().contactNote.findMany({
    where: { contact_id: contactId },
    orderBy: { created_at: "desc" },
    include: { author: { select: { first_name: true, last_name: true, email: true } } },
  });
}

export async function addNote(contactId: string, authorId: string | undefined, content: string) {
  return getPrisma().contactNote.create({
    data: { contact_id: contactId, author_id: authorId, content },
  });
}

export async function setTags(contactId: string, tagNames: string[]) {
  const tags = await Promise.all(
    tagNames.map((name) =>
      getPrisma().tag.upsert({ where: { name }, create: { name }, update: {} })
    )
  );
  await getPrisma().contactTag.deleteMany({ where: { contact_id: contactId } });
  await getPrisma().contactTag.createMany({
    data: tags.map((t) => ({ contact_id: contactId, tag_id: t.id })),
  });
  return getContact(contactId);
}

export async function timeline(contactId: string) {
  const contactIds = await resolveRelatedContactIds(contactId);
  return getPrisma().conversation.findMany({
    where: { contact_id: { in: contactIds } },
    orderBy: { created_at: "desc" },
    take: 100,
    include: { channel: true, queue: true },
  });
}

async function resolveRelatedContactIds(contactId: string): Promise<string[]> {
  const contact = await getPrisma().contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new HttpError(404, "Not found");

  const orConditions: Prisma.ContactWhereInput[] = [{ id: contactId }];
  const phoneVariants = new Set<string>();

  for (const raw of [contact.phone, contact.phone_wa]) {
    for (const variant of phoneCandidates(raw)) phoneVariants.add(variant);
    const canonical = canonicalPhone(raw);
    if (canonical) phoneVariants.add(canonical);
  }

  const phones = [...phoneVariants].filter(Boolean);
  if (phones.length) {
    orConditions.push({ phone: { in: phones } }, { phone_wa: { in: phones } });
  }

  const email = contact.email?.trim();
  if (email) {
    orConditions.push({ email: { equals: email, mode: "insensitive" } });
  }

  const teamsId = contact.teams_id?.trim();
  if (teamsId) {
    orConditions.push({ teams_id: teamsId });
  }

  const related = await getPrisma().contact.findMany({
    where: { OR: orConditions },
    select: { id: true },
  });

  return [...new Set(related.map((row) => row.id))];
}

function voiceCallPreview(direction: string, durationSeconds: number | null, state: string): string {
  const dir = direction === "outbound" ? "Saliente" : "Entrante";
  const duration = durationSeconds != null && durationSeconds > 0 ? ` · ${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s` : "";
  if (state === "ended") return `${dir}${duration}`.trim();
  if (state === "active") return `${dir} · en curso`;
  if (state === "ringing") return `${dir} · timbrando`;
  return dir;
}

async function fetchRecentMessagesByConversation(
  conversationIds: string[],
  perConv: number
): Promise<Map<string, ContactInteractionMessageDto[]>> {
  const map = new Map<string, ContactInteractionMessageDto[]>();
  if (!conversationIds.length || perConv <= 0) return map;

  const rows = await getPrisma().$queryRaw<
    Array<{
      conversation_id: string;
      content: string;
      created_at: Date;
      sender_type: string;
      content_type: string;
    }>
  >(Prisma.sql`
    SELECT conversation_id, content, created_at, sender_type, content_type
    FROM (
      SELECT
        m.conversation_id,
        m.content,
        m.created_at,
        m.sender_type::text AS sender_type,
        m.content_type::text AS content_type,
        ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.created_at DESC) AS rn
      FROM messages m
      WHERE m.conversation_id IN (${Prisma.join(conversationIds)})
        AND m.is_internal = false
        AND m.content_type::text <> 'SYSTEM_EVENT'
    ) ranked
    WHERE ranked.rn <= ${perConv}
    ORDER BY conversation_id ASC, created_at ASC
  `);

  for (const row of rows) {
    const list = map.get(row.conversation_id) ?? [];
    list.push({
      content: row.content,
      created_at: row.created_at.toISOString(),
      sender_type: row.sender_type,
      content_type: row.content_type,
    });
    map.set(row.conversation_id, list);
  }

  return map;
}

export async function getContactInteractions(
  contactId: string,
  options?: { limit?: number; messagesPerConversation?: number }
): Promise<ContactInteractionsResult> {
  const limit = Math.min(Math.max(options?.limit ?? 8, 1), 100);
  const messagesPerConversation = Math.min(Math.max(options?.messagesPerConversation ?? 3, 0), 10);
  const contactIds = await resolveRelatedContactIds(contactId);

  const [conversations, orphanVoiceCalls] = await Promise.all([
    getPrisma().conversation.findMany({
      where: { contact_id: { in: contactIds } },
      orderBy: [{ last_message_at: "desc" }, { created_at: "desc" }],
      take: 150,
      include: {
        channel: true,
        queue: true,
        _count: {
          select: {
            messages: {
              where: { is_internal: false, content_type: { not: "SYSTEM_EVENT" } },
            },
          },
        },
      },
    }),
    getPrisma().voiceCall.findMany({
      where: {
        contact_id: { in: contactIds },
        conversation_id: null,
      },
      orderBy: [{ ended_at: "desc" }, { started_at: "desc" }, { created_at: "desc" }],
      take: 50,
      include: { channel: true },
    }),
  ]);

  const conversationItems: ContactInteractionDto[] = conversations.map((conv) => ({
    id: `conv-${conv.id}`,
    kind: "conversation",
    occurred_at: (conv.last_message_at ?? conv.created_at).toISOString(),
    channel_type: conv.channel.type,
    status: conv.status,
    preview: conv.last_message_preview ?? conv.subject ?? null,
    conversation_id: conv.id,
    subject: conv.subject,
    duration_seconds: conv.handle_time_seconds,
    direction: null,
    queue_name: conv.queue?.name ?? null,
    csat_score: conv.csat_score,
    handle_time_seconds: conv.handle_time_seconds,
    message_count: conv._count.messages,
    recent_messages: null,
  }));

  const voiceItems: ContactInteractionDto[] = orphanVoiceCalls.map((call) => ({
    id: `voice-${call.id}`,
    kind: "voice_call",
    occurred_at: (call.ended_at ?? call.started_at ?? call.created_at).toISOString(),
    channel_type: call.channel?.type ?? "VOICE",
    status: call.state === "ended" ? "RESOLVED" : call.state === "ringing" ? "WAITING" : "ACTIVE",
    preview: voiceCallPreview(call.direction, call.duration_seconds, call.state),
    conversation_id: null,
    subject: call.remote_display_name ?? call.remote_uri,
    duration_seconds: call.duration_seconds,
    direction: call.direction,
    queue_name: null,
    csat_score: null,
    handle_time_seconds: call.duration_seconds,
    message_count: null,
    recent_messages: null,
  }));

  const allItems = [...conversationItems, ...voiceItems].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
  );

  const slicedItems = allItems.slice(0, limit);
  const conversationIdsForMessages = slicedItems
    .filter((item) => item.kind === "conversation" && item.conversation_id)
    .map((item) => item.conversation_id!);

  const recentMessagesByConversation = await fetchRecentMessagesByConversation(
    conversationIdsForMessages,
    messagesPerConversation
  );

  for (const item of slicedItems) {
    if (item.kind !== "conversation" || !item.conversation_id) continue;
    item.recent_messages = recentMessagesByConversation.get(item.conversation_id) ?? [];
  }

  const stats = {
    total_interactions: allItems.length,
    active_count: allItems.filter((item) =>
      ONGOING_STATUSES.includes(item.status as (typeof ONGOING_STATUSES)[number])
    ).length,
    avg_csat: (() => {
      const scores = conversations.map((c) => c.csat_score).filter((s): s is number => s != null);
      if (!scores.length) return null;
      return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    })(),
    avg_handle_time_minutes: (() => {
      const times = conversations
        .map((c) => c.handle_time_seconds)
        .filter((t): t is number => t != null && t > 0);
      if (!times.length) return null;
      const avgSeconds = times.reduce((a, b) => a + b, 0) / times.length;
      return Math.round((avgSeconds / 60) * 10) / 10;
    })(),
  };

  return {
    contact_ids: contactIds,
    merged_contact_count: contactIds.length,
    items: slicedItems,
    stats,
  };
}
