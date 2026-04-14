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
import { Plus, Edit2, Trash2, Users } from "lucide-react";
import { apiJson } from "@/lib/api";

type QueueRow = {
  id: string;
  name: string;
  description?: string;
  team_id?: string | null;
  team?: string;
  routing_strategy: string;
  waiting: number;
  active: number;
  agents_online: number;
  sla_percent: number;
  avg_wait_seconds: number;
  max_wait_seconds: number;
  is_active: boolean;
};

type TeamOption = { id: string; name: string };

const ROUTING = ["ROUND_ROBIN", "LEAST_BUSY", "SKILL_BASED", "PRIORITY_BASED", "LONGEST_IDLE"] as const;

export default function SettingsQueuesPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<QueueRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formTeamId, setFormTeamId] = useState<string>("");
  const [formRouting, setFormRouting] = useState<string>("LEAST_BUSY");
  const [formMaxWait, setFormMaxWait] = useState(300);
  const [formActive, setFormActive] = useState(true);

  const { data: queues = [], isLoading, error } = useQuery({
    queryKey: ["queues", "settings"],
    queryFn: () => apiJson<QueueRow[]>("/queues"),
  });

  const teamsQuery = useQuery({
    queryKey: ["settings", "teams"],
    queryFn: () => apiJson<TeamOption[]>("/settings/teams"),
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
    setFormName("");
    setFormDesc("");
    setFormTeamId("");
    setFormRouting("LEAST_BUSY");
    setFormMaxWait(300);
    setFormActive(true);
    setDialogOpen(true);
  };

  const openEdit = (q: QueueRow) => {
    setEditing(q);
    setFormName(q.name);
    setFormDesc(q.description ?? "");
    setFormTeamId(q.team_id ?? "");
    setFormRouting(q.routing_strategy);
    setFormMaxWait(q.max_wait_seconds);
    setFormActive(q.is_active);
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cola" : "Nueva cola"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Descripción</Label>
              <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} className="min-h-[60px] text-sm" />
            </div>
            <div>
              <Label className="text-xs">Equipo</Label>
              <Select value={formTeamId || "__none__"} onValueChange={(v) => setFormTeamId(v === "__none__" ? "" : v)}>
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
            {editing && (
              <div className="flex items-center justify-between">
                <Label className="text-xs">Cola activa</Label>
                <Switch checked={formActive} onCheckedChange={setFormActive} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
