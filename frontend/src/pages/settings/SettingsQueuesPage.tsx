import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Edit2,
  Trash2,
  Users,
  Settings2,
  Radio,
  Clock,
  CornerDownRight,
  Sparkles,
} from "lucide-react";
import { apiJson } from "@/lib/api";

type QueueDialogTab = "general" | "channels" | "hours" | "overflow" | "skills";

type QueueRow = {
  id: string;
  name: string;
  description?: string;
  team_id?: string | null;
  team?: string;
  routing_strategy: string;
  rotation_group?: string | null;
  rotation_order?: number | null;
  channel_ids?: string[];
  business_hours_id?: string | null;
  business_hours?: { id: string; name: string } | null;
  out_of_hours_message?: string | null;
  overflow_queue_id?: string | null;
  overflow_message?: string | null;
  sla_policy_id?: string | null;
  skills?: QueueSkillItem[];
  waiting: number;
  active: number;
  agents_online: number;
  sla_percent: number;
  avg_wait_seconds: number;
  max_wait_seconds: number;
  is_active: boolean;
};

type TeamOption = { id: string; name: string };
type ChannelOption = { id: string; name: string; type: string };
type SlaOption = { id: string; name: string };
type BusinessHoursOption = { id: string; name: string; timezone: string };
type SkillOption = { id: string; name: string; category: string };
type QueueSkillItem = { skill_id: string; min_level: number; mandatory: boolean };
type SkillFormState = { min_level: number; mandatory: boolean };

const ROUTING = ["ROUND_ROBIN", "LEAST_BUSY", "SKILL_BASED", "PRIORITY_BASED", "LONGEST_IDLE"] as const;

function skillsStateToArray(state: Record<string, SkillFormState>): QueueSkillItem[] {
  return Object.entries(state).map(([skill_id, s]) => ({
    skill_id,
    min_level: s.min_level,
    mandatory: s.mandatory,
  }));
}

