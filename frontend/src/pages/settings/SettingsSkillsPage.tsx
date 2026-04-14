import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api";

type SkillRow = { id: string; name: string; category: string };

export default function SettingsSkillsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SkillRow | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("tema");

  const { data: skills = [], isLoading, error } = useQuery({
    queryKey: ["settings", "skills"],
    queryFn: () => apiJson<SkillRow[]>("/settings/skills"),
  });

  const grouped = skills.reduce(
    (acc, s) => {
      const k = s.category || "general";
      acc[k] ??= [];
      acc[k].push(s);
      return acc;
    },
    {} as Record<string, SkillRow[]>
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), category: category.trim() || "general" };
      if (editing) {
        await apiJson(`/settings/skills/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiJson("/settings/skills", { method: "POST", body: JSON.stringify(body) });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "skills"] });
      toast.success(editing ? "Skill actualizada" : "Skill creada");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiJson(`/settings/skills/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "skills"] });
      toast.success("Eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Skills</h1>
        <Button
          size="sm"
          className="gap-1"
          variant="outline"
          onClick={() => {
            setEditing(null);
            setName("");
            setCategory("tema");
            setOpen(true);
          }}
        >
          <Plus size={14} /> Nueva skill
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(grouped).map(([cat, list]) => (
          <Card key={cat}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm capitalize">{cat}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {list.map((s) => (
                <div key={s.id} className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-xs gap-1 pr-1">
                    {s.name}
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-muted"
                      onClick={() => {
                        setEditing(s);
                        setName(s.name);
                        setCategory(s.category);
                        setOpen(true);
                      }}
                      aria-label="Editar"
                    >
                      <Edit2 size={10} />
                    </button>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-destructive/15 text-destructive"
                      onClick={() => {
                        if (window.confirm(`¿Eliminar skill «${s.name}»?`)) delMut.mutate(s.id);
                      }}
                      aria-label="Eliminar"
                    >
                      <Trash2 size={10} />
                    </button>
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar skill" : "Nueva skill"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" disabled={!!editing} />
            </div>
            <div>
              <Label className="text-xs">Categoría</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 text-sm" />
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
