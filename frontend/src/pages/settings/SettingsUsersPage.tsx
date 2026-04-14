import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus } from "lucide-react";
import { apiJson } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

type ApiUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  max_concurrent: number;
  roles: { role: { id: string; name: string } }[];
};

type RoleRow = { id: string; name: string };

const ASSIGNABLE_ROLES = ["agent", "supervisor", "admin"] as const;

const AGENT_STATUSES = ["ONLINE", "AWAY", "BUSY", "OFFLINE", "ON_BREAK"] as const;

function primaryRoleName(roles: ApiUser["roles"]): string {
  const names = roles.map((r) => r.role.name);
  if (names.includes("admin")) return "admin";
  if (names.includes("supervisor")) return "supervisor";
  return names[0] ?? "agent";
}

export default function SettingsUsersPage() {
  const qc = useQueryClient();
  const isAdmin = useAuthStore((s) => s.user?.role === "admin");
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleName, setRoleName] = useState<string>("agent");

  const [editOpen, setEditOpen] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editMaxConcurrent, setEditMaxConcurrent] = useState(5);
  const [editStatus, setEditStatus] = useState<string>("OFFLINE");
  const [editRoleName, setEditRoleName] = useState<string>("agent");
  const [editNewPassword, setEditNewPassword] = useState("");

  const usersQuery = useQuery({
    queryKey: ["settings", "users"],
    queryFn: () => apiJson<ApiUser[]>("/users"),
    enabled: isAdmin,
  });

  const rolesQuery = useQuery({
    queryKey: ["settings", "roles", "users-form"],
    queryFn: () => apiJson<RoleRow[]>("/settings/roles"),
    enabled: isAdmin && (createOpen || editOpen),
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiJson<{ id: string; email: string; name: string }>("/users", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          roleNames: [roleName],
        }),
      }),
    onSuccess: (u) => {
      void qc.invalidateQueries({ queryKey: ["settings", "users"] });
      void qc.invalidateQueries({ queryKey: ["agents"] });
      toast.success(`Usuario creado: ${u.name || u.email}`);
      setCreateOpen(false);
      setEmail("");
      setPassword("");
      setFirstName("");
      setLastName("");
      setRoleName("agent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editUserId) throw new Error("Usuario no seleccionado");
      const body: Record<string, unknown> = {
        email: editEmail.trim().toLowerCase(),
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        max_concurrent: editMaxConcurrent,
        status: editStatus,
        roleNames: [editRoleName],
      };
      if (editNewPassword.trim()) body.new_password = editNewPassword;
      return apiJson<ApiUser>(`/users/${editUserId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "users"] });
      void qc.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Usuario actualizado");
      setEditOpen(false);
      setEditUserId(null);
      setEditNewPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (u: ApiUser) => {
    setEditUserId(u.id);
    setEditEmail(u.email);
    setEditFirstName(u.first_name);
    setEditLastName(u.last_name);
    setEditMaxConcurrent(u.max_concurrent);
    setEditStatus(u.status);
    setEditRoleName(primaryRoleName(u.roles));
    setEditNewPassword("");
    setEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editEmail.trim() || !editFirstName.trim()) {
      toast.error("Email y nombre son obligatorios");
      return;
    }
    if (editNewPassword && editNewPassword.length < 8) {
      toast.error("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (editMaxConcurrent < 1 || editMaxConcurrent > 99) {
      toast.error("Máx. concurrentes debe estar entre 1 y 99");
      return;
    }
    updateMut.mutate();
  };

  const handleCreate = () => {
    if (!email.trim() || !password || !firstName.trim()) {
      toast.error("Email, nombre y contraseña son obligatorios");
      return;
    }
    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    createMut.mutate();
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold mb-2">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Solo los administradores pueden gestionar usuarios. Inicia sesión con una cuenta admin o asigna el rol
          correspondiente.
        </p>
      </div>
    );
  }

  const users = usersQuery.data ?? [];
  const rolesFromApi = rolesQuery.data ?? [];
  const roleOptions = ASSIGNABLE_ROLES.filter((n) => rolesFromApi.some((r) => r.name === n));

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Usuarios</h1>
        <Button size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> Nuevo usuario
        </Button>
      </div>

      {usersQuery.error && (
        <p className="text-sm text-destructive">{(usersQuery.error as Error).message}</p>
      )}
      {usersQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando usuarios…</p>}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cuentas del centro</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left p-3 font-medium">Nombre</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">Roles</th>
                <th className="text-center p-3 font-medium">Estado</th>
                <th className="text-center p-3 font-medium">Max. concurrentes</th>
                <th className="text-right p-3 font-medium w-[100px]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">
                    {`${u.first_name} ${u.last_name}`.trim() || "—"}
                  </td>
                  <td className="p-3 text-muted-foreground">{u.email}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((ur) => (
                        <Badge key={ur.role.id} variant="secondary" className="text-[10px] capitalize">
                          {ur.role.name}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant="outline" className="text-[10px]">
                      {u.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-center font-mono text-xs">{u.max_concurrent}</td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => openEdit(u)}>
                      <Pencil size={14} /> Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && !usersQuery.isLoading && (
            <p className="p-4 text-xs text-muted-foreground text-center">No hay usuarios.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-8 text-sm"
                placeholder="correo@empresa.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Apellido</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Contraseña inicial</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-8 text-sm"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div>
              <Label className="text-xs">Rol</Label>
              <Select value={roleName} onValueChange={setRoleName}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(roleOptions.length ? roleOptions : [...ASSIGNABLE_ROLES]).map((n) => (
                    <SelectItem key={n} value={n} className="text-xs capitalize">
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                El usuario podrá iniciar sesión con este email y contraseña.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={createMut.isPending}>
              Crear usuario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditUserId(null);
            setEditNewPassword("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                autoComplete="off"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Apellido</Label>
                <Input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Máx. conversaciones concurrentes</Label>
              <Input
                type="number"
                min={1}
                max={99}
                value={editMaxConcurrent}
                onChange={(e) => setEditMaxConcurrent(Number(e.target.value) || 1)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Estado de presencia</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs font-mono">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Rol</Label>
              <Select value={editRoleName} onValueChange={setEditRoleName}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(roleOptions.length ? roleOptions : [...ASSIGNABLE_ROLES]).map((n) => (
                    <SelectItem key={n} value={n} className="text-xs capitalize">
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Nueva contraseña (opcional)</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={editNewPassword}
                onChange={(e) => setEditNewPassword(e.target.value)}
                className="h-8 text-sm"
                placeholder="Vacío = sin cambios"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Si la cambias, el usuario deberá volver a iniciar sesión en el resto de dispositivos.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={updateMut.isPending}>
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
