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

// Handoff relay: cuando el número lo gestiona AgentHub, el canal no lleva
// credenciales de proveedor sino este bloque para relayar respuestas.
const agentHubRelaySchema = z.object({
  baseUrl: z.string().url(),
  apiPrefix: z.string().min(1).optional(),
  apiKey: z.string().min(1),
});

export type WhatsAppChannelConfig = z.infer<typeof whatsappConfigSchema>;

export function parseWhatsAppChannelConfig(raw: unknown): WhatsAppChannelConfig {
  return whatsappConfigSchema.parse(raw);
}

function formatIssues(prefix: string, out: z.SafeParseError<unknown>): string {
  return out.error.issues.map((i) => `${prefix}${i.path.join(".") || "config"}: ${i.message}`).join("; ");
}

export function getWhatsAppConfigValidationError(raw: unknown): string | undefined {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const hasAgentHub = obj.agenthub != null && typeof obj.agenthub === "object";
  const hasProvider = typeof obj.provider === "string" && obj.provider.length > 0;

  // Modo AgentHub (handoff) sin proveedor: validar solo el bloque de relay.
  if (hasAgentHub && !hasProvider) {
    const ah = agentHubRelaySchema.safeParse(obj.agenthub);
    if (ah.success) return undefined;
    return formatIssues("agenthub.", ah as z.SafeParseError<unknown>);
  }

  const out = whatsappConfigSchema.safeParse(raw);
  if (!out.success) return formatIssues("", out as z.SafeParseError<unknown>);
  // Proveedor válido: si además trae relay AgentHub, validarlo también.
  if (hasAgentHub) {
    const ah = agentHubRelaySchema.safeParse(obj.agenthub);
    if (!ah.success) return formatIssues("agenthub.", ah as z.SafeParseError<unknown>);
  }
  return undefined;
}
