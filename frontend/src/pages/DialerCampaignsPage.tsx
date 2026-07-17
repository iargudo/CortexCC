import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRef, useState } from "react";
import {
  Upload,
  PhoneOutgoing,
  BarChart3,
  Pencil,
  Trash2,
  Users,
  Plus,
  X,
} from "lucide-react";
import { apiFetch, apiJson } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Contact } from "@/data/mock";
import { useAuthStore } from "@/stores/authStore";

type Campaign = {
  id: string;
  name: string;
  mode: string;
  status: string;
  pacing_sec: number;
  predictive_ratio: number;
  max_lines: number;
  max_attempts: number;
  caller_id?: string | null;
  abandon_rate_max: number;
  require_agent_available: boolean;
  queue_id?: string | null;
  queue?: { id: string; name: string } | null;
  channel: { id: string; name: string };
  _count?: { contacts: number; sessions?: number };
};

type JoinableCampaign = {
  id: string;
  name: string;
  mode: string;
  status: string;
  channel: { id: string; name: string };
  _count?: { contacts: number };
};

type DialerContact = {
  id: string;
  phone: string;
  status: string;
  contact?: { name?: string | null } | null;
};

type CampaignStats = {
  by_status: Array<{ status: string; _count: number }>;
};

type CampaignContactRow = {
  id: string;
  phone: string;
  status: string;
  attempts: number;
  contact?: { id: string; name?: string | null; email?: string | null; phone?: string | null } | null;
};

const MODE_LABELS: Record<string, string> = {
  PREVIEW: "Preview",
  PROGRESSIVE: "Progresivo",
  PREDICTIVE: "Predictivo",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  COMPLETED: "Completada",
  ARCHIVED: "Archivada",
};

const CONTACT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  DIALING: "Marcando",
  CONTACTED: "Contactado",
  COMPLETED: "Completado",
  DNC: "No llamar",
  FAILED: "Fallido",
};

function hasSettingsAccess(user: ReturnType<typeof useAuthStore.getState>["user"]): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return Boolean(user.permissions?.settings);
}

function campaignModalTitle(campaign: Campaign | null): string {
  return campaign ? ` — ${campaign.name}` : "";
}

function CampaignStatsPanel({ campaignId }: { campaignId: string }) {
  const statsQuery = useQuery({
    queryKey: ["dialer", "campaigns", campaignId, "stats"],
    queryFn: () => apiJson<CampaignStats>(`/dialer/campaigns/${encodeURIComponent(campaignId)}/stats`),
  });

  if (statsQuery.isLoading) {
    return <p className="text-xs text-muted-foreground">Cargando estadísticas…</p>;
  }
  if (statsQuery.isError) {
    return <p className="text-xs text-destructive">No se pudieron cargar las estadísticas.</p>;
  }

  const rows = statsQuery.data?.by_status ?? [];
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin contactos importados.</p>;
  }

  const total = rows.reduce((sum, r) => sum + r._count, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {rows.map((row) => {
          const pct = total > 0 ? Math.round((row._count / total) * 100) : 0;
          return (
            <div key={row.status} className="rounded-md border bg-muted/30 p-3">
              <p className="text-[11px] text-muted-foreground">
                {CONTACT_STATUS_LABELS[row.status] ?? row.status}
              </p>
              <p className="text-lg font-semibold mt-0.5">{row._count}</p>
              <p className="text-[11px] text-muted-foreground">{pct}% del total</p>
            </div>
          );
        })}
      </div>
      <div className="rounded-md border px-3 py-2 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Total en campaña</span>
        <span className="font-medium">{total}</span>
      </div>
    </div>
  );
}

