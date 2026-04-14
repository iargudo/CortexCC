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
import { Users, Plus, Edit2, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api";

type TeamRow = { id: string; name: string; description?: string; member_count: number };

export default function SettingsTeamsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: teams = [], isLoading, error } = useQuery({
    queryKey: ["settings", "teams"],
    queryFn: () => apiJson<TeamRow[]>("/settings/teams"),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), description: description.trim() || undefined };
      if (editing) {
        await apiJson(`/settings/teams/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiJson("/settings/teams", { method: "POST", body: JSON.stringify(body) });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "teams"] });
      void qc.invalidateQueries({ queryKey: ["queues"] });
      toast.success(editing ? "Equipo actualizado" : "Equipo creado");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiJson(`/settings/teams/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "teams"] });
      void qc.invalidateQueries({ queryKey: ["queues"] });
      toast.success("Equipo eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Equipos</h1>
        <Button
          size="sm"
          className="gap-1"
          variant="outline"
          onClick={() => {
            setEditing(null);
            setName("");
            setDescription("");
            setOpen(true);
          }}
        >
          <Plus size={14} /> Nuevo equipo
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((t) => (
          <Card key={t.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users size={14} />
                  {t.name}
                </CardTitle>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setEditing(t);
                      setName(t.name);
                      setDescription(t.description ?? "");
                      setOpen(true);
                    }}
                  >
                    <Edit2 size={12} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    disabled={delMut.isPending}
                    onClick={() => {
                      if (window.confirm(`¿Eliminar equipo «${t.name}»?`)) delMut.mutate(t.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
              <Badge variant="outline" className="text-[10px]">
                {t.member_count} miembros
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar equipo" : "Nuevo equipo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" disabled={!!editing} />
            </div>
            <div>
              <Label className="text-xs">Descripción</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[72px] text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={!name.trim() || saveMut.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
