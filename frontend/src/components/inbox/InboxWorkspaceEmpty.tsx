import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Inbox,
  Lightbulb,
  MessageSquare,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { AgentStatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { AgentStatus } from "@/data/mock";
import { apiJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/stores/authStore";

type DashboardStats = {
  conversations_resolved_today: number;
  conversations_waiting: number;
  volume_24h: { hour: string; count: number }[];
};

type QueueRow = {
  id: string;
  name: string;
  waiting: number;
  active: number;
};

type AgentRow = {
  id: string;
  name: string;
  status: string;
  max_concurrent: number;
  active_conversations: number;
  resolved_today: number;
};

const TIPS = [
  "Usa respuestas rápidas con /saludo o /horarios para responder más rápido.",
  "Cambia tu estado a AWAY o ON_BREAK cuando no estés disponible para nuevas conversaciones.",
  "Revisa el panel derecho para ver historial y datos del contacto.",
  "En llamadas de voz, confirma que el softphone esté registrado antes de marcar.",
  "Prioriza conversaciones con indicador de SLA en rojo en la lista.",
];

const TAB_LABELS: Record<string, string> = {
  mine: "Mis conv.",
  queue: "En cola",
  all: "Todas",
};

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName || "Agente";
}

function greetingForHour(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 18) return "Buenas tardes";
  return "Buenas noches";
}

type Props = {
  user: AuthUser | null;
  hasConversations: boolean;
  tab: "mine" | "queue" | "all";
  listCount: number;
};

