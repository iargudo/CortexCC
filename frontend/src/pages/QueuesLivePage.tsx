import { useMemo, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import type { Conversation } from "@/data/mock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChannelIcon } from "@/components/ChannelIcon";
import { PriorityIndicator } from "@/components/PriorityIndicator";
import { AssignDialog } from "@/components/inbox/AssignDialog";
import { useAuthStore } from "@/stores/authStore";
import { apiJson } from "@/lib/api";
import {
  Clock, Users, AlertTriangle, ArrowUpDown, UserPlus, GripVertical,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";

type QueueRow = {
  id: string;
  name: string;
  description?: string;
  routing_strategy: string;
  waiting: number;
  active: number;
  agents_online: number;
  sla_percent: number;
  avg_wait_seconds: number;
  is_active: boolean;
};

export default function QueuesLivePage() {
  const canSupervisor = useAuthStore((s) => s.user?.role === "supervisor" || s.user?.role === "admin");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignContact, setAssignContact] = useState("");
  const [assignConversationId, setAssignConversationId] = useState<string | null>(null);

  const queuesQuery = useQuery({
    queryKey: ["queues", "live"],
    queryFn: () => apiJson<QueueRow[]>("/queues"),
    enabled: canSupervisor,
  });

  const queues = (queuesQuery.data ?? []).filter((q) => q.is_active);

  const waitingQueries = useQueries({
    queries: queues.map((q) => ({
      queryKey: ["queues", q.id, "waiting"],
      queryFn: () => apiJson<Conversation[]>(`/queues/${q.id}/waiting`),
      enabled: canSupervisor && queuesQuery.isSuccess && queues.length > 0,
    })),
  });

  const activeQueries = useQueries({
    queries: queues.map((q) => ({
      queryKey: ["queues", q.id, "active"],
      queryFn: () => apiJson<Conversation[]>(`/queues/${q.id}/active`),
      enabled: canSupervisor && queuesQuery.isSuccess && queues.length > 0,
    })),
  });

  const queueData = useMemo(() => {
    return queues.map((queue, i) => ({
      queue,
      waiting: waitingQueries[i]?.data ?? [],
      active: activeQueries[i]?.data ?? [],
    }));
  }, [queues, waitingQueries, activeQueries]);

  if (!canSupervisor) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Se requiere rol supervisor para ver colas en vivo.</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ArrowUpDown size={20} /> Colas en Tiempo Real
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-muted/50 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">Datos del API</span>
          </div>
        </div>
      </div>

      {queuesQuery.error && (
        <p className="text-sm text-destructive">{(queuesQuery.error as Error).message}</p>
      )}

      <div className="grid grid-cols-5 gap-3">
        {queuesQuery.isLoading && <p className="text-sm text-muted-foreground col-span-5">Cargando colas…</p>}
        {queueData.map(({ queue }) => {
          const slaColor =
            queue.sla_percent >= 85 ? "text-emerald-500" : queue.sla_percent >= 70 ? "text-amber-500" : "text-destructive";
          return (
            <Card key={queue.id} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">{queue.name}</span>
                <Badge variant="secondary" className="text-[9px]">
                  {queue.routing_strategy.replaceAll("_", " ")}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div>
                  <p className="text-lg font-bold text-amber-500">{queue.waiting}</p>
                  <p className="text-[9px] text-muted-foreground">Espera</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{queue.active}</p>
                  <p className="text-[9px] text-muted-foreground">Activas</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-500">{queue.agents_online}</p>
                  <p className="text-[9px] text-muted-foreground">Agentes</p>
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">SLA</span>
                  <span className={cn("font-medium", slaColor)}>{queue.sla_percent}%</span>
                </div>
                <Progress value={queue.sla_percent} className="h-1.5" />
              </div>
              <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                <Timer size={10} />
                <span>Espera prom: {queue.avg_wait_seconds}s</span>
              </div>
            </Card>
          );
        })}
      </div>

      {queueData.map(({ queue, waiting, active }) => (
        <Card key={queue.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                {queue.name}
                {waiting.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  >
                    {waiting.length} en espera
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Users size={12} /> {queue.agents_online} agentes
                <span>•</span>
                <span>Estrategia: {queue.routing_strategy.replaceAll("_", " ")}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {waiting.length === 0 && active.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin conversaciones en esta cola</p>
            ) : (
              <div className="space-y-1">
                {waiting.length > 0 && (
                  <>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                      En espera ({waiting.length})
                    </p>
                    {waiting.map((conv, idx) => (
                      <div
                        key={conv.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg border border-amber-200/50 bg-amber-50/30 dark:border-amber-800/30 dark:bg-amber-950/10 hover:bg-amber-50/60 transition-colors group cursor-move"
                      >
                        <GripVertical size={14} className="text-muted-foreground/50 group-hover:text-muted-foreground shrink-0" />
                        <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">#{idx + 1}</span>
                        <ChannelIcon channel={conv.channel} size={14} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{conv.contact.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{conv.last_message || "Esperando..."}</p>
                        </div>
                        <PriorityIndicator priority={conv.priority} />
                        <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <Clock size={12} />
                          <span className="font-mono">
                            {conv.wait_time_seconds
                              ? `${Math.floor(conv.wait_time_seconds / 60)}:${(conv.wait_time_seconds % 60).toString().padStart(2, "0")}`
                              : "0:00"}
                          </span>
                        </div>
                        {conv.sla_percent && conv.sla_percent > 70 && (
                          <AlertTriangle size={14} className={conv.sla_percent > 90 ? "text-destructive" : "text-amber-500"} />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            setAssignContact(conv.contact.name);
                            setAssignConversationId(conv.id);
                            setAssignOpen(true);
                          }}
                        >
                          <UserPlus size={10} className="mr-0.5" /> Asignar
                        </Button>
                      </div>
                    ))}
                  </>
                )}

                {active.length > 0 && (
                  <>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 mt-3">
                      En atención ({active.length})
                    </p>
                    {active.map((conv) => (
                      <div
                        key={conv.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="w-5" />
                        <ChannelIcon channel={conv.channel} size={14} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{conv.contact.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{conv.last_message}</p>
                        </div>
                        <PriorityIndicator priority={conv.priority} />
                        <span className="text-xs text-muted-foreground">{conv.assigned_agent || "—"}</span>
                        <Badge variant="secondary" className="text-[9px]">
                          {conv.status === "ACTIVE" ? "Activa" : conv.status === "ON_HOLD" ? "En espera" : conv.status}
                        </Badge>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        conversationId={assignConversationId ?? undefined}
        conversationContact={assignContact}
        mode="assign"
      />
    </div>
  );
}
