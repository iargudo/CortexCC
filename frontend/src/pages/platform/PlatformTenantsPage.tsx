import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Copy,
  Database,
  ExternalLink,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Stethoscope,
  Trash2,
} from "lucide-react";
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
import {
  platformJson,
  type MigrateAllResult,
  type PlatformTenant,
  type TenantDatabaseInspectResult,
} from "@/lib/platformApi";
import { buildTenantLoginUrl, openTenantLogin } from "@/lib/tenantEntryUrl";
import { normalizeSubdomainInput, normalizeTenantHost } from "@/lib/normalizeTenantHost";

type TenantFormState = {
  key: string;
  name: string;
  subdomain: string;
  custom_domain: string;
  database_name: string;
  admin_email: string;
  admin_password: string;
  seed: boolean;
};

const emptyForm = (): TenantFormState => ({
  key: "",
  name: "",
  subdomain: "",
  custom_domain: "",
  database_name: "",
  admin_email: "",
  admin_password: "",
  seed: false,
});

export default function PlatformTenantsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [migrateResultsOpen, setMigrateResultsOpen] = useState(false);
  const [migrateResults, setMigrateResults] = useState<MigrateAllResult | null>(null);
  const [selected, setSelected] = useState<PlatformTenant | null>(null);
  const [form, setForm] = useState<TenantFormState>(emptyForm());
  const [editForm, setEditForm] = useState({
    display_name: "",
    subdomain: "",
    custom_domain: "",
    is_active: true,
    database_host: "",
    database_port: "5432",
    database_user: "",
    database_password: "",
    database_name: "",
  });
  const [dbInspect, setDbInspect] = useState<TenantDatabaseInspectResult | null>(null);
  const [cloneForm, setCloneForm] = useState({
    new_key: "",
    new_name: "",
    subdomain: "",
    custom_domain: "",
    database_name: "",
  });
  const [dropDatabaseOnDelete, setDropDatabaseOnDelete] = useState(false);

  const tenantsQuery = useQuery({
    queryKey: ["platform", "tenants"],
    queryFn: () => platformJson<PlatformTenant[]>("/platform/tenants"),
  });

  const createMut = useMutation({
    mutationFn: () => {
      const subdomain = normalizeSubdomainInput(form.subdomain.trim() || form.key.trim());
      if (!subdomain) throw new Error("Subdominio inválido (solo minúsculas, números y guiones)");
      return platformJson<PlatformTenant>("/platform/tenants", {
        method: "POST",
        body: JSON.stringify({
          key: form.key.trim(),
          name: form.name.trim(),
          subdomain,
          custom_domain: normalizeTenantHost(form.custom_domain),
          database_name: form.database_name.trim() || undefined,
          admin_email: form.seed ? undefined : form.admin_email.trim() || undefined,
          admin_password: form.seed ? undefined : form.admin_password || undefined,
          seed: form.seed,
        }),
      });
    },
    onSuccess: (tenant) => {
      void qc.invalidateQueries({ queryKey: ["platform", "tenants"] });
      setCreateOpen(false);
      setForm(emptyForm());
      const loginUrl = buildTenantLoginUrl(tenant);
      toast.success("Tenant creado e inicializado", {
        description: "Abre el contact center del tenant en una pestaña nueva.",
        action: {
          label: "Ingresar",
          onClick: () => window.open(loginUrl, "_blank", "noopener,noreferrer"),
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: () => {
      const subdomainRaw = editForm.subdomain.trim();
      let subdomain: string | null = null;
      if (subdomainRaw) {
        subdomain = normalizeSubdomainInput(subdomainRaw);
        if (!subdomain) {
          throw new Error("Subdominio inválido (solo minúsculas, números y guiones)");
        }
      }
      const port = Number(editForm.database_port);
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        throw new Error("Puerto de base de datos inválido");
      }
      const payload: Record<string, unknown> = {
        display_name: editForm.display_name.trim(),
        subdomain,
        custom_domain: normalizeTenantHost(editForm.custom_domain),
        is_active: editForm.is_active,
        database_host: editForm.database_host.trim(),
        database_port: port,
        database_user: editForm.database_user.trim(),
        database_name: editForm.database_name.trim(),
      };
      if (editForm.database_password.trim()) {
        payload.database_password = editForm.database_password;
      }
      return platformJson<PlatformTenant>(
        `/platform/tenants/${encodeURIComponent(selected!.tenant_key)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      );
    },
    onSuccess: (tenant) => {
      void qc.invalidateQueries({ queryKey: ["platform", "tenants"] });
      setEditOpen(false);
      toast.success("Tenant actualizado", {
        description: tenant.custom_domain
          ? `Dominio: ${tenant.custom_domain}`
          : tenant.subdomain
            ? `Subdominio: ${tenant.subdomain}`
            : undefined,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inspectDbMut = useMutation({
    mutationFn: () => {
      const port = Number(editForm.database_port);
      const body: Record<string, unknown> = {
        database_host: editForm.database_host.trim(),
        database_port: port,
        database_user: editForm.database_user.trim(),
        database_name: editForm.database_name.trim(),
      };
      if (editForm.database_password.trim()) {
        body.database_password = editForm.database_password;
      }
      return platformJson<TenantDatabaseInspectResult>(
        `/platform/tenants/${encodeURIComponent(selected!.tenant_key)}/database/inspect`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
    },
    onSuccess: (data) => {
      setDbInspect(data);
      if (data.ok) {
        toast.success("Conexión OK", {
          description: `${data.database_size ?? "?"} · ${data.connection_ms ?? "?"} ms`,
        });
      } else {
        toast.error(data.error ?? "No se pudo conectar a la base de datos");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () =>
      platformJson(`/platform/tenants/${selected!.tenant_key}?drop_database=${dropDatabaseOnDelete}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["platform", "tenants"] });
      setDeleteOpen(false);
      toast.success("Tenant eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const migrateOneMut = useMutation({
    mutationFn: (key: string) =>
      platformJson(`/platform/tenants/${key}/migrate`, { method: "POST" }),
    onSuccess: (_data, key) => toast.success(`Migración OK: ${key}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const migrateAllMut = useMutation({
    mutationFn: () =>
      platformJson<MigrateAllResult>("/platform/migrate-all", {
        method: "POST",
        body: JSON.stringify({ active_only: true }),
      }),
    onSuccess: (data) => {
      setMigrateResults(data);
      setMigrateResultsOpen(true);
      if (data.failed_count === 0) {
        toast.success(`Migraciones completadas (${data.success_count})`);
      } else {
        toast.warning(`${data.failed_count} tenant(s) con error`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cloneMut = useMutation({
    mutationFn: () =>
      platformJson<PlatformTenant>(`/platform/tenants/${selected!.tenant_key}/clone`, {
        method: "POST",
        body: JSON.stringify({
          new_key: cloneForm.new_key.trim(),
          new_name: cloneForm.new_name.trim(),
          subdomain: cloneForm.subdomain.trim() || undefined,
          custom_domain: cloneForm.custom_domain.trim() || undefined,
          database_name: cloneForm.database_name.trim() || undefined,
        }),
      }),
    onSuccess: (tenant) => {
      void qc.invalidateQueries({ queryKey: ["platform", "tenants"] });
      setCloneOpen(false);
      toast.success("Tenant clonado", {
        action: {
          label: "Ingresar",
          onClick: () => openTenantLogin(tenant),
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (tenant: PlatformTenant) => {
    setSelected(tenant);
    setDbInspect(null);
    setEditForm({
      display_name: tenant.display_name,
      subdomain: tenant.subdomain ?? "",
      custom_domain: tenant.custom_domain ?? "",
      is_active: tenant.is_active,
      database_host: tenant.database_host,
      database_port: String(tenant.database_port),
      database_user: tenant.database_user,
      database_password: "",
      database_name: tenant.database_name,
    });
    setEditOpen(true);
  };

  const openClone = (tenant: PlatformTenant) => {
    setSelected(tenant);
    setCloneForm({
      new_key: `${tenant.tenant_key}-copy`,
      new_name: `${tenant.display_name} (copia)`,
      subdomain: `${tenant.tenant_key}-copy`,
      custom_domain: "",
      database_name: "",
    });
    setCloneOpen(true);
  };

  const openDelete = (tenant: PlatformTenant) => {
    setSelected(tenant);
    setDropDatabaseOnDelete(false);
    setDeleteOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="text-sm text-muted-foreground">
            Alta, edición, clonación y migraciones de bases de datos por tenant.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => migrateAllMut.mutate()}
            disabled={migrateAllMut.isPending}
          >
            {migrateAllMut.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Migrar todos
          </Button>
          <Button onClick={() => { setForm(emptyForm()); setCreateOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo tenant
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Registro en Master</CardTitle>
          <CardDescription>
            {tenantsQuery.data?.length ?? 0} tenant(s) registrados
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {tenantsQuery.isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Cargando…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Base de datos</TableHead>
                  <TableHead>Dominio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tenantsQuery.data ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.tenant_key}</TableCell>
                    <TableCell>{t.display_name}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-mono">{t.database_name}</div>
                      <div className="text-muted-foreground">
                        {t.database_user}@{t.database_host}:{t.database_port}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.custom_domain && <div>{t.custom_domain}</div>}
                      {t.subdomain && (
                        <div className="text-muted-foreground">{t.subdomain}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.is_active ? "default" : "secondary"}>
                        {t.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Ingresar al tenant"
                          disabled={!t.is_active}
                          onClick={() => openTenantLogin(t)}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Migrar"
                          onClick={() => migrateOneMut.mutate(t.tenant_key)}
                          disabled={migrateOneMut.isPending}
                        >
                          <Database className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Clonar" onClick={() => openClone(t)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Editar" onClick={() => openEdit(t)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Eliminar"
                          onClick={() => openDelete(t)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!tenantsQuery.data?.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No hay tenants. Crea el primero con «Nuevo tenant».
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tenant key *</Label>
                <Input
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase() })}
                  placeholder="cliente-a"
                />
              </div>
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Cliente A S.A."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Subdominio</Label>
                <Input
                  value={form.subdomain}
                  onChange={(e) => setForm({ ...form, subdomain: e.target.value })}
                  placeholder="cliente-a"
                />
              </div>
              <div className="space-y-2">
                <Label>Dominio custom</Label>
                <Input
                  value={form.custom_domain}
                  onChange={(e) => setForm({ ...form, custom_domain: e.target.value })}
                  placeholder="app.cliente.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nombre BD (opcional)</Label>
              <Input
                value={form.database_name}
                onChange={(e) => setForm({ ...form, database_name: e.target.value })}
                placeholder="cortexcontact_cliente_a"
              />
              <p className="text-xs text-muted-foreground">
                Se crea la base en PostgreSQL, se aplican migraciones y se registra en Master.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.seed} onCheckedChange={(v) => setForm({ ...form, seed: v })} />
              <Label>Seed demo (admin@cortex.local)</Label>
            </div>
            {!form.seed && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Admin email</Label>
                  <Input
                    type="email"
                    value={form.admin_email}
                    onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Admin password</Label>
                  <Input
                    type="password"
                    value={form.admin_password}
                    onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Crear e inicializar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar {selected?.tenant_key}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={editForm.display_name}
                onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Subdominio</Label>
                <Input
                  value={editForm.subdomain}
                  onChange={(e) => setEditForm({ ...editForm, subdomain: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Dominio custom</Label>
                <Input
                  value={editForm.custom_domain}
                  onChange={(e) => setEditForm({ ...editForm, custom_domain: e.target.value })}
                  placeholder="192.168.1.10 o app.empresa.com"
                />
                <p className="text-xs text-muted-foreground">
                  Solo hostname o IP, sin https:// ni puerto. Para LAN usa la IP del frontend.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editForm.is_active}
                onCheckedChange={(v) => setEditForm({ ...editForm, is_active: v })}
              />
              <Label>Tenant activo</Label>
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Base de datos PostgreSQL</p>
                  <p className="text-xs text-muted-foreground">
                    Credenciales registradas en Master para este tenant.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => inspectDbMut.mutate()}
                  disabled={inspectDbMut.isPending}
                >
                  {inspectDbMut.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Stethoscope className="w-4 h-4 mr-1" />
                  )}
                  Diagnosticar
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2 col-span-2">
                  <Label>Host</Label>
                  <Input
                    value={editForm.database_host}
                    onChange={(e) => setEditForm({ ...editForm, database_host: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Puerto</Label>
                  <Input
                    value={editForm.database_port}
                    onChange={(e) => setEditForm({ ...editForm, database_port: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nombre BD</Label>
                  <Input
                    value={editForm.database_name}
                    onChange={(e) => setEditForm({ ...editForm, database_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Usuario BD</Label>
                  <Input
                    value={editForm.database_user}
                    onChange={(e) => setEditForm({ ...editForm, database_user: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contraseña BD</Label>
                  <Input
                    type="password"
                    value={editForm.database_password}
                    onChange={(e) => setEditForm({ ...editForm, database_password: e.target.value })}
                    placeholder="Dejar vacío para no cambiar"
                  />
                </div>
              </div>

              {dbInspect && (
                <div
                  className={`rounded-md p-3 text-xs space-y-2 ${
                    dbInspect.ok ? "bg-emerald-500/10" : "bg-destructive/10"
                  }`}
                >
                  {dbInspect.ok ? (
                    <>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>Conexión: {dbInspect.connection_ms} ms</span>
                        {dbInspect.database_size && <span>Tamaño: {dbInspect.database_size}</span>}
                      </div>
                      {dbInspect.postgres_version && (
                        <p className="text-muted-foreground break-all">{dbInspect.postgres_version}</p>
                      )}
                      <div>
                        <p className="font-medium mb-1">Registros</p>
                        <div className="grid grid-cols-2 gap-1">
                          {Object.entries(dbInspect.table_counts).map(([table, count]) => (
                            <div key={table} className="flex justify-between gap-2 font-mono">
                              <span>{table}</span>
                              <span>{count >= 0 ? count : "—"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {dbInspect.migrations.length > 0 && (
                        <div>
                          <p className="font-medium mb-1">Migraciones ({dbInspect.migrations.length})</p>
                          <div className="max-h-28 overflow-y-auto space-y-0.5 font-mono">
                            {dbInspect.migrations.map((m) => (
                              <div key={m.migration_name}>{m.migration_name}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p>{dbInspect.error ?? "Error de conexión"}</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clonar {selected?.tenant_key}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Nuevo key *</Label>
                <Input
                  value={cloneForm.new_key}
                  onChange={(e) => setCloneForm({ ...cloneForm, new_key: e.target.value.toLowerCase() })}
                />
              </div>
              <div className="space-y-2">
                <Label>Nuevo nombre *</Label>
                <Input
                  value={cloneForm.new_name}
                  onChange={(e) => setCloneForm({ ...cloneForm, new_name: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Subdominio</Label>
                <Input
                  value={cloneForm.subdomain}
                  onChange={(e) => setCloneForm({ ...cloneForm, subdomain: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Dominio custom</Label>
                <Input
                  value={cloneForm.custom_domain}
                  onChange={(e) => setCloneForm({ ...cloneForm, custom_domain: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nombre BD (opcional)</Label>
              <Input
                value={cloneForm.database_name}
                onChange={(e) => setCloneForm({ ...cloneForm, database_name: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Copia el contenido de la BD origen a una nueva BD y registra el tenant en Master.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneOpen(false)}>Cancelar</Button>
            <Button onClick={() => cloneMut.mutate()} disabled={cloneMut.isPending}>
              {cloneMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Copy className="w-4 h-4 mr-2" />}
              Clonar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selected?.tenant_key}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quitará el registro de Master. Opcionalmente puedes eliminar también la base de datos PostgreSQL.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 py-2">
            <Switch checked={dropDatabaseOnDelete} onCheckedChange={setDropDatabaseOnDelete} />
            <Label>Eliminar base de datos «{selected?.database_name}»</Label>
          </div>
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

      <Dialog open={migrateResultsOpen} onOpenChange={setMigrateResultsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resultado migraciones</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto text-sm">
            {migrateResults?.results.map((r) => (
              <div
                key={r.tenant_key}
                className={`flex justify-between gap-2 rounded px-2 py-1 ${
                  r.ok ? "bg-emerald-500/10" : "bg-destructive/10"
                }`}
              >
                <span className="font-mono">{r.tenant_key}</span>
                <span>{r.ok ? "OK" : r.error ?? "Error"}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