export function InboxWorkspaceEmpty({ user, hasConversations, tab, listCount }: Props) {
  const canDashboard = user?.role === "admin" || Boolean(user?.permissions?.dashboard);

  const agentsQuery = useQuery({
    queryKey: ["agents", "inbox-workspace"],
    queryFn: () => apiJson<AgentRow[]>("/agents"),
    enabled: Boolean(user),
  });

  const queuesQuery = useQuery({
    queryKey: ["queues", "inbox-workspace"],
    queryFn: () => apiJson<QueueRow[]>("/queues"),
    enabled: Boolean(user),
  });

  const statsQuery = useQuery({
    queryKey: ["dashboard", "stats", "inbox-workspace"],
    queryFn: () => apiJson<DashboardStats>("/dashboard/stats"),
    enabled: Boolean(user && canDashboard),
    retry: false,
  });

  const me = agentsQuery.data?.find((a) => a.id === user?.id);
  const activeCount = me?.active_conversations ?? 0;
  const maxConcurrent = me?.max_concurrent ?? user?.max_concurrent ?? 5;
  const resolvedToday = me?.resolved_today ?? statsQuery.data?.conversations_resolved_today ?? 0;
  const loadPercent = Math.min(100, Math.round((activeCount / Math.max(maxConcurrent, 1)) * 100));
  const status = (me?.status ?? user?.status ?? "OFFLINE") as AgentStatus;

  const queues = queuesQuery.data ?? [];
  const totalWaiting = queues.reduce((sum, q) => sum + q.waiting, 0);
  const queuesWithWait = queues.filter((q) => q.waiting > 0).slice(0, 5);

  const chartData = useMemo(() => {
    const raw = statsQuery.data?.volume_24h ?? [];
    if (raw.length <= 8) return raw;
    return raw.slice(-8);
  }, [statsQuery.data?.volume_24h]);

  const tip = useMemo(() => TIPS[new Date().getDate() % TIPS.length], []);

  const loadingMetrics = agentsQuery.isLoading || queuesQuery.isLoading;

  return (
    <div className="flex-1 min-w-0 min-h-0 w-full overflow-y-auto scrollbar-thin bg-gradient-to-br from-muted/20 via-background to-primary/[0.03]">
      <div className="w-full px-6 lg:px-10 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-5 min-w-0 flex-1">
            <div
              className={cn(
                "relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border shadow-sm",
                hasConversations
                  ? "bg-primary/5 border-primary/20 text-primary"
                  : "bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              )}
            >
              {hasConversations ? (
                <MessageSquare size={30} strokeWidth={1.5} />
              ) : (
                <CheckCircle2 size={30} strokeWidth={1.5} />
              )}
              <Sparkles
                size={12}
                className="absolute -top-1 -right-1 text-primary/60 animate-pulse"
                aria-hidden
              />
            </div>
            <div className="space-y-1 min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">{greetingForHour()},</p>
              <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight truncate">
                {user ? firstName(user.name) : "Agente"}
              </h2>
              <h3 className="text-base font-medium pt-0.5">
                {hasConversations ? "Selecciona una conversación" : "Bandeja al día"}
              </h3>
              {!hasConversations ? (
                <p className="text-sm text-muted-foreground">
                  Tu bandeja en <span className="font-medium text-foreground">{TAB_LABELS[tab]}</span> está
                  al día.
                  {totalWaiting > 0 &&
                    ` Hay ${totalWaiting} en espera en otras colas.`}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {listCount} conversación{listCount !== 1 ? "es" : ""} en{" "}
                  <span className="font-medium text-foreground">{TAB_LABELS[tab]}</span>
                  {" · "}
                  <span className="inline-flex items-center gap-1">
                    <ArrowLeft size={12} className="text-primary" />
                    elige un hilo en la lista
                  </span>
                </p>
              )}
            </div>
          </div>
          <Badge variant="outline" className="gap-2 py-1.5 px-3 shrink-0 self-start">
            <AgentStatusBadge status={status} />
          </Badge>
        </div>

        {/* Stat cards — full width */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Activas</p>
                  <p className="text-3xl font-bold mt-1 tabular-nums">
                    {loadingMetrics ? "—" : activeCount}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">conversaciones asignadas</p>
                </div>
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <MessageSquare size={20} className="text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Resueltas hoy</p>
                  <p className="text-3xl font-bold mt-1 tabular-nums">
                    {loadingMetrics ? "—" : resolvedToday}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">cierre del día</p>
                </div>
                <div className="h-11 w-11 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Carga</p>
                  <p className="text-3xl font-bold mt-1 tabular-nums">
                    {loadingMetrics ? "—" : `${loadPercent}%`}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {activeCount}/{maxConcurrent} concurrentes
                  </p>
                </div>
                <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <TrendingUp size={20} className="text-muted-foreground" />
                </div>
              </div>
              {!loadingMetrics && (
                <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      loadPercent >= 90 ? "bg-destructive" : loadPercent >= 70 ? "bg-amber-500" : "bg-primary"
                    )}
                    style={{ width: `${loadPercent}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chart + queues — two columns on large screens */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {canDashboard && chartData.length > 0 ? (
            <Card
              className={cn(
                "border-border/60 shadow-sm overflow-hidden",
                queues.length > 0 ? "xl:col-span-8" : "xl:col-span-12"
              )}
            >
              <CardContent className="p-5 pb-3">
                <p className="text-sm font-medium mb-4">Actividad reciente del centro</p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="inboxVolumeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      className="text-muted-foreground"
                    />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelFormatter={(label) => `Hora ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      fill="url(#inboxVolumeGrad)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card
              className={cn(
                "border-border/60 shadow-sm",
                queues.length > 0 ? "xl:col-span-8" : "xl:col-span-12"
              )}
            >
              <CardContent className="p-5 flex flex-col justify-center min-h-[200px]">
                <p className="text-sm font-medium">Área de trabajo</p>
                <p className="text-sm text-muted-foreground mt-2 max-w-xl">
                  {hasConversations
                    ? "Selecciona una conversación en el panel izquierdo para ver mensajes, historial del contacto y acciones de la interacción."
                    : "Cuando lleguen nuevas conversaciones aparecerán en la lista. Mantén tu estado en ONLINE para recibir asignaciones."}
                </p>
              </CardContent>
            </Card>
          )}

          {queues.length > 0 && (
            <Card className="border-border/60 shadow-sm xl:col-span-4">
              <CardContent className="p-5 space-y-4 h-full">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <Clock size={14} className="text-muted-foreground" />
                    Colas del centro
                  </p>
                  <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
                    {totalWaiting} en espera
                  </Badge>
                </div>
                {queuesWithWait.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin conversaciones en espera en ninguna cola.</p>
                ) : (
                  <div className="space-y-3">
                    {queuesWithWait.map((q) => {
                      const maxBar = Math.max(...queuesWithWait.map((x) => x.waiting), 1);
                      const pct = Math.round((q.waiting / maxBar) * 100);
                      return (
                        <div key={q.id} className="space-y-1.5">
                          <div className="flex justify-between text-sm gap-2">
                            <span className="font-medium truncate">{q.name}</span>
                            <span className="text-muted-foreground shrink-0 tabular-nums">{q.waiting}</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary/70 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {queues.length > queuesWithWait.length && queuesWithWait.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    +{queues.length - queuesWithWait.length} cola(s) sin espera
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Tip — full width */}
        <div className="flex gap-4 rounded-xl border border-dashed border-border/80 bg-muted/30 p-5 w-full">
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
            <Lightbulb size={18} className="text-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Consejo del día
            </p>
            <p className="text-sm text-foreground/90">{tip}</p>
          </div>
          {!hasConversations && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground shrink-0 self-center">
              <Inbox size={14} />
              <span>Cortex Contact Center</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
