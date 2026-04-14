import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import type { Agent, RoutingStrategy } from "@/data/mock";
import { AgentStatusBadge } from "@/components/StatusBadge";
import { apiJson } from "@/lib/api";
import {
  UserPlus, Bot, ShieldCheck, User, Zap, ArrowRightLeft,
  BarChart3, Clock, CheckCircle, AlertTriangle, Sparkles,
  TrendingUp, Activity, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ApiAgent = {
  id: string;
  name: string;
  email: string;
  status: Agent["status"];
  max_concurrent: number;
  active_conversations: number;
  skills: { name: string; proficiency: number }[];
  teams: string[];
  resolved_today?: number;
  status_since: string;
  csat_avg?: number;
};

type ApiQueue = {
  id: string;
  name: string;
};

type AssignTarget = "auto" | "agent" | "supervisor" | "ai" | "queue";

const routingStrategies: { value: RoutingStrategy; label: string; description: string; icon: React.ReactNode }[] = [
  { value: "ROUND_ROBIN", label: "Round Robin", description: "Distribución equitativa secuencial", icon: <ArrowRightLeft size={14} /> },
  { value: "LEAST_BUSY", label: "Menos ocupado", description: "Al agente con menor carga actual", icon: <Activity size={14} /> },
  { value: "SKILL_BASED", label: "Por habilidades", description: "Según skills requeridos del caso", icon: <TrendingUp size={14} /> },
  { value: "PRIORITY_BASED", label: "Por prioridad", description: "Prioriza agentes con mejor rendimiento", icon: <BarChart3 size={14} /> },
  { value: "LONGEST_IDLE", label: "Mayor tiempo libre", description: "Al agente que lleva más tiempo sin atender", icon: <Clock size={14} /> },
];

type AiAssistant = {
  id: string;
  name: string;
  type: string;
  status: string;
  capacity: string;
  avgResolutionTime: string;
  csatAvg: number;
  specialties: string[];
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationContact: string;
  conversationId?: string;
  mode?: "assign" | "transfer";
  /** Si es true, la asignación manual a agente usa POST /supervisor/force-assign (emite notificación al agente). */
  supervisorAgentAssign?: boolean;
}

export function AssignDialog({
  open,
  onOpenChange,
  conversationContact,
  conversationId,
  mode = "assign",
  supervisorAgentAssign = false,
}: Props) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<AssignTarget>("auto");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedSupervisor, setSelectedSupervisor] = useState("");
  const [selectedAI, setSelectedAI] = useState("");
  const [selectedQueue, setSelectedQueue] = useState("");
  const [routingStrategy, setRoutingStrategy] = useState<RoutingStrategy>("LEAST_BUSY");
  const [reason, setReason] = useState("");
  const [considerSkills, setConsiderSkills] = useState(true);
  const [considerLoad, setConsiderLoad] = useState(true);
  const [respectSchedule, setRespectSchedule] = useState(true);

  const agentsQuery = useQuery({
    queryKey: ["agents", "assign-dialog"],
    enabled: open,
    queryFn: () => apiJson<ApiAgent[]>("/agents"),
  });

  const queuesQuery = useQuery({
    queryKey: ["queues", "assign-dialog"],
    enabled: open,
    queryFn: () => apiJson<ApiQueue[]>("/queues"),
  });

  const aiAgentsQuery = useQuery({
    queryKey: ["settings", "ai-assistants-preview"],
    enabled: open,
    queryFn: () => apiJson<{ agents: AiAssistant[] }>("/settings/ai-assistants-preview"),
  });

  const agents = agentsQuery.data ?? [];
  const aiAgents = aiAgentsQuery.data?.agents ?? [];

  const availableAgents = useMemo(() => {
    return agents
      .filter((a) => a.status === "ONLINE" || a.status === "BUSY")
      .map((a) => ({
        ...a,
        loadPercent: Math.round((a.active_conversations / Math.max(a.max_concurrent, 1)) * 100),
        isFull: a.active_conversations >= a.max_concurrent,
      }))
      .sort((a, b) => a.loadPercent - b.loadPercent);
  }, [agents]);

  const clientRecommendedAgent = useMemo(() => {
    const free = availableAgents.filter((a) => !a.isFull);
    if (free.length === 0) return null;

    switch (routingStrategy) {
      case "LEAST_BUSY":
        return free[0];
      case "LONGEST_IDLE":
        return free.reduce((best, a) =>
          new Date(a.status_since) < new Date(best.status_since) ? a : best
        );
      case "PRIORITY_BASED":
        return free.reduce((best, a) =>
          (a.csat_avg || 0) > (best.csat_avg || 0) ? a : best
        );
      case "SKILL_BASED":
        return free.reduce((best, a) =>
          a.skills.length > best.skills.length ? a : best
        );
      default:
        return free[0];
    }
  }, [availableAgents, routingStrategy]);

  const recommendQuery = useQuery({
    queryKey: ["routing", "recommend", conversationId, routingStrategy],
    enabled: Boolean(open && conversationId && target === "auto"),
    queryFn: () =>
      apiJson<{ agent_id: string | null }>(
        `/routing/recommend?conversation_id=${encodeURIComponent(conversationId!)}&strategy=${encodeURIComponent(routingStrategy)}`
      ),
    retry: false,
  });

  const enrichAgent = (a: ApiAgent) => ({
    ...a,
    loadPercent: Math.round((a.active_conversations / Math.max(a.max_concurrent, 1)) * 100),
    isFull: a.active_conversations >= a.max_concurrent,
  });

  const recommendedAgent = (() => {
    if (target !== "auto" || !conversationId) return clientRecommendedAgent;
    if (recommendQuery.isPending) return clientRecommendedAgent;
    if (recommendQuery.isError) return clientRecommendedAgent;
    const id = recommendQuery.data?.agent_id;
    if (id) {
      const a = agents.find((x) => x.id === id);
      return a ? enrichAgent(a) : clientRecommendedAgent;
    }
    return null;
  })();

  const resetForm = () => {
    setReason("");
    setSelectedAgent("");
    setSelectedSupervisor("");
    setSelectedAI("");
    setSelectedQueue("");
  };

  const assignMut = useMutation({
    mutationFn: async () => {
      if (!conversationId) throw new Error("Falta el identificador de la conversación");

      if (target === "auto") {
        await apiJson("/routing/assign", {
          method: "POST",
          body: JSON.stringify({ conversation_id: conversationId }),
        });
        return;
      }

      if (target === "queue") {
        await apiJson(`/conversations/${conversationId}/transfer`, {
          method: "POST",
          body: JSON.stringify({ queue_id: selectedQueue, reason: reason || undefined }),
        });
        return;
      }

      if (target === "agent") {
        if (supervisorAgentAssign) {
          await apiJson("/supervisor/force-assign", {
            method: "POST",
            body: JSON.stringify({
              conversation_id: conversationId,
              agent_id: selectedAgent,
            }),
          });
        } else {
          await apiJson("/routing/assign", {
            method: "POST",
            body: JSON.stringify({
              conversation_id: conversationId,
              target_type: "agent",
              target_id: selectedAgent,
              reason: reason || undefined,
            }),
          });
        }
        return;
      }

      if (target === "supervisor") {
        await apiJson("/routing/assign", {
          method: "POST",
          body: JSON.stringify({
            conversation_id: conversationId,
            target_type: "supervisor",
            target_id: selectedSupervisor,
            reason: reason || undefined,
          }),
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      if (conversationId) {
        void qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      }
      toast.success(mode === "transfer" ? "Conversación derivada" : "Asignación enviada");
      onOpenChange(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleAssign = () => {
    if (!conversationId) {
      toast.error("No hay conversación asociada a esta acción");
      return;
    }
    if (target === "ai") {
      const name = aiAgents.find((a) => a.id === selectedAI)?.name ?? "Asistente IA";
      toast.success(
        `Simulación: handoff a «${name}» (sin webhook). ${reason ? "El motivo quedaría en el payload al integrador." : ""}`
      );
      onOpenChange(false);
      resetForm();
      return;
    }
    assignMut.mutate();
  };

  const isValid = () => {
    switch (target) {
      case "auto":
        return true;
      case "agent":
        return !!selectedAgent;
      case "supervisor":
        return !!selectedSupervisor;
      case "ai":
        return !!selectedAI;
      case "queue":
        return !!selectedQueue;
      default:
        return false;
    }
  };

  const targetOptions: { value: AssignTarget; label: string; icon: React.ReactNode; desc: string }[] = [
    { value: "auto", label: "Automático", icon: <Zap size={16} />, desc: "Balanceo de carga" },
    { value: "agent", label: "Agente", icon: <User size={16} />, desc: "Selección manual" },
    { value: "supervisor", label: "Supervisor", icon: <ShieldCheck size={16} />, desc: "Escalación" },
    { value: "queue", label: "Cola", icon: <Layers size={16} />, desc: "Reencolar" },
    { value: "ai", label: "IA", icon: <Bot size={16} />, desc: "Asistente virtual" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus size={16} />
            {mode === "assign" ? "Asignar conversación" : "Derivar conversación"}
          </DialogTitle>
          <DialogDescription>
            {mode === "assign" ? "Asignar" : "Derivar"} la conversación con{" "}
            <span className="font-medium text-foreground">{conversationContact}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {agentsQuery.isError && (
            <p className="text-xs text-destructive">No se pudieron cargar agentes.</p>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium">Derivar a</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {targetOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTarget(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-2.5 rounded-lg border-2 transition-all hover:border-primary/50",
                    target === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-transparent bg-muted/30"
                  )}
                >
                  <div
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center",
                      target === opt.value ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {opt.icon}
                  </div>
                  <span className="text-xs font-medium text-center">{opt.label}</span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {target === "auto" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Estrategia de enrutamiento (vista previa)</Label>
                <div className="space-y-1.5">
                  {routingStrategies.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setRoutingStrategy(s.value)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left",
                        routingStrategy === s.value
                          ? "border-primary bg-primary/5"
                          : "border-transparent hover:bg-muted/50"
                      )}
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          routingStrategy === s.value ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {s.icon}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{s.label}</p>
                        <p className="text-[11px] text-muted-foreground">{s.description}</p>
                      </div>
                      {routingStrategy === s.value && (
                        <CheckCircle size={14} className="text-primary ml-auto shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5 border-t pt-3">
                <Label className="text-sm font-medium">Criterios adicionales</Label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={13} className="text-muted-foreground" />
                      <span className="text-sm">Considerar habilidades (skills)</span>
                    </div>
                    <Switch checked={considerSkills} onCheckedChange={setConsiderSkills} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity size={13} className="text-muted-foreground" />
                      <span className="text-sm">Respetar capacidad máxima</span>
                    </div>
                    <Switch checked={considerLoad} onCheckedChange={setConsiderLoad} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock size={13} className="text-muted-foreground" />
                      <span className="text-sm">Respetar horario laboral</span>
                    </div>
                    <Switch checked={respectSchedule} onCheckedChange={setRespectSchedule} />
                  </div>
                </div>
              </div>

              {recommendQuery.isFetching && conversationId && (
                <p className="text-[10px] text-muted-foreground">Calculando recomendación del motor…</p>
              )}

              {recommendedAgent && (
                <div className="border rounded-lg p-3 bg-primary/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={12} className="text-primary" />
                    <span className="text-xs font-medium text-primary">Agente recomendado</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                      {recommendedAgent.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{recommendedAgent.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <AgentStatusBadge status={recommendedAgent.status} />
                        <span className="text-[10px] text-muted-foreground">
                          {recommendedAgent.active_conversations}/{recommendedAgent.max_concurrent} conv.
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Carga</p>
                      <div className="flex items-center gap-1.5">
                        <Progress value={recommendedAgent.loadPercent} className="w-16 h-1.5" />
                        <span className="text-[10px] font-mono">{recommendedAgent.loadPercent}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!recommendedAgent && (
                <div className="border rounded-lg p-3 bg-destructive/5 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-destructive shrink-0" />
                  <p className="text-xs text-destructive">
                    No hay agentes disponibles con capacidad. La conversación quedará en cola.
                  </p>
                </div>
              )}
            </div>
          )}

          {target === "agent" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Seleccionar agente</Label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                {availableAgents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setSelectedAgent(agent.id)}
                    disabled={agent.isFull}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left",
                      selectedAgent === agent.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50",
                      agent.isFull && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                      {agent.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{agent.name}</p>
                        <AgentStatusBadge status={agent.status} />
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {agent.skills.slice(0, 3).map((s) => (
                          <Badge key={s.name} variant="secondary" className="text-[9px] px-1 py-0">
                            {s.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1.5">
                        <Progress value={agent.loadPercent} className="w-14 h-1.5" />
                        <span
                          className={cn(
                            "text-[10px] font-mono",
                            agent.loadPercent >= 80
                              ? "text-destructive"
                              : agent.loadPercent >= 50
                                ? "text-amber-500"
                                : "text-emerald-500"
                          )}
                        >
                          {agent.loadPercent}%
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {agent.active_conversations}/{agent.max_concurrent}
                        {agent.isFull && " (lleno)"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {target === "supervisor" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Seleccionar usuario (escalación)</Label>
              <p className="text-xs text-muted-foreground">
                Lista de usuarios del centro; elige a quien debe llegar la conversación como supervisor.
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                {agents.map((sup) => (
                  <button
                    key={sup.id}
                    type="button"
                    onClick={() => setSelectedSupervisor(sup.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left",
                      selectedSupervisor === sup.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50"
                    )}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <ShieldCheck size={16} className="text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{sup.name}</p>
                      <div className="flex items-center gap-2">
                        <AgentStatusBadge status={sup.status} />
                        <span className="text-[10px] text-muted-foreground">
                          {sup.active_conversations}/{sup.max_concurrent} conv.
                        </span>
                      </div>
                    </div>
                    {selectedSupervisor === sup.id && <CheckCircle size={14} className="text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {target === "queue" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Cola destino</Label>
              <Select value={selectedQueue} onValueChange={setSelectedQueue}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Seleccionar cola…" />
                </SelectTrigger>
                <SelectContent>
                  {(queuesQuery.data ?? []).map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {target === "ai" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Seleccionar asistente IA</Label>
              <p className="text-xs text-muted-foreground">
                Catálogo de demostración desde el API; el webhook real a AgentHub/Collect se configura en integraciones.
              </p>
              {aiAgentsQuery.isLoading && <p className="text-xs text-muted-foreground">Cargando asistentes…</p>}
              {aiAgentsQuery.isError && (
                <p className="text-xs text-destructive">No se pudo cargar la lista de IA.</p>
              )}
              <div className="space-y-1.5">
                {aiAgents.map((ai) => (
                  <button
                    key={ai.id}
                    type="button"
                    onClick={() => setSelectedAI(ai.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-lg border transition-all text-left",
                      selectedAI === ai.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50"
                    )}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot size={18} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{ai.name}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 font-medium">
                          Activo
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {ai.specialties.map((s) => (
                          <Badge key={s} variant="secondary" className="text-[9px] px-1 py-0">
                            {s}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                        <span>⚡ {ai.avgResolutionTime} prom.</span>
                        <span>⭐ {ai.csatAvg}/5 CSAT</span>
                        <span>♾️ {ai.capacity}</span>
                      </div>
                    </div>
                    {selectedAI === ai.id && <CheckCircle size={14} className="text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 border-t pt-3">
            <Label className="text-sm">Motivo {target !== "auto" ? "(opcional)" : ""}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                target === "ai"
                  ? "Contexto adicional para el asistente IA..."
                  : target === "supervisor"
                    ? "Razón de la escalación..."
                    : "Motivo de la asignación..."
              }
              className="min-h-[50px] text-sm resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleAssign} disabled={!isValid() || assignMut.isPending} className="gap-1.5">
            {target === "auto" && (
              <>
                <Zap size={14} /> Asignar automáticamente
              </>
            )}
            {target === "agent" && (
              <>
                <User size={14} /> Asignar a agente
              </>
            )}
            {target === "supervisor" && (
              <>
                <ShieldCheck size={14} /> Escalar a supervisor
              </>
            )}
            {target === "queue" && (
              <>
                <Layers size={14} /> Enviar a cola
              </>
            )}
            {target === "ai" && (
              <>
                <Bot size={14} /> Derivar a IA
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
