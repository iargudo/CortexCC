import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
const cachedPrisma = globalForPrisma.prisma as (PrismaClient & { voiceCall?: unknown }) | undefined;
const isCachedClientCompatible = cachedPrisma ? typeof cachedPrisma.voiceCall !== "undefined" : false;

export const prisma =
  (isCachedClientCompatible ? cachedPrisma : undefined) ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? process.env.PRISMA_LOG_QUERIES === "true"
          ? ["query", "error", "warn"]
          : ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
