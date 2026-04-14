import type { AgentStatus, ConversationStatus } from "@/data/mock";
import { cn } from "@/lib/utils";

const agentStatusConfig: Record<AgentStatus, { label: string; dotClass: string }> = {
  ONLINE: { label: "En línea", dotClass: "bg-status-online" },
  AWAY: { label: "Ausente", dotClass: "bg-status-away" },
  BUSY: { label: "Ocupado", dotClass: "bg-status-busy" },
  OFFLINE: { label: "Desconectado", dotClass: "bg-status-offline" },
  ON_BREAK: { label: "En descanso", dotClass: "bg-status-break" },
};

export function AgentStatusDot({ status, className }: { status: AgentStatus; className?: string }) {
  return <span className={cn("inline-block w-2.5 h-2.5 rounded-full", agentStatusConfig[status].dotClass, className)} />;
}

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const config = agentStatusConfig[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <AgentStatusDot status={status} />
      {config.label}
    </span>
  );
}

const convStatusConfig: Record<ConversationStatus, { label: string; variant: string }> = {
  WAITING: { label: "En cola", variant: "bg-status-away/20 text-status-away" },
  ASSIGNED: { label: "Asignada", variant: "bg-primary/20 text-primary" },
  ACTIVE: { label: "Activa", variant: "bg-status-online/20 text-status-online" },
  ON_HOLD: { label: "En espera", variant: "bg-status-away/20 text-status-away" },
  WRAP_UP: { label: "Cierre", variant: "bg-status-break/20 text-status-break" },
  RESOLVED: { label: "Resuelta", variant: "bg-muted text-muted-foreground" },
  ABANDONED: { label: "Abandonada", variant: "bg-destructive/20 text-destructive" },
  TRANSFERRED: { label: "Transferida", variant: "bg-primary/20 text-primary" },
};

export function ConversationStatusBadge({ status }: { status: ConversationStatus }) {
  const config = convStatusConfig[status];
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", config.variant)}>
      {config.label}
    </span>
  );
}
