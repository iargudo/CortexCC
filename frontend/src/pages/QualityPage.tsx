import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ChannelType } from "@/data/mock";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChannelIcon } from "@/components/ChannelIcon";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Star, ThumbsUp, MessageSquare, CheckCircle, Phone, PhoneIncoming, PhoneOutgoing, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { apiJson } from "@/lib/api";

type PendingRow = {
  id: string;
  status: string;
  contact: { name: string | null };
  channel: { type: ChannelType };
  queue: { name: string } | null;
  assignments: { user: { first_name: string; last_name: string } | null }[];
  voice_calls?: { id: string; metadata: Record<string, unknown> | null }[];
};

type EvalRow = {
  id: string;
  conversation_id: string;
  agent_display_name: string;
  contact_display_name: string;
  channel: ChannelType;
  score: number;
  saludo: number;
  empatia: number;
  resolucion: number;
  cierre: number;
  comment: string;
  created_at: string;
};

type AgentRow = { id: string; name: string; csat_avg?: number };

type RecordingRow = {
  id: string;
  conversation_id: string | null;
  remote_uri: string;
  remote_display_name: string | null;
  direction: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | undefined;
  agent: { id: string; name: string } | null;
  contact: { id: string; name: string | null; phone: string | null } | null;
};

type RecordingsResponse = {
  items: RecordingRow[];
  page: number;
  limit: number;
  total: number;
};

type EvalTarget = {
  id: string;
  channel: ChannelType;
  contact: { name: string };
  assigned_agent?: string;
  queue_name: string;
  recording_url?: string;
};

const categories = [
  { key: "saludo" as const, label: "Saludo y presentación", weight: "25%" },
  { key: "empatia" as const, label: "Empatía y tono", weight: "25%" },
  { key: "resolucion" as const, label: "Resolución del problema", weight: "30%" },
  { key: "cierre" as const, label: "Cierre y despedida", weight: "20%" },
];

function mapPending(p: PendingRow): EvalTarget {
  const u = p.assignments[0]?.user;
  const assigned = u ? `${u.first_name} ${u.last_name}`.trim() : undefined;
  const vc = p.voice_calls?.[0];
  const recUrl = (vc?.metadata as Record<string, unknown> | null)?.recording_url as string | undefined;
  return {
    id: p.id,
    channel: p.channel.type,
    contact: { name: p.contact.name ?? "Contacto" },
    assigned_agent: assigned,
    queue_name: p.queue?.name ?? "—",
    recording_url: recUrl,
  };
}

