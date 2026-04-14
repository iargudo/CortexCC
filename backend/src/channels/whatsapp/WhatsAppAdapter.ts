import { randomUUID } from "crypto";
import type { Channel } from "@prisma/client";
import type {
  ChannelAdapter,
  ConversationWithChannel,
  HealthStatus,
  IncomingMessage,
  OutboundMessage,
  SendResult,
} from "../ChannelAdapter.js";
import { parseWhatsAppChannelConfig, type WhatsAppChannelConfig } from "./config.js";

type Dict = Record<string, unknown>;

function asRecord(value: unknown): Dict {
  return (value ?? {}) as Dict;
}

function cleanBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "").trim();
}

function normalizeTwilioPhone(phone: string): string {
  const p = normalizePhone(phone);
  if (p.startsWith("whatsapp:")) return p;
  const noPrefix = p.replace(/^whatsapp:/, "");
  const withPlus = noPrefix.startsWith("+") ? noPrefix : `+${noPrefix}`;
  return `whatsapp:${withPlus}`;
}

function pickDestinationPhone(conversation: ConversationWithChannel): string {
  const phone = conversation.contact?.phone_wa ?? conversation.contact?.phone;
  if (!phone) throw new Error("Contact phone is required for WhatsApp outbound");
  return normalizePhone(phone);
}

function mapIncomingContentType(kind: string | undefined): string {
  const k = (kind ?? "").toLowerCase();
  if (k.includes("image")) return "IMAGE";
  if (k.includes("video")) return "VIDEO";
  if (k.includes("audio") || k.includes("voice")) return "AUDIO";
  if (k.includes("document") || k.includes("file")) return "FILE";
  return "TEXT";
}

function firstString(value: unknown, ...keys: string[]): string {
  const r = asRecord(value);
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

function findFirstHttpUrl(input: unknown): string {
  if (!input) return "";
  if (typeof input === "string") {
    return /^https?:\/\//i.test(input) ? input : "";
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = findFirstHttpUrl(item);
      if (found) return found;
    }
    return "";
  }
  const rec = asRecord(input);
  for (const key of Object.keys(rec)) {
    const found = findFirstHttpUrl(rec[key]);
    if (found) return found;
  }
  return "";
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "on") return true;
    if (v === "false" || v === "0" || v === "off") return false;
  }
  return fallback;
}

export class WhatsAppAdapter implements ChannelAdapter {
  readonly type = "WHATSAPP" as const;
  private config: WhatsAppChannelConfig | null = null;

  async initialize(channel: Channel): Promise<void> {
    this.config = parseWhatsAppChannelConfig(channel.config);
  }

  private getConfig(): WhatsAppChannelConfig {
    if (!this.config) throw new Error("WhatsApp adapter not initialized");
    return this.config;
  }

  async sendMessage(conversation: ConversationWithChannel, message: OutboundMessage): Promise<SendResult> {
    const cfg = this.getConfig();
    const to = pickDestinationPhone(conversation);
    const body = message.content?.trim();
    if (!body) return { ok: false, error: "Message content is required" };

    if (cfg.provider === "ultramsg") return this.sendViaUltraMsg(cfg, to, body);
    if (cfg.provider === "twilio") return this.sendViaTwilio(cfg, to, body);
    return this.sendVia360Dialog(cfg, to, body);
  }

  async parseIncoming(raw: unknown): Promise<IncomingMessage> {
    const cfg = this.getConfig();
    if (cfg.provider === "twilio") return this.parseTwilioIncoming(raw);
    if (cfg.provider === "ultramsg") return this.parseUltraMsgIncoming(raw, cfg);
    return this.parse360DialogIncoming(raw, cfg);
  }

  async healthCheck(channel: Channel): Promise<HealthStatus> {
    let cfg: WhatsAppChannelConfig;
    try {
      cfg = parseWhatsAppChannelConfig(channel.config);
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : "Invalid WhatsApp config" };
    }

