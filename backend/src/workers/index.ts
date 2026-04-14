import type { Server } from "socket.io";
import { createRoutingWorker, createSlaWorker, createOutboundWorker } from "../queue/bull.js";
import { prisma } from "../lib/prisma.js";
import { RoutingEngine } from "../routing/RoutingEngine.js";
import { deliverOutboundMessage } from "../services/outbound.service.js";
import { startEmailInboundPoller } from "../services/emailPoller.service.js";
import { startVoiceAsteriskListeners } from "../services/voiceAsterisk.service.js";

export function startWorkers(io: Server | null): void {
  const engine = new RoutingEngine(prisma, io);

  createRoutingWorker(async (job) => {
    const id = job.data.conversationId as string;
    if (id) await engine.routeConversation(id);
  });

  createSlaWorker(async (_job) => {
    /* SLA periodic checks — extend with notifications */
  });

  createOutboundWorker(async (job) => {
    const messageId = job.data.messageId as string;
    if (messageId) await deliverOutboundMessage(messageId, io);
  });

  startEmailInboundPoller(io);
  void startVoiceAsteriskListeners(io).catch((err) => {
    console.error("[voice] Failed to start voice listeners:", err);
  });

  console.log("BullMQ workers listening (routing, sla-check, outbound-messages, email-poller, voice-ari)");
}