function fmtDuration(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function QualityPage() {
  const qc = useQueryClient();
  const [evalOpen, setEvalOpen] = useState(false);
  const [evalTarget, setEvalTarget] = useState<EvalTarget | null>(null);
  const [scores, setScores] = useState({ saludo: 7, empatia: 7, resolucion: 7, cierre: 7 });
  const [evalComment, setEvalComment] = useState("");

  const [recPage, setRecPage] = useState(1);
  const [recSearch, setRecSearch] = useState("");
  const [recDirection, setRecDirection] = useState<string>("all");
  const [recAgentId, setRecAgentId] = useState<string>("all");
  const [recDateFrom, setRecDateFrom] = useState("");
  const [recDateTo, setRecDateTo] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);

  const pendingQuery = useQuery({
    queryKey: ["quality", "pending"],
    queryFn: () => apiJson<PendingRow[]>("/quality/pending"),
  });
  const evalsQuery = useQuery({
    queryKey: ["quality", "evaluations"],
    queryFn: () => apiJson<EvalRow[]>("/quality/evaluations"),
  });
  const agentsQuery = useQuery({
    queryKey: ["agents", "quality"],
    queryFn: () => apiJson<AgentRow[]>("/agents"),
  });

  const recQueryParams = new URLSearchParams({ page: String(recPage), limit: "25" });
  if (recDirection !== "all") recQueryParams.set("direction", recDirection);
  if (recAgentId !== "all") recQueryParams.set("agentId", recAgentId);
  if (recDateFrom) recQueryParams.set("dateFrom", recDateFrom);
  if (recDateTo) recQueryParams.set("dateTo", recDateTo);
  if (recSearch.trim()) recQueryParams.set("search", recSearch.trim());

  const recordingsQuery = useQuery({
    queryKey: ["quality", "recordings", recPage, recDirection, recAgentId, recDateFrom, recDateTo, recSearch],
    queryFn: () => apiJson<RecordingsResponse>(`/voice/recordings?${recQueryParams.toString()}`),
  });
  const recordings = recordingsQuery.data?.items ?? [];
  const recTotal = recordingsQuery.data?.total ?? 0;
  const recTotalPages = Math.max(1, Math.ceil(recTotal / 25));

  const pending = (pendingQuery.data ?? []).map(mapPending);
  const evaluations = evalsQuery.data ?? [];
  const agents = agentsQuery.data ?? [];

  const totalScore = Math.round(
    Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length * 10
  );

  const openEval = (conv: EvalTarget) => {
    setEvalTarget(conv);
    setScores({ saludo: 7, empatia: 7, resolucion: 7, cierre: 7 });
    setEvalComment("");
    setEvalOpen(true);
  };

  const saveEvalMut = useMutation({
    mutationFn: () =>
      apiJson("/quality/evaluations", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: evalTarget!.id,
          categories: {
            saludo: scores.saludo,
            empatia: scores.empatia,
            resolucion: scores.resolucion,
            cierre: scores.cierre,
          },
          comment: evalComment.trim() || "—",
        }),
      }),
    onSuccess: () => {
      toast.success("Evaluación guardada");
      setEvalOpen(false);
      void qc.invalidateQueries({ queryKey: ["quality"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const agentPerformance = useMemo(() => {
    return agents.map((a) => {
      const agentEvals = evaluations.filter((e) => e.agent_display_name === a.name);
      const avgScore =
        agentEvals.length > 0
          ? Math.round(agentEvals.reduce((acc, e) => acc + e.score, 0) / agentEvals.length)
          : null;
      return { ...a, avgScore, evalCount: agentEvals.length };
    });
  }, [agents, evaluations]);

  const avgEvalScore =
    evaluations.length > 0
      ? Math.round(evaluations.reduce((s, e) => s + e.score, 0) / evaluations.length)
      : null;

  const err = pendingQuery.error || evalsQuery.error || agentsQuery.error;

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <h1 className="text-xl font-bold">Calidad (QA)</h1>
      {err && <p className="text-sm text-destructive">{(err as Error).message}</p>}

      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Star size={20} className="text-status-away" />
            <div>
              <p className="text-xs text-muted-foreground">Score promedio</p>
              <p className="text-2xl font-bold">{avgEvalScore !== null ? `${avgEvalScore}%` : "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <ThumbsUp size={20} className="text-status-online" />
            <div>
              <p className="text-xs text-muted-foreground">CSAT (agentes)</p>
              <p className="text-2xl font-bold">—</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <MessageSquare size={20} className="text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Evaluaciones</p>
              <p className="text-2xl font-bold">{evaluations.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle size={20} className="text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Pendientes</p>
              <p className="text-2xl font-bold">{pending.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Phone size={20} className="text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Grabaciones</p>
              <p className="text-2xl font-bold">{recTotal}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="evaluations">
        <TabsList>
          <TabsTrigger value="evaluations">Evaluaciones</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
          <TabsTrigger value="agents">Por agente</TabsTrigger>
          <TabsTrigger value="recordings" className="flex items-center gap-1.5">
            <Phone size={13} />
            Grabaciones
          </TabsTrigger>
        </TabsList>

        <TabsContent value="evaluations" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {evalsQuery.isLoading && <p className="p-4 text-sm text-muted-foreground">Cargando…</p>}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left p-3 font-medium">Agente</th>
                    <th className="text-left p-3 font-medium">Contacto</th>
                    <th className="text-center p-3 font-medium">Canal</th>
                    <th className="text-center p-3 font-medium">Score</th>
                    <th className="text-center p-3 font-medium">Saludo</th>
                    <th className="text-center p-3 font-medium">Empatía</th>
                    <th className="text-center p-3 font-medium">Resolución</th>
                    <th className="text-center p-3 font-medium">Cierre</th>
                    <th className="text-left p-3 font-medium">Comentario</th>
                    <th className="text-left p-3 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="p-3 font-medium">{e.agent_display_name}</td>
                      <td className="p-3 text-muted-foreground">{e.contact_display_name}</td>
                      <td className="text-center p-3">
                        <ChannelIcon channel={e.channel} size={14} />
                      </td>
                      <td className="text-center p-3">
                        <Badge variant={e.score >= 80 ? "default" : "secondary"} className="text-xs">
                          {Math.round(e.score)}%
                        </Badge>
                      </td>
                      <td className="text-center p-3">{e.saludo}/10</td>
                      <td className="text-center p-3">{e.empatia}/10</td>
                      <td className="text-center p-3">{e.resolucion}/10</td>
                      <td className="text-center p-3">{e.cierre}/10</td>
                      <td className="p-3 text-xs text-muted-foreground max-w-[150px] truncate">{e.comment}</td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(e.created_at).toLocaleDateString("es")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardContent className="space-y-2 p-4">
              {pendingQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
              {pending.map((c) => (
                <div key={c.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <ChannelIcon channel={c.channel} size={14} />
                    <div>
                      <p className="text-sm font-medium">{c.contact.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.assigned_agent ?? "—"} • {c.queue_name}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openEval(c)}>
                    Evaluar
                  </Button>
                </div>
              ))}
              {!pendingQuery.isLoading && pending.length === 0 && (
                <p className="text-sm text-muted-foreground">No hay conversaciones resueltas pendientes de evaluación.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agents" className="mt-4">
          <div className="grid grid-cols-3 gap-4">
            {agentsQuery.isLoading && <p className="text-sm text-muted-foreground col-span-3">Cargando…</p>}
            {agentPerformance.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                      {a.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.evalCount} evaluaciones</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted rounded p-2">
                      <p className="text-muted-foreground">QA Score</p>
                      <p className="font-medium">{a.avgScore !== null ? `${a.avgScore}%` : "—"}</p>
                    </div>
                    <div className="bg-muted rounded p-2">
                      <p className="text-muted-foreground">CSAT</p>
                      <p className="font-medium">{a.csat_avg?.toFixed(1) ?? "—"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="recordings" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por número o nombre…"
                    value={recSearch}
                    onChange={(e) => { setRecSearch(e.target.value); setRecPage(1); }}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
                <Select value={recDirection} onValueChange={(v) => { setRecDirection(v); setRecPage(1); }}>
                  <SelectTrigger className="w-[140px] h-9 text-sm">
                    <SelectValue placeholder="Dirección" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="inbound">Entrantes</SelectItem>
                    <SelectItem value="outbound">Salientes</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={recAgentId} onValueChange={(v) => { setRecAgentId(v); setRecPage(1); }}>
                  <SelectTrigger className="w-[180px] h-9 text-sm">
                    <SelectValue placeholder="Agente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los agentes</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={recDateFrom}
                    onChange={(e) => { setRecDateFrom(e.target.value); setRecPage(1); }}
                    className="h-9 text-sm w-[140px]"
                  />
                  <span className="text-xs text-muted-foreground">a</span>
                  <Input
                    type="date"
                    value={recDateTo}
                    onChange={(e) => { setRecDateTo(e.target.value); setRecPage(1); }}
                    className="h-9 text-sm w-[140px]"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {recordingsQuery.isLoading && <p className="p-4 text-sm text-muted-foreground">Cargando grabaciones…</p>}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left p-3 font-medium">Dirección</th>
                    <th className="text-left p-3 font-medium">Contacto / Número</th>
                    <th className="text-left p-3 font-medium">Agente</th>
                    <th className="text-center p-3 font-medium">Duración</th>
                    <th className="text-left p-3 font-medium">Fecha</th>
                    <th className="text-left p-3 font-medium">Grabación</th>
                  </tr>
                </thead>
                <tbody>
                  {recordings.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 text-xs">
                          {r.direction === "inbound" ? (
                            <><PhoneIncoming size={13} className="text-status-online" /> Entrante</>
                          ) : (
                            <><PhoneOutgoing size={13} className="text-primary" /> Saliente</>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-sm">{r.contact?.name ?? r.remote_display_name ?? "Desconocido"}</p>
                        <p className="text-xs text-muted-foreground">{r.contact?.phone ?? r.remote_uri ?? ""}</p>
                      </td>
                      <td className="p-3 text-sm">{r.agent?.name ?? "—"}</td>
                      <td className="text-center p-3 font-mono text-sm">{fmtDuration(r.duration_seconds)}</td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {r.started_at ? new Date(r.started_at).toLocaleString("es", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td className="p-3">
                        {r.recording_url ? (
                          playingId === r.id ? (
                            <audio
                              controls
                              autoPlay
                              preload="auto"
                              src={r.recording_url}
                              className="h-8 w-[280px]"
                              onEnded={() => setPlayingId(null)}
                            />
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setPlayingId(r.id)}
                            >
                              Reproducir
                            </Button>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin grabación</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!recordingsQuery.isLoading && recordings.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                        No se encontraron grabaciones con los filtros aplicados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {recTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {recTotal} grabación{recTotal !== 1 ? "es" : ""} — Página {recPage} de {recTotalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={recPage <= 1}
                  onClick={() => setRecPage((p) => p - 1)}
                >
                  <ChevronLeft size={14} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={recPage >= recTotalPages}
                  onClick={() => setRecPage((p) => p + 1)}
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={evalOpen} onOpenChange={setEvalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Evaluar conversación</DialogTitle>
          </DialogHeader>
          {evalTarget && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-muted rounded-lg p-3">
                <ChannelIcon channel={evalTarget.channel} size={14} />
                <div>
                  <p className="text-sm font-medium">{evalTarget.contact.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {evalTarget.assigned_agent} • {evalTarget.queue_name}
                  </p>
                </div>
                <Badge className="ml-auto text-lg font-bold" variant={totalScore >= 80 ? "default" : "secondary"}>
                  {totalScore}%
                </Badge>
              </div>

              {evalTarget.recording_url && (
                <div className="space-y-1">
                  <Label className="text-sm flex items-center gap-1.5">
                    <Phone size={13} /> Grabación de la llamada
                  </Label>
                  <audio
                    controls
                    preload="none"
                    src={evalTarget.recording_url}
                    className="w-full h-10"
                  />
                </div>
              )}

              {categories.map((cat) => (
                <div key={cat.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">
                      {cat.label} <span className="text-muted-foreground text-xs">({cat.weight})</span>
                    </Label>
                    <span className="text-sm font-bold w-8 text-right">{scores[cat.key]}</span>
                  </div>
                  <Slider
                    value={[scores[cat.key]]}
                    onValueChange={([v]) => setScores((prev) => ({ ...prev, [cat.key]: v }))}
                    min={1}
                    max={10}
                    step={1}
                    className="w-full"
                  />
                </div>
              ))}

              <div className="space-y-2">
                <Label className="text-sm">Comentarios del evaluador</Label>
                <Textarea
                  value={evalComment}
                  onChange={(e) => setEvalComment(e.target.value)}
                  placeholder="Observaciones y retroalimentación..."
                  className="min-h-[60px] text-sm resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEvalOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={!evalTarget || saveEvalMut.isPending} onClick={() => saveEvalMut.mutate()}>
              Guardar evaluación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
