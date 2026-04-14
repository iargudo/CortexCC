import type { Channel, ChannelType, Prisma } from "@prisma/client";

export type ConversationWithChannel = Prisma.ConversationGetPayload<{ include: { channel: true; contact: true } }>;

export interface OutboundMessage {
  content: string;
  content_type: string;
  attachments?: { url: string; filename: string; mime_type: string }[];
  metadata?: Record<string, unknown>;
}

export interface SendResult {
  external_id?: string;
  ok: boolean;
  error?: string;
}

export interface IncomingMessage {
  external_id: string;
  contact_identifier: string;
  contact_name?: string;
  content: string;
  content_type: string;
  attachments?: { filename: string; mime_type: string; size_bytes: number; url: string }[];
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface HealthStatus {
  ok: boolean;
  detail?: string;
}

export interface ChannelAdapter {
  readonly type: ChannelType;
  initialize(channel: Channel): Promise<void>;
  sendMessage(conversation: ConversationWithChannel, message: OutboundMessage): Promise<SendResult>;
  parseIncoming(raw: unknown): Promise<IncomingMessage>;
  healthCheck(channel: Channel): Promise<HealthStatus>;
  destroy(): Promise<void>;
}
