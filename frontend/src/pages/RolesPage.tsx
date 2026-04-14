import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, Plus } from "lucide-react";
import { apiJson } from "@/lib/api";

type PermissionKey =
  | "inbox"
  | "dashboard"
  | "supervisor"
  | "quality"
  | "reports"
  | "contacts"
  | "settings";

type RoleRow = {
  id: string;
  name: string;
  permissions: Partial<Record<PermissionKey, boolean>> | null;
};

const PERMISSIONS: { key: PermissionKey; label: string }[] = [
  { key: "inbox", label: "Bandeja" },
  { key: "dashboard", label: "Dashboard" },
  { key: "supervisor", label: "Supervisor" },
  { key: "quality", label: "Calidad" },
  { key: "reports", label: "Reportes" },
  { key: "contacts", label: "Contactos" },
  { key: "settings", label: "Configuración" },
];

const CORE_ROLE_NAMES = new Set(["admin", "supervisor", "agent"]);

function emptyPerms(): Partial<Record<PermissionKey, boolean>> {
  return Object.fromEntries(PERMISSIONS.map((p) => [p.key, false])) as Partial<Record<PermissionKey, boolean>>;
}

export default function RolesPage() {
  const qc = useQueryClient();
  const [editRole, setEditRole] = useState<RoleRow | null>(null);
  const [draft, setDraft] = useState<Partial<Record<PermissionKey, boolean>>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<Partial<Record<PermissionKey, boolean>>>(() => emptyPerms());

  const { data: roles = [], isLoading, error } = useQuery({
    queryKey: ["settings", "roles"],
    queryFn: () => apiJson<RoleRow[]>("/settings/roles"),
  });

  useEffect(() => {
    if (editRole) {
      const base = emptyPerms();
      for (const p of PERMISSIONS) {
        base[p.key] = Boolean(editRole.permissions?.[p.key]);
      }
      setDraft(base);
    }
  }, [editRole]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!editRole) return;
      await apiJson(`/settings/roles/${editRole.id}`, {
        method: "PUT",
        body: JSON.stringify({ permissions: draft }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "roles"] });
      toast.success("Permisos actualizados");
      setEditRole(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const name = newName.trim().toLowerCase().replace(/\s+/g, "_");
      if (!name) throw new Error("Nombre requerido");
      if (CORE_ROLE_NAMES.has(name)) throw new Error("Ese nombre está reservado");
      await apiJson("/settings/roles", {
        method: "POST",
        body: JSON.stringify({ name, permissions: newPerms }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "roles"] });
      toast.success("Rol creado");
      setCreateOpen(false);
      setNewName("");
      setNewPerms(emptyPerms());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiJson(`/settings/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "roles"] });
      toast.success("Rol eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDraft = (key: PermissionKey, checked: boolean) => {
    setDraft((d) => ({ ...d, [key]: checked }));
  };

  const toggleNew = (key: PermissionKey, checked: boolean) => {
    setNewPerms((d) => ({ ...d, [key]: checked }));
  };

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Shield size={20} /> Roles y permisos
        </h1>
        <Button size="sm" className="gap-1" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> Nuevo rol
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm capitalize flex items-center justify-between gap-2">
                {role.name}
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditRole(role)}>
                    Editar
                  </Button>
                  {!CORE_ROLE_NAMES.has(role.name) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive"
                      disabled={deleteMut.isPending}
                      onClick={() => {
                        if (window.confirm(`¿Eliminar el rol «${role.name}»?`)) deleteMut.mutate(role.id);
                      }}
                    >
                      Eliminar
                    </Button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {PERMISSIONS.filter((p) => role.permissions?.[p.key]).map((p) => (
                  <Badge key={p.key} variant="secondary" className="text-[10px]">
                    {p.label}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editRole} onOpenChange={(o) => !o && setEditRole(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">Permisos: {editRole?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {PERMISSIONS.map((p) => (
              <div key={p.key} className="flex items-center gap-2">
                <Checkbox
                  id={`e-${p.key}`}
                  checked={Boolean(draft[p.key])}
                  onCheckedChange={(c) => toggleDraft(p.key, c === true)}
                />
                <Label htmlFor={`e-${p.key}`} className="text-sm cursor-pointer">
                  {p.label}
                </Label>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground pt-2">
              Los cambios se guardan con PUT en el rol seleccionado. Comprueba que al menos un administrador conserve permiso de configuración.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditRole(null)}>
              Cancelar
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo rol</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre (sin espacios; se normaliza a minúsculas)</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8 text-sm" placeholder="ej. backoffice" />
            </div>
            <p className="text-[10px] text-muted-foreground">Permisos iniciales</p>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {PERMISSIONS.map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`n-${p.key}`}
                    checked={Boolean(newPerms[p.key])}
                    onCheckedChange={(c) => toggleNew(p.key, c === true)}
                  />
                  <Label htmlFor={`n-${p.key}`} className="text-sm cursor-pointer">
                    {p.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createMut.mutate()} disabled={!newName.trim() || createMut.isPending}>
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
