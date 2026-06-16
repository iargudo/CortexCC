-- Voice contact center foundation

CREATE TYPE "TelephonyOutcome" AS ENUM ('ANSWERED', 'NO_ANSWER', 'BUSY', 'FAILED', 'CANCELLED');
CREATE TYPE "VoiceCallLegType" AS ENUM ('CALLER', 'AGENT', 'TRUNK');
CREATE TYPE "DialerCampaignMode" AS ENUM ('PREVIEW', 'PROGRESSIVE', 'PREDICTIVE');
CREATE TYPE "DialerCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "DialerContactStatus" AS ENUM ('PENDING', 'DIALING', 'CONTACTED', 'COMPLETED', 'DNC', 'FAILED');
CREATE TYPE "DialerSessionStatus" AS ENUM ('IDLE', 'PREVIEWING', 'DIALING', 'ON_CALL', 'WRAP_UP', 'PAUSED');

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sip_extension" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sip_password" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_sip_extension_key" ON "users"("sip_extension") WHERE "sip_extension" IS NOT NULL;

ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "sip_turn_servers" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "sip_extension_range_start" INTEGER NOT NULL DEFAULT 7001;
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "sip_extension_range_end" INTEGER NOT NULL DEFAULT 7099;

ALTER TABLE "conversation_assignments" ADD COLUMN IF NOT EXISTS "voice_call_id" TEXT;
ALTER TABLE "conversation_assignments" ADD COLUMN IF NOT EXISTS "ring_started_at" TIMESTAMP(3);
ALTER TABLE "conversation_assignments" ADD COLUMN IF NOT EXISTS "telephony_answered_at" TIMESTAMP(3);
ALTER TABLE "conversation_assignments" ADD COLUMN IF NOT EXISTS "telephony_outcome" "TelephonyOutcome";

ALTER TABLE "voice_calls" ADD COLUMN IF NOT EXISTS "conversation_id" TEXT;
ALTER TABLE "voice_calls" ADD COLUMN IF NOT EXISTS "channel_id" TEXT;
ALTER TABLE "voice_calls" ADD COLUMN IF NOT EXISTS "contact_id" TEXT;
ALTER TABLE "voice_calls" ADD COLUMN IF NOT EXISTS "asterisk_channel_id" TEXT;
ALTER TABLE "voice_calls" ADD COLUMN IF NOT EXISTS "bridge_id" TEXT;
ALTER TABLE "voice_calls" ADD COLUMN IF NOT EXISTS "linkedid" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "voice_calls_asterisk_channel_id_key" ON "voice_calls"("asterisk_channel_id");
CREATE INDEX IF NOT EXISTS "voice_calls_conversation_id_idx" ON "voice_calls"("conversation_id");

ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_voice_call_id_fkey" FOREIGN KEY ("voice_call_id") REFERENCES "voice_calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "voice_call_legs" (
    "id" TEXT NOT NULL,
    "voice_call_id" TEXT NOT NULL,
    "leg_type" "VoiceCallLegType" NOT NULL,
    "channel_id" TEXT,
    "endpoint" TEXT,
    "state" TEXT NOT NULL DEFAULT 'ringing',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "voice_call_legs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "voice_call_legs_voice_call_id_idx" ON "voice_call_legs"("voice_call_id");
ALTER TABLE "voice_call_legs" ADD CONSTRAINT "voice_call_legs_voice_call_id_fkey" FOREIGN KEY ("voice_call_id") REFERENCES "voice_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "dialer_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "queue_id" TEXT,
    "mode" "DialerCampaignMode" NOT NULL DEFAULT 'PREVIEW',
    "status" "DialerCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "pacing_sec" INTEGER NOT NULL DEFAULT 30,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "caller_id" TEXT,
    "schedule_json" JSONB,
    "predictive_ratio" DOUBLE PRECISION NOT NULL DEFAULT 1.2,
    "max_lines" INTEGER NOT NULL DEFAULT 5,
    "abandon_rate_max" DOUBLE PRECISION NOT NULL DEFAULT 0.03,
    "require_agent_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dialer_campaigns_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "dialer_campaigns" ADD CONSTRAINT "dialer_campaigns_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dialer_campaigns" ADD CONSTRAINT "dialer_campaigns_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "dialer_campaign_contacts" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "phone" TEXT NOT NULL,
    "status" "DialerContactStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_disposition_id" TEXT,
    "next_call_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dialer_campaign_contacts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "dialer_campaign_contacts_campaign_id_status_idx" ON "dialer_campaign_contacts"("campaign_id", "status");
CREATE INDEX IF NOT EXISTS "dialer_campaign_contacts_phone_idx" ON "dialer_campaign_contacts"("phone");
ALTER TABLE "dialer_campaign_contacts" ADD CONSTRAINT "dialer_campaign_contacts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "dialer_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dialer_campaign_contacts" ADD CONSTRAINT "dialer_campaign_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "dialer_sessions" (
    "id" TEXT NOT NULL,
    "agent_user_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "status" "DialerSessionStatus" NOT NULL DEFAULT 'IDLE',
    "current_contact_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dialer_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "dialer_sessions_agent_user_id_campaign_id_key" ON "dialer_sessions"("agent_user_id", "campaign_id");
ALTER TABLE "dialer_sessions" ADD CONSTRAINT "dialer_sessions_agent_user_id_fkey" FOREIGN KEY ("agent_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dialer_sessions" ADD CONSTRAINT "dialer_sessions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "dialer_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
