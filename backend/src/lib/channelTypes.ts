import type { ChannelType } from "@prisma/client";

export function mapChannelType(s: string): ChannelType {
  const upper = s.toUpperCase();
  if (upper === "WHATSAPP") return "WHATSAPP";
  if (upper === "EMAIL") return "EMAIL";
  if (upper === "TEAMS") return "TEAMS";
  if (upper === "VOICE") return "VOICE";
  return "WEBCHAT";
}
