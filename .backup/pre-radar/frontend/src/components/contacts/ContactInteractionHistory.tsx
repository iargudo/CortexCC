import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, History } from "lucide-react";
import { apiJson } from "@/lib/api";
import { ChannelIcon } from "@/components/ChannelIcon";
import { ConversationStatusBadge } from "@/components/StatusBadge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ChannelType } from "@/data/mock";
import {
  type ContactInteractionsResponse,
  formatDuration,
  formatInteractionWhen,
  formatMessageSnippet,
  isActiveInteraction,
  senderLabel,
} from "@/lib/contactInteractions";

type Props = {
  contactId: string;
  currentConversationId?: string;
  variant?: "compact" | "full";
  limit?: number;
  defaultOpen?: boolean;
  enabled?: boolean;
  onViewAll?: () => void;
  className?: string;
};

function interactionHeader(item: ContactInteractionsResponse["items"][number]): string | null {
  if (item.kind === "voice_call") return item.preview ?? "Llamada de voz";
  if (item.subject) return item.subject;
  return null;
}

function MessageList({
  item,
  compact,
}: {
  item: ContactInteractionsResponse["items"][number];
  compact: boolean;
}) {
  const messages = item.recent_messages ?? [];
  const header = interactionHeader(item);
  const remaining =
    item.message_count != null && item.message_count > messages.length
      ? item.message_count - messages.length
      : 0;

  if (item.kind === "voice_call") {
    return header ? <p className="text-xs text-muted-foreground mt-0.5">{header}</p> : null;
  }

  if (messages.length === 0) {
    const fallback = item.preview ?? header;
    return fallback ? (
      <p className={cn("text-xs text-muted-foreground mt-0.5", compact && "truncate")}>{fallback}</p>
    ) : null;
  }

  return (
    <div className="mt-1.5 space-y-1 border-l-2 border-muted pl-2">
      {header && (
        <p className="text-[10px] font-medium text-muted-foreground truncate">{header}</p>
      )}
      {messages.map((msg, idx) => (
        <div key={`${item.id}-msg-${idx}`} className="min-w-0">
          <p className="text-[10px] text-muted-foreground">
            {senderLabel(msg.sender_type)}
            <span className="mx-1">·</span>
            {formatInteractionWhen(msg.created_at)}
          </p>
          <p className={cn("text-xs text-foreground/90", compact ? "line-clamp-2" : "line-clamp-3")}>
            {formatMessageSnippet(msg.content, msg.content_type)}
          </p>
        </div>
      ))}
      {remaining > 0 && (
        <p className="text-[10px] text-primary/80">
          + {remaining} mensaje{remaining === 1 ? "" : "s"} más · abrir conversación
        </p>
      )}
    </div>
  );
}