export default function SettingsQueuesPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<QueueDialogTab>("general");
  const [editing, setEditing] = useState<QueueRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formTeamId, setFormTeamId] = useState<string>("");
  const [formRouting, setFormRouting] = useState<string>("LEAST_BUSY");
  const [formMaxWait, setFormMaxWait] = useState(300);
  const [formActive, setFormActive] = useState(true);
  const [formRotationGroup, setFormRotationGroup] = useState("");
  const [formRotationOrder, setFormRotationOrder] = useState<string>("");
  const [formChannelIds, setFormChannelIds] = useState<string[]>([]);
  const [formBusinessHoursId, setFormBusinessHoursId] = useState("");
  const [formOutOfHours, setFormOutOfHours] = useState("");
  const [formOverflowQueueId, setFormOverflowQueueId] = useState("");
  const [formOverflowMessage, setFormOverflowMessage] = useState("");
  const [formSlaPolicyId, setFormSlaPolicyId] = useState("");
  const [formSkills, setFormSkills] = useState<Record<string, SkillFormState>>({});

  const { data: queues = [], isLoading, error } = useQuery({
    queryKey: ["queues", "settings"],
    queryFn: () => apiJson<QueueRow[]>("/queues"),
  });

  const teamsQuery = useQuery({
    queryKey: ["settings", "teams"],
    queryFn: () => apiJson<TeamOption[]>("/settings/teams"),
  });

  const channelsQuery = useQuery({
    queryKey: ["settings", "channels"],
    queryFn: () => apiJson<ChannelOption[]>("/settings/channels"),
  });

  const slaQuery = useQuery({
    queryKey: ["settings", "sla-policies"],
    queryFn: () => apiJson<SlaOption[]>("/settings/sla-policies"),
  });

  const skillsQuery = useQuery({
    queryKey: ["settings", "skills"],
    queryFn: () => apiJson<SkillOption[]>("/settings/skills"),
  });

  const businessHoursQuery = useQuery({
    queryKey: ["settings", "business-hours"],
    queryFn: () => apiJson<BusinessHoursOption[]>("/settings/business-hours"),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["queues"] });
  };

  const createMut = useMutation({
    mutationFn: () => {
      const team = teamsQuery.data?.find((t) => t.id === formTeamId);
      return apiJson("/queues", {
        method: "POST",
        body: JSON.stringify({
          name: formName.trim(),
          description: formDesc.trim() || undefined,
          team: team?.name,
          routing_strategy: formRouting,
          max_wait_seconds: formMaxWait,
          rotation_group: formRotationGroup.trim() || null,
          rotation_order: formRotationOrder.trim() ? Number(formRotationOrder) : null,
          channel_ids: formChannelIds,
          business_hours_id: formBusinessHoursId || null,
          out_of_hours_message: formOutOfHours.trim() || null,
          overflow_queue_id: formOverflowQueueId || null,
          overflow_message: formOverflowMessage.trim() || null,
          sla_policy_id: formSlaPolicyId || null,
          skills: skillsStateToArray(formSkills),
        }),
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Cola creada");
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("Sin cola");
      return apiJson(`/queues/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: formName.trim(),
          description: formDesc.trim() || undefined,
          team_id: formTeamId || null,
          routing_strategy: formRouting,
          max_wait_seconds: formMaxWait,
          is_active: formActive,
          rotation_group: formRotationGroup.trim() || null,
          rotation_order: formRotationOrder.trim() ? Number(formRotationOrder) : null,
          channel_ids: formChannelIds,
          business_hours_id: formBusinessHoursId || null,
          out_of_hours_message: formOutOfHours.trim() || null,
          overflow_queue_id: formOverflowQueueId || null,
          overflow_message: formOverflowMessage.trim() || null,
          sla_policy_id: formSlaPolicyId || null,
          skills: skillsStateToArray(formSkills),
        }),
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Cola actualizada");
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiJson(`/queues/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast.success("Cola eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setDialogTab("general");
    setFormName("");
    setFormDesc("");
    setFormTeamId("");
    setFormRouting("LEAST_BUSY");
    setFormMaxWait(300);
    setFormActive(true);
    setFormRotationGroup("");
    setFormRotationOrder("");
    setFormChannelIds([]);
    setFormBusinessHoursId("");
    setFormOutOfHours("");
    setFormOverflowQueueId("");
    setFormOverflowMessage("");
    setFormSlaPolicyId("");
    setFormSkills({});
    setDialogOpen(true);
  };

  const openEdit = (q: QueueRow) => {
    setEditing(q);
    setDialogTab("general");
    setFormName(q.name);
    setFormDesc(q.description ?? "");
    setFormTeamId(q.team_id ?? "");
    setFormRouting(q.routing_strategy);
    setFormMaxWait(q.max_wait_seconds);
    setFormActive(q.is_active);
    setFormRotationGroup(q.rotation_group ?? "");
    setFormRotationOrder(q.rotation_order != null ? String(q.rotation_order) : "");
    setFormChannelIds(q.channel_ids ?? []);
    setFormBusinessHoursId(q.business_hours_id ?? "");
    setFormOutOfHours(q.out_of_hours_message ?? "");
    setFormOverflowQueueId(q.overflow_queue_id ?? "");
    setFormOverflowMessage(q.overflow_message ?? "");
    setFormSlaPolicyId(q.sla_policy_id ?? "");
    setFormSkills(
      (q.skills ?? []).reduce(
        (acc, s) => ({ ...acc, [s.skill_id]: { min_level: s.min_level, mandatory: s.mandatory } }),
        {} as Record<string, SkillFormState>
      )
    );
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formName.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (editing) updateMut.mutate();
    else createMut.mutate();
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Colas</h1>
        <Button size="sm" className="gap-1" variant="outline" onClick={openNew}>
          <Plus size={14} /> Nueva cola
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <div className="grid grid-cols-2 gap-4">
        {queues.map((q) => (
          <Card key={q.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  {q.name}
                  {q.is_active ? (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">
                      Activa
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Inactiva
                    </Badge>
                  )}
                  {q.rotation_group && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {q.rotation_group}
                      {q.rotation_order != null ? ` · #${q.rotation_order}` : ""}
                    </Badge>
                  )}
                  {q.business_hours_id && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {q.business_hours?.name ?? "Horario"}
                    </Badge>
                  )}
                  {q.overflow_queue_id && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      Desborde
                    </Badge>
                  )}
                  {q.sla_policy_id && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      SLA
                    </Badge>
                  )}
                  {(q.skills?.length ?? 0) > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {q.skills!.length} skill{q.skills!.length === 1 ? "" : "s"}
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(q)}>
                    <Edit2 size={12} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    disabled={deleteMut.isPending}
                    onClick={() => {
                      if (window.confirm(`¿Eliminar la cola «${q.name}»?`)) deleteMut.mutate(q.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {q.description && <p className="text-xs text-muted-foreground">{q.description}</p>}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted rounded p-2">
                  <p className="text-muted-foreground">Estrategia</p>
                  <p className="font-medium">{q.routing_strategy.replaceAll("_", " ")}</p>
                </div>
                <div className="bg-muted rounded p-2">
                  <p className="text-muted-foreground">Equipo</p>
                  <p className="font-medium">{q.team || "Sin equipo"}</p>
                </div>
                <div className="bg-muted rounded p-2">
                  <p className="text-muted-foreground">Max espera</p>
                  <p className="font-medium">{q.max_wait_seconds}s</p>
                </div>
                <div className="bg-muted rounded p-2">
                  <p className="text-muted-foreground">Canales</p>
                  <p className="font-medium">{q.channel_ids?.length ?? 0}</p>
                </div>
                <div className="bg-muted rounded p-2">
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Users size={10} /> En cola / activas
                  </p>
                  <p className="font-medium">
                    {q.waiting} / {q.active}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0 space-y-1">
            <DialogTitle>{editing ? "Editar cola" : "Nueva cola"}</DialogTitle>
            <p className="text-xs text-muted-foreground">
              {editing
                ? "Ajusta la configuración por secciones. Los cambios se guardan al confirmar."
                : "Completa los datos básicos y configura el resto por secciones."}
            </p>
          </DialogHeader>

          <Tabs
            value={dialogTab}
            onValueChange={(v) => setDialogTab(v as QueueDialogTab)}
            className="flex flex-1 min-h-0 flex-col sm:flex-row sm:min-h-[380px]"
          >
            <TabsList className="flex sm:flex-col h-auto w-full sm:w-44 shrink-0 rounded-none border-b sm:border-b-0 sm:border-r bg-muted/40 p-1.5 gap-0.5 justify-start items-stretch overflow-x-auto scrollbar-thin">
              <TabsTrigger
                value="general"
                className="justify-start gap-2 text-xs px-3 py-2 data-[state=active]:shadow-sm"
              >
                <Settings2 size={14} className="shrink-0" />
                General
              </TabsTrigger>
              <TabsTrigger
                value="channels"
                className="justify-start gap-2 text-xs px-3 py-2 data-[state=active]:shadow-sm"
              >
                <Radio size={14} className="shrink-0" />
                Canales
                {formChannelIds.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    {formChannelIds.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="hours"
                className="justify-start gap-2 text-xs px-3 py-2 data-[state=active]:shadow-sm"
              >
                <Clock size={14} className="shrink-0" />
                Horario
              </TabsTrigger>
              <TabsTrigger
                value="overflow"
                className="justify-start gap-2 text-xs px-3 py-2 data-[state=active]:shadow-sm"
              >
                <CornerDownRight size={14} className="shrink-0" />
                Desborde y SLA
              </TabsTrigger>
              <TabsTrigger
                value="skills"
                className="justify-start gap-2 text-xs px-3 py-2 data-[state=active]:shadow-sm"
              >
                <Sparkles size={14} className="shrink-0" />
                Skills
                {Object.keys(formSkills).length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    {Object.keys(formSkills).length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-6 py-5">
              <TabsContent value="general" className="mt-0 space-y-4 focus-visible:outline-none">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Nombre</Label>
                    <Input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="h-8 text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Descripción</Label>
                    <Textarea
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      className="min-h-[60px] text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Equipo</Label>
                    <Select
                      value={formTeamId || "__none__"}
                      onValueChange={(v) => setFormTeamId(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Sin equipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin equipo</SelectItem>
                        {(teamsQuery.data ?? []).map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Max. espera (segundos)</Label>
                    <Input
                      type="number"
                      min={30}
                      value={formMaxWait}
                      onChange={(e) => setFormMaxWait(Number(e.target.value) || 300)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Estrategia de enrutamiento</Label>
                    <Select value={formRouting} onValueChange={setFormRouting}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROUTING.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r.replaceAll("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {editing && (
                    <div className="sm:col-span-2 flex items-center justify-between rounded-md border px-3 py-2">
                      <div>
                        <Label className="text-xs">Cola activa</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Las colas inactivas no reciben conversaciones nuevas.
                        </p>
                      </div>
                      <Switch checked={formActive} onCheckedChange={setFormActive} />
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="channels" className="mt-0 space-y-4 focus-visible:outline-none">
                <div>
                  <Label className="text-xs">Canales que alimentan esta cola</Label>
                  <div className="mt-1.5 max-h-48 overflow-y-auto scrollbar-thin rounded-md border p-2 space-y-1">
                    {(channelsQuery.data ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground p-1">No hay canales configurados.</p>
                    )}
                    {(channelsQuery.data ?? []).map((ch) => {
                      const checked = formChannelIds.includes(ch.id);
                      return (
                        <label
                          key={ch.id}
                          className="flex items-center gap-2 text-sm cursor-pointer rounded px-1.5 py-1 hover:bg-muted"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) =>
                              setFormChannelIds((prev) =>
                                v === true ? [...prev, ch.id] : prev.filter((id) => id !== ch.id)
                              )
                            }
                          />
                          <span className="flex-1 truncate">{ch.name}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                            {ch.type}
                          </Badge>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Sin canales vinculados, la cola no recibe conversaciones entrantes. Para que la
                    rotación funcione, cada canal del grupo debe estar vinculado a todas las colas del
                    mismo grupo.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Grupo de rotación</Label>
                    <Input
                      value={formRotationGroup}
                      onChange={(e) => setFormRotationGroup(e.target.value)}
                      placeholder="ej. ventas_puntonet"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Orden de rotación</Label>
                    <Input
                      type="number"
                      min={1}
                      value={formRotationOrder}
                      onChange={(e) => setFormRotationOrder(e.target.value)}
                      disabled={!formRotationGroup.trim()}
                      placeholder="1, 2, 3…"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-2">
                  Colas con el mismo grupo reparten las conversaciones entrantes por turnos
                  (round-robin), en el orden indicado. Déjalo vacío para no participar en la rotación.
                </p>
              </TabsContent>

              <TabsContent value="hours" className="mt-0 space-y-4 focus-visible:outline-none">
                <div>
                  <Label className="text-xs">Horario de atención</Label>
                  <Select
                    value={formBusinessHoursId || "__none__"}
                    onValueChange={(v) => setFormBusinessHoursId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Sin horario (siempre abierta)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin horario (siempre abierta)</SelectItem>
                      {businessHoursQuery.data?.map((bh) => (
                        <SelectItem key={bh.id} value={bh.id}>
                          {bh.name} · {bh.timezone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Los horarios se administran en Configuración general → Horarios. Sin horario
                    asignado, la cola se considera siempre abierta.
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Mensaje fuera de horario</Label>
                  <Textarea
                    value={formOutOfHours}
                    onChange={(e) => setFormOutOfHours(e.target.value)}
                    placeholder="Respuesta automática cuando la cola está fuera de horario"
                    className="min-h-[100px] text-sm"
                    disabled={!formBusinessHoursId}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Se envía automáticamente cuando entra una conversación fuera del horario. Requiere
                    un horario asignado; si se deja vacío, no se envía nada.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="overflow" className="mt-0 space-y-4 focus-visible:outline-none">
                <div>
                  <Label className="text-xs">Cola de desborde</Label>
                  <Select
                    value={formOverflowQueueId || "__none__"}
                    onValueChange={(v) => setFormOverflowQueueId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Sin desborde" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin desborde</SelectItem>
                      {queues
                        .filter((qq) => qq.id !== editing?.id)
                        .map((qq) => (
                          <SelectItem key={qq.id} value={qq.id}>
                            {qq.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Si una conversación espera más de «Max. espera» sin asignarse, se mueve a esta cola.
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Mensaje de desborde</Label>
                  <Textarea
                    value={formOverflowMessage}
                    onChange={(e) => setFormOverflowMessage(e.target.value)}
                    placeholder="Mensaje automático al mover la conversación a la cola de desborde"
                    className="min-h-[80px] text-sm"
                    disabled={!formOverflowQueueId}
                  />
                </div>
                <div>
                  <Label className="text-xs">Política SLA</Label>
                  <Select
                    value={formSlaPolicyId || "__none__"}
                    onValueChange={(v) => setFormSlaPolicyId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Sin SLA" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin SLA</SelectItem>
                      {(slaQuery.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Aplica los tiempos de primera respuesta y resolución al encolar conversaciones.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="skills" className="mt-0 space-y-3 focus-visible:outline-none">
                <div>
                  <Label className="text-xs">Skills requeridos</Label>
                  <div className="mt-1.5 max-h-64 overflow-y-auto scrollbar-thin rounded-md border p-2 space-y-1.5">
                    {(skillsQuery.data ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground p-1">No hay skills configurados.</p>
                    )}
                    {(skillsQuery.data ?? []).map((sk) => {
                      const sel = formSkills[sk.id];
                      const enabled = !!sel;
                      return (
                        <div key={sk.id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/60">
                          <Checkbox
                            checked={enabled}
                            onCheckedChange={(v) =>
                              setFormSkills((prev) => {
                                const next = { ...prev };
                                if (v === true) next[sk.id] = { min_level: 1, mandatory: false };
                                else delete next[sk.id];
                                return next;
                              })
                            }
                          />
                          <span className="flex-1 text-sm truncate" title={sk.name}>
                            {sk.name}
                          </span>
                          <span className="text-[11px] text-muted-foreground shrink-0">Nivel</span>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={sel?.min_level ?? 1}
                            disabled={!enabled}
                            onChange={(e) =>
                              setFormSkills((prev) => ({
                                ...prev,
                                [sk.id]: {
                                  min_level: Math.min(10, Math.max(1, Number(e.target.value) || 1)),
                                  mandatory: prev[sk.id]?.mandatory ?? false,
                                },
                              }))
                            }
                            className="h-7 text-xs w-14"
                          />
                          <label className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                            <Checkbox
                              checked={sel?.mandatory ?? false}
                              disabled={!enabled}
                              onCheckedChange={(v) =>
                                setFormSkills((prev) => ({
                                  ...prev,
                                  [sk.id]: {
                                    min_level: prev[sk.id]?.min_level ?? 1,
                                    mandatory: v === true,
                                  },
                                }))
                              }
                            />
                            Obligatorio
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Los skills obligatorios filtran qué agentes pueden recibir (deben tener el skill
                    con nivel ≥ al indicado). Los opcionales solo puntúan en la estrategia SKILL_BASED.
                  </p>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background sm:justify-between gap-2">
            <p className="text-[11px] text-muted-foreground hidden sm:block self-center">
              {formName.trim() || "Sin nombre"}
              {editing ? " · Edición" : " · Nueva"}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                Guardar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
