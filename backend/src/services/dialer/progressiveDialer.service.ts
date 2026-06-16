import { getPrisma } from "../../lib/prisma.js";
import { enqueueDialerProgressive } from "../../queue/bull.js";
import { originateOutboundCall } from "../voice/voiceCallController.service.js";
import type { Server } from "socket.io";

export async function runProgressiveDialerTick(io: Server | null, campaignId: string): Promise<void> {
  const campaign = await getPrisma().dialerCampaign.findUnique({
    where: { id: campaignId },
    include: { channel: true },
  });
  if (!campaign || campaign.status !== "ACTIVE" || campaign.mode !== "PROGRESSIVE") return;

  const idleSession = await getPrisma().dialerSession.findFirst({
    where: { campaign_id: campaignId, status: "IDLE" },
    include: { agent: { select: { id: true, status: true, sip_extension: true } } },
  });
  if (!idleSession?.agent.sip_extension || idleSession.agent.status !== "ONLINE") {
    await enqueueDialerProgressive({ campaignId }, { delay: campaign.pacing_sec * 1000 });
    return;
  }

  const nextContact = await getPrisma().dialerCampaignContact.findFirst({
    where: {
      campaign_id: campaignId,
      status: "PENDING",
      attempts: { lt: campaign.max_attempts },
      OR: [{ next_call_at: null }, { next_call_at: { lte: new Date() } }],
    },
    orderBy: { created_at: "asc" },
  });
  if (!nextContact) return;

  await originateOutboundCall({
    io,
    channel: campaign.channel,
    agentUserId: idleSession.agent_user_id,
    phone: nextContact.phone,
    contactId: nextContact.contact_id ?? undefined,
    campaignId,
    dialerContactId: nextContact.id,
  });

  await getPrisma().dialerCampaignContact.update({
    where: { id: nextContact.id },
    data: { status: "DIALING", attempts: { increment: 1 } },
  });
  await getPrisma().dialerSession.update({
    where: { id: idleSession.id },
    data: { status: "DIALING", current_contact_id: nextContact.id },
  });

  await enqueueDialerProgressive({ campaignId }, { delay: campaign.pacing_sec * 1000 });
}
