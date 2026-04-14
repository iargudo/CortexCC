import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AgentStatusBadge } from "@/components/StatusBadge";
import { Users, Clock, MessageSquare, CheckCircle, TrendingUp, AlertTriangle, ThumbsUp, Maximize2, Minimize2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { apiJson } from "@/lib/api";

type DashboardStats = {
  agents_online: number;
  agents_total: number;
  conversations_waiting: number;
  conversations_active: number;
  conversations_resolved_today: number;
  avg_wait_seconds: number;
  avg_handle_seconds: number;
  sla_compliance: number;
  csat_avg: number;
  abandonment_rate: number;
  transfer_rate: number;
  escalations_from_ai: number;
  volume_24h: { hour: string; count: number }[];
  channel_breakdown: { channel: string; count: number; percentage: number }[];
};

type QueueRow = {
  id: string;
  name: string;
  waiting: number;
  active: number;
  agents_online: number;
  sla_percent: number;
  avg_wait_seconds: number;
};

type AgentRow = {
  id: string;
  name: string;
  status: string;
  max_concurrent: number;
  active_conversations: number;
  resolved_today: number;
  skills: { name: string; proficiency: number }[];
};

const channelColors = ["hsl(142, 70%, 49%)", "hsl(217, 91%, 60%)", "hsl(38, 92%, 50%)", "hsl(188, 94%, 43%)", "hsl(249, 33%, 52%)"];

export default function DashboardPage() {
  const [fullscreen, setFullscreen] = useState(false);

  const statsQuery = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: () => apiJson<DashboardStats>("/dashboard/stats"),
  });
  const queuesQuery = useQuery({
    queryKey: ["queues"],
    queryFn: () => apiJson<QueueRow[]>("/queues"),
  });
  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiJson<AgentRow[]>("/agents"),
  });

  const stats = statsQuery.data;
  const queues = queuesQuery.data ?? [];
  const agents = agentsQuery.data ?? [];

  const statCards = useMemo(() => {
    if (!stats) return [];
    return [
      { label: "Agentes en línea", value: `${stats.agents_online}/${stats.agents_total}`, icon: Users, color: "text-status-online" },
      { label: "En cola", value: stats.conversations_waiting, icon: Clock, color: "text-status-away" },
      { label: "Activas", value: stats.conversations_active, icon: MessageSquare, color: "text-primary" },
      { label: "Resueltas hoy", value: stats.conversations_resolved_today, icon: CheckCircle, color: "text-status-online" },
      { label: "Espera prom.", value: `${stats.avg_wait_seconds}s`, icon: Clock, color: "text-muted-foreground" },
      { label: "AHT", value: `${Math.floor(stats.avg_handle_seconds / 60)}m`, icon: TrendingUp, color: "text-primary" },
      { label: "SLA", value: `${stats.sla_compliance}%`, icon: AlertTriangle, color: stats.sla_compliance >= 80 ? "text-status-online" : "text-status-away" },
      { label: "CSAT", value: `${stats.csat_avg}/5`, icon: ThumbsUp, color: "text-status-online" },
    ];
  }, [stats]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
      setFullscreen(true);
    } else {
      void document.exitFullscreen();
      setFullscreen(false);
    }
  };

  const loading = statsQuery.isLoading || queuesQuery.isLoading || agentsQuery.isLoading;
  const err = statsQuery.error || queuesQuery.error || agentsQuery.error;

  return (
    <div className={cn("p-6 overflow-y-auto h-full scrollbar-thin space-y-6", fullscreen && "bg-background")}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <Button variant="outline" size="sm" className="gap-1" onClick={toggleFullscreen}>
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {fullscreen ? "Salir" : "Wallboard"}
        </Button>
      </div>

      {err && (
        <p className="text-sm text-destructive">{(err as Error).message}</p>
      )}

      {loading && !stats && <p className="text-sm text-muted-foreground">Cargando métricas…</p>}

      {stats && (
        <>
          <div className="grid grid-cols-4 gap-4">
            {statCards.map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                      <p className="text-2xl font-bold mt-1">{s.value}</p>
                    </div>
                    <s.icon size={20} className={s.color} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card className="col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Volumen de conversaciones (24h)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={stats.volume_24h}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary) / 0.15)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Por canal</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie
                      data={stats.channel_breakdown}
                      dataKey="count"
                      nameKey="channel"
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={55}
                      strokeWidth={2}
                    >
                      {stats.channel_breakdown.map((_, i) => (
                        <Cell key={i} fill={channelColors[i % channelColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 mt-2">
                  {stats.channel_breakdown.map((ch, i) => (
                    <div key={ch.channel} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: channelColors[i % channelColors.length] }} />
                        {ch.channel}
                      </span>
                      <span className="font-medium">
                        {ch.count} ({ch.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Tasa de abandono</p>
                <p className="text-2xl font-bold text-status-away">{stats.abandonment_rate}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Tasa de transferencia</p>
                <p className="text-2xl font-bold">{stats.transfer_rate}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Escalamientos IA</p>
                <p className="text-2xl font-bold">{stats.escalations_from_ai}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">SLA (panel)</p>
                <p className="text-2xl font-bold text-status-online">{stats.sla_compliance}%</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Colas en tiempo real</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-2 font-medium">Cola</th>
                <th className="text-center py-2 font-medium">Esperando</th>
                <th className="text-center py-2 font-medium">Activas</th>
                <th className="text-center py-2 font-medium">Agentes</th>
                <th className="text-center py-2 font-medium">SLA %</th>
                <th className="text-center py-2 font-medium">Espera prom.</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((q) => (
                <tr key={q.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{q.name}</td>
                  <td className="text-center py-2">
                    <span className={q.waiting > 0 ? "text-status-away font-medium" : "text-muted-foreground"}>{q.waiting}</span>
                  </td>
                  <td className="text-center py-2">{q.active}</td>
                  <td className="text-center py-2">{q.agents_online}</td>
                  <td className="text-center py-2">
                    <span
                      className={
                        q.sla_percent >= 80 ? "text-status-online" : q.sla_percent >= 60 ? "text-status-away" : "text-destructive"
                      }
                    >
                      {q.sla_percent}%
                    </span>
                  </td>
                  <td className="text-center py-2 text-muted-foreground">{q.avg_wait_seconds}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Agentes</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-2 font-medium">Agente</th>
                <th className="text-center py-2 font-medium">Estado</th>
                <th className="text-center py-2 font-medium">Activas</th>
                <th className="text-center py-2 font-medium">Resueltas hoy</th>
                <th className="text-center py-2 font-medium">Skills</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{a.name}</td>
                  <td className="text-center py-2">
                    <AgentStatusBadge status={a.status as never} />
                  </td>
                  <td className="text-center py-2">
                    {a.active_conversations}/{a.max_concurrent}
                  </td>
                  <td className="text-center py-2">{a.resolved_today}</td>
                  <td className="text-center py-2 text-muted-foreground text-xs">
                    {a.skills.slice(0, 3).map((s) => s.name).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
