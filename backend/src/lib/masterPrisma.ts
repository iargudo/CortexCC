import { PrismaClient } from "@prisma/client-master";

const globalForMaster = globalThis as unknown as { masterPrisma: PrismaClient | undefined };

export const masterPrisma =
  globalForMaster.masterPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForMaster.masterPrisma = masterPrisma;
}
