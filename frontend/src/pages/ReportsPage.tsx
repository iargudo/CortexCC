import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChannelType } from "@/data/mock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, Download, MessageSquare, CheckCircle, ThumbsUp, Phone, Clock, TrendingUp, TrendingDown,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { apiFetch, apiJson } from "@/lib/api";

function rangeForPreset(preset: string): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  if (preset === "7d") from.setDate(from.getDate() - 7);
  else if (preset === "90d") from.setDate(from.getDate() - 90);
  else from.setDate(from.getDate() - 30);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

const channelColors: Record<string, string> = {
  WHATSAPP: "hsl(142, 70%, 49%)",
  EMAIL: "hsl(217, 91%, 60%)",
  VOICE: "hsl(38, 92%, 50%)",
  WEBCHAT: "hsl(188, 94%, 43%)",
  TEAMS: "hsl(249, 33%, 52%)",
};

type VolumeReport = { byDay: Record<string, Partial<Record<ChannelType, number>>> };
type ProductivityRow = {
  agent: string;
  conversations: number;
  aht_seconds?: number;
  csat?: number;
  fcr?: number;
  status: string;
};
type SlaRow = { queue: string; handled: number; sla_percent: number; avg_wait: number };

type ReportSummary = {
  total_conversations: number;
  resolved: number;
  abandoned: number;
  avg_aht_seconds: number;
  avg_csat: number;
  sla_met_percent: number;
};

type HourlyReport = { byHour: { hour: string; conversations: number }[] };
type CsatReport = { byWeek: { week: string; label: string; avg_score: number; samples: number }[] };