    try {
      if (cfg.provider === "ultramsg") {
        const url = new URL(`${cleanBaseUrl(cfg.baseUrl)}/${cfg.instanceId}/instance/status`);
        url.searchParams.set("token", cfg.token);
        const res = await fetch(url.toString(), { method: "GET" });
        return { ok: res.ok, detail: res.ok ? "UltraMsg reachable" : `UltraMsg status ${res.status}` };
      }

      if (cfg.provider === "twilio") {
        const url = `${cleanBaseUrl(cfg.apiBaseUrl)}/2010-04-01/Accounts/${cfg.accountSid}.json`;
        const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
        const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
        return { ok: res.ok, detail: res.ok ? "Twilio reachable" : `Twilio status ${res.status}` };
      }

      const url = `${cleanBaseUrl(cfg.baseUrl)}/v1/configs/webhook`;
      const res = await fetch(url, { headers: { "D360-API-KEY": cfg.apiKey } });
      return { ok: res.ok, detail: res.ok ? "360Dialog reachable" : `360Dialog status ${res.status}` };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? `Connection failed: ${err.message}` : "Connection failed",
      };
    }
  }

  async destroy(): Promise<void> {
    this.config = null;
  }

  private async sendViaUltraMsg(cfg: Extract<WhatsAppChannelConfig, { provider: "ultramsg" }>, to: string, body: string): Promise<SendResult> {
    const url = `${cleanBaseUrl(cfg.baseUrl)}/${cfg.instanceId}/messages/chat`;
    const payload = new URLSearchParams({
      token: cfg.token,
      to,
      body,
    });
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload.toString(),
    });
    const json = await safeJson(res);
    if (!res.ok) return { ok: false, error: `UltraMsg status ${res.status}` };
    const id = asRecord(json).id ?? asRecord(asRecord(json).data).id ?? asRecord(asRecord(json).message).id;
    return { ok: true, external_id: typeof id === "string" ? id : undefined };
  }

  private async sendViaTwilio(cfg: Extract<WhatsAppChannelConfig, { provider: "twilio" }>, to: string, body: string): Promise<SendResult> {
    const url = `${cleanBaseUrl(cfg.apiBaseUrl)}/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
    const params = new URLSearchParams({
      To: normalizeTwilioPhone(to),
      From: normalizeTwilioPhone(cfg.from),
      Body: body,
    });
    const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const json = await safeJson(res);
    if (!res.ok) return { ok: false, error: `Twilio status ${res.status}` };
    const sid = asRecord(json).sid;
    return { ok: true, external_id: typeof sid === "string" ? sid : undefined };
  }

  private async sendVia360Dialog(cfg: Extract<WhatsAppChannelConfig, { provider: "360dialog" }>, to: string, body: string): Promise<SendResult> {
    const url = `${cleanBaseUrl(cfg.baseUrl)}/messages`;
    const payload: Dict = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body },
    };
    if (cfg.phoneNumberId) payload.phone_number_id = cfg.phoneNumberId;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "D360-API-KEY": cfg.apiKey,
      },
      body: JSON.stringify(payload),
    });
    const json = await safeJson(res);
    if (!res.ok) return { ok: false, error: `360Dialog status ${res.status}` };

    const messages = asRecord(json).messages as unknown;
    const first = Array.isArray(messages) && messages.length > 0 ? asRecord(messages[0]).id : undefined;
    return { ok: true, external_id: typeof first === "string" ? first : undefined };
  }

  private parseTwilioIncoming(raw: unknown): IncomingMessage {
    const r = asRecord(raw);
    const from = String(r.From ?? r.from ?? "unknown");
    const sid = String(r.MessageSid ?? r.SmsSid ?? randomUUID());
    const content = String(r.Body ?? "");
    const numMedia = Number(r.NumMedia ?? 0);
    const attachments =
      Number.isFinite(numMedia) && numMedia > 0
        ? Array.from({ length: numMedia }, (_, idx) => {
            const mediaUrl = r[`MediaUrl${idx}`];
            const mime = r[`MediaContentType${idx}`];
            return {
              filename: `twilio-media-${idx + 1}`,
              mime_type: String(mime ?? "application/octet-stream"),
              size_bytes: 0,
              url: String(mediaUrl ?? ""),
            };
          }).filter((a) => Boolean(a.url))
        : undefined;
    const primaryType = attachments?.[0]?.mime_type?.split("/")[0];
    return {
      external_id: sid,
      contact_identifier: from.replace(/^whatsapp:/, ""),
      contact_name: r.ProfileName ? String(r.ProfileName) : undefined,
      content: content || (attachments?.length ? "[Media]" : ""),
      content_type: mapIncomingContentType(primaryType),
      attachments,
      metadata: r,
      timestamp: new Date(),
    };
  }

  private async parseUltraMsgIncoming(
    raw: unknown,
    cfg: Extract<WhatsAppChannelConfig, { provider: "ultramsg" }>
  ): Promise<IncomingMessage> {
    const r = asRecord(raw);
    const data = asRecord(r.data);
    const from = String(r.from ?? data.from ?? "unknown");
    const msgId = String(r.id ?? data.id ?? randomUUID());
    const kind = String(r.type ?? data.type ?? "");
    const body = String(r.body ?? data.body ?? r.message ?? "");
    let mediaUrl = String(r.media ?? data.media ?? r.url ?? data.url ?? "");
    const mime = String(r.mime_type ?? data.mime_type ?? "");
    if (!mediaUrl && kind.toLowerCase() === "image") {
      const resolved = await this.resolveUltraMsgMediaUrl(cfg, from, msgId, String(data.id ?? ""));
      if (resolved) mediaUrl = resolved;
      if (!mediaUrl) {
        await this.ensureUltraMsgWebhookMediaDownload(cfg);
        const secondTry = await this.resolveUltraMsgMediaUrl(cfg, from, msgId, String(data.id ?? ""));
        if (secondTry) mediaUrl = secondTry;
      }
    }
    const attachments =
      mediaUrl
        ? [
            {
              filename: `ultramsg-${kind || "media"}`,
              mime_type: mime || "application/octet-stream",
              size_bytes: Number(r.size ?? data.size ?? 0),
              url: mediaUrl,
            },
          ]
        : undefined;
    const explicitType = mapIncomingContentType(kind || attachments?.[0]?.mime_type?.split("/")[0]);
    return {
      external_id: msgId,
      contact_identifier: from,
      contact_name: r.senderName ? String(r.senderName) : undefined,
      content: body || (attachments?.length ? "[Media]" : ""),
      content_type: explicitType,
      attachments,
      metadata: r,
      timestamp: new Date(),
    };
  }

  private async ensureUltraMsgWebhookMediaDownload(
    cfg: Extract<WhatsAppChannelConfig, { provider: "ultramsg" }>
  ): Promise<void> {
    try {
      const getUrl = new URL(`${cleanBaseUrl(cfg.baseUrl)}/${cfg.instanceId}/instance/settings`);
      getUrl.searchParams.set("token", cfg.token);
      const currentRes = await fetch(getUrl.toString(), { method: "GET" });
      if (!currentRes.ok) return;
      const current = asRecord(await safeJson(currentRes));
      if (asBoolean(current.webhook_message_download_media)) return;

      const payload = new URLSearchParams({
        token: cfg.token,
        sendDelay: String(current.sendDelay ?? current.send_delay ?? 1),
        sendDelayMax: String(current.sendDelayMax ?? current.send_delay_max ?? 15),
        webhook_url: String(current.webhook_url ?? ""),
        webhook_message_received: String(
          asBoolean(current.webhook_message_received, true)
        ),
        webhook_message_create: String(asBoolean(current.webhook_message_create, true)),
        webhook_message_ack: String(asBoolean(current.webhook_message_ack, true)),
        webhook_message_download_media: "true",
      });
      const updateUrl = `${cleanBaseUrl(cfg.baseUrl)}/${cfg.instanceId}/instance/settings`;
      await fetch(updateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: payload.toString(),
      });
    } catch {
      // No throw: webhook processing must continue even if setting update fails.
    }
  }

  private async resolveUltraMsgMediaUrl(
    cfg: Extract<WhatsAppChannelConfig, { provider: "ultramsg" }>,
    chatId: string,
    fallbackMsgId: string,
    rawMessageId: string
  ): Promise<string> {
    try {
      const url = new URL(`${cleanBaseUrl(cfg.baseUrl)}/${cfg.instanceId}/chats/messages`);
      url.searchParams.set("token", cfg.token);
      url.searchParams.set("chatId", chatId);
      url.searchParams.set("limit", "30");
      const res = await fetch(url.toString(), { method: "GET" });
      if (!res.ok) return "";
      const json = await safeJson(res);
      const list = Array.isArray(json) ? json : Array.isArray(asRecord(json).messages) ? (asRecord(json).messages as unknown[]) : [];
      const targetIds = [fallbackMsgId, rawMessageId].filter(Boolean);
      for (const item of list) {
        const id = firstString(item, "id", "msgId", "_id");
        if (targetIds.length && !targetIds.includes(id)) continue;
        const candidate =
          firstString(item, "media", "url", "link", "mediaUrl", "file", "fileUrl") || findFirstHttpUrl(item);
        if (candidate) return candidate;
      }
      // Fallback: try any message in the batch with a media URL.
      for (const item of list) {
        const candidate =
          firstString(item, "media", "url", "link", "mediaUrl", "file", "fileUrl") || findFirstHttpUrl(item);
        if (candidate) return candidate;
      }
      return "";
    } catch {
      return "";
    }
  }

  private async parse360DialogIncoming(
    raw: unknown,
    cfg: Extract<WhatsAppChannelConfig, { provider: "360dialog" }>
  ): Promise<IncomingMessage> {
    const root = asRecord(raw);
    const entry = Array.isArray(root.entry) ? asRecord(root.entry[0]) : {};
    const changes = Array.isArray(entry.changes) ? asRecord(entry.changes[0]) : {};
    const value = asRecord(changes.value);
    const messages = Array.isArray(value.messages) ? asRecord(value.messages[0]) : {};
    const contacts = Array.isArray(value.contacts) ? asRecord(value.contacts[0]) : {};
    const profile = asRecord(contacts.profile);
    const text = asRecord(messages.text);
    const image = asRecord(messages.image);
    const document = asRecord(messages.document);
    const audio = asRecord(messages.audio);
    const video = asRecord(messages.video);
    const msgType = String(messages.type ?? "");
    const from = String(messages.from ?? contacts.wa_id ?? "unknown");
    const body = String(text.body ?? image.caption ?? document.caption ?? "");
    const externalId = String(messages.id ?? randomUUID());
    const mediaId = String(image.id ?? document.id ?? audio.id ?? video.id ?? "");
    let attachments:
      | {
          filename: string;
          mime_type: string;
          size_bytes: number;
          url: string;
        }[]
      | undefined;
    if (msgType && msgType !== "text" && mediaId) {
      let media = { url: "", mime_type: "", size_bytes: 0 };
      try {
        media = await this.resolve360DialogMedia(cfg, mediaId);
      } catch {
        // Fallback: persist media id for manual retrieval if provider URL resolution fails.
        media = { url: mediaId, mime_type: "", size_bytes: 0 };
      }
      attachments = [
        {
          filename: `${msgType}-${externalId}`,
          mime_type:
            media.mime_type ||
            String(
              image.mime_type ??
                document.mime_type ??
                audio.mime_type ??
                video.mime_type ??
                "application/octet-stream"
            ),
          size_bytes: media.size_bytes,
          url: media.url,
        },
      ];
    }

    return {
      external_id: externalId,
      contact_identifier: from,
      contact_name: profile.name ? String(profile.name) : undefined,
      content: body || (attachments?.length ? "[Media]" : ""),
      content_type: mapIncomingContentType(msgType),
      attachments,
      metadata: root,
      timestamp: new Date(),
    };
  }

  private async resolve360DialogMedia(
    cfg: Extract<WhatsAppChannelConfig, { provider: "360dialog" }>,
    mediaId: string
  ): Promise<{ url: string; mime_type: string; size_bytes: number }> {
    const url = `${cleanBaseUrl(cfg.baseUrl)}/${mediaId}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "D360-API-KEY": cfg.apiKey },
    });
    if (!res.ok) {
      throw new Error(`360Dialog media resolve failed (${res.status})`);
    }
    const json = asRecord(await safeJson(res));
    return {
      url: String(json.url ?? ""),
      mime_type: String(json.mime_type ?? "application/octet-stream"),
      size_bytes: Number(json.file_size ?? 0),
    };
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return {};
  }
}
