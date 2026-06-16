import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Radar } from "lucide-react";
import { apiJson } from "@/lib/api";
import { ChannelIcon } from "@/components/ChannelIcon";
import { cn } from "@/lib/utils";
import type { ChannelType } from "@/data/mock";
import {
  type ContactActivityFeedResponse,
  buildRadarHeadline,
  formatActivityWhen,
} from "@/lib/contactActivityFeed";

type Props = {
  contactId: string;
  excludeConversationId?: string;
  limit?: number;
  onViewAll?: () => void;
  className?: string;
};

export function ContactActivityRadar({
  contactId,
  excludeConversationId,
  limit = 6,
  onViewAll,
  className,
}: Props) {
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["contacts", contactId, "activity-feed", limit, excludeConversationId ?? ""],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (excludeConversationId) params.set("exclude_conversation_id", excludeConversationId);
      return apiJson<ContactActivityFeedResponse>(
        `/contacts/${encodeURIComponent(contactId)}/activity-feed?${params.toString()}`
      );
    },
    enabled: Boolean(contactId),
  });

  const data = query.data;
  const events = data?.events ?? [];
  const headline = data ? buildRadarHeadline(data.summary) : null;
  const mergedHint =
    data && data.merged_contact_count > 1
      ? `${data.merged_contact_count} fichas unificadas por teléfono/email`
      : null;

  const openConversation = (conversationId: string) => {
    if (conversationId === excludeConversationId) return;
    navigate(`/?conversation=${encodeURIComponent(conversationId)}`);
  };

  return (
    <div className={cn("px-4 py-3", className)}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Radar size={14} className="text-primary" />
          Casos anteriores
        </div>
        {onViewAll && (
          <button type="button" onClick={onViewAll} className="text-[10px] text-primary hover:underline shrink-0">
            Historial completo
          </button>
        )}
      </div>

      {query.isLoading && <p className="text-xs text-muted-foreground">Cargando…</p>}
      {query.isError && (
        <p className="text-xs text-destructive">{(query.error as Error).message || "Error al cargar"}</p>
      )}

      {!query.isLoading && !query.isError && (
        <>
          {headline && (
            <p className="text-[11px] text-muted-foreground leading-snug mb-2">{headline}</p>
          )}
          {mergedHint && <p className="text-[10px] text-muted-foreground mb-2">{mergedHint}</p>}

          <div className="max-h-[168px] overflow-y-auto scrollbar-thin rounded-md border bg-muted/20 divide-y">
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">No hay otros casos con este cliente.</p>
            ) : (
              events.map((event) => {
                const channelType = event.channel_type as ChannelType;
                const clickable = Boolean(event.conversation_id);
                const Row = clickable ? "button" : "div";
                return (
                  <Row
                    key={event.id}
                    type={clickable ? "button" : undefined}
                    onClick={clickable ? () => openConversation(event.conversation_id!) : undefined}
                    className={cn(
                      "w-full text-left px-2.5 py-2 flex gap-2 items-start min-w-0",
                      clickable && "hover:bg-muted/60 transition-colors cursor-pointer"
                    )}
                  >
                    <span className="shrink-0 mt-0.5">
                      <ChannelIcon channel={channelType} size={12} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatActivityWhen(event.occurred_at)}
                        </span>
                        {event.outcome_label && (
                          <span className="text-[10px] font-medium text-foreground/80">{event.outcome_label}</span>
                        )}
                      </span>
                      <span className="block text-xs text-foreground/90 line-clamp-2 leading-snug mt-0.5">
                        {event.summary}
                      </span>
                    </span>
                  </Row>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
