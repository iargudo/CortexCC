import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password.js";

const ROTATION_GROUP = "ventas_puntonet";

/** Horario de ventas (usado por la auto-respuesta de fuera de horario de la cola). */
const SALES_SCHEDULE = {
  timezone: "America/Guayaquil",
  mon: { open: "08:00", close: "20:00" },
  tue: { open: "08:00", close: "20:00" },
  wed: { open: "08:00", close: "20:00" },
  thu: { open: "08:00", close: "20:00" },
  fri: { open: "08:00", close: "20:00" },
  sat: { open: "09:00", close: "14:00" },
  sun: null,
} as const;

export type PuntonetSetupResult = {
  ok: true;
  rotation_group: string;
  coordinations: number;
  default_password: string;
};

/** Configuración operativa Puntonet (requiere tenantBaseline previo). */
export async function runPuntonetSetup(
  databaseUrl: string,
  defaultPassword = "PuntonetVentas2026!"
): Promise<PuntonetSetupResult> {
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {

  await prisma.organizationSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      company_name: "Puntonet",
      timezone: "America/Guayaquil",
      language: "es",
      default_country_code: "EC",
      sip_display_name: "Puntonet Ventas",
      sip_extension_range_start: 7001,
      sip_extension_range_end: 7099,
    },
    update: {
      company_name: "Puntonet",
      timezone: "America/Guayaquil",
      language: "es",
      default_country_code: "EC",
      sip_display_name: "Puntonet Ventas",
    },
  });

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "admin" } });
  const supervisorRole = await prisma.role.findUniqueOrThrow({ where: { name: "supervisor" } });
  const coordinatorRole = await prisma.role.findUniqueOrThrow({ where: { name: "coordinator" } });
  const agentRole = await prisma.role.findUniqueOrThrow({ where: { name: "agent" } });

  // --- Skills (mismo perfil para las 3 coordinaciones) ---
  const skills = await Promise.all([
    prisma.skill.upsert({
      where: { name: "ventas" },
      create: { name: "ventas", category: "tema" },
      update: {},
    }),
    prisma.skill.upsert({
      where: { name: "planes_internet" },
      create: { name: "planes_internet", category: "producto" },
      update: {},
    }),
    prisma.skill.upsert({
      where: { name: "puntonet" },
      create: { name: "puntonet", category: "marca" },
      update: {},
    }),
  ]);

  const sla = await prisma.slaPolicy.upsert({
    where: { name: "Ventas Puntonet" },
    create: {
      name: "Ventas Puntonet",
      first_response_seconds: 120,
      resolution_seconds: 3600,
      warning_threshold_pct: 80,
    },
    update: { first_response_seconds: 120, resolution_seconds: 3600 },
  });

  await prisma.businessHours.upsert({
    where: { name: "Horario Puntonet" },
    create: {
      name: "Horario Puntonet",
      timezone: "America/Guayaquil",
      schedule: {
        mon: { open: "08:00", close: "20:00" },
        tue: { open: "08:00", close: "20:00" },
        wed: { open: "08:00", close: "20:00" },
        thu: { open: "08:00", close: "20:00" },
        fri: { open: "08:00", close: "20:00" },
        sat: { open: "09:00", close: "14:00" },
        sun: null,
      },
    },
    update: { timezone: "America/Guayaquil" },
  });

  // --- 3 coordinaciones (equipos) + colas en rotación Round Robin ---
  const coordinationDefs = [
    { order: 1, teamName: "Coordinación 1", queueName: "Ventas Coordinación 1" },
    { order: 2, teamName: "Coordinación 2", queueName: "Ventas Coordinación 2" },
    { order: 3, teamName: "Coordinación 3", queueName: "Ventas Coordinación 3" },
  ];

  const coordinations: { order: number; teamId: string; queueId: string }[] = [];
  for (const def of coordinationDefs) {
    const team = await prisma.team.upsert({
      where: { name: def.teamName },
      create: { name: def.teamName, description: "Televentas Puntonet — planes de internet" },
      update: { description: "Televentas Puntonet — planes de internet" },
    });

    const queue = await prisma.queue.upsert({
      where: { name: def.queueName },
      create: {
        name: def.queueName,
        description: `Ventas de planes de internet — ${def.teamName}`,
        team_id: team.id,
        priority: 3,
        // Nivel 2: dentro de la coordinación prioriza por tasa de conversión.
        routing_strategy: "PRIORITY_BASED",
        max_wait_seconds: 300,
        sla_policy_id: sla.id,
        is_active: true,
        // Nivel 1: rotación cíclica entre coordinaciones.
        rotation_group: ROTATION_GROUP,
        rotation_order: def.order,
        schedule: SALES_SCHEDULE,
        out_of_hours_message:
          "Gracias por contactar a Puntonet. Nuestro horario de ventas es lun–vie 08:00–20:00 y sáb 09:00–14:00.",
      },
      update: {
        description: `Ventas de planes de internet — ${def.teamName}`,
        team_id: team.id,
        routing_strategy: "PRIORITY_BASED",
        sla_policy_id: sla.id,
        is_active: true,
        rotation_group: ROTATION_GROUP,
        rotation_order: def.order,
        schedule: SALES_SCHEDULE,
      },
    });

    for (const skill of skills) {
      await prisma.queueSkill.upsert({
        where: { queue_id_skill_id: { queue_id: queue.id, skill_id: skill.id } },
        create: {
          queue_id: queue.id,
          skill_id: skill.id,
          min_level: skill.name === "planes_internet" ? 5 : 3,
          mandatory: skill.name === "planes_internet",
        },
        update: {
          min_level: skill.name === "planes_internet" ? 5 : 3,
          mandatory: skill.name === "planes_internet",
        },
      });
    }

    coordinations.push({ order: def.order, teamId: team.id, queueId: queue.id });
  }

  // --- Canales de entrada (MVP: mensajería). WhatsApp vía 360Dialog: 2 activos + 1 backup ---
  const channelDefs = [
    {
      id: "puntonet-wa-pauta-a",
      name: "WhatsApp Pauta A (360Dialog)",
      type: "WHATSAPP" as const,
      status: "active",
      config: { provider: "360dialog", apiKey: "", phoneNumberId: "" },
    },
    {
      id: "puntonet-wa-pauta-b",
      name: "WhatsApp Pauta B (360Dialog)",
      type: "WHATSAPP" as const,
      status: "active",
      config: { provider: "360dialog", apiKey: "", phoneNumberId: "" },
    },
    {
      id: "puntonet-wa-backup",
      name: "WhatsApp Backup (360Dialog)",
      type: "WHATSAPP" as const,
      status: "inactive",
      config: { provider: "360dialog", apiKey: "", phoneNumberId: "" },
    },
    {
      id: "puntonet-webchat",
      name: "Webchat Puntonet",
      type: "WEBCHAT" as const,
      status: "active",
      config: {},
    },
  ];

  for (const ch of channelDefs) {
    await prisma.channel.upsert({
      where: { id: ch.id },
      create: { id: ch.id, name: ch.name, type: ch.type, status: ch.status, config: ch.config },
      update: { name: ch.name, status: ch.status, config: ch.config },
    });
    // Cada canal alimenta a las 3 coordinaciones (así el dispatcher detecta el grupo de rotación).
    for (const coord of coordinations) {
      await prisma.queueChannel.upsert({
        where: { queue_id_channel_id: { queue_id: coord.queueId, channel_id: ch.id } },
        create: { queue_id: coord.queueId, channel_id: ch.id },
        update: {},
      });
    }
  }

  // --- Disposiciones (is_conversion marca qué cuenta como venta ganada) ---
  const dispositions = [
    { name: "Venta cerrada", category: "venta", requires_note: false, is_conversion: true },
    { name: "Cotización enviada", category: "venta", requires_note: true, is_conversion: false },
    { name: "Seguimiento comercial", category: "seguimiento", requires_note: true, is_conversion: false },
    { name: "Sin cobertura", category: "no_venta", requires_note: true, is_conversion: false },
    { name: "No interesado", category: "no_venta", requires_note: false, is_conversion: false },
  ];
  for (const d of dispositions) {
    await prisma.disposition.upsert({
      where: { name: d.name },
      create: { ...d, is_active: true },
      update: {
        category: d.category,
        requires_note: d.requires_note,
        is_conversion: d.is_conversion,
        is_active: true,
      },
    });
  }

  // --- Respuestas rápidas ---
  const quickReplies = [
    {
      shortcode: "/saludo",
      title: "Saludo Puntonet",
      content:
        "Hola, gracias por contactar a Puntonet. Soy su asesor comercial. ¿En qué plan de internet puedo ayudarle hoy?",
    },
    {
      shortcode: "/planes",
      title: "Planes internet",
      content:
        "Contamos con planes de internet hogar y empresa con velocidades simétricas y soporte local. ¿Desea plan residencial o corporativo?",
    },
    {
      shortcode: "/cobertura",
      title: "Verificar cobertura",
      content: "Para validar cobertura necesito su dirección exacta y ciudad. ¿Me puede compartir esos datos?",
    },
    {
      shortcode: "/contratacion",
      title: "Proceso de contratación",
      content:
        "El proceso es: 1) validación de cobertura, 2) elección del plan, 3) datos del titular, 4) instalación agendada.",
    },
    {
      shortcode: "/promo",
      title: "Promoción vigente",
      content: "Tenemos promociones de instalación en zonas con cobertura. Le confirmo beneficios según su ubicación.",
    },
  ];
  for (const qr of quickReplies) {
    const existing = await prisma.quickReply.findFirst({ where: { shortcode: qr.shortcode } });
    if (existing) {
      await prisma.quickReply.update({ where: { id: existing.id }, data: { title: qr.title, content: qr.content } });
    } else {
      await prisma.quickReply.create({ data: qr });
    }
  }

  const tags = [
    { name: "plan-hogar", color: "#2563EB" },
    { name: "plan-empresarial", color: "#7C3AED" },
    { name: "lead-caliente", color: "#DC2626" },
    { name: "requiere-cobertura", color: "#D97706" },
  ];
  for (const tag of tags) {
    await prisma.tag.upsert({ where: { name: tag.name }, create: tag, update: { color: tag.color } });
  }

  // --- Usuarios: jefatura (global), coordinadores (por equipo) y asesores ---
  const password_hash = await hashPassword(defaultPassword);

  async function upsertUser(params: {
    email: string;
    first_name: string;
    last_name: string;
    roleId: string;
  }): Promise<string> {
    const email = params.email.toLowerCase();
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        password_hash,
        first_name: params.first_name,
        last_name: params.last_name,
        status: "OFFLINE",
        max_concurrent: 5,
        roles: { create: [{ role_id: params.roleId }] },
      },
      update: {
        password_hash,
        first_name: params.first_name,
        last_name: params.last_name,
      },
    });
    // Rol autoritativo: deja exactamente el rol indicado (idempotente en re-seed).
    await prisma.userRole.deleteMany({ where: { user_id: user.id, role_id: { not: params.roleId } } });
    await prisma.userRole.upsert({
      where: { user_id_role_id: { user_id: user.id, role_id: params.roleId } },
      create: { user_id: user.id, role_id: params.roleId },
      update: {},
    });
    return user.id;
  }

  async function assignTeam(userId: string, teamId: string, role: "coordinator" | "member"): Promise<void> {
    await prisma.teamMember.upsert({
      where: { team_id_user_id: { team_id: teamId, user_id: userId } },
      create: { team_id: teamId, user_id: userId, role },
      update: { role },
    });
  }

  async function assignSkills(userId: string): Promise<void> {
    for (const skill of skills) {
      await prisma.userSkill.upsert({
        where: { user_id_skill_id: { user_id: userId, skill_id: skill.id } },
        create: { user_id: userId, skill_id: skill.id, proficiency: skill.name === "planes_internet" ? 9 : 8 },
        update: { proficiency: skill.name === "planes_internet" ? 9 : 8 },
      });
    }
  }

  // Administrador de la plataforma (acceso a Configuración / gestión de equipos).
  await upsertUser({
    email: "admin@puntonet.ec",
    first_name: "Administrador",
    last_name: "Puntonet",
    roleId: adminRole.id,
  });

  // Jefatura general: rol supervisor, sin equipo → alcance global.
  await upsertUser({
    email: "jefatura.ventas@puntonet.ec",
    first_name: "Jefatura",
    last_name: "Ventas",
    roleId: supervisorRole.id,
  });

  // Coordinadores: rol RBAC "coordinator" (capacidades) + TeamMember.role
  // "coordinator" (alcance a su equipo).
  for (const coord of coordinations) {
    const coordId = await upsertUser({
      email: `coordinacion${coord.order}@puntonet.ec`,
      first_name: `Coordinación ${coord.order}`,
      last_name: "Ventas",
      roleId: coordinatorRole.id,
    });
    await assignTeam(coordId, coord.teamId, "coordinator");
  }

  // Asesores: 2 por coordinación. Mantiene ventas@puntonet.ec como asesor de la Coordinación 1.
  const advisorDefs = [
    { email: "ventas@puntonet.ec", first_name: "Asesor", last_name: "Ventas 1", coordIndex: 0 },
    { email: "ventas2@puntonet.ec", first_name: "Asesor", last_name: "Ventas 2", coordIndex: 0 },
    { email: "ventas3@puntonet.ec", first_name: "Asesor", last_name: "Ventas 3", coordIndex: 1 },
    { email: "ventas4@puntonet.ec", first_name: "Asesor", last_name: "Ventas 4", coordIndex: 1 },
    { email: "ventas5@puntonet.ec", first_name: "Asesor", last_name: "Ventas 5", coordIndex: 2 },
    { email: "ventas6@puntonet.ec", first_name: "Asesor", last_name: "Ventas 6", coordIndex: 2 },
  ];
  for (const adv of advisorDefs) {
    const coord = coordinations[adv.coordIndex];
    const advisorId = await upsertUser({
      email: adv.email,
      first_name: adv.first_name,
      last_name: adv.last_name,
      roleId: agentRole.id,
    });
    await assignTeam(advisorId, coord.teamId, "member");
    await assignSkills(advisorId);
  }

    return {
      ok: true,
      rotation_group: ROTATION_GROUP,
      coordinations: coordinations.length,
      default_password: defaultPassword,
    };
  } finally {
    await prisma.$disconnect();
  }
}
