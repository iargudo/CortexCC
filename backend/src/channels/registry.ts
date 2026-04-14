import type { ChannelType } from "@prisma/client";
import type { ChannelAdapter } from "./ChannelAdapter.js";
import { WebChatAdapter } from "./webchat/WebChatAdapter.js";
import { StubAdapter } from "./stub/StubAdapter.js";
import { WhatsAppAdapter } from "./whatsapp/WhatsAppAdapter.js";
import { EmailAdapter } from "./email/EmailAdapter.js";
import { VoiceAdapter } from "./voice/VoiceAdapter.js";

export function createAdapterForType(type: ChannelType): ChannelAdapter {
  if (type === "WHATSAPP") return new WhatsAppAdapter();
  if (type === "EMAIL") return new EmailAdapter();
  if (type === "VOICE") return new VoiceAdapter();
  if (type === "WEBCHAT") return new WebChatAdapter();
  return new StubAdapter(type);
}
