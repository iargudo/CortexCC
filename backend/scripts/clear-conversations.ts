/**
 * Borra todas las conversaciones y registros en cascada (mensajes, asignaciones, transferencias, etc.).
 * No borra contactos, colas, usuarios ni configuración.
 *
 * Uso: desde backend/ → npx tsx scripts/clear-conversations.ts
 *      o npm run db:clear-conversations
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.conversation.deleteMany({});
  console.log(`Listo: eliminadas ${result.count} conversaciones (cascada: mensajes, adjuntos, asignaciones, transferencias, evaluaciones de calidad).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
