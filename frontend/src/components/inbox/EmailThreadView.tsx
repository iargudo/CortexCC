import { useState } from "react";
import DOMPurify from "dompurify";
import { type Message } from "@/data/mock";
import {
  Mail, Reply, ReplyAll, Forward, Paperclip, ChevronDown, ChevronUp,
  StickyNote, Bot, Clock, User, FileText, Image, File,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmailThreadViewProps {
  messages: Message[];
  subject?: string;
  contactName: string;
  contactEmail?: string;
  agentName?: string;
}

type EmailAttachment = { filename: string; mime_type: string; size_bytes: number; url?: string };

function resolveCidSources(html: string, attachments: EmailAttachment[]): string {
  let out = html;
  for (const att of attachments) {
    if (!att.url) continue;
    const filename = (att.filename || "").trim().toLowerCase();
    if (!filename) continue;
    const stem = filename.replace(/\.[a-z0-9]+$/i, "");
    const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`cid:${escapedFilename}`, "gi"), att.url);
    out = out.replace(new RegExp(`cid:${escapedStem}[^\"'\\s>]*`, "gi"), att.url);
  }
  return out;
}

function AttachmentChip({
  attachment,
}: {
  attachment: { filename: string; mime_type: string; size_bytes: number; url?: string };
}) {
  const icon = attachment.mime_type.startsWith("image/")
    ? <Image size={12} />
    : attachment.mime_type === "application/pdf"
      ? <FileText size={12} />
      : <File size={12} />;

  const size = attachment.size_bytes > 1024 * 1024
    ? `${(attachment.size_bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(attachment.size_bytes / 1024)} KB`;

  const body = (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border bg-muted/40 hover:bg-muted transition-colors cursor-pointer text-xs">
      <span className="text-muted-foreground">{icon}</span>
      <span className="font-medium truncate max-w-[140px]">{attachment.filename}</span>
      <span className="text-muted-foreground">({size})</span>
    </div>
  );
  if (!attachment.url) return body;
  return (
    <a href={attachment.url} target="_blank" rel="noreferrer">
      {body}
    </a>
  );
}

function EmailMessage({
  msg,
  contactName,
  contactEmail,
  agentName,
  isLast,
}: {
  msg: Message;
  contactName: string;
  contactEmail?: string;
  agentName?: string;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(isLast);
  const isAgent = msg.sender_type === "AGENT";
  const isBot = msg.sender_type === "BOT";
  const isNote = msg.is_internal;
  const isSystem = msg.sender_type === "SYSTEM";

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="text-[11px] text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
          {msg.content}
        </span>
      </div>
    );
  }

  const senderName = isAgent ? (msg.sender_name || agentName || "Agente") : isBot ? (msg.sender_name || "Bot") : contactName;
  const senderEmail = isAgent ? "agente@cortexcontactcenter.com" : isBot ? "bot@cortexcontactcenter.com" : (contactEmail || "");
  const date = new Date(msg.created_at);
  const dateStr = date.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
  const timeStr = date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  const attachments = msg.attachments ?? [];
  const isHtmlBody = msg.content_type === "HTML" && !isNote;
  const safeHtml = isHtmlBody
    ? DOMPurify.sanitize(resolveCidSources(msg.content, attachments), {
        USE_PROFILES: { html: true },
        ALLOWED_ATTR: ["href", "src", "alt", "title", "style", "target", "rel"],
      })
    : "";

  return (
    <div className={cn(
      "border rounded-lg overflow-hidden",
      isNote && "border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10",
      !isNote && "bg-card",
    )}>
      {/* Email header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors"
      >
        {/* Avatar */}
        <div className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5",
          isNote ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
            : isAgent ? "bg-primary/10 text-primary"
              : isBot ? "bg-muted text-muted-foreground"
                : "bg-accent text-accent-foreground"
        )}>
          {isNote ? <StickyNote size={16} />
            : isBot ? <Bot size={16} />
              : senderName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{senderName}</span>
            {isNote && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200/60 text-amber-800 dark:bg-amber-800/40 dark:text-amber-300 font-medium">Nota interna</span>}
            {isBot && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">Bot</span>}
          </div>

          {!expanded && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{msg.content}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {dateStr} {timeStr}
          </span>
          {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded email body */}
      {expanded && (
        <div className="border-t">
          {/* Email metadata */}
          <div className="px-4 py-2 bg-muted/20 text-xs space-y-0.5">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-8 shrink-0">De:</span>
              <span className="font-medium">{senderName}</span>
              {senderEmail && <span className="text-muted-foreground">&lt;{senderEmail}&gt;</span>}
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-8 shrink-0">Para:</span>
              <span>
                {isAgent
                  ? `${contactName} <${contactEmail || "cliente@email.com"}>`
                  : `${agentName || "Agente"} <agente@cortexcontactcenter.com>`}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-8 shrink-0">
                <Clock size={10} className="inline mt-px" />
              </span>
              <span>{dateStr} a las {timeStr}</span>
            </div>
          </div>

          {/* Email body */}
          <div className="px-4 py-4">
            {isHtmlBody ? (
              <div
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: safeHtml }}
              />
            ) : (
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
            )}
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="px-4 pb-3 border-t pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Paperclip size={12} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  {attachments.length} adjunto{attachments.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {attachments.map((att, i) => (
                  <AttachmentChip key={i} attachment={att} />
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {attachments
                  .filter((att) => att.mime_type.startsWith("image/") && Boolean(att.url))
                  .map((att, idx) => (
                    <img
                      key={`img-${idx}`}
                      src={att.url}
                      alt={att.filename || "Imagen adjunta"}
                      className="max-h-72 max-w-full rounded border object-contain bg-background/40"
                      loading="lazy"
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Quick actions */}
          {!isNote && (
            <div className="px-4 py-2 border-t flex gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                <Reply size={12} /> Responder
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                <ReplyAll size={12} /> Responder a todos
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                <Forward size={12} /> Reenviar
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EmailThreadView({
  messages,
  subject,
  contactName,
  contactEmail,
  agentName,
}: EmailThreadViewProps) {
  const nonSystemMessages = messages.filter(m => m.sender_type !== "SYSTEM");
  const systemMessages = messages.filter(m => m.sender_type === "SYSTEM");

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-background">
      {/* Subject header */}
      {subject && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-muted-foreground shrink-0" />
            <h2 className="text-sm font-semibold truncate">{subject}</h2>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 ml-6">
            {nonSystemMessages.length} mensaje{nonSystemMessages.length !== 1 ? "s" : ""} en este hilo
          </p>
        </div>
      )}

      {/* System events */}
      {systemMessages.map(msg => (
        <div key={msg.id} className="flex justify-center py-2">
          <span className="text-[11px] text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
            {msg.content}
          </span>
        </div>
      ))}

      {/* Email thread */}
      <div className="p-4 space-y-3">
        {nonSystemMessages.length === 0 && (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            Sin mensajes en este hilo
          </div>
        )}

        {nonSystemMessages.map((msg, idx) => (
          <EmailMessage
            key={msg.id}
            msg={msg}
            contactName={contactName}
            contactEmail={contactEmail}
            agentName={agentName}
            isLast={idx === nonSystemMessages.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
