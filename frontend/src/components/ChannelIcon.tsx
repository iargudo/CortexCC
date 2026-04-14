import { MessageSquare, Mail, Phone, Globe, Users } from "lucide-react";
import type { ChannelType } from "@/data/mock";

const channelConfig: Record<ChannelType, { icon: typeof MessageSquare; label: string; className: string }> = {
  WHATSAPP: { icon: MessageSquare, label: "WhatsApp", className: "text-channel-whatsapp" },
  EMAIL: { icon: Mail, label: "Email", className: "text-channel-email" },
  TEAMS: { icon: Users, label: "Teams", className: "text-channel-teams" },
  VOICE: { icon: Phone, label: "Voz", className: "text-channel-voice" },
  WEBCHAT: { icon: Globe, label: "WebChat", className: "text-channel-webchat" },
};

export function ChannelIcon({ channel, size = 16 }: { channel: ChannelType; size?: number }) {
  const config = channelConfig[channel];
  const Icon = config.icon;
  return <Icon size={size} className={config.className} />;
}

export function ChannelBadge({ channel }: { channel: ChannelType }) {
  const config = channelConfig[channel];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${config.className}`}>
      <Icon size={12} />
      {config.label}
    </span>
  );
}
