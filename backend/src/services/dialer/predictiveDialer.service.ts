import { getPrisma } from "../../lib/prisma.js";
import { enqueueDialerPredictive } from "../../queue/bull.js";
import { parseVoiceChannelConfig } from "../../channels/voice/config.js";
import { createAriClient } from "../voice/ariClient.js";
import { saveVoiceSession } from "../voice/voiceSessionStore.js";
import { ingestVoiceCallEvent } from "../voice/voiceCall.service.js";
import type { Server } from "socket.io";

export async function runPredictiveDialerTick(io: Server | null, campaignId: string): Promise<void> {
  const campaign = await getPrisma().dialerCampaign.findUnique({
    where: { id: campaignId },
    include: { channel: true },
  });
  if (!campaign || campaign.status !== "ACTIVE" || campaign.mode !== "PREDICTIVE") return;

  const idleAgents = await getPrisma().dialerSession.count({
    where: {
      campaign_id: campaignId,
      status: "IDLE",
      agent: { status: "ONLINE", sip_extension: { not: null } },
    },
  });
  const activeDialing = await getPrisma().dialerCampaignContact.count({
    where: { campaign_id: campaignId, status: "DIALING" },
  });

  const linesToDial = Math.max(
    0,
    Math.min(
      campaign.max_lines,
      Math.ceil(idleAgents * campaign.predictive_ratio) - activeDialing
    )
  );

  if (linesToDial === 0) {
    await enqueueDialerPredictive({ campaignId }, { delay: campaign.pacing_sec * 1000 });
    return;
  }

  const cfg = parseVoiceChannelConfig(campaign.channel.config);
  const ari = createAriClient(cfg);

  for (let i = 0; i < linesToDial; i += 1) {
    const contact = await getPrisma().dialerCampaignContact.findFirst({
      where: {
        campaign_id: campaignId,
        status: "PENDING",
        attempts: { lt: campaign.max_attempts },
      },
      orderBy: { created_at: "asc" },
    });
    if (!contact) break;

    if (campaign.require_agent_available && idleAgents === 0) break;

    const trunkEndpoint = `${cfg.outboundTrunkEndpoint}/${contact.phone}`;
    const trunkLeg = await ari.originate({
      endpoint: trunkEndpoint,
      app: cfg.ariApp,
      appArgs: `predictive,${campaignId},${contact.id}`,
      callerId: campaign.caller_id ?? cfg.defaultCallerId,
      timeout: cfg.ringTimeoutSec,
    });

    await saveVoiceSession({
      channelId: trunkLeg.id,
      direction: "outbound",
      state: "ringing",
      dialedNumber: contact.phone,
      campaignId,
      dialerContactId: contact.id,
      channelConfigId: campaign.channel.id,
      updatedAt: new Date().toISOString(),
    });

    await getPrisma().dialerCampaignContact.update({
      where: { id: contact.id },
      data: { status: "DIALING", attempts: { increment: 1 } },
    });

    await ingestVoiceCallEvent(
      {
        channelId: campaign.channel.id,
        externalCallId: trunkLeg.id,
        asteriskChannelId: trunkLeg.id,
        dialedNumber: contact.phone,
        direction: "outbound",
        state: "ringing",
        metadata: { campaign_id: campaignId, dialer_contact_id: contact.id, mode: "predictive" },
      },
      io
    );
  }

  await enqueueDialerPredictive({ campaignId }, { delay: campaign.pacing_sec * 1000 });
}

export async function assignPredictiveAnswerToAgent(
  io: Server | null,
  campaignId: string,
  trunkChannelId: string,
  dialerContactId: string
): Promise<void> {
  const session = await getPrisma().dialerSession.findFirst({
    where: {
      campaign_id: campaignId,
      status: "IDLE",
      agent: { status: "ONLINE", sip_extension: { not: null } },
    },
    orderBy: { updated_at: "asc" },
    include: { agent: { select: { id: true, sip_extension: true, status: true } } },
  });
  if (!session?.agent.sip_extension) return;

  const campaign = await getPrisma().dialerCampaign.findUnique({
    where: { id: campaignId },
    include: { channel: true },
  });
  if (!campaign) return;

  const { bridgeChannels } = await import("../voice/voiceCallController.service.js");
  const cfg = parseVoiceChannelConfig(campaign.channel.config);

  const contact = await getPrisma().dialerCampaignContact.findUnique({ where: { id: dialerContactId } });
  if (!contact) return;

  const { originateOutboundCall } = await import("../voice/voiceCallController.service.js");
  const out = await originateOutboundCall({
    io,
    channel: campaign.channel,
    agentUserId: session.agent_user_id,
    phone: contact.phone,
    contactId: contact.contact_id ?? undefined,
    campaignId,
    dialerContactId,
  });

  await bridgeChannels(io, cfg, trunkChannelId, out.callerChannelId, out.conversationId);

  await getPrisma().dialerSession.update({
    where: { id: session.id },
    data: { status: "ON_CALL", current_contact_id: dialerContactId },
  });
}
