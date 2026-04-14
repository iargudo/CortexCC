import type { Channel, ChannelType } from "@prisma/client";
import type {
  ChannelAdapter,
  ConversationWithChannel,
  HealthStatus,
  IncomingMessage,
  OutboundMessage,
  SendResult,
} from "../ChannelAdapter.js";

export class StubAdapter implements ChannelAdapter {
  constructor(readonly type: ChannelType) {}

  async initialize(_channel: Channel): Promise<void> {}

  async sendMessage(_conversation: ConversationWithChannel, _message: OutboundMessage): Promise<SendResult> {
    return { ok: true, external_id: "stub" };
  }

  async parseIncoming(raw: unknown): Promise<IncomingMessage> {
    return {
      external_id: "stub",
      contact_identifier: "unknown",
      content: JSON.stringify(raw),
      content_type: "TEXT",
      timestamp: new Date(),
    };
  }

  async healthCheck(_channel: Channel): Promise<HealthStatus> {
    return { ok: true };
  }

  async destroy(): Promise<void> {}
}
