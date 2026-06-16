-- PBX host unificado para derivar sip_server (WSS) y ariBaseUrl (ARI)
ALTER TABLE "organization_settings"
ADD COLUMN     "pbx_host" TEXT,
ADD COLUMN     "pbx_wss_port" INTEGER NOT NULL DEFAULT 8089,
ADD COLUMN     "pbx_ari_port" INTEGER NOT NULL DEFAULT 8074;

-- Backfill desde configuración existente
UPDATE "organization_settings"
SET
  "pbx_host" = COALESCE(
    NULLIF(regexp_replace(COALESCE("sip_server", ''), '^wss?://([^:/]+).*$', '\1'), ''),
    NULLIF(regexp_replace(COALESCE("sip_server", ''), '^https?://([^:/]+).*$', '\1'), '')
  ),
  "pbx_wss_port" = CASE
    WHEN "sip_server" ~ '^wss?://[^:]+:([0-9]+)' THEN (regexp_match("sip_server", '^wss?://[^:]+:([0-9]+)'))[1]::INTEGER
    ELSE 8089
  END
WHERE "id" = 'default' AND "pbx_host" IS NULL AND "sip_server" IS NOT NULL;
