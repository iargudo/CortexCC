import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BookOpen, Edit2, Plus, Search, Trash2, UserCog } from "lucide-react";
import { apiJson } from "@/lib/api";

type SkillRow = { id: string; name: string; category: string };

type ApiUserSkill = {
  skill_id: string;
  proficiency: number;
  skill: { id: string; name: string; category: string };
};

type ApiUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: { role: { name: string } }[];
  skills: ApiUserSkill[];
};

const SKILL_CATEGORIES = [
  { value: "tema", label: "Tema" },
  { value: "idioma", label: "Idioma" },
  { value: "tecnico", label: "Técnico" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  tema: "Tema",
  idioma: "Idioma",
  tecnico: "Técnico",
  general: "General",
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

function normalizeSkillName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

export default function SettingsSkillsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("catalog");

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editing, setEditing] = useState<SkillRow | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("tema");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<SkillRow | null>(null);

  const [agentSearch, setAgentSearch] = useState("");
  const [editingAgent, setEditingAgent] = useState<ApiUser | null>(null);
  const [agentSkillMap, setAgentSkillMap] = useState<Map<string, number>>(new Map());

  const { data: skills = [], isLoading, error } = useQuery({
    queryKey: ["settings", "skills"],
    queryFn: () => apiJson<SkillRow[]>("/settings/skills"),
  });

  const usersQuery = useQuery({
    queryKey: ["settings", "users", "skills"],
    queryFn: () => apiJson<ApiUser[]>("/users"),
  });

  const filteredSkills = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return skills.filter((s) => {
      if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
      if (!q) return true;
      return s.name.includes(q) || categoryLabel(s.category).toLowerCase().includes(q);
    });
  }, [skills, catalogSearch, categoryFilter]);

  const skillsByCategory = useMemo(() => {
    const grouped: Record<string, SkillRow[]> = {};
    for (const s of skills) {
      const k = s.category || "general";
      grouped[k] ??= [];
      grouped[k].push(s);
    }
    return grouped;
  }, [skills]);

  const filteredAgents = useMemo(() => {
    const q = agentSearch.trim().toLowerCase();
    const list = usersQuery.data ?? [];
    if (!q) return list;
    return list.filter((u) => {
      const label = `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase();
      return label.includes(q);
    });
  }, [usersQuery.data, agentSearch]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setCategory("tema");
    setCatalogOpen(true);
  };

  const openEdit = (skill: SkillRow) => {
    setEditing(skill);
    setName(skill.name);
    setCategory(skill.category || "tema");
    setCatalogOpen(true);
  };

  const openAgentSkills = (user: ApiUser) => {
    setEditingAgent(user);
    const map = new Map<string, number>();
    for (const us of user.skills) {
      map.set(us.skill_id, us.proficiency);
    }
    setAgentSkillMap(map);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const normalizedName = normalizeSkillName(name);
      if (!normalizedName) throw new Error("El nombre es obligatorio");
      const body = { name: normalizedName, category: category.trim() || "tema" };
      if (editing) {
        await apiJson(`/settings/skills/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiJson("/settings/skills", { method: "POST", body: JSON.stringify(body) });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "skills"] });
      void qc.invalidateQueries({ queryKey: ["agents"] });
      toast.success(editing ? "Skill actualizada" : "Skill creada");
      setCatalogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiJson(`/settings/skills/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "skills"] });
      void qc.invalidateQueries({ queryKey: ["settings", "users", "skills"] });
      void qc.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Skill eliminada");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const agentSkillsMut = useMutation({
    mutationFn: () => {
      if (!editingAgent) throw new Error("Sin agente");
      const payload = [...agentSkillMap.entries()].map(([skill_id, proficiency]) => ({
        skill_id,
        proficiency: Math.min(10, Math.max(1, proficiency)),
      }));
      return apiJson(`/users/${editingAgent.id}/skills`, {
        method: "PUT",
        body: JSON.stringify({ skills: payload }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "users", "skills"] });
      void qc.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Skills del agente actualizadas");
      setEditingAgent(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAgentSkill = (skillId: string, checked: boolean) => {
    setAgentSkillMap((prev) => {
      const next = new Map(prev);
      if (checked) next.set(skillId, next.get(skillId) ?? 5);
      else next.delete(skillId);
      return next;
    });
  };

  const setAgentProficiency = (skillId: string, value: number) => {
    setAgentSkillMap((prev) => {
      const next = new Map(prev);
      next.set(skillId, value);
      return next;
    });
  };

  const handleSaveCatalog = () => {
    const normalized = normalizeSkillName(name);
    if (!normalized) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (!editing && skills.some((s) => s.name === normalized)) {
      toast.error("Ya existe una skill con ese nombre");
      return;
    }
    saveMut.mutate();
  };

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Skills</h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Define capacidades (tema, idioma, técnico) y asigna nivel de dominio (1–10) a cada agente. Las colas con
            estrategia <span className="font-mono">SKILL_BASED</span> usan estas coincidencias para enrutar.
          </p>
        </div>
        {tab === "catalog" && (
          <Button size="sm" className="gap-1 shrink-0" onClick={openCreate}>
            <Plus size={14} /> Nueva skill
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="catalog" className="gap-1.5 text-xs">
            <BookOpen size={14} /> Catálogo
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5 text-xs">
            <UserCog size={14} /> Agentes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar skill…"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 w-full sm:w-[160px] text-sm">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todas las categorías</SelectItem>
                {SKILL_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value} className="text-xs">
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Catálogo de skills</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <p className="p-4 text-sm text-muted-foreground">Cargando skills…</p>
              ) : filteredSkills.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">
                  {skills.length === 0
                    ? "No hay skills. Crea la primera para empezar a asignar capacidades a los agentes."
                    : "No hay resultados con el filtro actual."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Nombre</TableHead>
                      <TableHead className="text-xs">Categoría</TableHead>
                      <TableHead className="text-xs text-right w-[100px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSkills.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-sm">{s.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {categoryLabel(s.category)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                              <Edit2 size={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => setDeleteTarget(s)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agents" className="mt-4 space-y-4">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar agente por nombre o email…"
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Skills por agente</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {usersQuery.isLoading ? (
                <p className="p-4 text-sm text-muted-foreground">Cargando usuarios…</p>
              ) : usersQuery.error ? (
                <p className="p-4 text-sm text-destructive">{(usersQuery.error as Error).message}</p>
              ) : filteredAgents.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">No hay usuarios que coincidan.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Agente</TableHead>
                      <TableHead className="text-xs">Roles</TableHead>
                      <TableHead className="text-xs">Skills asignadas</TableHead>
                      <TableHead className="text-xs text-right w-[120px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAgents.map((u) => {
                      const label = `${u.first_name} ${u.last_name}`.trim() || u.email;
                      return (
                        <TableRow key={u.id}>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{label}</p>
                              <p className="text-[11px] text-muted-foreground">{u.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {u.roles.map((r) => (
                                <Badge key={r.role.name} variant="secondary" className="text-[10px] capitalize">
                                  {r.role.name}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {u.skills.length === 0 ? (
                              <span className="text-xs text-muted-foreground">Sin skills</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {u.skills.slice(0, 5).map((s) => (
                                  <Badge key={s.skill_id} variant="outline" className="text-[10px] font-mono">
                                    {s.skill.name} ({s.proficiency})
                                  </Badge>
                                ))}
                                {u.skills.length > 5 && (
                                  <Badge variant="outline" className="text-[10px]">+{u.skills.length - 5}</Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => openAgentSkills(u)}
                              disabled={skills.length === 0}
                            >
                              Editar skills
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {skills.length === 0 && !usersQuery.isLoading && (
            <p className="text-xs text-muted-foreground">
              Crea skills en el catálogo antes de asignarlas a los agentes.
            </p>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar skill" : "Nueva skill"}</DialogTitle>
            <DialogDescription className="text-xs">
              Usa un identificador corto en minúsculas (ej. <span className="font-mono">cobranza</span>,{" "}
              <span className="font-mono">ingles</span>). Se normaliza automáticamente al guardar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-sm font-mono"
                placeholder="soporte_tecnico"
              />
              {name.trim() && normalizeSkillName(name) !== name.trim() && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Se guardará como: <span className="font-mono">{normalizeSkillName(name)}</span>
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Categoría</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="text-xs">
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCatalogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCatalog} disabled={!name.trim() || saveMut.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingAgent)}
        onOpenChange={(open) => {
          if (!open) setEditingAgent(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Skills de{" "}
              {editingAgent
                ? `${editingAgent.first_name} ${editingAgent.last_name}`.trim() || editingAgent.email
                : ""}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Marca las skills del agente y ajusta el nivel de dominio (1 = básico, 10 = experto).
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto border rounded-md min-h-[240px] max-h-[420px] divide-y">
            {skills.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No hay skills en el catálogo.</p>
            ) : (
              Object.entries(skillsByCategory).map(([cat, list]) => (
                <div key={cat} className="p-3 space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    {categoryLabel(cat)}
                  </p>
                  {list.map((skill) => {
                    const checked = agentSkillMap.has(skill.id);
                    const proficiency = agentSkillMap.get(skill.id) ?? 5;
                    return (
                      <div key={skill.id} className="flex items-start gap-3 py-1">
                        <Checkbox
                          checked={checked}
                          className="mt-0.5"
                          onCheckedChange={(v) => toggleAgentSkill(skill.id, v === true)}
                        />
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-mono">{skill.name}</span>
                            {checked && (
                              <span className="text-xs font-mono text-muted-foreground shrink-0">{proficiency}/10</span>
                            )}
                          </div>
                          {checked && (
                            <Slider
                              min={1}
                              max={10}
                              step={1}
                              value={[proficiency]}
                              onValueChange={([v]) => setAgentProficiency(skill.id, v)}
                              className="py-1"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Seleccionadas: {agentSkillMap.size}
            {agentSkillMap.size === 0 ? " · el agente quedará sin skills asignadas" : ""}
          </p>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingAgent(null)}>
              Cancelar
            </Button>
            <Button onClick={() => agentSkillsMut.mutate()} disabled={agentSkillsMut.isPending}>
              Guardar asignación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar skill?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente la skill <span className="font-mono">{deleteTarget?.name}</span>. Las
              asignaciones en agentes y colas que la usen también se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && delMut.mutate(deleteTarget.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
