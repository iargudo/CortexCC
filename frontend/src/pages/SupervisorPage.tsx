import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Conversation } from "@/data/mock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AgentStatusBadge, ConversationStatusBadge } from "@/components/StatusBadge";
import { ChannelIcon } from "@/components/ChannelIcon";
import { PriorityIndicator } from "@/components/PriorityIndicator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AssignDialog } from "@/components/inbox/AssignDialog";
import { SupervisorMonitorDialog } from "@/components/supervisor/SupervisorMonitorDialog";
import { useAuthStore } from "@/stores/authStore";
import { apiJson } from "@/lib/api";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowRightLeft, Eye, UserPlus, Radio, Bot, ShieldCheck,
  Users, Activity,
} from "lucide-react";

type DashboardStats = {
  agents_online: number;
  agents_total: number;
  conversations_waiting: number;
  conversations_active: number;
  conversations_resolved_today: number;
};

type AgentRow = {
  id: string;
  name: string;
  status: string;
  max_concurrent: number;
  active_conversations: number;
  skills: { name: string; proficiency: number }[];
  resolved_today: number;
  aht_seconds?: number;
  csat_avg?: number;
};

export default function SupervisorPage() {
  const user = useAuthStore((s) => s.user);
  const canAll = user?.role === "admin" || user?.role === "supervisor";

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignContact, setAssignContact] = useState("");
  const [assignConversationId, setAssignConversationId] = useState<string | null>(null);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [monitorAgent, setMonitorAgent] = useState({ name: "", id: "" });

  const statsQuery = useQuery({
    queryKey: ["supervisor", "live-board"],
    queryFn: () => apiJson<DashboardStats>("/supervisor/live-board"),
    enabled: canAll,
  });

  const agentsQuery = useQuery({
    queryKey: ["agents", "supervisor"],
    queryFn: () => apiJson<AgentRow[]>("/agents"),
    enabled: canAll,
  });

  const convQuery = useQuery({
    queryKey: ["conversations", "all", "supervisor"],
    queryFn: () => apiJson<{ data: Conversation[] }>("/conversations?tab=all&limit=100&page=1"),
    enabled: canAll,
  });

  const stats = statsQuery.data;
  const agents = agentsQuery.data ?? [];
  const conversations = convQuery.data?.data ?? [];

  const openAssign = (contactName: string, conversationId?: string) => {
    setAssignContact(contactName);
    setAssignConversationId(conversationId ?? null);
    setAssignOpen(true);
  };

  const totalOnline = agents.filter((a) => a.status === "ONLINE").length;
  const totalBusy = agents.filter((a) => a.status === "BUSY").length;
  const totalConvActive =
    stats?.conversations_active ??
    conversations.filter((c) => c.status !== "RESOLVED" && c.status !== "ABANDONED").length;
  const totalWaiting = stats?.conversations_waiting ?? conversations.filter((c) => c.status === "WAITING").length;

  const alerts = [
    { id: 1, type: "sla_warning", message: "Revisa colas con conversaciones en espera prolongada", time: "En vivo" },
    { id: 2, type: "agent_idle", message: "Monitorea agentes en estado Ausente u Ocupado", time: "En vivo" },
  ];

  if (!canAll) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">No tienes permiso de supervisor para ver esta vista.</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Supervisor</h1>
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-status-online animate-pulse-dot" />
          <span className="text-xs text-muted-foreground">En vivo</span>
        </div>
      </div>

      {(statsQuery.error || agentsQuery.error || convQuery.error) && (
        <p className="text-sm text-destructive">
          {String((statsQuery.error || agentsQuery.error || convQuery.error) as Error)}
        </p>
      )}

      <div className="grid grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Agentes en línea</span>
          </div>
          <p className="text-2xl font-bold">{statsQuery.isLoading ? "—" : totalOnline}</p>
          <p className="text-[10px] text-muted-foreground">{totalBusy} ocupados</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Conv. activas</span>
          </div>
          <p className="text-2xl font-bold">{statsQuery.isLoading ? "—" : totalConvActive}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className="text-amber-500" />
            <span className="text-xs text-muted-foreground">En espera</span>
          </div>
          <p className="text-2xl font-bold text-amber-500">{statsQuery.isLoading ? "—" : totalWaiting}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Bot size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Agentes totales</span>
          </div>
          <p className="text-2xl font-bold">{statsQuery.isLoading ? "—" : stats?.agents_total ?? agents.length}</p>
        </Card>
      </div>

      <Card className="border-status-away/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle size={14} className="text-status-away" /> Alertas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className="flex items-center justify-between bg-surface-internal-note/30 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm">{a.message}</p>
                <p className="text-[10px] text-muted-foreground">{a.time}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Monitoreo de agentes</CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() =>
                toast.message("Asignación masiva", {
                  description: "Pendiente de motor de reglas (colas, skills, carga).",
                })
              }
            >
              <UserPlus size={12} /> Asignación masiva
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {agentsQuery.isLoading && <p className="text-sm text-muted-foreground col-span-3">Cargando agentes…</p>}
            {agents.map((agent) => {
              const loadPct = Math.round((agent.active_conversations / Math.max(agent.max_concurrent, 1)) * 100);
              return (
                <div key={agent.id} className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
                      {agent.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{agent.name}</p>
                      <AgentStatusBadge status={agent.status as never} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                      <span>
                        Carga: {agent.active_conversations}/{agent.max_concurrent}
                      </span>
                      <span
                        className={
                          loadPct >= 80 ? "text-destructive font-medium" : loadPct >= 50 ? "text-amber-500" : "text-emerald-500"
                        }
                      >
                        {loadPct}%
                      </span>
                    </div>
                    <Progress value={loadPct} className="h-1.5" />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>AHT: {agent.aht_seconds ? `${Math.round(agent.aht_seconds / 60)}m` : "—"}</span>
                    <span>CSAT: {agent.csat_avg?.toFixed(1) || "—"}</span>
                    <span>Resueltas: {agent.resolved_today}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {agent.skills.slice(0, 4).map((s) => (
                      <Badge key={s.name} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {s.name} ({s.proficiency})
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] flex-1 gap-1"
                      onClick={() => {
                        setMonitorAgent({ name: agent.name, id: agent.id });
                        setMonitorOpen(true);
                      }}
                    >
                      <Eye size={10} /> Monitor
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] flex-1 gap-1"
                      onClick={() => openAssign(`Manual · ${agent.name}`)}
                    >
                      <ArrowRightLeft size={10} /> Derivar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Conversaciones activas</CardTitle>
        </CardHeader>
        <CardContent>
          {convQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando conversaciones…</p>}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-2 font-medium">Contacto</th>
                <th className="text-center py-2 font-medium">Canal</th>
                <th className="text-center py-2 font-medium">Estado</th>
                <th className="text-center py-2 font-medium">P</th>
                <th className="text-left py-2 font-medium">Cola</th>
                <th className="text-left py-2 font-medium">Asignado a</th>
                <th className="text-center py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {conversations
                .filter((c) => c.status !== "RESOLVED")
                .map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{c.contact.name}</td>
                    <td className="text-center py-2">
                      <ChannelIcon channel={c.channel} size={14} />
                    </td>
                    <td className="text-center py-2">
                      <ConversationStatusBadge status={c.status} />
                    </td>
                    <td className="text-center py-2">
                      <PriorityIndicator priority={c.priority} />
                    </td>
                    <td className="py-2 text-muted-foreground">{c.queue_name}</td>
                    <td className="py-2">
                      {c.assigned_agent ? (
                        <span className="text-muted-foreground">{c.assigned_agent}</span>
                      ) : (
                        <span className="text-[10px] text-amber-500 font-medium">Sin asignar</span>
                      )}
                    </td>
                    <td className="text-center py-2">
                      <div className="flex justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="Monitor"
                          disabled={!c.assigned_agent}
                          onClick={() => {
                            const ag = agents.find((a) => a.name === c.assigned_agent);
                            if (!ag) {
                              toast.info("No hay agente asignado para abrir el monitor");
                              return;
                            }
                            setMonitorAgent({ name: ag.name, id: ag.id });
                            setMonitorOpen(true);
                          }}
                        >
                          <Eye size={12} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="Derivar a agente"
                          onClick={() => openAssign(c.contact.name, c.id)}
                        >
                          <UserPlus size={12} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="Escalar"
                          onClick={() => openAssign(c.contact.name, c.id)}
                        >
                          <ShieldCheck size={12} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="IA"
                          onClick={() => openAssign(c.contact.name, c.id)}
                        >
                          <Bot size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        conversationId={assignConversationId ?? undefined}
        conversationContact={assignContact}
        mode="assign"
        supervisorAgentAssign
      />
      <SupervisorMonitorDialog
        open={monitorOpen}
        onOpenChange={setMonitorOpen}
        agentName={monitorAgent.name}
        agentId={monitorAgent.id}
      />
    </div>
  );
}
