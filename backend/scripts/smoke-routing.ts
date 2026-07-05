import "dotenv/config";
import { ensureConnection, disconnectAllTenants, disconnectMaster } from "../src/lib/tenantConnectionManager.js";
import { runWithTenant } from "../src/lib/tenantContext.js";
import { getPrisma } from "../src/lib/prisma.js";
import { getRedis } from "../src/lib/redis.js";
import { ingestIncomingMessage } from "../src/services/inbound.service.js";
import { RoutingEngine } from "../src/routing/RoutingEngine.js";
import { canonicalPhone } from "../src/lib/phone.js";

/**
 * Smoke test end-to-end del enrutamiento de dos niveles:
 *  - Nivel 1: Round Robin cíclico entre las coordinaciones (rotation_group).
 *  - Nivel 2: asignación al agente dentro de la coordinación (RoutingEngine).
 *
 * Simula N ingresos de WhatsApp (contactos distintos), enruta cada conversación
 * y reporta el reparto por coordinación y por agente. Limpia sus propios datos
 * de prueba al terminar (usar --keep para conservarlos).
 *
 * Uso:
 *   npm run smoke:routing            (tenant "local", 9 ingresos)
 *   tsx scripts/smoke-routing.ts <tenantKey> <n> [--keep]
 */

const ROTATION_GROUP = "ventas_puntonet";

const tenantKey = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "local";
const nArg = Number(process.argv[3]);
const N = Number.isFinite(nArg) && nArg > 0 ? Math.floor(nArg) : 9;
const KEEP = process.argv.includes("--keep");

function bar(count: number, max: number, width = 24): string {
  if (max <= 0) return "";
  return "█".repeat(Math.max(1, Math.round((count / max) * width)));
}

async function run(): Promise<void> {
  const info = await ensureConnection(tenantKey);
  console.log(`\n== Smoke routing · tenant "${info.name}" (${info.key}) · ${N} ingresos ==\n`);

  await runWithTenant(info.key, info.name, async () => {
    const prisma = getPrisma();
    const redis = getRedis();
    const engine = new RoutingEngine(prisma, null);

    // Reinicia el cursor RR para que el reparto empiece limpio.
    await redis.del(`rr:coordination:${info.key}:${ROTATION_GROUP}`);

    const rotationQueues = await prisma.queue.findMany({
      where: { rotation_group: ROTATION_GROUP, is_active: true },
      orderBy: [{ rotation_order: "asc" }, { id: "asc" }],
      select: { id: true, name: true, team_id: true },
    });
    if (rotationQueues.length === 0) {
      throw new Error(`No hay colas activas en el grupo de rotación "${ROTATION_GROUP}". ¿Corriste el setup del MVP?`);
    }
    console.log("Coordinaciones en rotación:");
    rotationQueues.forEach((q, i) => console.log(`  ${i + 1}. ${q.name}`));

    const channel = await prisma.channel.findFirst({ where: { type: "WHATSAPP", status: "active" } });
    if (!channel) throw new Error("No hay canal WhatsApp activo. ¿Corriste el setup del MVP?");
    console.log(`\nCanal de entrada: ${channel.name}\n`);

    // Pone ONLINE a los miembros de las coordinaciones (así el nivel 2 puede asignar).
    const teamIds = [...new Set(rotationQueues.map((q) => q.team_id).filter(Boolean))] as string[];
    const members = await prisma.teamMember.findMany({
      where: { team_id: { in: teamIds } },
      select: { user_id: true },
    });
    const memberIds = [...new Set(members.map((m) => m.user_id))];
    const previousStatuses = await prisma.user.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, status: true },
    });
    await prisma.user.updateMany({ where: { id: { in: memberIds } }, data: { status: "ONLINE" } });

    // Simula ingresos de WhatsApp con contactos distintos.
    const phones: string[] = [];
    const conversationIds: string[] = [];
    for (let i = 1; i <= N; i++) {
      const localPhone = `0999${String(100000 + i)}`; // 10 dígitos, EC
      phones.push(localPhone);
      const res = await ingestIncomingMessage(channel.id, {
        external_id: `smoke-${Date.now()}-${i}`,
        contact_identifier: localPhone,
        contact_name: `Lead Prueba ${i}`,
        content: `Hola, quiero información de planes de internet (${i})`,
        content_type: "text",
        timestamp: new Date(),
      });
      conversationIds.push(res.conversation_id);
    }

    // Nivel 2: enruta cada conversación al mejor agente de su coordinación.
    for (const id of conversationIds) {
      await engine.routeConversation(id);
    }

    // Reporte del reparto.
    const convs = await prisma.conversation.findMany({
      where: { id: { in: conversationIds } },
      select: {
        id: true,
        status: true,
        queue: { select: { name: true } },
        assignments: {
          where: { ended_at: null },
          select: { user: { select: { first_name: true, last_name: true, email: true } } },
        },
      },
    });

    const byQueue = new Map<string, number>();
    const byAgent = new Map<string, number>();
    let assigned = 0;
    let waiting = 0;
    for (const c of convs) {
      const qn = c.queue?.name ?? "(sin cola)";
      byQueue.set(qn, (byQueue.get(qn) ?? 0) + 1);
      const a = c.assignments[0]?.user;
      if (a) {
        assigned++;
        const an = `${a.first_name} ${a.last_name}`.trim() || a.email;
        byAgent.set(an, (byAgent.get(an) ?? 0) + 1);
      } else {
        waiting++;
      }
    }

    const maxQ = Math.max(...[...byQueue.values()], 1);
    console.log("── Nivel 1 · Reparto por coordinación (Round Robin) ──");
    for (const q of rotationQueues) {
      const c = byQueue.get(q.name) ?? 0;
      console.log(`  ${q.name.padEnd(24)} ${String(c).padStart(2)}  ${bar(c, maxQ)}`);
    }

    console.log("\n── Nivel 2 · Reparto por agente (dentro de cada coordinación) ──");
    const maxA = Math.max(...[...byAgent.values()], 1);
    if (byAgent.size === 0) {
      console.log("  (ninguna conversación fue asignada a un agente)");
    } else {
      for (const [name, c] of [...byAgent.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${name.padEnd(24)} ${String(c).padStart(2)}  ${bar(c, maxA)}`);
      }
    }

    console.log(`\nTotal: ${convs.length} conversaciones · asignadas: ${assigned} · en espera: ${waiting}`);

    // Limpieza de datos de prueba.
    if (!KEEP) {
      const canonicals = phones.map((p) => canonicalPhone(p)).filter(Boolean) as string[];
      await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
      await prisma.contact.deleteMany({ where: { phone_wa: { in: canonicals } } });
      await redis.del(`rr:coordination:${info.key}:${ROTATION_GROUP}`);
      for (const u of previousStatuses) {
        await prisma.user.update({ where: { id: u.id }, data: { status: u.status } });
      }
      console.log("\nDatos de prueba eliminados y estados de agentes restaurados.");
    } else {
      console.log("\n--keep: se conservaron las conversaciones de prueba.");
    }
  });
}

run()
  .then(async () => {
    await disconnectAllTenants();
    await disconnectMaster();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("\nSmoke routing falló:", err);
    await disconnectAllTenants().catch(() => {});
    await disconnectMaster().catch(() => {});
    process.exit(1);
  });
