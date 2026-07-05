-- AlterEnum
ALTER TYPE "AgentStatus" ADD VALUE IF NOT EXISTS 'FOLLOW_UP';

-- AlterTable
ALTER TABLE "queues" ADD COLUMN "rotation_group" TEXT;
ALTER TABLE "queues" ADD COLUMN "rotation_order" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "sales_won" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "sales_total" INTEGER NOT NULL DEFAULT 0;

-- Index to resolve rotation members quickly
CREATE INDEX "queues_rotation_group_rotation_order_idx" ON "queues" ("rotation_group", "rotation_order");
