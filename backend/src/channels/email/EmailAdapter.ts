import type { Channel } from "@prisma/client";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import type { Attachment as NodemailerAttachment } from "nodemailer/lib/mailer/index.js";
import type {
  ChannelAdapter,
  ConversationWithChannel,
  HealthStatus,
  IncomingMessage,
  OutboundMessage,
  SendResult,
} from "../ChannelAdapter.js";
import { parseEmailChannelConfig, type EmailChannelConfig } from "./config.js";

type Dict = Record<string, unknown>;

function asRecord(value: unknown): Dict {
  return (value ?? {}) as Dict;
}

function toNodemailerAttachment(a: { url: string; filename: string; mime_type: string }): NodemailerAttachment {
  const match = /^data:([^;]+);base64,(.*)$/i.exec(a.url);
  if (match) {
    return {
      filename: a.filename,
      contentType: a.mime_type || match[1],
      content: Buffer.from(match[2], "base64"),
    };
  }
  return {
    filename: a.filename,
    contentType: a.mime_type,
    path: a.url,
  };
}

export class EmailAdapter implements ChannelAdapter {
  readonly type = "EMAIL" as const;
  private config: EmailChannelConfig | null = null;

  async initialize(channel: Channel): Promise<void> {
    this.config = parseEmailChannelConfig(channel.config);
  }

  private getConfig(): EmailChannelConfig {
    if (!this.config) throw new Error("Email adapter not initialized");
    return this.config;
  }

  async sendMessage(conversation: ConversationWithChannel, message: OutboundMessage): Promise<SendResult> {
    const cfg = this.getConfig();
    const to = String(message.metadata?.to ?? conversation.contact.email ?? "").trim();
    if (!to) return { ok: false, error: "Recipient email is required" };
    const cc = String(message.metadata?.cc ?? "").trim() || undefined;
    const subject = String(message.metadata?.subject ?? message.metadata?.email_subject ?? "Sin asunto");
    const attachments = (message.attachments ?? []).map(toNodemailerAttachment);
    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpSecure,
      auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    });

    try {
      const out = await transporter.sendMail({
        from: cfg.fromName ? `"${cfg.fromName}" <${cfg.fromEmail ?? cfg.smtpUser}>` : cfg.fromEmail ?? cfg.smtpUser,
        to,
        cc,
        subject,
        text: message.content,
        attachments,
      });
      return { ok: true, external_id: out.messageId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "SMTP send failed" };
    }
  }

  async parseIncoming(raw: unknown): Promise<IncomingMessage> {
    const r = asRecord(raw);
    return {
      external_id: String(r.messageId ?? r.id ?? ""),
      contact_identifier: String(r.fromEmail ?? r.from ?? ""),
      contact_name: r.fromName ? String(r.fromName) : undefined,
      content: String(r.text ?? ""),
      content_type: "EMAIL",
      metadata: r,
      timestamp: r.date instanceof Date ? r.date : new Date(),
    };
  }

  async healthCheck(channel: Channel): Promise<HealthStatus> {
    let cfg: EmailChannelConfig;
    try {
      cfg = parseEmailChannelConfig(channel.config);
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : "Invalid email config" };
    }

    try {
      const smtp = nodemailer.createTransport({
        host: cfg.smtpHost,
        port: cfg.smtpPort,
        secure: cfg.smtpSecure,
        auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
      });
      await smtp.verify();

      const imap = new ImapFlow({
        host: cfg.imapHost,
        port: cfg.imapPort,
        secure: cfg.imapSecure,
        auth: { user: cfg.imapUser, pass: cfg.imapPass },
      });
      await imap.connect();
      await imap.logout();
      return { ok: true, detail: "SMTP + IMAP OK" };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : "SMTP/IMAP validation failed",
      };
    }
  }

  async destroy(): Promise<void> {
    this.config = null;
  }
}
