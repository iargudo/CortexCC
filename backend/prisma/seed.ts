import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { applyTenantBaseline } from "../src/bootstrap/tenantBaseline.js";

function buildTenantDatabaseUrl(): string {
  const host = process.env.TENANT_DB_HOST?.trim();
  const port = process.env.TENANT_DB_PORT?.trim() ?? "5432";
  const user = process.env.TENANT_DB_USER?.trim();
  const password = process.env.TENANT_DB_PASSWORD?.trim();
  const name = process.env.TENANT_DB_NAME?.trim();

  if (host && user && password && name) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) return databaseUrl;

  throw new Error("Set TENANT_DB_* or DATABASE_URL for seed:tenant");
}

const prisma = new PrismaClient({
  datasources: { db: { url: buildTenantDatabaseUrl() } },
});

async function main() {
  await applyTenantBaseline(prisma, {
    companyName: "Cortex Contact",
    timezone: "America/Guayaquil",
  });

  await prisma.organizationSettings.update({
    where: { id: "default" },
    data: {
      sip_server: "wss://localhost:8089/ws",
      sip_realm: "localhost",
      pbx_host: "localhost",
      pbx_wss_port: 8089,
      pbx_ari_port: 8074,
      sip_display_name: "Cortex Agent",
    },
  });

  const roles = await Promise.all(
    ["admin", "supervisor", "agent"].map((name) => prisma.role.findUniqueOrThrow({ where: { name } }))
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
  const voiceConfig = {
    provider: "asterisk_ari",
    ariBaseUrl: "http://localhost:8074",
    ariApp: "cortexcc",
    ariUsername: "cortexcc",
    ariPassword: "Admin123!",
    callerIdField: "channel.caller.number",
    dialedNumberField: "channel.dialplan.exten",
    extensionField: "endpoint",
    pollFallbackSec: 15,
    outboundTrunkEndpoint: "PJSIP/carrier-trunk",
    outboundContext: "outbound-trunk",
    defaultCallerId: "CortexCC",
    agentEndpointTemplate: "PJSIP/{extension}",
    ringTimeoutSec: 30,
    mohClass: "default",
    recordingEnabled: false,
  };
  for (const t of channelTypes) {
    await prisma.channel.upsert({
      where: { id: `seed-channel-${t}` },
      create: {
        id: `seed-channel-${t}`,
        name: `${t} channel`,
        type: t,
        status: "active",
        config: t === "VOICE" ? voiceConfig : {},
      },
      update: t === "VOICE" ? { config: voiceConfig, status: "active" } : {},
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
  const voice = await prisma.channel.findFirst({ where: { type: "VOICE" } });
  if (voice) {
    await prisma.queueChannel.upsert({
      where: { queue_id_channel_id: { queue_id: queue.id, channel_id: voice.id } },
      create: { queue_id: queue.id, channel_id: voice.id },
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
    await prisma.user.update({
      where: { id: agentUser.id },
      data: { sip_extension: "7001", sip_password: "7001pass" },
    });
  }

  const integrationApps = [
    {
      id: "seed-intapp-crm",
      key: "crm_snapshot",
      name: "CRM",
      icon: "UserCircle2",
      mode: "SNAPSHOT" as const,
      config: {
        view_mode: "INLINE",
        cards: [
          { label: "Nivel cliente", value: "{{contact.tags.0|default:Standard}}" },
          { label: "Origen", value: "{{contact.source_system|default:direct}}" },
        ],
      },
    },
    {
      id: "seed-intapp-collect",
      key: "collect_console",
      name: "Cobranza",
      icon: "Wallet",
      mode: "EMBED" as const,
      base_url: "https://cortexcollect.example.com",
      config: {
        view_mode: "MODAL",
        embed_path_template:
          "/workspace?conversation={{conversation.id}}&contact={{contact.id}}&source={{conversation.source}}",
      },
    },
    {
      id: "seed-intapp-maps",
      key: "geo_map",
      name: "Mapa",
      icon: "MapPinned",
      mode: "EMBED" as const,
      base_url: "https://maps.google.com",
      config: { embed_path_template: "/maps?q={{contact.phone|default:Ecuador}}" },
    },
  ];

  for (const app of integrationApps) {
    await prisma.integrationApp.upsert({
      where: { key: app.key },
      create: {
        id: app.id,
        key: app.key,
        name: app.name,
        icon: app.icon,
        mode: app.mode,
        base_url: app.base_url,
        config: app.config,
        is_active: true,
      },
      update: {
        name: app.name,
        icon: app.icon,
        mode: app.mode,
        base_url: app.base_url,
        config: app.config,
        is_active: true,
      },
    });
  }

  await prisma.integrationAppBinding.upsert({
    where: { id: "seed-bind-crm-global" },
    create: {
      id: "seed-bind-crm-global",
      app_id: "seed-intapp-crm",
      scope_type: "GLOBAL",
      placement: "right_rail",
      sort_order: 10,
      is_visible: true,
    },
    update: { is_visible: true, sort_order: 10 },
  });

  await prisma.integrationAppBinding.upsert({
    where: { id: "seed-bind-collect-whatsapp" },
    create: {
      id: "seed-bind-collect-whatsapp",
      app_id: "seed-intapp-collect",
      scope_type: "CHANNEL",
      scope_id: "WHATSAPP",
      placement: "right_rail",
      sort_order: 20,
      is_visible: true,
      rules: { sources: ["agenthub_escalation", "collect_escalation"] },
    },
    update: { is_visible: true, sort_order: 20 },
  });

  await prisma.integrationAppBinding.upsert({
    where: { id: "seed-bind-maps-voice" },
    create: {
      id: "seed-bind-maps-voice",
      app_id: "seed-intapp-maps",
      scope_type: "CHANNEL",
      scope_id: "VOICE",
      placement: "right_rail",
      sort_order: 30,
      is_visible: true,
    },
    update: { is_visible: true, sort_order: 30 },
  });

  console.log("Seed demo local completado (baseline + datos de laboratorio).");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
