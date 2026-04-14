import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { defaultRolePermissions } from "../src/lib/permissions.js";

const prisma = new PrismaClient();

async function main() {
  await prisma.organizationSettings.upsert({
    where: { id: "default" },
    create: { id: "default", company_name: "Cortex Contact", timezone: "America/Guayaquil", language: "es" },
    update: {},
  });

  const roles = await Promise.all(
    ["admin", "supervisor", "agent"].map((name) =>
      prisma.role.upsert({
        where: { name },
        create: {
          name,
          permissions: defaultRolePermissions[name] ?? {},
        },
        update: { permissions: defaultRolePermissions[name] ?? {} },
      })
    )
  );
  const roleByName = Object.fromEntries(roles.map((r) => [r.name, r]));

  const password_hash = await bcrypt.hash("demo1234", 10);
  const usersData = [
    { email: "admin@cortex.local", first_name: "Admin", last_name: "User", role: "admin" },
    { email: "supervisor@cortex.local", first_name: "Super", last_name: "Visor", role: "supervisor" },
    { email: "agent@cortex.local", first_name: "Ana", last_name: "García", role: "agent" },
  ] as const;

  for (const u of usersData) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        password_hash,
        first_name: u.first_name,
        last_name: u.last_name,
        status: "ONLINE",
        roles: { create: [{ role_id: roleByName[u.role].id }] },
      },
      update: {
        password_hash,
        first_name: u.first_name,
        last_name: u.last_name,
      },
    });
  }

  const team = await prisma.team.upsert({
    where: { name: "Soporte" },
    create: { name: "Soporte", description: "Equipo general" },
    update: {},
  });

  const skills = await Promise.all([
    prisma.skill.upsert({
      where: { name: "ventas" },
      create: { name: "ventas", category: "tema" },
      update: {},
    }),
    prisma.skill.upsert({
      where: { name: "cobranza" },
      create: { name: "cobranza", category: "tema" },
      update: {},
    }),
  ]);

  const queue = await prisma.queue.upsert({
    where: { name: "General" },
    create: {
      name: "General",
      description: "Cola por defecto",
      team_id: team.id,
      routing_strategy: "LEAST_BUSY",
      max_wait_seconds: 300,
      is_active: true,
    },
    update: { team_id: team.id },
  });

  const channelTypes = ["WHATSAPP", "EMAIL", "TEAMS", "VOICE", "WEBCHAT"] as const;
  for (const t of channelTypes) {
    await prisma.channel.upsert({
      where: { id: `seed-channel-${t}` },
      create: {
        id: `seed-channel-${t}`,
        name: `${t} channel`,
        type: t,
        status: "active",
        config: {},
      },
      update: {},
    });
  }

  const wa = await prisma.channel.findFirst({ where: { type: "WHATSAPP" } });
  if (wa) {
    await prisma.queueChannel.upsert({
      where: { queue_id_channel_id: { queue_id: queue.id, channel_id: wa.id } },
      create: { queue_id: queue.id, channel_id: wa.id },
      update: {},
    });
  }

  for (const s of skills) {
    await prisma.queueSkill.upsert({
      where: { queue_id_skill_id: { queue_id: queue.id, skill_id: s.id } },
      create: { queue_id: queue.id, skill_id: s.id, min_level: 1, mandatory: false },
      update: {},
    });
  }

  await prisma.disposition.createMany({
    data: [
      { name: "Resuelto satisfactorio", category: "resuelto", requires_note: false },
      { name: "Seguimiento", category: "seguimiento", requires_note: true },
    ],
    skipDuplicates: true,
  });

  await prisma.quickReply.createMany({
    data: [
      { shortcode: "/saludo", title: "Saludo", content: "Hola, gracias por contactarnos." },
      { shortcode: "/horarios", title: "Horarios", content: "Nuestro horario es de 8am a 6pm." },
    ],
    skipDuplicates: true,
  });

  const agentUser = await prisma.user.findUnique({ where: { email: "agent@cortex.local" } });
  if (agentUser) {
    for (const s of skills) {
      await prisma.userSkill.upsert({
        where: { user_id_skill_id: { user_id: agentUser.id, skill_id: s.id } },
        create: { user_id: agentUser.id, skill_id: s.id, proficiency: 8 },
        update: { proficiency: 8 },
      });
    }
    await prisma.teamMember.upsert({
      where: { team_id_user_id: { team_id: team.id, user_id: agentUser.id } },
      create: { team_id: team.id, user_id: agentUser.id, role: "member" },
      update: {},
    });
  }

  console.log("Seed completed.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
