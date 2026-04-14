import { z } from "zod";

const voiceChannelConfigSchema = z.object({
  provider: z.literal("asterisk_ari").default("asterisk_ari"),
  ariBaseUrl: z.string().url(),
  ariApp: z.string().min(1),
  ariUsername: z.string().min(1),
  ariPassword: z.string().min(1),
  extensionField: z.string().min(1).default("endpoint"),
  callerIdField: z.string().min(1).default("caller.number"),
  dialedNumberField: z.string().min(1).default("dialplan.exten"),
  pollFallbackSec: z.coerce.number().int().min(5).max(120).default(15),
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
