import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { canonicalPhone } from "../src/lib/phone.js";

const prisma = new PrismaClient();

type ContactLite = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  phone_wa: string | null;
  external_id: string | null;
  source_system: string | null;
  created_at: Date;
  _count: { conversations: number };
};

function contactScore(c: ContactLite): number {
  let score = 0;
  if (c.external_id) score += 20;
  if (c.source_system) score += 10;
  if (c.name) score += 4;
  if (c.email) score += 4;
  score += c._count.conversations;
  return score;
}

function keyForContact(c: ContactLite): string | null {
  return canonicalPhone(c.phone_wa ?? c.phone);
}

async function mergeContactInto(primary: ContactLite, duplicate: ContactLite): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.conversation.updateMany({
      where: { contact_id: duplicate.id },
      data: { contact_id: primary.id },
    });

    const dupTags = await tx.contactTag.findMany({ where: { contact_id: duplicate.id } });
    for (const tag of dupTags) {
      await tx.contactTag.upsert({
        where: { contact_id_tag_id: { contact_id: primary.id, tag_id: tag.tag_id } },
        create: { contact_id: primary.id, tag_id: tag.tag_id },
        update: {},
      });
    }

    await tx.contactNote.updateMany({
      where: { contact_id: duplicate.id },
      data: { contact_id: primary.id },
    });

    await tx.contact.update({
      where: { id: primary.id },
      data: {
        name: primary.name ?? duplicate.name ?? undefined,
        email: primary.email ?? duplicate.email ?? undefined,
        phone: canonicalPhone(primary.phone ?? duplicate.phone) ?? undefined,
        phone_wa: canonicalPhone(primary.phone_wa ?? duplicate.phone_wa ?? primary.phone ?? duplicate.phone) ?? undefined,
        external_id: primary.external_id ?? duplicate.external_id ?? undefined,
        source_system: primary.source_system ?? duplicate.source_system ?? undefined,
      },
    });

    await tx.contact.delete({ where: { id: duplicate.id } });
  });
}

async function main() {
  const contacts = await prisma.contact.findMany({
    include: { _count: { select: { conversations: true } } },
    orderBy: { created_at: "asc" },
  });

  let normalized = 0;
  for (const c of contacts) {
    const nPhone = canonicalPhone(c.phone);
    const nWa = canonicalPhone(c.phone_wa ?? c.phone);
    if (nPhone !== c.phone || nWa !== c.phone_wa) {
      await prisma.contact.update({
        where: { id: c.id },
        data: {
          phone: nPhone ?? undefined,
          phone_wa: nWa ?? undefined,
        },
      });
      normalized += 1;
    }
  }

  const refreshed = await prisma.contact.findMany({
    include: { _count: { select: { conversations: true } } },
    orderBy: { created_at: "asc" },
  });

  const groups = new Map<string, ContactLite[]>();
  for (const c of refreshed) {
    const key = keyForContact(c);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }

  let merged = 0;
  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => {
      const diff = contactScore(b) - contactScore(a);
      if (diff !== 0) return diff;
      return a.created_at.getTime() - b.created_at.getTime();
    });
    const primary = sorted[0];
    for (const dup of sorted.slice(1)) {
      await mergeContactInto(primary, dup);
      merged += 1;
    }
  }

  console.log(`Listo: normalizados ${normalized} contactos; fusionados ${merged} duplicados por teléfono.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
