import { z } from "zod";

const emailChannelConfigSchema = z.object({
  provider: z.literal("smtp_imap").default("smtp_imap"),
  smtpHost: z.string().min(1),
  smtpPort: z.coerce.number().int().positive(),
  smtpSecure: z.coerce.boolean().default(false),
  smtpUser: z.string().min(1),
  smtpPass: z.string().min(1),
  fromEmail: z.string().email().optional(),
  fromName: z.string().min(1).optional(),
  imapHost: z.string().min(1),
  imapPort: z.coerce.number().int().positive(),
  imapSecure: z.coerce.boolean().default(true),
  imapUser: z.string().min(1),
  imapPass: z.string().min(1),
  imapMailbox: z.string().min(1).default("INBOX"),
  pollIntervalSec: z.coerce.number().int().min(10).max(600).default(30),
  subjectFilterMode: z.enum(["contains", "equals", "regex"]).optional(),
  subjectFilterValue: z.string().trim().min(1).optional(),
});

export type EmailChannelConfig = z.infer<typeof emailChannelConfigSchema>;

export function parseEmailChannelConfig(raw: unknown): EmailChannelConfig {
  return emailChannelConfigSchema.parse(raw);
}

export function getEmailConfigValidationError(raw: unknown): string | undefined {
  const out = emailChannelConfigSchema.safeParse(raw);
  if (out.success) return undefined;
  return out.error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`).join("; ");
}
