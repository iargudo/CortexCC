import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, RefreshCw, Plus, Trash2, Zap, Info, Layers, PanelRight, Sparkles, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { apiJson } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type { IntegrationApp, IntegrationAuthType, IntegrationBinding, IntegrationBindingScopeType } from "@/data/mock";

export type IntegrationCard = {
  id: string;
  name: string;
  description: string;
  status: "connected" | "warning" | "disconnected";
  lastSync: string;
  stats: Record<string, string | number>;
  endpoint: string;
};

const statusConfig = {
  connected: { label: "Conectado", variant: "default" as const, icon: CheckCircle, color: "text-status-online" },
  warning: { label: "Advertencia", variant: "secondary" as const, icon: Zap, color: "text-status-away" },
  disconnected: { label: "Desconectado", variant: "destructive" as const, icon: XCircle, color: "text-destructive" },
};

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const isAdmin = useAuthStore((s) => s.user?.role === "admin");
  const summaryQuery = useQuery({
    queryKey: ["settings", "integrations-summary"],
    queryFn: () => apiJson<{ integrations: IntegrationCard[] }>("/settings/integrations-summary"),
  });
  const appsQuery = useQuery({
    queryKey: ["settings", "integration-apps"],
    queryFn: () => apiJson<IntegrationApp[]>("/settings/integration-apps"),
    enabled: isAdmin,
  });
  const bindingsQuery = useQuery({
    queryKey: ["settings", "integration-bindings"],
    queryFn: () => apiJson<IntegrationBinding[]>("/settings/integration-bindings"),
    enabled: isAdmin,
  });

  const [appDialogOpen, setAppDialogOpen] = useState(false);
  const [bindingDialogOpen, setBindingDialogOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editApp, setEditApp] = useState<IntegrationApp | null>(null);
  const [editBinding, setEditBinding] = useState<IntegrationBinding | null>(null);
  const [appForm, setAppForm] = useState({
    key: "",
    name: "",
    icon: "Link",
    mode: "SNAPSHOT",
    auth_type: "NONE",
    base_url: "",
    credentials_ref: "",
    is_active: true,
    config: "{}",
  });
  const [bindingForm, setBindingForm] = useState({
    app_id: "",
    scope_type: "GLOBAL",
    scope_id: "",
    placement: "right_rail",
    sort_order: 10,
    is_visible: true,
    rules: "{}",
  });
  const [wizardForm, setWizardForm] = useState({
    name: "",
    mode: "SNAPSHOT",
    icon: "Link",
    base_url: "",
    view_mode: "INLINE",
    scope_type: "GLOBAL",
    scope_id: "",
    source_filter: "",
    sort_order: 10,
  });

  const integrations = summaryQuery.data?.integrations ?? [];
  const apps = appsQuery.data ?? [];
  const bindings = bindingsQuery.data ?? [];
  const appOptions = useMemo(() => apps.map((a) => ({ id: a.id, name: a.name })), [apps]);
  const appById = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);

  const describeBinding = (binding: IntegrationBinding) => {
    const sourceList = Array.isArray((binding.rules as Record<string, unknown> | undefined)?.sources)
      ? ((binding.rules as Record<string, unknown>).sources as unknown[]).map((s) => String(s)).filter(Boolean)
      : [];

    const baseScope =
      binding.scope_type === "GLOBAL"
        ? "todas las conversaciones"
        : binding.scope_type === "CHANNEL"
          ? `canal ${binding.scope_id || "sin valor"}`
          : binding.scope_type === "QUEUE"
            ? `cola ${binding.scope_id || "sin valor"}`
            : `rol ${binding.scope_id || "sin valor"}`;

    if (sourceList.length === 0) return `Aparece para ${baseScope}`;
    return `Aparece para ${baseScope} y fuentes: ${sourceList.join(", ")}`;
  };

  const toKeyFromName = (name: string) =>
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const saveAppMut = useMutation({
    mutationFn: async () => {
      let parsedConfig: Record<string, unknown> = {};
      try {
        parsedConfig = appForm.config.trim() ? (JSON.parse(appForm.config) as Record<string, unknown>) : {};
      } catch {
        throw new Error("Config JSON inválido");
      }
      const payload = {
        key: appForm.key,
        name: appForm.name,
        icon: appForm.icon,
        mode: appForm.mode,
        auth_type: appForm.auth_type,
        base_url: appForm.base_url || null,
        credentials_ref: appForm.credentials_ref || null,
        is_active: appForm.is_active,
        config: parsedConfig,
      };
      if (editApp) {
        return apiJson(`/settings/integration-apps/${editApp.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }
      return apiJson("/settings/integration-apps", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success(editApp ? "App actualizada" : "App creada");
      setAppDialogOpen(false);
      setEditApp(null);
      setAppForm({
        key: "",
        name: "",
        icon: "Link",
        mode: "SNAPSHOT",
        auth_type: "NONE",
        base_url: "",
        credentials_ref: "",
        is_active: true,
        config: "{}",
      });
      void qc.invalidateQueries({ queryKey: ["settings", "integration-apps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAppMut = useMutation({
    mutationFn: (id: string) => apiJson(`/settings/integration-apps/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("App eliminada");
      void qc.invalidateQueries({ queryKey: ["settings", "integration-apps"] });
      void qc.invalidateQueries({ queryKey: ["settings", "integration-bindings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveBindingMut = useMutation({
    mutationFn: async () => {
      let parsedRules: Record<string, unknown> = {};
      try {
        parsedRules = bindingForm.rules.trim() ? (JSON.parse(bindingForm.rules) as Record<string, unknown>) : {};
      } catch {
        throw new Error("Rules JSON inválido");
      }
      const payload = {
        app_id: bindingForm.app_id,
        scope_type: bindingForm.scope_type,
        scope_id: bindingForm.scope_id || null,
        placement: bindingForm.placement,
        sort_order: Number(bindingForm.sort_order),
        is_visible: bindingForm.is_visible,
        rules: parsedRules,
      };
      if (editBinding) {
        return apiJson(`/settings/integration-bindings/${editBinding.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }
      return apiJson("/settings/integration-bindings", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success(editBinding ? "Binding actualizado" : "Binding creado");
      setBindingDialogOpen(false);
      setEditBinding(null);
      setBindingForm({
        app_id: "",
        scope_type: "GLOBAL",
        scope_id: "",
        placement: "right_rail",
        sort_order: 10,
        is_visible: true,
        rules: "{}",
      });
      void qc.invalidateQueries({ queryKey: ["settings", "integration-bindings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteBindingMut = useMutation({
    mutationFn: (id: string) => apiJson(`/settings/integration-bindings/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Binding eliminado");
      void qc.invalidateQueries({ queryKey: ["settings", "integration-bindings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const wizardCreateMut = useMutation({
    mutationFn: async () => {
      const name = wizardForm.name.trim();
      if (!name) throw new Error("Nombre requerido");
      const key = toKeyFromName(name);
      if (!key) throw new Error("No se pudo generar key válida");

      const config: Record<string, unknown> = {};
      if (wizardForm.mode === "EMBED") {
        if (!wizardForm.base_url.trim()) throw new Error("Base URL requerida para EMBED");
        config.view_mode = wizardForm.view_mode;
      }
      if (wizardForm.mode === "SNAPSHOT") {
        config.cards = [
          { label: "Canal", value: "{{conversation.channel_type}}" },
          { label: "Fuente", value: "{{conversation.source}}" },
          { label: "Contacto", value: "{{contact.name|default:Sin nombre}}" },
        ];
      }
      if (wizardForm.mode === "ACTIONS") {
        config.actions = [{ action_key: "open_external_case", label: "Abrir caso externo" }];
      }

      const createdApp = await apiJson<IntegrationApp>("/settings/integration-apps", {
        method: "POST",
        body: JSON.stringify({
          key,
          name,
          icon: wizardForm.icon.trim() || "Link",
          mode: wizardForm.mode,
          auth_type: "NONE",
          base_url: wizardForm.mode === "EMBED" ? wizardForm.base_url.trim() : null,
          credentials_ref: null,
          is_active: true,
          config,
        }),
      });

      try {
        const sourceFilter = wizardForm.source_filter
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        await apiJson("/settings/integration-bindings", {
          method: "POST",
          body: JSON.stringify({
            app_id: createdApp.id,
            scope_type: wizardForm.scope_type,
            scope_id: wizardForm.scope_id.trim() || null,
            placement: "right_rail",
            sort_order: Number(wizardForm.sort_order) || 0,
            is_visible: true,
            rules: sourceFilter.length > 0 ? { sources: sourceFilter } : {},
          }),
        });
      } catch (bindingErr) {
        // rollback best-effort to avoid app orphan
        await apiJson(`/settings/integration-apps/${createdApp.id}`, { method: "DELETE" }).catch(() => undefined);
        throw bindingErr;
      }
    },
    onSuccess: () => {
      toast.success("Integración creada con wizard");
      setWizardOpen(false);
      setWizardForm({
        name: "",
        mode: "SNAPSHOT",
        icon: "Link",
        base_url: "",
        view_mode: "INLINE",
        scope_type: "GLOBAL",
        scope_id: "",
        source_filter: "",
        sort_order: 10,
      });
      void qc.invalidateQueries({ queryKey: ["settings", "integration-apps"] });
      void qc.invalidateQueries({ queryKey: ["settings", "integration-bindings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreateApp = () => {
    setEditApp(null);
    setAppForm({
      key: "",
      name: "",
      icon: "Link",
      mode: "SNAPSHOT",
      auth_type: "NONE",
      base_url: "",
      credentials_ref: "",
      is_active: true,
      config: "{}",
    });
    setAppDialogOpen(true);
  };

  const setAppViewMode = (viewMode: "INLINE" | "MODAL" | "EXTERNAL_TAB") => {
    setAppForm((prev) => {
      let cfg: Record<string, unknown> = {};
      try {
        cfg = prev.config.trim() ? (JSON.parse(prev.config) as Record<string, unknown>) : {};
      } catch {
        cfg = {};
      }
      cfg.view_mode = viewMode;
      return { ...prev, config: JSON.stringify(cfg, null, 2) };
    });
  };

  const currentAppViewMode = useMemo<"INLINE" | "MODAL" | "EXTERNAL_TAB">(() => {
    try {
      const parsed = appForm.config.trim() ? (JSON.parse(appForm.config) as Record<string, unknown>) : {};
      const vm = String(parsed.view_mode ?? "INLINE").toUpperCase();
      if (vm === "MODAL") return "MODAL";
      if (vm === "EXTERNAL_TAB") return "EXTERNAL_TAB";
      return "INLINE";
    } catch {
      return "INLINE";
    }
  }, [appForm.config]);

  const openEditApp = (app: IntegrationApp) => {
    setEditApp(app);
    setAppForm({
      key: app.key,
      name: app.name,
      icon: app.icon,
      mode: app.mode,
      auth_type: app.auth_type,
      base_url: app.base_url ?? "",
      credentials_ref: app.credentials_ref ?? "",
      is_active: app.is_active,
      config: JSON.stringify(app.config ?? {}, null, 2),
    });
    setAppDialogOpen(true);
  };

  const openCreateBinding = () => {
    setEditBinding(null);
    setBindingForm({
      app_id: appOptions[0]?.id ?? "",
      scope_type: "GLOBAL",
      scope_id: "",
      placement: "right_rail",
      sort_order: 10,
      is_visible: true,
      rules: "{}",
    });
    setBindingDialogOpen(true);
  };

  const openEditBinding = (binding: IntegrationBinding) => {
    setEditBinding(binding);
    setBindingForm({
      app_id: binding.app_id,
      scope_type: binding.scope_type,
      scope_id: binding.scope_id ?? "",
      placement: binding.placement,
      sort_order: binding.sort_order,
      is_visible: binding.is_visible,
      rules: JSON.stringify(binding.rules ?? {}, null, 2),
    });
    setBindingDialogOpen(true);
  };

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Integraciones</h1>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={summaryQuery.isFetching}
          onClick={() => void summaryQuery.refetch()}
        >
          <RefreshCw size={14} className={summaryQuery.isFetching ? "animate-spin" : ""} /> Verificar todas
        </Button>
      </div>

      <Tabs defaultValue="status">
        <TabsList>
          <TabsTrigger value="status">Estado</TabsTrigger>
          {isAdmin && <TabsTrigger value="design">Apps y rail</TabsTrigger>}
        </TabsList>

        <TabsContent value="status" className="space-y-4 mt-4">
          {summaryQuery.error && <p className="text-sm text-destructive">{(summaryQuery.error as Error).message}</p>}
          {summaryQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando estado de integraciones…</p>}
          {!summaryQuery.isLoading && integrations.length === 0 && !summaryQuery.error && (
            <p className="text-sm text-muted-foreground">No hay datos de integraciones.</p>
          )}
          <div className="grid grid-cols-2 gap-4">
            {integrations.map((int) => {
              const sc = statusConfig[int.status];
              return (
                <Card key={int.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <sc.icon size={14} className={sc.color} />
                        {int.name}
                      </CardTitle>
                      <Badge variant={sc.variant} className="text-[10px]">
                        {sc.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">{int.description}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Endpoint: <span className="font-mono">{int.endpoint}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Última sincronización: <span className="font-medium text-foreground">{int.lastSync}</span>
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="design" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-5">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="rounded-lg border p-3 bg-muted/20">
                    <p className="text-xs font-semibold flex items-center gap-1">
                      <Layers size={12} /> Paso 1: Crear app
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Define tipo (SNAPSHOT/EMBED/ACTIONS), nombre e ícono.
                    </p>
                  </div>
                  <div className="rounded-lg border p-3 bg-muted/20">
                    <p className="text-xs font-semibold flex items-center gap-1">
                      <PanelRight size={12} /> Paso 2: Publicar en rail
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Crea binding visible y define cuándo debe aparecer.
                    </p>
                  </div>
                  <div className="rounded-lg border p-3 bg-muted/20">
                    <p className="text-xs font-semibold flex items-center gap-1">
                      <Sparkles size={12} /> Paso 3: Probar
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Abre una conversación y valida que el botón aparezca.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
                  <p className="text-xs text-muted-foreground">
                    Tip: si no aparece, normalmente falta `is_visible`, `scope` o coincide mal `rules.sources`.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setWizardOpen(true)}>
                      <WandSparkles size={12} /> Wizard nueva integración
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid xl:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm">Apps</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Qué hace cada integración.
                    </p>
                  </div>
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={openCreateApp}>
                    <Plus size={12} /> Nueva app
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {appsQuery.isLoading && <p className="text-xs text-muted-foreground">Cargando apps…</p>}
                  {!appsQuery.isLoading && apps.length === 0 && (
                    <p className="text-xs text-muted-foreground">No hay apps creadas todavía.</p>
                  )}
                  {apps.map((app) => (
                    <div key={app.id} className="rounded-md border p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{app.name}</p>
                          <p className="text-muted-foreground truncate">key: {app.key}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => openEditApp(app)}>
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] text-destructive"
                            disabled={deleteAppMut.isPending}
                            onClick={() => {
                              if (window.confirm(`¿Eliminar app ${app.name}?`)) deleteAppMut.mutate(app.id);
                            }}
                          >
                            <Trash2 size={10} />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-[10px]">
                          {app.mode}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {app.auth_type}
                        </Badge>
                        {!app.is_active && (
                          <Badge variant="destructive" className="text-[10px]">
                            Inactiva
                          </Badge>
                        )}
                      </div>
                      {app.mode === "EMBED" && (
                        <p className="text-[11px] text-muted-foreground">
                          Visualización: {String(((app.config ?? {}) as Record<string, unknown>).view_mode ?? "INLINE")}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm">Publicación en rail</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Define cuándo y dónde aparece el botón.
                    </p>
                  </div>
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={openCreateBinding}>
                    <Plus size={12} /> Nuevo binding
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {bindingsQuery.isLoading && <p className="text-xs text-muted-foreground">Cargando bindings…</p>}
                  {!bindingsQuery.isLoading && bindings.length === 0 && (
                    <p className="text-xs text-muted-foreground">No hay publicaciones en rail todavía.</p>
                  )}
                  {bindings.map((binding) => (
                    <div key={binding.id} className="rounded-md border p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{binding.app_name}</p>
                          <p className="text-muted-foreground truncate">{describeBinding(binding)}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px]"
                            onClick={() => openEditBinding(binding)}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] text-destructive"
                            disabled={deleteBindingMut.isPending}
                            onClick={() => {
                              if (window.confirm(`¿Eliminar binding ${binding.app_name}?`)) deleteBindingMut.mutate(binding.id);
                            }}
                          >
                            <Trash2 size={10} />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-[10px]">
                          {binding.scope_type}
                          {binding.scope_id ? `: ${binding.scope_id}` : ""}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {binding.placement}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          orden {binding.sort_order}
                        </Badge>
                        {appById.get(binding.app_id)?.mode && (
                          <Badge variant="secondary" className="text-[10px]">
                            {appById.get(binding.app_id)?.mode}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                        <Info size={12} className="mt-[1px] shrink-0" />
                        Fuente permitida:{" "}
                        {Array.isArray((binding.rules as Record<string, unknown> | undefined)?.sources)
                          ? ((binding.rules as Record<string, unknown>).sources as unknown[]).map((s) => String(s)).join(", ")
                          : "cualquiera"}
                      </p>
                      {!binding.is_visible && (
                        <Badge variant="outline" className="text-[10px]">
                          Oculto
                        </Badge>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={appDialogOpen} onOpenChange={setAppDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editApp ? "Editar app de integración" : "Nueva app de integración"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Key</Label>
                <Input
                  value={appForm.key}
                  onChange={(e) => setAppForm((s) => ({ ...s, key: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={appForm.name}
                  onChange={(e) => setAppForm((s) => ({ ...s, name: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Icono</Label>
                <Input
                  value={appForm.icon}
                  onChange={(e) => setAppForm((s) => ({ ...s, icon: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Modo</Label>
                <Select value={appForm.mode} onValueChange={(v) => setAppForm((s) => ({ ...s, mode: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["SNAPSHOT", "EMBED", "ACTIONS"].map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {mode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Auth</Label>
                <Select
                  value={appForm.auth_type}
                  onValueChange={(v) => setAppForm((s) => ({ ...s, auth_type: v as IntegrationAuthType }))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["NONE", "API_KEY", "OAUTH2", "JWT"].map((auth) => (
                      <SelectItem key={auth} value={auth}>
                        {auth}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">View mode (solo EMBED)</Label>
              <Select value={currentAppViewMode} onValueChange={(v) => setAppViewMode(v as "INLINE" | "MODAL" | "EXTERNAL_TAB")}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INLINE">INLINE (panel derecho)</SelectItem>
                  <SelectItem value="MODAL">MODAL (ventana grande)</SelectItem>
                  <SelectItem value="EXTERNAL_TAB">EXTERNAL_TAB (nueva pestaña)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Base URL</Label>
                <Input
                  value={appForm.base_url}
                  onChange={(e) => setAppForm((s) => ({ ...s, base_url: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Credentials ref</Label>
                <Input
                  value={appForm.credentials_ref}
                  onChange={(e) => setAppForm((s) => ({ ...s, credentials_ref: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Config JSON</Label>
              <Textarea
                value={appForm.config}
                onChange={(e) => setAppForm((s) => ({ ...s, config: e.target.value }))}
                className="text-xs min-h-[140px] font-mono"
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={appForm.is_active}
                onChange={(e) => setAppForm((s) => ({ ...s, is_active: e.target.checked }))}
              />
              App activa
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAppDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveAppMut.mutate()} disabled={saveAppMut.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bindingDialogOpen} onOpenChange={setBindingDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editBinding ? "Editar binding" : "Nuevo binding"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">App</Label>
                <Select value={bindingForm.app_id} onValueChange={(v) => setBindingForm((s) => ({ ...s, app_id: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Seleccionar app" />
                  </SelectTrigger>
                  <SelectContent>
                    {appOptions.map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Scope type</Label>
                <Select
                  value={bindingForm.scope_type}
                  onValueChange={(v) => setBindingForm((s) => ({ ...s, scope_type: v as IntegrationBindingScopeType }))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["GLOBAL", "CHANNEL", "QUEUE", "ROLE"].map((scope) => (
                      <SelectItem key={scope} value={scope}>
                        {scope}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Scope id</Label>
                <Input
                  value={bindingForm.scope_id}
                  onChange={(e) => setBindingForm((s) => ({ ...s, scope_id: e.target.value }))}
                  className="h-8 text-sm"
                  placeholder="WHATSAPP / role / queue"
                />
              </div>
              <div>
                <Label className="text-xs">Placement</Label>
                <Input
                  value={bindingForm.placement}
                  onChange={(e) => setBindingForm((s) => ({ ...s, placement: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Orden</Label>
                <Input
                  type="number"
                  value={bindingForm.sort_order}
                  onChange={(e) => setBindingForm((s) => ({ ...s, sort_order: Number(e.target.value) || 0 }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Rules JSON</Label>
              <Textarea
                value={bindingForm.rules}
                onChange={(e) => setBindingForm((s) => ({ ...s, rules: e.target.value }))}
                className="text-xs min-h-[120px] font-mono"
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={bindingForm.is_visible}
                onChange={(e) => setBindingForm((s) => ({ ...s, is_visible: e.target.checked }))}
              />
              Binding visible
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBindingDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveBindingMut.mutate()} disabled={saveBindingMut.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Wizard: nueva integración</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3 bg-muted/20">
              <p className="text-xs font-medium">Este asistente crea App + Binding en un solo paso.</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Úsalo para empezar rápido. Luego puedes ajustar detalles con “Editar”.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nombre de la integración</Label>
                <Input
                  className="h-8 text-sm"
                  value={wizardForm.name}
                  onChange={(e) => setWizardForm((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Ej: CRM Comercial"
                />
              </div>
              <div>
                <Label className="text-xs">Icono</Label>
                <Input
                  className="h-8 text-sm"
                  value={wizardForm.icon}
                  onChange={(e) => setWizardForm((s) => ({ ...s, icon: e.target.value }))}
                  placeholder="Link"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={wizardForm.mode} onValueChange={(v) => setWizardForm((s) => ({ ...s, mode: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SNAPSHOT">SNAPSHOT (resumen rápido)</SelectItem>
                    <SelectItem value="EMBED">EMBED (sitio embebido)</SelectItem>
                    <SelectItem value="ACTIONS">ACTIONS (acciones rápidas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Orden en rail</Label>
                <Input
                  type="number"
                  className="h-8 text-sm"
                  value={wizardForm.sort_order}
                  onChange={(e) => setWizardForm((s) => ({ ...s, sort_order: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>

            {wizardForm.mode === "EMBED" && (
              <>
                <div>
                  <Label className="text-xs">URL base</Label>
                  <Input
                    className="h-8 text-sm"
                    value={wizardForm.base_url}
                    onChange={(e) => setWizardForm((s) => ({ ...s, base_url: e.target.value }))}
                    placeholder="https://tu-sistema.com"
                  />
                </div>
                <div>
                  <Label className="text-xs">Cómo abrirla</Label>
                  <Select
                    value={wizardForm.view_mode}
                    onValueChange={(v) => setWizardForm((s) => ({ ...s, view_mode: v }))}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INLINE">INLINE (panel derecho)</SelectItem>
                      <SelectItem value="MODAL">MODAL (pantalla grande)</SelectItem>
                      <SelectItem value="EXTERNAL_TAB">EXTERNAL_TAB (nueva pestaña)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Dónde aparece</Label>
                <Select
                  value={wizardForm.scope_type}
                  onValueChange={(v) => setWizardForm((s) => ({ ...s, scope_type: v as IntegrationBindingScopeType }))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GLOBAL">GLOBAL (todas)</SelectItem>
                    <SelectItem value="CHANNEL">CHANNEL (por canal)</SelectItem>
                    <SelectItem value="QUEUE">QUEUE (por cola)</SelectItem>
                    <SelectItem value="ROLE">ROLE (por rol)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Valor de filtro (si aplica)</Label>
                <Input
                  className="h-8 text-sm"
                  value={wizardForm.scope_id}
                  onChange={(e) => setWizardForm((s) => ({ ...s, scope_id: e.target.value }))}
                  placeholder="WHATSAPP / General / supervisor"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Fuentes permitidas (opcional, separadas por coma)</Label>
              <Input
                className="h-8 text-sm"
                value={wizardForm.source_filter}
                onChange={(e) => setWizardForm((s) => ({ ...s, source_filter: e.target.value }))}
                placeholder="agenthub_escalation, collect_escalation"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWizardOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => wizardCreateMut.mutate()} disabled={wizardCreateMut.isPending}>
              Crear integración
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
