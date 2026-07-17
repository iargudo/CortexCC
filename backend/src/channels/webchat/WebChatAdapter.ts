import { randomUUID } from "crypto";
import type { Channel, ChannelType } from "@prisma/client";
import type {
  ChannelAdapter,
  ConversationWithChannel,
  HealthStatus,
  IncomingMessage,
  OutboundMessage,
  SendResult,
} from "../ChannelAdapter.js";
import { getAgentHubRelayConfig, sendAgentReplyToAgentHub } from "../agenthubRelay.js";

export class WebChatAdapter implements ChannelAdapter {
  readonly type = "WEBCHAT" as ChannelType;

  async initialize(_channel: Channel): Promise<void> {
    /* Socket.IO namespace /webchat handles widget traffic */
  }

  async sendMessage(conversation: ConversationWithChannel, message: OutboundMessage): Promise<SendResult> {
    // Human agent reply is delivered to the widget through AgentHub (WebSocket).
    const relay = getAgentHubRelayConfig(conversation.channel.config);
    if (!relay) {
      return {
        ok: false,
        error: "WEBCHAT channel has no AgentHub relay config (channel.config.agenthub)",
      };
    }
    const conversationRefId = conversation.source_ref_id;
    if (!conversationRefId) {
      return { ok: false, error: "Conversation has no source_ref_id (AgentHub conversation id)" };
    }
    const userId = conversation.contact?.external_id;
    if (!userId) {
      return { ok: false, error: "Contact has no external_id (AgentHub webchat userId)" };
    }
    const content = message.content?.trim();
    if (!content) {
      return { ok: false, error: "Message content is required" };
    }
    return sendAgentReplyToAgentHub({
      config: relay,
      conversationRefId,
      channelType: "webchat",
      userId,
      content,
    });
  }

  async parseIncoming(raw: unknown): Promise<IncomingMessage> {
    const r = raw as Record<string, unknown>;
    return {
      external_id: String(r.id ?? randomUUID()),
      contact_identifier: String(r.sessionId ?? "webchat"),
      contact_name: r.name ? String(r.name) : undefined,
      content: String(r.text ?? ""),
      content_type: "TEXT",
      timestamp: new Date(),
    };
  }

  async healthCheck(_channel: Channel): Promise<HealthStatus> {
    return { ok: true };
  }

  async destroy(): Promise<void> {
    /* noop */
  }
}
