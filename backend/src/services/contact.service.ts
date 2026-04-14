import { prisma } from "../lib/prisma.js";
import { canonicalPhone } from "../lib/phone.js";
import { HttpError } from "../middleware/errorHandler.js";
import { mapContact } from "./conversationMapper.js";

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
    prisma.contact.findMany({
      where,
      include: { tags: { include: { tag: true } } },
      skip,
      take: limit,
      orderBy: { updated_at: "desc" },
    }),
    prisma.contact.count({ where }),
  ]);
  return { data: rows.map(mapContact), meta: { page, limit, total } };
}

export async function getContact(id: string) {
  const c = await prisma.contact.findUnique({
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
          const t = await prisma.tag.upsert({
            where: { name },
            create: { name },
            update: {},
          });
          return t;
        })
      )
    : [];

  const c = await prisma.contact.create({
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
  const c = await prisma.contact.update({
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
  await prisma.contact.delete({ where: { id } });
}

export async function mergeContacts(sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new HttpError(400, "Cannot merge same contact");
  const [src, tgt] = await Promise.all([
    prisma.contact.findUnique({ where: { id: sourceId }, include: { tags: true } }),
    prisma.contact.findUnique({ where: { id: targetId }, include: { tags: true } }),
  ]);
  if (!src || !tgt) throw new HttpError(404, "Contact not found");

  await prisma.$transaction(async (tx) => {
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

  const merged = await prisma.contact.findUnique({
    where: { id: targetId },
    include: { tags: { include: { tag: true } } },
  });
  return mapContact(merged!);
}

export async function listNotes(contactId: string) {
  return prisma.contactNote.findMany({
    where: { contact_id: contactId },
    orderBy: { created_at: "desc" },
    include: { author: { select: { first_name: true, last_name: true, email: true } } },
  });
}

export async function addNote(contactId: string, authorId: string | undefined, content: string) {
  return prisma.contactNote.create({
    data: { contact_id: contactId, author_id: authorId, content },
  });
}

export async function setTags(contactId: string, tagNames: string[]) {
  const tags = await Promise.all(
    tagNames.map((name) =>
      prisma.tag.upsert({ where: { name }, create: { name }, update: {} })
    )
  );
  await prisma.contactTag.deleteMany({ where: { contact_id: contactId } });
  await prisma.contactTag.createMany({
    data: tags.map((t) => ({ contact_id: contactId, tag_id: t.id })),
  });
  return getContact(contactId);
}

export async function timeline(contactId: string) {
  return prisma.conversation.findMany({
    where: { contact_id: contactId },
    orderBy: { created_at: "desc" },
    take: 100,
    include: { channel: true, queue: true },
  });
}
