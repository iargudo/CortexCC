import type { Server } from "socket.io";
import {
  createDialerPredictiveWorker,
  createDialerProgressiveWorker,
  createOutboundWorker,
  createRecordingUploadWorker,
  createRoutingWorker,
  createSlaWorker,
} from "../queue/bull.js";
import { getPrisma } from "../lib/prisma.js";
import { ensureConnection } from "../lib/tenantConnectionManager.js";
import { runWithTenant } from "../lib/tenantContext.js";
import { RoutingEngine } from "../routing/RoutingEngine.js";
import { deliverOutboundMessage } from "../services/outbound.service.js";
import { startEmailInboundPoller } from "../services/emailPoller.service.js";
import { startVoiceAsteriskListeners } from "../services/voiceAsterisk.service.js";
import { runProgressiveDialerTick } from "../services/dialer/progressiveDialer.service.js";
import { runPredictiveDialerTick } from "../services/dialer/predictiveDialer.service.js";
import { runSlaCheck } from "../services/slaCheck.service.js";
import { processRecordingUpload } from "../services/voice/recording.service.js";

async function withJobTenant<T>(
  tenantKey: string | undefined,
  fn: () => Promise<T>
): Promise<T | undefined> {
  if (!tenantKey) return undefined;
  const info = await ensureConnection(tenantKey);
  return runWithTenant(info.key, info.name, fn);
}

export function startWorkers(io: Server | null): void {
  createRoutingWorker(async (job) => {
    const tenantKey = job.data.tenantKey as string | undefined;
    const id = job.data.conversationId as string;
    if (!tenantKey || !id) return;
    await withJobTenant(tenantKey, async () => {
      const engine = new RoutingEngine(getPrisma(), io);
      await engine.routeConversation(id);
    });
  });

  createSlaWorker(async (job) => {
    const tenantKey = job.data.tenantKey as string | undefined;
    const conversationId = job.data.conversationId as string | undefined;
    const queueId = job.data.queueId as string | undefined;
    if (!tenantKey || !conversationId || !queueId) return;
    await withJobTenant(tenantKey, async () => {
      await runSlaCheck(conversationId, queueId, io);
    });
  });

  createOutboundWorker(async (job) => {
    const tenantKey = job.data.tenantKey as string | undefined;
    const messageId = job.data.messageId as string;
    if (!tenantKey || !messageId) return;
    await withJobTenant(tenantKey, async () => {
      await deliverOutboundMessage(messageId, io);
    });
  });

  createDialerProgressiveWorker(async (job) => {
    const tenantKey = job.data.tenantKey as string | undefined;
    const campaignId = job.data.campaignId as string;
    if (!tenantKey || !campaignId) return;
    await withJobTenant(tenantKey, async () => {
      await runProgressiveDialerTick(io, campaignId);
    });
  });

  createDialerPredictiveWorker(async (job) => {
    const tenantKey = job.data.tenantKey as string | undefined;
    const campaignId = job.data.campaignId as string;
    if (!tenantKey || !campaignId) return;
    await withJobTenant(tenantKey, async () => {
      await runPredictiveDialerTick(io, campaignId);
    });
  });

  createRecordingUploadWorker(async (job) => {
    const tenantKey = job.data.tenantKey as string | undefined;
    const recordingName = job.data.recordingName as string | undefined;
    if (!tenantKey || !recordingName) return;
    await withJobTenant(tenantKey, async () => {
      await processRecordingUpload({
        tenantKey,
        recordingName,
        conversationId: job.data.conversationId as string | undefined,
        channelConfigId: job.data.channelConfigId as string | undefined,
      });
    });
  });

  startEmailInboundPoller(io);
  void startVoiceAsteriskListeners(io).catch((err) => {
    console.error("[voice] Failed to start voice listeners:", err);
  });

  console.log(
    "BullMQ workers listening (routing, sla-check, outbound-messages, dialer-progressive, dialer-predictive, recording-upload, email-poller, voice-ari)"
  );
}
