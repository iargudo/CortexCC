-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "sip_display_name" TEXT,
ADD COLUMN     "sip_ice_gathering_timeout" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "sip_realm" TEXT,
ADD COLUMN     "sip_server" TEXT,
ADD COLUMN     "sip_stun_servers" TEXT[] DEFAULT ARRAY['stun:stun.l.google.com:19302']::TEXT[];

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "sip_extension" TEXT,
ADD COLUMN     "sip_password" TEXT;
