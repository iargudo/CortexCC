import type { Channel } from "@prisma/client";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { Server } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { parseEmailChannelConfig, type EmailChannelConfig } from "../channels/email/config.js";
import { ingestEmailIncoming } from "./emailInbound.service.js";

let running = false;
let timer: NodeJS.Timeout | null = null;

const TICK_INTERVAL_MS = 5_000;
const channelNextPollAt = new Map<string, number>();
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;
const EMAIL_LOOKBACK_HOURS = 24;

function extractAddressList(value: unknown): string[] {
  if (!value) return [];
  const entries = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const nested = (entry as { value?: Array<{ address?: string }> }).value;
    if (Array.isArray(nested)) {
      for (const n of nested) {
        if (n.address) out.push(n.address);
      }
      continue;
    }
    const address = (entry as { address?: string }).address;
    if (address) out.push(address);
  }
  return out;
}

function subjectMatchesFilter(
  subject: string | undefined,
  mode: "contains" | "equals" | "regex" | undefined,
  filterValue: string | undefined
): boolean {
  const needle = (filterValue ?? "").trim();
  if (!needle) return true;
  const normalizedSubject = (subject ?? "").trim();
  const normalizedNeedle = needle.trim();
  if (mode === "equals") {
    return normalizedSubject.toLowerCase() === normalizedNeedle.toLowerCase();
  }
  if (mode === "regex") {
    try {
      const pattern = new RegExp(normalizedNeedle, "i");
      return pattern.test(normalizedSubject);
    } catch {
      return false;
    }
  }
  return normalizedSubject.toLowerCase().includes(normalizedNeedle.toLowerCase());
}

function toInlineImageAttachment(raw: unknown): { filename: string; mime_type: string; size_bytes: number; url: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as {
    filename?: string;
    contentType?: string;
    size?: number;
    content?: Buffer;
  };
  const mime = String(data.contentType ?? "").trim().toLowerCase();
  if (!mime.startsWith("image/")) return null;
  const content = data.content;
  if (!content || !Buffer.isBuffer(content)) return null;
  const size = Number(data.size ?? content.byteLength ?? 0);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_INLINE_IMAGE_BYTES) return null;
  const base64 = content.toString("base64");
  return {
    filename: String(data.filename ?? "image"),
    mime_type: mime,
    size_bytes: size,
    url: `data:${mime};base64,${base64}`,
  };
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function messageAlreadyInSystem(messageId: string): Promise<boolean> {
  if (!messageId) return false;
  const existing = await prisma.message.findFirst({
    where: { email_message_id: messageId },
    select: { id: true },
  });
  return Boolean(existing);
}

export function startEmailInboundPoller(io: Server | null): void {
  if (timer) return;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const channels = await prisma.channel.findMany({
        where: { type: "EMAIL", status: "active" },
      });
      for (const ch of channels) {
        let cfg: EmailChannelConfig;
        try {
          cfg = parseEmailChannelConfig(ch.config);
        } catch {
          continue;
        }
        const now = Date.now();
        const nextAt = channelNextPollAt.get(ch.id) ?? 0;
        if (now < nextAt) continue;
        const intervalMs = Math.max(10, Number(cfg.pollIntervalSec ?? 30)) * 1000;
        channelNextPollAt.set(ch.id, now + intervalMs);
        await pollEmailChannel(ch, cfg, io);
      }
    } catch (err) {
      console.error("email poller tick failed", err);
    } finally {
      running = false;
    }
  };

  void tick();
  timer = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);
}

async function pollEmailChannel(channel: Channel, cfg: EmailChannelConfig, io: Server | null): Promise<void> {
  const client = new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: cfg.imapSecure,
    auth: { user: cfg.imapUser, pass: cfg.imapPass },
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(cfg.imapMailbox);
    try {
      const unseen = await client.search({
        seen: false,
        since: new Date(Date.now() - EMAIL_LOOKBACK_HOURS * 60 * 60 * 1000),
      });
      if (unseen === false) return;

      const pendingUids = [...unseen].sort((a, b) => a - b);
      for (const seq of pendingUids) {
        const metadata = await client.fetchOne(seq, {
          uid: true,
          envelope: true,
        });
        if (!metadata) continue;

        const envelopeMessageId = String(metadata.envelope?.messageId ?? "").trim();
        if (envelopeMessageId && (await messageAlreadyInSystem(envelopeMessageId))) {
          await client.messageFlagsAdd(seq, ["\\Seen"]);
          continue;
        }

        const message = await client.fetchOne(seq, {
          uid: true,
          envelope: true,
          source: true,
          flags: true,
        });
        if (!message || !message.source || typeof message.uid !== "number") continue;
        const parsed = await simpleParser(message.source);
        if (!subjectMatchesFilter(parsed.subject || undefined, cfg.subjectFilterMode, cfg.subjectFilterValue)) {
          await client.messageFlagsAdd(seq, ["\\Seen"]);
          continue;
        }
        const messageId = parsed.messageId || `imap-${channel.id}-${message.uid}`;
        const from = parsed.from?.value?.[0];
        const fromEmail = (from?.address || "").toLowerCase();
        if (!fromEmail) {
          await client.messageFlagsAdd(seq, ["\\Seen"]);
          continue;
        }
        const toList = extractAddressList(parsed.to).join(", ");
        const ccList = extractAddressList(parsed.cc).join(", ");
        const htmlBody = parsed.html ? String(parsed.html) : undefined;
        const plainText = parsed.text?.trim() || (htmlBody ? htmlToText(htmlBody) : "") || "[Correo recibido]";
        const inlineImageAttachments = (parsed.attachments ?? [])
          .map((att) => toInlineImageAttachment(att))
          .filter((att): att is { filename: string; mime_type: string; size_bytes: number; url: string } => Boolean(att));

        const out = await ingestEmailIncoming(channel.id, {
          messageId,
          fromEmail,
          fromName: from?.name || undefined,
          subject: parsed.subject || undefined,
          text: plainText,
          htmlBody,
          cc: ccList || undefined,
          inReplyTo: parsed.inReplyTo || undefined,
          date: parsed.date || new Date(),
          attachments: inlineImageAttachments,
        });

        io?.to(`conversation:${out.conversation_id}`).emit("message:new", {
          conversationId: out.conversation_id,
        });

        const assignments = await prisma.conversationAssignment.findMany({
          where: { conversation_id: out.conversation_id, ended_at: null },
          select: { user_id: true },
        });
        for (const a of assignments) {
          io?.to(`user:${a.user_id}`).emit("message:new", {
            conversationId: out.conversation_id,
          });
        }

        await prisma.message.updateMany({
          where: { id: out.message_id },
          data: {
            metadata: {
              from: fromEmail,
              to: toList || undefined,
            } as object,
          },
        });

        await client.messageFlagsAdd(seq, ["\\Seen"]);
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error(`email poller failed for channel ${channel.id}`, err);
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore disconnect errors
    }
  }
}