const EXPORT_TYPES = [
  { value: "volume", label: "Volumen diario" },
  { value: "hourly", label: "Volumen horario" },
  { value: "productivity", label: "Productividad" },
  { value: "sla", label: "SLA por cola" },
  { value: "summary", label: "KPIs resumen" },
  { value: "csat", label: "CSAT semanal" },
] as const;

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState("30d");
  const [channelFilter, setChannelFilter] = useState("all");
  const [exportType, setExportType] = useState<string>("volume");

  const { from, to } = useMemo(() => rangeForPreset(dateRange), [dateRange]);
  const qs = `date_from=${encodeURIComponent(from.toISOString())}&date_to=${encodeURIComponent(to.toISOString())}`;

  const volumeQuery = useQuery({
    queryKey: ["reports", "volume", qs],
    queryFn: () => apiJson<VolumeReport>(`/reports/volume?${qs}`),
  });
  const prodQuery = useQuery({
    queryKey: ["reports", "productivity", qs],
    queryFn: () => apiJson<ProductivityRow[]>(`/reports/productivity?${qs}`),
  });
  const slaQuery = useQuery({
    queryKey: ["reports", "sla", qs],
    queryFn: () => apiJson<SlaRow[]>(`/reports/sla?${qs}`),
  });
  const summaryQuery = useQuery({
    queryKey: ["reports", "summary", qs],
    queryFn: () => apiJson<ReportSummary>(`/reports/summary?${qs}`),
  });
  const hourlyQuery = useQuery({
    queryKey: ["reports", "hourly", qs],
    queryFn: () => apiJson<HourlyReport>(`/reports/hourly?${qs}`),
  });
  const csatQuery = useQuery({
    queryKey: ["reports", "csat", qs],
    queryFn: () => apiJson<CsatReport>(`/reports/csat?${qs}`),
  });

  const dailyVolume = useMemo(() => {
    const byDay = volumeQuery.data?.byDay ?? {};
    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, ch]) => ({
        date: new Date(day).toLocaleDateString("es", { day: "2-digit", month: "short" }),
        whatsapp: ch.WHATSAPP ?? 0,
        email: ch.EMAIL ?? 0,
        voice: ch.VOICE ?? 0,
        webchat: ch.WEBCHAT ?? 0,
        teams: ch.TEAMS ?? 0,
      }));
  }, [volumeQuery.data]);

  const hourlyDistribution = useMemo(() => {
    const rows = hourlyQuery.data?.byHour;
    if (rows?.length) return rows;
    return Array.from({ length: 24 }, (_, h) => ({
      hour: `${h.toString().padStart(2, "0")}:00`,
      conversations: 0,
    }));
  }, [hourlyQuery.data]);

  const agentProductivity = useMemo(() => {
    return (prodQuery.data ?? []).map((r) => ({
      name: r.agent,
      resolved: r.conversations,
      aht: r.aht_seconds || 0,
      csat: r.csat || 0,
      fcr: r.fcr || 0,
      occupancy: r.status === "BUSY" ? 75 : r.status === "ONLINE" ? 45 : 30,
    }));
  }, [prodQuery.data]);

  const slaByQueue = useMemo(() => {
    return (slaQuery.data ?? []).map((r) => ({
      name: r.queue,
      sla: r.sla_percent,
      avgWait: r.avg_wait,
      volume: r.handled,
      abandoned: 0,
    }));
  }, [slaQuery.data]);

  const err =
    volumeQuery.error ||
    prodQuery.error ||
    slaQuery.error ||
    summaryQuery.error ||
    hourlyQuery.error ||
    csatQuery.error;

  const summary = summaryQuery.data;
  const csatWeeks = csatQuery.data?.byWeek ?? [];

  const fmtAht = (sec: number) => {
    if (!sec) return "—";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };

  const kpiCards = useMemo(() => {
    const tot = summary?.total_conversations ?? 0;
    const res = summary?.resolved ?? 0;
    const pctRes = tot > 0 ? `${Math.round((res / tot) * 100)}% del total` : "—";
    return [
      { label: "Total conversaciones", value: String(tot), change: pctRes, up: true, icon: MessageSquare },
      { label: "Resueltas", value: String(res), change: summaryQuery.isLoading ? "…" : `${summary?.abandoned ?? 0} aband.`, up: true, icon: CheckCircle },
      { label: "Abandonadas", value: String(summary?.abandoned ?? "—"), change: "en período", up: false, icon: Phone },
      { label: "AHT promedio", value: fmtAht(summary?.avg_aht_seconds ?? 0), change: "handle time", up: (summary?.avg_aht_seconds ?? 0) < 600, icon: Clock },
      { label: "CSAT promedio", value: summary?.avg_csat ? summary.avg_csat.toFixed(2) : "—", change: "/5 conv.", up: (summary?.avg_csat ?? 0) >= 4, icon: ThumbsUp },
      { label: "SLA cumplimiento", value: `${summary?.sla_met_percent ?? "—"}%`, change: "resueltas", up: (summary?.sla_met_percent ?? 0) >= 85, icon: TrendingUp },
    ];
  }, [summary, summaryQuery.isLoading]);

  const exportReport = async () => {
    try {
      const res = await apiFetch(`/reports/export?type=${encodeURIComponent(exportType)}&${qs}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportType}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  const filteredDaily =
    channelFilter === "all"
      ? dailyVolume
      : dailyVolume.map((d) => ({
          ...d,
          ...Object.fromEntries(
            (["whatsapp", "email", "voice", "webchat", "teams"] as const).map((k) => [
              k,
              channelFilter.toLowerCase() === k ? (d as never)[k] : 0,
            ])
          ),
        }));

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 size={20} /> Reportes y Analítica
        </h1>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 días</SelectItem>
              <SelectItem value="30d">Últimos 30 días</SelectItem>
              <SelectItem value="90d">Últimos 90 días</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los canales</SelectItem>
              <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
              <SelectItem value="EMAIL">Email</SelectItem>
              <SelectItem value="VOICE">Voz</SelectItem>
              <SelectItem value="WEBCHAT">WebChat</SelectItem>
              <SelectItem value="TEAMS">Teams</SelectItem>
            </SelectContent>
          </Select>
          <Select value={exportType} onValueChange={setExportType}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Qué exportar" />
            </SelectTrigger>
            <SelectContent>
              {EXPORT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => void exportReport()}>
            <Download size={12} /> Exportar CSV
          </Button>
        </div>
      </div>

      {err && <p className="text-sm text-destructive">{(err as Error).message}</p>}

      <div className="grid grid-cols-6 gap-3">
        {kpiCards.map((s, i) => (
          <Card key={i} className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon size={12} className="text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{s.label}</span>
            </div>
            <p className="text-lg font-bold">
              {summaryQuery.isLoading && i < 3 ? "…" : s.value}
            </p>
            <span className={cn("text-[10px] font-medium flex items-center gap-0.5", s.up ? "text-emerald-500" : "text-destructive")}>
              {s.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {s.change}
            </span>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="volume">
        <TabsList>
          <TabsTrigger value="volume" className="text-xs">
            Volumen
          </TabsTrigger>
          <TabsTrigger value="agents" className="text-xs">
            Agentes
          </TabsTrigger>
          <TabsTrigger value="queues" className="text-xs">
            Colas & SLA
          </TabsTrigger>
          <TabsTrigger value="csat" className="text-xs">
            CSAT
          </TabsTrigger>
        </TabsList>

        <TabsContent value="volume" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Volumen diario por canal</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={filteredDaily}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="whatsapp" stackId="1" fill={channelColors.WHATSAPP} stroke={channelColors.WHATSAPP} fillOpacity={0.6} name="WhatsApp" />
                    <Area type="monotone" dataKey="email" stackId="1" fill={channelColors.EMAIL} stroke={channelColors.EMAIL} fillOpacity={0.6} name="Email" />
                    <Area type="monotone" dataKey="voice" stackId="1" fill={channelColors.VOICE} stroke={channelColors.VOICE} fillOpacity={0.6} name="Voz" />
                    <Area type="monotone" dataKey="webchat" stackId="1" fill={channelColors.WEBCHAT} stroke={channelColors.WEBCHAT} fillOpacity={0.6} name="WebChat" />
                    <Area type="monotone" dataKey="teams" stackId="1" fill={channelColors.TEAMS} stroke={channelColors.TEAMS} fillOpacity={0.6} name="Teams" />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Distribución horaria</CardTitle>
              </CardHeader>
              <CardContent>
                {hourlyQuery.isLoading && <p className="text-xs text-muted-foreground mb-2">Cargando…</p>}
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={hourlyDistribution}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="conversations" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} name="Conversaciones" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="agents" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Productividad por agente</CardTitle>
            </CardHeader>
            <CardContent>
              {prodQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left p-2 font-medium">Agente</th>
                    <th className="text-center p-2 font-medium">Asignaciones</th>
                    <th className="text-center p-2 font-medium">AHT</th>
                    <th className="text-center p-2 font-medium">CSAT</th>
                    <th className="text-center p-2 font-medium">FCR %</th>
                    <th className="text-center p-2 font-medium">Ocupación</th>
                  </tr>
                </thead>
                <tbody>
                  {agentProductivity
                    .sort((a, b) => b.resolved - a.resolved)
                    .map((a) => (
                      <tr key={a.name} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-2 font-medium">{a.name}</td>
                        <td className="text-center p-2">{a.resolved}</td>
                        <td className="text-center p-2">
                          {Math.floor(a.aht / 60)}m {a.aht % 60}s
                        </td>
                        <td className="text-center p-2">
                          <span
                            className={cn(
                              "font-medium",
                              a.csat >= 4.5 ? "text-emerald-500" : a.csat >= 4.0 ? "text-foreground" : "text-amber-500"
                            )}
                          >
                            {a.csat.toFixed(1)}
                          </span>
                        </td>
                        <td className="text-center p-2">
                          <span
                            className={cn(
                              "font-medium",
                              a.fcr >= 85 ? "text-emerald-500" : a.fcr >= 70 ? "text-foreground" : "text-amber-500"
                            )}
                          >
                            {a.fcr}%
                          </span>
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-2 justify-center">
                            <Progress value={a.occupancy} className="w-16 h-1.5" />
                            <span className="text-xs font-mono">{a.occupancy}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queues" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">SLA por cola</CardTitle>
              </CardHeader>
              <CardContent>
                {slaQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={slaByQueue} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="sla" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="SLA %" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Detalle por cola</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {slaByQueue.map((q) => (
                    <div key={q.name} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{q.name}</p>
                        <div className="flex gap-3 text-[10px] text-muted-foreground mt-0.5">
                          <span>Volumen: {q.volume}</span>
                          <span>Espera max: {q.avgWait}s</span>
                        </div>
                      </div>
                      <Badge variant={q.sla >= 85 ? "default" : q.sla >= 75 ? "secondary" : "destructive"} className="text-xs">
                        {q.sla}% SLA
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="csat" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tendencia semanal (calidad + encuestas)</CardTitle>
              </CardHeader>
              <CardContent>
                {csatQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
                {csatWeeks.length === 0 && !csatQuery.isLoading && (
                  <p className="text-sm text-muted-foreground">Sin datos de CSAT en el período.</p>
                )}
                {csatWeeks.length > 0 && (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={csatWeeks}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Line type="monotone" dataKey="avg_score" name="Promedio" stroke="hsl(var(--primary))" strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Detalle por semana</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin">
                {csatWeeks.map((w) => (
                  <div key={w.week} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                    <span className="text-muted-foreground">{w.label}</span>
                    <span className="font-medium">{w.avg_score.toFixed(2)} / 5</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {w.samples} muestras
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
