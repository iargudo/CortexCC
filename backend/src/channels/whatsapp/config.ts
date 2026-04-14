import { z } from "zod";

const ultraMsgSchema = z.object({
  provider: z.literal("ultramsg"),
  instanceId: z.string().min(1),
  token: z.string().min(1),
  baseUrl: z.string().url().default("https://api.ultramsg.com"),
});

const twilioSchema = z.object({
  provider: z.literal("twilio"),
  accountSid: z.string().min(1),
  authToken: z.string().min(1),
  from: z.string().min(1),
  apiBaseUrl: z.string().url().default("https://api.twilio.com"),
});

const dialog360Schema = z.object({
  provider: z.literal("360dialog"),
  apiKey: z.string().min(1),
  phoneNumberId: z.string().min(1).optional(),
  baseUrl: z.string().url().default("https://waba-v2.360dialog.io"),
});

const whatsappConfigSchema = z.discriminatedUnion("provider", [ultraMsgSchema, twilioSchema, dialog360Schema]);

export type WhatsAppChannelConfig = z.infer<typeof whatsappConfigSchema>;

export function parseWhatsAppChannelConfig(raw: unknown): WhatsAppChannelConfig {
  return whatsappConfigSchema.parse(raw);
}

export function getWhatsAppConfigValidationError(raw: unknown): string | undefined {
  const out = whatsappConfigSchema.safeParse(raw);
  if (out.success) return undefined;
  return out.error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`).join("; ");
}
