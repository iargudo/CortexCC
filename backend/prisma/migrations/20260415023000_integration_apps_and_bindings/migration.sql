-- CreateEnum
CREATE TYPE "IntegrationAppMode" AS ENUM ('SNAPSHOT', 'EMBED', 'ACTIONS');

-- CreateEnum
CREATE TYPE "IntegrationAuthType" AS ENUM ('NONE', 'API_KEY', 'OAUTH2', 'JWT');

-- CreateEnum
CREATE TYPE "IntegrationBindingScopeType" AS ENUM ('GLOBAL', 'CHANNEL', 'QUEUE', 'ROLE');

-- CreateTable
CREATE TABLE "integration_apps" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'Link',
    "mode" "IntegrationAppMode" NOT NULL DEFAULT 'SNAPSHOT',
    "auth_type" "IntegrationAuthType" NOT NULL DEFAULT 'NONE',
    "base_url" TEXT,
    "credentials_ref" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_app_bindings" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "scope_type" "IntegrationBindingScopeType" NOT NULL DEFAULT 'GLOBAL',
    "scope_id" TEXT,
    "placement" TEXT NOT NULL DEFAULT 'right_rail',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_app_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_apps_key_key" ON "integration_apps"("key");

-- CreateIndex
CREATE INDEX "integration_app_bindings_placement_is_visible_idx" ON "integration_app_bindings"("placement", "is_visible");

-- CreateIndex
CREATE INDEX "integration_app_bindings_scope_type_scope_id_idx" ON "integration_app_bindings"("scope_type", "scope_id");

-- AddForeignKey
ALTER TABLE "integration_app_bindings"
ADD CONSTRAINT "integration_app_bindings_app_id_fkey"
FOREIGN KEY ("app_id") REFERENCES "integration_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
