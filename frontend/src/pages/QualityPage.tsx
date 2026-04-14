import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ChannelType } from "@/data/mock";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChannelIcon } from "@/components/ChannelIcon";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Star, ThumbsUp, MessageSquare, CheckCircle } from "lucide-react";
import { apiJson } from "@/lib/api";

type PendingRow = {
  id: string;
  status: string;
  contact: { name: string | null };
  channel: { type: ChannelType };
  queue: { name: string } | null;
  assignments: { user: { first_name: string; last_name: string } | null }[];
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

type EvalTarget = {
  id: string;
  channel: ChannelType;
  contact: { name: string };
  assigned_agent?: string;
  queue_name: string;
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
  return {
    id: p.id,
    channel: p.channel.type,
    contact: { name: p.contact.name ?? "Contacto" },
    assigned_agent: assigned,
    queue_name: p.queue?.name ?? "—",
  };
}

export default function QualityPage() {
  const qc = useQueryClient();
  const [evalOpen, setEvalOpen] = useState(false);
  const [evalTarget, setEvalTarget] = useState<EvalTarget | null>(null);
  const [scores, setScores] = useState({ saludo: 7, empatia: 7, resolucion: 7, cierre: 7 });
  const [evalComment, setEvalComment] = useState("");

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

      <div className="grid grid-cols-4 gap-4">
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
      </div>

      <Tabs defaultValue="evaluations">
        <TabsList>
          <TabsTrigger value="evaluations">Evaluaciones</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
          <TabsTrigger value="agents">Por agente</TabsTrigger>
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
