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

export class WebChatAdapter implements ChannelAdapter {
  readonly type = "WEBCHAT" as ChannelType;

  async initialize(_channel: Channel): Promise<void> {
    /* Socket.IO namespace /webchat handles widget traffic */
  }

  async sendMessage(_conversation: ConversationWithChannel, _message: OutboundMessage): Promise<SendResult> {
    return { ok: true };
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