function DialerAgentPanel() {
  const qc = useQueryClient();
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [joinedCampaignId, setJoinedCampaignId] = useState<string | null>(null);

  const joinableQuery = useQuery({
    queryKey: ["dialer", "campaigns", "joinable"],
    queryFn: () => apiJson<JoinableCampaign[]>("/dialer/campaigns/joinable"),
  });

  const campaigns = joinableQuery.data ?? [];
  const activeCampaignId = joinedCampaignId ?? selectedCampaignId ?? campaigns[0]?.id ?? "";

  const nextQuery = useQuery({
    queryKey: ["dialer", "sessions", "me", "next", activeCampaignId],
    queryFn: () =>
      apiJson<DialerContact | null>(
        `/dialer/sessions/me/next?campaign_id=${encodeURIComponent(activeCampaignId)}`
      ),
    enabled: Boolean(joinedCampaignId && activeCampaignId),
  });

  const joinMut = useMutation({
    mutationFn: (campaignId: string) =>
      apiJson("/dialer/sessions/join", {
        method: "POST",
        body: JSON.stringify({ campaign_id: campaignId }),
      }),
    onSuccess: (_data, campaignId) => {
      setJoinedCampaignId(campaignId);
      toast.success("Sesión iniciada en la campaña");
      void qc.invalidateQueries({ queryKey: ["dialer", "sessions", "me", "next", campaignId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error al unirse"),
  });

  const dialMut = useMutation({
    mutationFn: ({ campaignId, dialerContactId }: { campaignId: string; dialerContactId: string }) =>
      apiJson("/dialer/sessions/me/dial", {
        method: "POST",
        body: JSON.stringify({ campaign_id: campaignId, dialer_contact_id: dialerContactId }),
      }),
    onSuccess: () => {
      toast.success("Marcando contacto…");
      void qc.invalidateQueries({ queryKey: ["dialer", "sessions", "me", "next", activeCampaignId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error al marcar"),
  });

  const selectedCampaign = campaigns.find((c) => c.id === activeCampaignId);
  const nextContact = nextQuery.data;

  return (
    <div className="border rounded-lg p-4 bg-card space-y-4">
      <div>
        <h2 className="text-sm font-medium">Mi sesión de marcación</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Únete a una campaña activa. En modo Preview eliges cuándo marcar cada contacto.
        </p>
      </div>

      {joinableQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando campañas…</p>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay campañas activas. Un administrador debe crear una, importar contactos y activarla.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
            <select
              className="h-10 rounded-md border px-2 text-sm bg-background"
              value={activeCampaignId}
              onChange={(e) => {
                setSelectedCampaignId(e.target.value);
                setJoinedCampaignId(null);
              }}
              disabled={Boolean(joinedCampaignId)}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {MODE_LABELS[c.mode] ?? c.mode} · {c._count?.contacts ?? 0} contactos
                </option>
              ))}
            </select>
            {!joinedCampaignId ? (
              <Button
                disabled={!activeCampaignId || joinMut.isPending}
                onClick={() => joinMut.mutate(activeCampaignId)}
              >
                Unirme
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setJoinedCampaignId(null)}>
                Cambiar campaña
              </Button>
            )}
          </div>

          {joinedCampaignId && selectedCampaign && (
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">{MODE_LABELS[selectedCampaign.mode] ?? selectedCampaign.mode}</Badge>
                <span className="text-muted-foreground">{selectedCampaign.channel.name}</span>
              </div>

              {selectedCampaign.mode !== "PREVIEW" ? (
                <p className="text-xs text-muted-foreground">
                  En modo {MODE_LABELS[selectedCampaign.mode] ?? selectedCampaign.mode} el sistema marca
                  automáticamente cuando estás disponible (ONLINE) y con softphone registrado.
                </p>
              ) : nextQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Buscando siguiente contacto…</p>
              ) : !nextContact ? (
                <p className="text-sm text-muted-foreground">No hay contactos pendientes en esta campaña.</p>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{nextContact.contact?.name ?? "Sin nombre"}</p>
                    <p className="text-sm font-mono text-muted-foreground">{nextContact.phone}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Estado: {CONTACT_STATUS_LABELS[nextContact.status] ?? nextContact.status}
                    </p>
                  </div>
                  <Button
                    className="gap-1 shrink-0"
                    disabled={dialMut.isPending}
                    onClick={() =>
                      dialMut.mutate({
                        campaignId: joinedCampaignId,
                        dialerContactId: nextContact.id,
                      })
                    }
                  >
                    <PhoneOutgoing size={14} /> Marcar
                  </Button>
                </div>
              )}

              {selectedCampaign.mode === "PREVIEW" && joinedCampaignId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() =>
                    void qc.invalidateQueries({
                      queryKey: ["dialer", "sessions", "me", "next", joinedCampaignId],
                    })
                  }
                >
                  Actualizar siguiente contacto
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CampaignContactsPanel({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const contactsQuery = useQuery({
    queryKey: ["dialer", "campaigns", campaignId, "contacts", search],
    queryFn: () =>
      apiJson<{ data: CampaignContactRow[]; meta: { total: number } }>(
        `/dialer/campaigns/${encodeURIComponent(campaignId)}/contacts?search=${encodeURIComponent(search)}&limit=100`
      ),
  });

  const systemContactsQuery = useQuery({
    queryKey: ["contacts", contactSearch, "dialer-pick"],
    enabled: addOpen,
    queryFn: () =>
      apiJson<{ data: Contact[] }>(
        `/contacts?search=${encodeURIComponent(contactSearch)}&limit=100&page=1`
      ),
  });

  const addMut = useMutation({
    mutationFn: (contactIds: string[]) =>
      apiJson(`/dialer/campaigns/${encodeURIComponent(campaignId)}/contacts`, {
        method: "POST",
        body: JSON.stringify({ contact_ids: contactIds }),
      }),
    onSuccess: (data: { imported?: number; skipped?: number }) => {
      toast.success(`Agregados: ${data.imported ?? 0}${data.skipped ? ` · omitidos: ${data.skipped}` : ""}`);
      setAddOpen(false);
      setSelectedIds(new Set());
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns", campaignId, "contacts"] });
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns"] });
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns", campaignId, "stats"] });
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns", "joinable"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error al agregar"),
  });

  const removeMut = useMutation({
    mutationFn: (dialerContactId: string) =>
      apiFetch(`/dialer/campaigns/${encodeURIComponent(campaignId)}/contacts/${encodeURIComponent(dialerContactId)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success("Contacto eliminado de la campaña");
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns", campaignId, "contacts"] });
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns"] });
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns", campaignId, "stats"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error al eliminar"),
  });

  const systemContacts = (systemContactsQuery.data?.data ?? []).filter((c) => c.phone || c.phone_wa);
  const rows = contactsQuery.data?.data ?? [];

  const toggleContact = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Buscar en campaña…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-9"
        />
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setAddOpen(true)}>
          <Plus size={14} /> Desde contactos del sistema
        </Button>
      </div>

      {contactsQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">Cargando contactos…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin contactos en la campaña. Agrégalos desde el módulo de contactos o importa un CSV.
        </p>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-16">Intentos</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm">{row.contact?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm font-mono">{row.phone}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">
                      {CONTACT_STATUS_LABELS[row.status] ?? row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{row.attempts}</TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      disabled={removeMut.isPending}
                      onClick={() => removeMut.mutate(row.id)}
                    >
                      <X size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Total en campaña: {contactsQuery.data?.meta.total ?? 0}
      </p>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Agregar contactos del sistema</DialogTitle>
            <DialogDescription>
              Selecciona contactos con teléfono del directorio para añadirlos a esta campaña.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Buscar por nombre, email o teléfono…"
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
          />
          <div className="flex-1 overflow-y-auto border rounded-md min-h-[200px] max-h-[320px]">
            {systemContactsQuery.isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">Buscando…</p>
            ) : systemContacts.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                No hay contactos con teléfono. Créalos en Contactos primero.
              </p>
            ) : (
              <div className="divide-y">
                {systemContacts.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggleContact(c.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {c.phone ?? c.phone_wa}
                        {c.email ? ` · ${c.email}` : ""}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={selectedIds.size === 0 || addMut.isPending}
              onClick={() => addMut.mutate([...selectedIds])}
            >
              Agregar {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DialerAdminPanel() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [mode, setMode] = useState("PREVIEW");
  const [contactsModalCampaign, setContactsModalCampaign] = useState<Campaign | null>(null);
  const [statsModalCampaign, setStatsModalCampaign] = useState<Campaign | null>(null);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [deleteCampaign, setDeleteCampaign] = useState<Campaign | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const campaignsQuery = useQuery({
    queryKey: ["dialer", "campaigns"],
    queryFn: () => apiJson<Campaign[]>("/dialer/campaigns"),
  });

  const channelsQuery = useQuery({
    queryKey: ["settings", "channels"],
    queryFn: () => apiJson<Array<{ id: string; name: string; type: string }>>("/settings/channels"),
  });

  const queuesQuery = useQuery({
    queryKey: ["queues", "settings"],
    queryFn: () => apiJson<Array<{ id: string; name: string }>>("/queues"),
  });

  const voiceChannels = (channelsQuery.data ?? []).filter((c) => c.type === "VOICE");

  const createMut = useMutation({
    mutationFn: () =>
      apiJson("/dialer/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name,
          channel_id: channelId || voiceChannels[0]?.id,
          mode,
        }),
      }),
    onSuccess: () => {
      toast.success("Campaña creada");
      setName("");
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns"] });
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns", "joinable"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiJson(`/dialer/campaigns/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns"] });
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns", "joinable"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const updateMut = useMutation({
    mutationFn: (payload: {
      id: string;
      name: string;
      channel_id: string;
      mode: string;
      pacing_sec: number;
      predictive_ratio: number;
      max_lines: number;
      queue_id: string | null;
      caller_id: string | null;
      max_attempts: number;
      abandon_rate_max: number;
      require_agent_available: boolean;
    }) =>
      apiJson(`/dialer/campaigns/${encodeURIComponent(payload.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: payload.name,
          channel_id: payload.channel_id,
          mode: payload.mode,
          pacing_sec: payload.pacing_sec,
          predictive_ratio: payload.predictive_ratio,
          max_lines: payload.max_lines,
          queue_id: payload.queue_id,
          caller_id: payload.caller_id,
          max_attempts: payload.max_attempts,
          abandon_rate_max: payload.abandon_rate_max,
          require_agent_available: payload.require_agent_available,
        }),
      }),
    onSuccess: () => {
      toast.success("Campaña actualizada");
      setEditCampaign(null);
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns"] });
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns", "joinable"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error al actualizar"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/dialer/campaigns/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Campaña eliminada");
      setDeleteCampaign(null);
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns"] });
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns", "joinable"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error al eliminar"),
  });

  const importMut = useMutation({
    mutationFn: async ({ campaignId, file }: { campaignId: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch(`/dialer/campaigns/${encodeURIComponent(campaignId)}/contacts/import`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || res.statusText);
      }
      return res.json() as Promise<{ imported: number }>;
    },
    onSuccess: (data, { campaignId }) => {
      const skipped = "skipped" in data && typeof data.skipped === "number" ? data.skipped : 0;
      toast.success(
        `Importados: ${data.imported}${skipped ? ` · omitidos (duplicados/sin teléfono): ${skipped}` : ""}`
      );
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns"] });
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns", campaignId, "contacts"] });
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns", campaignId, "stats"] });
      void qc.invalidateQueries({ queryKey: ["dialer", "campaigns", "joinable"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error al importar"),
  });

  const handleImport = (campaignId: string) => {
    fileRefs.current[campaignId]?.click();
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 space-y-3 bg-card">
        <h2 className="text-sm font-medium">Nueva campaña</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <select
            className="h-10 rounded-md border px-2 text-sm bg-background"
            value={channelId || voiceChannels[0]?.id || ""}
            onChange={(e) => setChannelId(e.target.value)}
          >
            {voiceChannels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border px-2 text-sm bg-background"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="PREVIEW">Preview</option>
            <option value="PROGRESSIVE">Progresivo</option>
            <option value="PREDICTIVE">Predictivo</option>
          </select>
          <Button disabled={!name.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
            Crear
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          El CSV importa al directorio de contactos y a la campaña: si el teléfono ya existe se vincula; si no,
          se crea en Contactos. Columnas: <code className="text-xs">phone</code> (obligatorio),{" "}
          <code className="text-xs">name</code> o <code className="text-xs">contact_id</code> (opcionales).
        </p>
      </div>

      <div className="space-y-2">
        {(campaignsQuery.data ?? []).map((c) => (
            <div key={c.id} className="border rounded-lg p-4 bg-card space-y-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{c.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {MODE_LABELS[c.mode] ?? c.mode} · {STATUS_LABELS[c.status] ?? c.status} ·{" "}
                    {c._count?.contacts ?? 0} contactos
                    {c.mode === "PREDICTIVE" &&
                      ` · ratio ${c.predictive_ratio} · max ${c.max_lines} líneas`}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Canal: {c.channel.name}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={(el) => {
                      fileRefs.current[c.id] = el;
                    }}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importMut.mutate({ campaignId: c.id, file });
                      e.target.value = "";
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setContactsModalCampaign(c)}
                  >
                    <Users size={14} />
                    Contactos
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={importMut.isPending}
                    onClick={() => handleImport(c.id)}
                  >
                    <Upload size={14} /> Importar CSV
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditCampaign(c)}>
                    <Pencil size={14} /> Editar
                  </Button>
                  {c.status !== "ACTIVE" ? (
                    <Button size="sm" onClick={() => statusMut.mutate({ id: c.id, status: "ACTIVE" })}>
                      Activar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => statusMut.mutate({ id: c.id, status: "PAUSED" })}
                    >
                      Pausar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    onClick={() => setStatsModalCampaign(c)}
                  >
                    <BarChart3 size={14} />
                    Estadísticas
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-destructive hover:text-destructive"
                    onClick={() => setDeleteCampaign(c)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </div>
        ))}
      </div>

      <Dialog
        open={Boolean(contactsModalCampaign)}
        onOpenChange={(open) => !open && setContactsModalCampaign(null)}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Contactos{campaignModalTitle(contactsModalCampaign)}</DialogTitle>
            <DialogDescription>
              Lista de contactos de la campaña, búsqueda, alta desde el directorio o eliminación.
            </DialogDescription>
          </DialogHeader>
          {contactsModalCampaign && (
            <div className="flex-1 overflow-y-auto min-h-0 pr-1">
              <CampaignContactsPanel campaignId={contactsModalCampaign.id} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(statsModalCampaign)}
        onOpenChange={(open) => !open && setStatsModalCampaign(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Estadísticas{campaignModalTitle(statsModalCampaign)}</DialogTitle>
            <DialogDescription>
              Distribución de contactos por estado de marcación en esta campaña.
            </DialogDescription>
          </DialogHeader>
          {statsModalCampaign && <CampaignStatsPanel campaignId={statsModalCampaign.id} />}
        </DialogContent>
      </Dialog>

      {editCampaign && (
        <EditCampaignDialog
          campaign={editCampaign}
          voiceChannels={voiceChannels}
          queues={queuesQuery.data ?? []}
          pending={updateMut.isPending}
          onClose={() => setEditCampaign(null)}
          onSave={(payload) => updateMut.mutate(payload)}
        />
      )}

      <AlertDialog open={Boolean(deleteCampaign)} onOpenChange={(open) => !open && setDeleteCampaign(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar campaña?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará &quot;{deleteCampaign?.name}&quot; y todos sus contactos de marcación. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteCampaign && deleteMut.mutate(deleteCampaign.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditCampaignDialog({
  campaign,
  voiceChannels,
  queues,
  pending,
  onClose,
  onSave,
}: {
  campaign: Campaign;
  voiceChannels: Array<{ id: string; name: string }>;
  queues: Array<{ id: string; name: string }>;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id: string;
    name: string;
    channel_id: string;
    mode: string;
    pacing_sec: number;
    predictive_ratio: number;
    max_lines: number;
    queue_id: string | null;
    caller_id: string | null;
    max_attempts: number;
    abandon_rate_max: number;
    require_agent_available: boolean;
  }) => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [channelId, setChannelId] = useState(campaign.channel.id);
  const [mode, setMode] = useState(campaign.mode);
  const [pacingSec, setPacingSec] = useState(String(campaign.pacing_sec));
  const [predictiveRatio, setPredictiveRatio] = useState(String(campaign.predictive_ratio));
  const [maxLines, setMaxLines] = useState(String(campaign.max_lines));
  const [queueId, setQueueId] = useState(campaign.queue_id ?? "");
  const [callerId, setCallerId] = useState(campaign.caller_id ?? "");
  const [maxAttempts, setMaxAttempts] = useState(String(campaign.max_attempts ?? 3));
  const [abandonRateMax, setAbandonRateMax] = useState(String(campaign.abandon_rate_max ?? 0.03));
  const [requireAgentAvailable, setRequireAgentAvailable] = useState(
    campaign.require_agent_available ?? true
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar campaña</DialogTitle>
          <DialogDescription>Modifica nombre, canal, modo y parámetros de marcación.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="edit-name">Nombre</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Canal de voz</Label>
            <select
              className="h-10 w-full rounded-md border px-2 text-sm bg-background"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            >
              {voiceChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Modo</Label>
            <select
              className="h-10 w-full rounded-md border px-2 text-sm bg-background"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="PREVIEW">Preview</option>
              <option value="PROGRESSIVE">Progresivo</option>
              <option value="PREDICTIVE">Predictivo</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="edit-pacing">Pacing (s)</Label>
              <Input
                id="edit-pacing"
                type="number"
                min={1}
                value={pacingSec}
                onChange={(e) => setPacingSec(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-ratio">Ratio predictivo</Label>
              <Input
                id="edit-ratio"
                type="number"
                step="0.1"
                min={1}
                value={predictiveRatio}
                onChange={(e) => setPredictiveRatio(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-lines">Máx. líneas</Label>
              <Input
                id="edit-lines"
                type="number"
                min={1}
                value={maxLines}
                onChange={(e) => setMaxLines(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Cola destino</Label>
            <select
              className="h-10 w-full rounded-md border px-2 text-sm bg-background"
              value={queueId}
              onChange={(e) => setQueueId(e.target.value)}
            >
              <option value="">Sin cola</option>
              {queues.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="edit-caller">Caller ID</Label>
              <Input
                id="edit-caller"
                value={callerId}
                onChange={(e) => setCallerId(e.target.value)}
                placeholder="Número saliente"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-attempts">Máx. intentos</Label>
              <Input
                id="edit-attempts"
                type="number"
                min={1}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-abandon">Abandono máx.</Label>
              <Input
                id="edit-abandon"
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={abandonRateMax}
                onChange={(e) => setAbandonRateMax(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="edit-require-agent"
              checked={requireAgentAvailable}
              onCheckedChange={(c) => setRequireAgentAvailable(Boolean(c))}
            />
            <Label htmlFor="edit-require-agent" className="text-sm">
              Requiere agente disponible (predictivo/progresivo)
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!name.trim() || pending}
            onClick={() =>
              onSave({
                id: campaign.id,
                name: name.trim(),
                channel_id: channelId,
                mode,
                pacing_sec: Number(pacingSec) || 30,
                predictive_ratio: Number(predictiveRatio) || 1.2,
                max_lines: Number(maxLines) || 5,
                queue_id: queueId || null,
                caller_id: callerId.trim() || null,
                max_attempts: Number(maxAttempts) || 3,
                abandon_rate_max: Number(abandonRateMax) || 0.03,
                require_agent_available: requireAgentAvailable,
              })
            }
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DialerCampaignsPage() {
  const user = useAuthStore((s) => s.user);
  const canAdmin = hasSettingsAccess(user);

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Campañas de marcación</h1>
        <p className="text-sm text-muted-foreground">
          Marcación outbound: Preview (manual), progresivo y predictivo
        </p>
      </div>

      {canAdmin ? (
        <Tabs defaultValue="agent">
          <TabsList>
            <TabsTrigger value="agent">Mi sesión</TabsTrigger>
            <TabsTrigger value="admin">Administración</TabsTrigger>
          </TabsList>
          <TabsContent value="agent" className="mt-4">
            <DialerAgentPanel />
          </TabsContent>
          <TabsContent value="admin" className="mt-4">
            <DialerAdminPanel />
          </TabsContent>
        </Tabs>
      ) : (
        <DialerAgentPanel />
      )}
    </div>
  );
}
