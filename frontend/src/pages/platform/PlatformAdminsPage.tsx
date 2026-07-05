import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { platformJson, type PlatformAdmin } from "@/lib/platformApi";
import { usePlatformAuthStore } from "@/stores/platformAuthStore";

export default function PlatformAdminsPage() {
  const qc = useQueryClient();
  const currentUser = usePlatformAuthStore((s) => s.user);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<PlatformAdmin | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
  });
  const [editForm, setEditForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    is_active: true,
    new_password: "",
  });

  const adminsQuery = useQuery({
    queryKey: ["platform", "admins"],
    queryFn: () => platformJson<PlatformAdmin[]>("/platform/admins"),
  });

  const createMut = useMutation({
    mutationFn: () =>
      platformJson<PlatformAdmin>("/platform/admins", {
        method: "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["platform", "admins"] });
      setCreateOpen(false);
      setForm({ email: "", password: "", first_name: "", last_name: "" });
      toast.success("Administrador creado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      platformJson<PlatformAdmin>(`/platform/admins/${selected!.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          email: editForm.email.trim(),
          first_name: editForm.first_name.trim(),
          last_name: editForm.last_name.trim(),
          is_active: editForm.is_active,
          new_password: editForm.new_password.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["platform", "admins"] });
      setEditOpen(false);
      toast.success("Administrador actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () =>
      platformJson(`/platform/admins/${selected!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["platform", "admins"] });
      setDeleteOpen(false);
      toast.success("Administrador eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (admin: PlatformAdmin) => {
    setSelected(admin);
    setEditForm({
      email: admin.email,
      first_name: admin.first_name,
      last_name: admin.last_name,
      is_active: admin.is_active,
      new_password: "",
    });
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Administradores de plataforma</h1>
          <p className="text-sm text-muted-foreground">
            Usuarios con acceso al panel de gestión de tenants (rol admin único).
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo administrador
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Usuarios</CardTitle>
          <CardDescription>{adminsQuery.data?.length ?? 0} administrador(es)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(adminsQuery.data ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.name}</TableCell>
                  <TableCell>{a.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">admin</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.is_active ? "default" : "secondary"}>
                      {a.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(a)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={a.id === currentUser?.id}
                        onClick={() => { setSelected(a); setDeleteOpen(true); }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo administrador</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Apellido</Label>
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Contraseña</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={8}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar administrador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input
                  value={editForm.first_name}
                  onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Apellido</Label>
                <Input
                  value={editForm.last_name}
                  onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nueva contraseña (opcional)</Label>
              <Input
                type="password"
                value={editForm.new_password}
                onChange={(e) => setEditForm({ ...editForm, new_password: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editForm.is_active}
                onCheckedChange={(v) => setEditForm({ ...editForm, is_active: v })}
              />
              <Label>Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selected?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se revocará el acceso al panel de administración de plataforma.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMut.mutate()}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