export function ContactInteractionHistory({
  contactId,
  currentConversationId,
  variant = "compact",
  limit,
  defaultOpen = true,
  enabled = true,
  onViewAll,
  className,
}: Props) {
  const navigate = useNavigate();
  const isCompact = variant === "compact";
  const fetchLimit = limit ?? (isCompact ? 8 : 100);
  const messagesPerConversation = isCompact ? 3 : 5;

  const query = useQuery({
    queryKey: ["contacts", contactId, "interactions", fetchLimit, messagesPerConversation],
    queryFn: () =>
      apiJson<ContactInteractionsResponse>(
        `/contacts/${encodeURIComponent(contactId)}/interactions?limit=${fetchLimit}&messages_per_conversation=${messagesPerConversation}`
      ),
    enabled: Boolean(contactId) && enabled,
  });

  const data = query.data;
  const items = data?.items ?? [];
  const stats = data?.stats;
  const mergedHint =
    data && data.merged_contact_count > 1
      ? `${data.merged_contact_count} fichas unificadas por teléfono/email`
      : null;

  const openConversation = (conversationId: string) => {
    if (conversationId === currentConversationId) return;
    navigate(`/?conversation=${encodeURIComponent(conversationId)}`);
  };

  const listBody = (
    <div className={cn(isCompact ? "space-y-1.5" : "space-y-0 relative")}>
      {!isCompact && items.length > 0 && (
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border" aria-hidden />
      )}
      {query.isLoading && (
        <p className={cn("text-xs text-muted-foreground", !isCompact && "pl-10")}>Cargando historial…</p>
      )}
      {query.isError && (
        <p className={cn("text-xs text-destructive", !isCompact && "pl-10")}>
          {(query.error as Error).message || "No se pudo cargar el historial"}
        </p>
      )}
      {!query.isLoading && !query.isError && items.length === 0 && (
        <p className={cn("text-xs text-muted-foreground", !isCompact && "pl-10")}>
          Sin interacciones previas en ningún canal.
        </p>
      )}
      {items.map((item) => {
        const channelType = (item.channel_type ?? "VOICE") as ChannelType;
        const active = isActiveInteraction(item.status);
        const clickable = Boolean(item.conversation_id);
        const isCurrent = item.conversation_id === currentConversationId;
        const duration =
          item.kind === "voice_call"
            ? formatDuration(item.duration_seconds)
            : formatDuration(item.handle_time_seconds);

        const content = (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <ChannelIcon channel={channelType} size={12} />
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatInteractionWhen(item.occurred_at)}
              </span>
              {active && (
                <ConversationStatusBadge status={item.status as never} />
              )}
              {isCurrent && (
                <span className="text-[10px] text-primary font-medium shrink-0">Actual</span>
              )}
            </div>
            <MessageList item={item} compact={isCompact} />
            {(duration || item.queue_name) && (
              <p className="text-[10px] text-muted-foreground mt-1 truncate">
                {[duration, item.queue_name].filter(Boolean).join(" · ")}
              </p>
            )}
          </>
        );

        if (isCompact) {
          return (
            <button
              key={item.id}
              type="button"
              disabled={!clickable}
              onClick={() => item.conversation_id && openConversation(item.conversation_id)}
              className={cn(
                "w-full text-left rounded-md border px-2.5 py-2 transition-colors",
                clickable && "hover:bg-muted/50 cursor-pointer",
                !clickable && "cursor-default opacity-90",
                isCurrent && "border-primary/40 bg-primary/5"
              )}
            >
              {content}
            </button>
          );
        }

        return (
          <div key={item.id} className="relative pl-10 pb-4">
            <div
              className={cn(
                "absolute left-2.5 top-1 w-3 h-3 rounded-full ring-2 ring-background",
                active ? "bg-primary" : "bg-muted"
              )}
            />
            {clickable ? (
              <button
                type="button"
                onClick={() => item.conversation_id && openConversation(item.conversation_id)}
                className={cn(
                  "w-full text-left border rounded-lg p-3 transition-colors hover:bg-muted/40",
                  active && "bg-primary/5",
                  isCurrent && "border-primary/40"
                )}
              >
                {content}
              </button>
            ) : (
              <div className="border rounded-lg p-3 bg-muted/20">{content}</div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (isCompact) {
    return (
      <Collapsible defaultOpen={defaultOpen} className={className}>
        <div className="px-4 pt-1 pb-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium hover:text-foreground text-muted-foreground transition-colors group">
              <History size={14} />
              Historial reciente
              <ChevronDown size={12} className="transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            {onViewAll && (
              <button
                type="button"
                onClick={onViewAll}
                className="text-[10px] text-primary hover:underline shrink-0"
              >
                Ver todo
              </button>
            )}
          </div>
          {mergedHint && (
            <p className="text-[10px] text-muted-foreground mb-2">{mergedHint}</p>
          )}
          <CollapsibleContent>{listBody}</CollapsibleContent>
        </div>
      </Collapsible>
    );
  }

  return (
    <div className={className}>
      {mergedHint && (
        <p className="text-[10px] text-muted-foreground mb-3">{mergedHint}</p>
      )}
      {listBody}
      {stats && (
        <p className="text-[10px] text-muted-foreground mt-3">
          {stats.total_interactions} interacciones en total
          {stats.active_count > 0 ? ` · ${stats.active_count} activas` : ""}
        </p>
      )}
    </div>
  );
}

export function useContactInteractions(contactId: string, limit = 100, enabled = true) {
  const messagesPerConversation = limit <= 8 ? 3 : 5;
  return useQuery({
    queryKey: ["contacts", contactId, "interactions", limit, messagesPerConversation],
    queryFn: () =>
      apiJson<ContactInteractionsResponse>(
        `/contacts/${encodeURIComponent(contactId)}/interactions?limit=${limit}&messages_per_conversation=${messagesPerConversation}`
      ),
    enabled: Boolean(contactId) && enabled,
  });
}
