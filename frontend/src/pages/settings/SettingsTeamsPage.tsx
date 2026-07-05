import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Users, Plus, Edit2, Trash2, UserPlus, Star } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { apiJson } from "@/lib/api";

type TeamRow = { id: string; name: string; description?: string; member_count: number };

type ApiUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: { role: { name: string } }[];
};

type TeamMemberRow = {
  user_id: string;
  role: string;
  user: { id: string; name: string; email: string; status: string };
};

export default function SettingsTeamsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [membersTeam, setMembersTeam] = useState<TeamRow | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");

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

  const usersQuery = useQuery({
    queryKey: ["settings", "users", "teams-members"],
    queryFn: () => apiJson<ApiUser[]>("/users"),
    enabled: Boolean(membersTeam),
  });

  const membersQuery = useQuery({
    queryKey: ["settings", "teams", membersTeam?.id, "members"],
    queryFn: () => apiJson<TeamMemberRow[]>(`/settings/teams/${encodeURIComponent(membersTeam!.id)}/members`),
    enabled: Boolean(membersTeam),
  });

  const membersMut = useMutation({
    mutationFn: () => {
      if (!membersTeam) throw new Error("Sin equipo");
      return apiJson<{ member_count: number }>(`/settings/teams/${encodeURIComponent(membersTeam.id)}/members`, {
        method: "PUT",
        body: JSON.stringify({ user_ids: [...selectedUserIds] }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "teams"] });
      void qc.invalidateQueries({ queryKey: ["settings", "teams", membersTeam?.id, "members"] });
      void qc.invalidateQueries({ queryKey: ["queues"] });
      void qc.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Miembros del equipo actualizados");
      setMembersTeam(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "coordinator" | "member" }) => {
      if (!membersTeam) throw new Error("Sin equipo");
      return apiJson(
        `/settings/teams/${encodeURIComponent(membersTeam.id)}/members/${encodeURIComponent(userId)}/role`,
        { method: "PUT", body: JSON.stringify({ role }) }
      );
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["settings", "teams", membersTeam?.id, "members"] });
      void qc.invalidateQueries({ queryKey: ["settings", "users", "teams-members"] });
      void qc.invalidateQueries({ queryKey: ["agents"] });
      toast.success(vars.role === "coordinator" ? "Nombrado coordinador" : "Coordinador retirado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const memberRoleMap = new Map((membersQuery.data ?? []).map((m) => [m.user_id, m.role]));

  const openMembersDialog = (team: TeamRow) => {
    setMembersTeam(team);
    setMemberSearch("");
  };

  useEffect(() => {
    if (!membersTeam || !membersQuery.data) return;
    setSelectedUserIds(new Set(membersQuery.data.map((m) => m.user_id)));
  }, [membersTeam, membersQuery.data]);

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
        <div>
          <h1 className="text-xl font-bold">Equipos</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Asigna agentes a cada equipo. Las colas usan el equipo vinculado para enrutar conversaciones.
          </p>
        </div>
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
            <CardContent className="space-y-3">
              {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {t.member_count} miembros
                </Badge>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openMembersDialog(t)}>
                  <UserPlus size={12} /> Asignar agentes
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={Boolean(membersTeam)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setMembersTeam(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Asignar agentes — {membersTeam?.name}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Buscar por nombre o email…"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex-1 overflow-y-auto border rounded-md min-h-[220px] max-h-[360px]">
            {usersQuery.isLoading || membersQuery.isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">Cargando usuarios…</p>
            ) : (
              <div className="divide-y">
                {(usersQuery.data ?? [])
                  .filter((u) => {
                    const q = memberSearch.trim().toLowerCase();
                    if (!q) return true;
                    const label = `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase();
                    return label.includes(q);
                  })
                  .map((u) => {
                    const label = `${u.first_name} ${u.last_name}`.trim() || u.email;
                    const roles = u.roles.map((r) => r.role.name).join(", ");
                    const checked = selectedUserIds.has(u.id);
                    const persistedRole = memberRoleMap.get(u.id);
                    const isPersistedMember = persistedRole !== undefined;
                    const isCoordinator = persistedRole === "coordinator";
                    return (
                      <label
                        key={u.id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => {
                            setSelectedUserIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(u.id)) next.delete(u.id);
                              else next.add(u.id);
                              return next;
                            });
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate flex items-center gap-1.5">
                            {label}
                            {isCoordinator && (
                              <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5 py-0">
                                <Star size={9} className="fill-current" /> Coordinador
                              </Badge>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {u.email}
                            {roles ? ` · ${roles}` : ""}
                          </p>
                        </div>
                        {isPersistedMember && (
                          <Button
                            type="button"
                            variant={isCoordinator ? "default" : "outline"}
                            size="sm"
                            className="h-6 px-2 text-[10px] gap-1 shrink-0"
                            disabled={roleMut.isPending}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              roleMut.mutate({ userId: u.id, role: isCoordinator ? "member" : "coordinator" });
                            }}
                          >
                            <Star size={11} className={isCoordinator ? "fill-current" : ""} />
                            {isCoordinator ? "Quitar" : "Coordinador"}
                          </Button>
                        )}
                      </label>
                    );
                  })}
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Seleccionados: {selectedUserIds.size}
            {membersQuery.data && membersQuery.data.length > 0 && selectedUserIds.size === 0
              ? " · el equipo quedará sin miembros"
              : ""}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Marca a un miembro guardado como <span className="font-medium">Coordinador</span> para limitar su
            supervisión a este equipo. Guarda primero la asignación de nuevos agentes.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMembersTeam(null)}>
              Cancelar
            </Button>
            <Button onClick={() => membersMut.mutate()} disabled={membersMut.isPending}>
              Guardar asignación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
