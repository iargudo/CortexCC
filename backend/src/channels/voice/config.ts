import { z } from "zod";

const voiceChannelConfigSchema = z.object({
  provider: z.literal("asterisk_ari").default("asterisk_ari"),
  ariBaseUrl: z.string().url(),
  ariApp: z.string().min(1).default("cortexcc"),
  ariUsername: z.string().min(1),
  ariPassword: z.string().min(1),
  callerIdField: z.string().min(1).default("channel.caller.number"),
  dialedNumberField: z.string().min(1).default("channel.dialplan.exten"),
  extensionField: z.string().min(1).default("endpoint"),
  pollFallbackSec: z.coerce.number().int().min(5).max(120).default(15),
  outboundTrunkEndpoint: z.string().min(1).default("PJSIP/carrier-trunk"),
  outboundContext: z.string().min(1).default("outbound-trunk"),
  defaultCallerId: z.string().optional(),
  agentEndpointTemplate: z.string().min(1).default("PJSIP/{extension}"),
  ringTimeoutSec: z.coerce.number().int().min(5).max(120).default(30),
  mohClass: z.string().default("default"),
  recordingEnabled: z.boolean().default(false),
});

export type VoiceChannelConfig = z.infer<typeof voiceChannelConfigSchema>;

export function parseVoiceChannelConfig(raw: unknown): VoiceChannelConfig {
  return voiceChannelConfigSchema.parse(raw);
}

export function getVoiceConfigValidationError(raw: unknown): string | undefined {
  const out = voiceChannelConfigSchema.safeParse(raw);
  if (out.success) return undefined;
  return out.error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`).join("; ");
}

export function buildAgentEndpoint(cfg: VoiceChannelConfig, extension: string): string {
  return cfg.agentEndpointTemplate.replace("{extension}", extension);
}
