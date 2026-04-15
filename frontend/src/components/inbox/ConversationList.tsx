import { type Conversation, type ChannelType } from "@/data/mock";
import { ChannelIcon } from "@/components/ChannelIcon";
import { PriorityIndicator, SlaBar } from "@/components/PriorityIndicator";
import { ConversationStatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";
import { MessageSquare, Mail, Phone, Globe, Users } from "lucide-react";

const channels: { type: ChannelType; icon: typeof MessageSquare }[] = [
  { type: "WHATSAPP", icon: MessageSquare },
  { type: "EMAIL", icon: Mail },
  { type: "TEAMS", icon: Users },
  { type: "VOICE", icon: Phone },
  { type: "WEBCHAT", icon: Globe },
];

interface Props {
  conversations: Conversation[];
  /** Resalta fila aunque el detalle aún no cargó (p. ej. `?conversation=`). */
  highlightId?: string | null;
  selected: Conversation | null;
  onSelect: (c: Conversation) => void;
  tab: "mine" | "queue" | "all";
  onTabChange: (t: "mine" | "queue" | "all") => void;
  channelFilter: ChannelType | null;
  onChannelFilterChange: (c: ChannelType | null) => void;
  /** Si es false, no se muestra la pestaña "Todas" (requiere rol supervisor/admin en API). */
  showAllTab?: boolean;
}

export function ConversationList({
  conversations,
  highlightId = null,
  selected,
  onSelect,
  tab,
  onTabChange,
  channelFilter,
  onChannelFilterChange,
  showAllTab = false,
}: Props) {
  const tabs = (showAllTab ? (["mine", "queue", "all"] as const) : (["mine", "queue"] as const));
  const timeAgo = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diff < 1) return "ahora";
    if (diff < 60) return `${diff}m`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h`;
    return `${Math.floor(diff / 1440)}d`;
  };

  return (
    <div className="w-64 h-full min-h-0 border-r flex flex-col bg-card shrink-0 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTabChange(t)}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium transition-colors",
              tab === t ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "mine" ? "Mis conv." : t === "queue" ? "En cola" : "Todas"}
          </button>
        ))}
      </div>

      {/* Channel filter */}
      <div className="flex gap-1 p-2 border-b">
        <button
          type="button"
          onClick={() => onChannelFilterChange(null)}
          className={cn("px-2 py-1 rounded text-[10px] font-medium transition-colors",
            !channelFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          Todos
        </button>
        {channels.map(ch => (
          <button
            type="button"
            key={ch.type}
            onClick={() => onChannelFilterChange(channelFilter === ch.type ? null : ch.type)}
            className={cn("p-1 rounded transition-colors",
              channelFilter === ch.type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <ch.icon size={14} />
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No hay conversaciones</div>
        ) : (
          conversations.map(conv => (
            <button
              type="button"
              key={conv.id}
              onClick={() => onSelect(conv)}
              className={cn(
                "w-full text-left p-3 border-b transition-colors hover:bg-muted/50",
                (selected?.id === conv.id || highlightId === conv.id) && "bg-muted"
              )}
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5 w-7 flex flex-col items-center gap-1.5 shrink-0">
                  <ChannelIcon channel={conv.channel} size={14} />
                  <PriorityIndicator priority={conv.priority} />
                  {conv.unread_count > 0 && (
                    <span className="bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-medium truncate">{conv.contact.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(conv.last_message_at)}</span>
                  </div>
                  {conv.subject && <p className="text-xs text-muted-foreground truncate">{conv.subject}</p>}
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.last_message}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <ConversationStatusBadge status={conv.status} />
                    <span className="text-[10px] text-muted-foreground">●{conv.queue_name}</span>
                  </div>
                  {conv.sla_percent !== undefined && (
                    <div className="mt-1.5">
                      <SlaBar percent={conv.sla_percent} />
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
