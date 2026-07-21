import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { BusinessHours, Disposition, QuickReply, SlaPolicy } from "@/data/mock";
import type { ChannelType } from "@/data/mock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus,
  Edit2,
  Trash2,
  Clock,
  MessageCircle,
  FileCheck,
  Calendar,
  Building2,
  Tag as TagIcon,
} from "lucide-react";
import { apiJson } from "@/lib/api";
import { BusinessHoursScheduleEditor } from "@/components/settings/BusinessHoursScheduleEditor";
import {
  DEFAULT_SCHEDULE,
  TIMEZONE_OPTIONS,
  dayLabel,
  formatScheduleSlots,
  normalizeSchedule,
  validateSchedule,
  type WeekSchedule,
} from "@/lib/businessHours";

const CHANNELS: ChannelType[] = ["WHATSAPP", "EMAIL", "VOICE", "WEBCHAT", "TEAMS"];

type OrganizationSettings = {
  company_name: string | null;
  timezone: string | null;
  language: string | null;
  agent_can_transfer?: boolean;
};

type TagRow = {
  id: string;
  name: string;
  color: string;
  _count?: { contacts: number };
};

const LANGUAGE_OPTIONS = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "pt", label: "Português" },
];

export default function SettingsGeneralPage() {
  const qc = useQueryClient();
  const invalidate = (key: readonly string[]) => void qc.invalidateQueries({ queryKey: key });

  const dispQuery = useQuery({
    queryKey: ["settings", "dispositions", "all"],
    queryFn: () => apiJson<Disposition[]>("/settings/dispositions"),
  });
  const slaQuery = useQuery({
    queryKey: ["settings", "sla-policies"],
    queryFn: () => apiJson<SlaPolicy[]>("/settings/sla-policies"),
  });
  const qrQuery = useQuery({
    queryKey: ["settings", "quick-replies"],
    queryFn: () => apiJson<QuickReply[]>("/settings/quick-replies"),
  });
  const bhQuery = useQuery({
    queryKey: ["settings", "business-hours"],
    queryFn: () => apiJson<BusinessHours[]>("/settings/business-hours"),
  });
  const orgQuery = useQuery({
    queryKey: ["settings", "general"],
    queryFn: () => apiJson<OrganizationSettings | null>("/settings/general"),
  });
  const tagsQuery = useQuery({
    queryKey: ["settings", "tags"],
    queryFn: () => apiJson<TagRow[]>("/settings/tags"),
  });

  const [dispOpen, setDispOpen] = useState(false);
  const [editingDisp, setEditingDisp] = useState<Disposition | null>(null);
  const [dName, setDName] = useState("");
  const [dCat, setDCat] = useState("general");
  const [dNote, setDNote] = useState(false);
  const [dActive, setDActive] = useState(true);
  const [dConversion, setDConversion] = useState(false);

  const dispSave = useMutation({
    mutationFn: async () => {
      const body = {
        name: dName.trim(),
        category: dCat,
        requires_note: dNote,
        is_active: dActive,
        is_conversion: dConversion,
      };
      if (editingDisp) {
        await apiJson(`/settings/dispositions/${editingDisp.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiJson("/settings/dispositions", { method: "POST", body: JSON.stringify(body) });
      }
    },
    onSuccess: () => {
      invalidate(["settings", "dispositions", "all"]);
      toast.success(editingDisp ? "Disposición actualizada" : "Disposición creada");
      setDispOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dispDel = useMutation({
    mutationFn: (id: string) => apiJson(`/settings/dispositions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["settings", "dispositions", "all"]);
      toast.success("Eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [slaOpen, setSlaOpen] = useState(false);
  const [editingSla, setEditingSla] = useState<SlaPolicy | null>(null);
  const [sName, setSName] = useState("");
  const [sFirst, setSFirst] = useState(300);
  const [sRes, setSRes] = useState(3600);
  const [sWarn, setSWarn] = useState(80);

  const slaSave = useMutation({
    mutationFn: async () => {
      const body = {
        name: sName.trim(),
        first_response_seconds: sFirst,
        resolution_seconds: sRes,
        warning_threshold_pct: sWarn,
      };
      if (editingSla) {
        await apiJson(`/settings/sla-policies/${editingSla.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiJson("/settings/sla-policies", { method: "POST", body: JSON.stringify(body) });
      }
    },
    onSuccess: () => {
      invalidate(["settings", "sla-policies"]);
      toast.success(editingSla ? "Política actualizada" : "Política creada");
      setSlaOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const slaDel = useMutation({
    mutationFn: (id: string) => apiJson(`/settings/sla-policies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["settings", "sla-policies"]);
      toast.success("Política eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [qrOpen, setQrOpen] = useState(false);
  const [editingQr, setEditingQr] = useState<QuickReply | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [qrTitle, setQrTitle] = useState("");
  const [qrContent, setQrContent] = useState("");
  const [qrChannel, setQrChannel] = useState<string>("__all__");
  const [qrCat, setQrCat] = useState("");

  const qrSave = useMutation({
    mutationFn: async () => {
      const body = {
        shortcode: qrCode.trim(),
        title: qrTitle.trim(),
        content: qrContent,
        channel: qrChannel === "__all__" ? null : qrChannel,
        category: qrCat.trim() || null,
      };
      if (editingQr) {
        await apiJson(`/settings/quick-replies/${editingQr.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiJson("/settings/quick-replies", { method: "POST", body: JSON.stringify(body) });
      }
    },
    onSuccess: () => {
      invalidate(["settings", "quick-replies"]);
      invalidate(["settings", "quick-replies", "inbox"]);
      invalidate(["settings", "quick-replies", "context-panel"]);
      toast.success(editingQr ? "Respuesta actualizada" : "Respuesta creada");
      setQrOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const qrDel = useMutation({
    mutationFn: (id: string) => apiJson(`/settings/quick-replies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["settings", "quick-replies"]);
      invalidate(["settings", "quick-replies", "inbox"]);
      invalidate(["settings", "quick-replies", "context-panel"]);
      toast.success("Eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [bhOpen, setBhOpen] = useState(false);
  const [editingBh, setEditingBh] = useState<BusinessHours | null>(null);
  const [bhName, setBhName] = useState("");
  const [bhTz, setBhTz] = useState("America/Guayaquil");
  const [bhSchedule, setBhSchedule] = useState<WeekSchedule>(DEFAULT_SCHEDULE);
  const [bhHolidays, setBhHolidays] = useState("");

  const bhSave = useMutation({
    mutationFn: async () => {
      const scheduleError = validateSchedule(bhSchedule);
      if (scheduleError) throw new Error(scheduleError);
      const holidays = bhHolidays
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const invalidDate = holidays.find((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d));
      if (invalidDate) throw new Error(`Fecha de feriado inválida: ${invalidDate} (usa AAAA-MM-DD)`);
      const body = { name: bhName.trim(), timezone: bhTz, schedule: bhSchedule, holidays };
      if (editingBh) {
        await apiJson(`/settings/business-hours/${editingBh.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiJson("/settings/business-hours", { method: "POST", body: JSON.stringify(body) });
      }
    },
    onSuccess: () => {
      invalidate(["settings", "business-hours"]);
      toast.success(editingBh ? "Horario actualizado" : "Horario creado");
      setBhOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [orgName, setOrgName] = useState("");
  const [orgTz, setOrgTz] = useState("America/Guayaquil");
  const [orgLang, setOrgLang] = useState("es");
  const [agentCanTransfer, setAgentCanTransfer] = useState(false);
  const [orgHydrated, setOrgHydrated] = useState(false);

  if (!orgHydrated && orgQuery.data) {
    setOrgName(orgQuery.data.company_name ?? "");
    setOrgTz(orgQuery.data.timezone ?? "America/Guayaquil");
    setOrgLang(orgQuery.data.language ?? "es");
    setAgentCanTransfer(Boolean(orgQuery.data.agent_can_transfer));
    setOrgHydrated(true);
  }

  const orgSave = useMutation({
    mutationFn: () =>
      apiJson("/settings/general", {
        method: "PUT",
        body: JSON.stringify({
          company_name: orgName.trim(),
          timezone: orgTz,
          language: orgLang,
          agent_can_transfer: agentCanTransfer,
        }),
      }),
    onSuccess: () => {
      invalidate(["settings", "general"]);
      invalidate(["org-capabilities"]);
      toast.success("Organización actualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [tagOpen, setTagOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagRow | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("#6B7280");

  const tagSave = useMutation({
    mutationFn: async () => {
      const body = { name: tagName.trim(), color: tagColor };
      if (editingTag) {
        await apiJson(`/settings/tags/${editingTag.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiJson("/settings/tags", { method: "POST", body: JSON.stringify(body) });
      }
    },
    onSuccess: () => {
      invalidate(["settings", "tags"]);
      toast.success(editingTag ? "Etiqueta actualizada" : "Etiqueta creada");
      setTagOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tagDel = useMutation({
    mutationFn: (id: string) => apiJson(`/settings/tags/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["settings", "tags"]);
      toast.success("Etiqueta eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dispositions = dispQuery.data ?? [];
  const slaPolicies = slaQuery.data ?? [];
  const quickReplies = qrQuery.data ?? [];
  const businessHours = bhQuery.data ?? [];
  const tags = tagsQuery.data ?? [];

  const err = dispQuery.error || slaQuery.error || qrQuery.error || bhQuery.error;

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <h1 className="text-xl font-bold">Configuración general</h1>
      {err && <p className="text-sm text-destructive">{(err as Error).message}</p>}

      <Tabs defaultValue="organization">
        <TabsList>
          <TabsTrigger value="organization" className="gap-1">
            <Building2 size={12} /> Organización
          </TabsTrigger>
          <TabsTrigger value="dispositions" className="gap-1">
            <FileCheck size={12} /> Disposiciones
          </TabsTrigger>
          <TabsTrigger value="sla" className="gap-1">
            <Clock size={12} /> SLA
          </TabsTrigger>
          <TabsTrigger value="quick-replies" className="gap-1">
            <MessageCircle size={12} /> Respuestas rápidas
          </TabsTrigger>
          <TabsTrigger value="hours" className="gap-1">
            <Calendar size={12} /> Horarios
          </TabsTrigger>
          <TabsTrigger value="tags" className="gap-1">
            <TagIcon size={12} /> Etiquetas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organization" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Datos de la organización</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-lg">
              {orgQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
              <div>
                <Label className="text-xs">Nombre de la empresa</Label>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="h-8 text-sm"
                  placeholder="Mi Empresa"
                />
              </div>
              <div>
                <Label className="text-xs">Zona horaria</Label>
                <Select value={orgTz} onValueChange={setOrgTz}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONE_OPTIONS.some((tz) => tz.value === orgTz) ? null : (
                      <SelectItem value={orgTz}>{orgTz}</SelectItem>
                    )}
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Idioma</Label>
                <Select value={orgLang} onValueChange={setOrgLang}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="agent-can-transfer"
                    checked={agentCanTransfer}
                    onCheckedChange={(c) => setAgentCanTransfer(Boolean(c))}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="agent-can-transfer" className="text-xs font-medium cursor-pointer">
                      Permitir que agentes transfieran conversaciones
                    </Label>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Por defecto solo admin, supervisor y coordinador pueden transferir. Activa esta
                      opción para habilitar la transferencia también a agentes.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => orgSave.mutate()}
                  disabled={orgSave.isPending || !orgName.trim()}
                >
                  Guardar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dispositions" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1"
              variant="outline"
              onClick={() => {
                setEditingDisp(null);
                setDName("");
                setDCat("general");
                setDNote(false);
                setDActive(true);
                setDConversion(false);
                setDispOpen(true);
              }}
            >
              <Plus size={14} /> Nueva disposición
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {dispQuery.isLoading && <p className="p-4 text-sm text-muted-foreground">Cargando…</p>}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left p-3 font-medium">Nombre</th>
                    <th className="text-left p-3 font-medium">Categoría</th>
                    <th className="text-center p-3 font-medium">Requiere nota</th>
                    <th className="text-center p-3 font-medium">Conversión</th>
                    <th className="text-center p-3 font-medium">Estado</th>
                    <th className="text-center p-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {dispositions.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="p-3 font-medium">{d.name}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className="text-[10px]">
                          {d.category}
                        </Badge>
                      </td>
                      <td className="text-center p-3">{d.requires_note ? "Sí" : "No"}</td>
                      <td className="text-center p-3">
                        {d.is_conversion ? (
                          <Badge variant="default" className="text-[10px]">
                            Sí
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </td>
                      <td className="text-center p-3">
                        <Badge variant={d.is_active ? "default" : "secondary"} className="text-[10px]">
                          {d.is_active ? "Activa" : "Inactiva"}
                        </Badge>
                      </td>
                      <td className="text-center p-3">
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingDisp(d);
                              setDName(d.name);
                              setDCat(d.category);
                              setDNote(d.requires_note);
                              setDActive(d.is_active);
                              setDConversion(d.is_conversion);
                              setDispOpen(true);
                            }}
                          >
                            <Edit2 size={12} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            disabled={dispDel.isPending}
                            onClick={() => {
                              if (window.confirm(`¿Eliminar «${d.name}»?`)) dispDel.mutate(d.id);
                            }}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sla" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1"
              variant="outline"
              onClick={() => {
                setEditingSla(null);
                setSName("");
                setSFirst(300);
                setSRes(3600);
                setSWarn(80);
                setSlaOpen(true);
              }}
            >
              <Plus size={14} /> Nueva política
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {slaQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando SLA…</p>}
            {slaPolicies.map((s) => (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{s.name}</CardTitle>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingSla(s);
                          setSName(s.name);
                          setSFirst(s.first_response_seconds);
                          setSRes(s.resolution_seconds);
                          setSWarn(s.warning_threshold_pct);
                          setSlaOpen(true);
                        }}
                      >
                        <Edit2 size={12} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        disabled={slaDel.isPending}
                        onClick={() => {
                          if (window.confirm(`¿Eliminar política «${s.name}»?`)) slaDel.mutate(s.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted rounded p-2">
                      <p className="text-muted-foreground">1ra respuesta</p>
                      <p className="font-medium">
                        {s.first_response_seconds < 3600
                          ? `${s.first_response_seconds}s`
                          : `${Math.floor(s.first_response_seconds / 3600)}h`}
                      </p>
                    </div>
                    <div className="bg-muted rounded p-2">
                      <p className="text-muted-foreground">Resolución</p>
                      <p className="font-medium">
                        {s.resolution_seconds < 3600
                          ? `${Math.floor(s.resolution_seconds / 60)}m`
                          : `${Math.floor(s.resolution_seconds / 3600)}h`}
                      </p>
                    </div>
                    <div className="bg-muted rounded p-2 col-span-2">
                      <p className="text-muted-foreground">Umbral de alerta</p>
                      <p className="font-medium">{s.warning_threshold_pct}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="quick-replies" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1"
              variant="outline"
              onClick={() => {
                setEditingQr(null);
                setQrCode("");
                setQrTitle("");
                setQrContent("");
                setQrChannel("__all__");
                setQrCat("");
                setQrOpen(true);
              }}
            >
              <Plus size={14} /> Nueva respuesta
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {qrQuery.isLoading && <p className="p-4 text-sm text-muted-foreground">Cargando…</p>}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left p-3 font-medium">Shortcode</th>
                    <th className="text-left p-3 font-medium">Título</th>
                    <th className="text-left p-3 font-medium">Contenido</th>
                    <th className="text-center p-3 font-medium">Canal</th>
                    <th className="text-center p-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {quickReplies.map((qr) => (
                    <tr key={qr.id} className="border-b last:border-0">
                      <td className="p-3 font-mono text-primary text-xs">{qr.shortcode}</td>
                      <td className="p-3 font-medium">{qr.title}</td>
                      <td className="p-3 text-muted-foreground max-w-xs truncate">{qr.content}</td>
                      <td className="text-center p-3">{qr.channel || "Todos"}</td>
                      <td className="text-center p-3">
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingQr(qr);
                              setQrCode(qr.shortcode);
                              setQrTitle(qr.title);
                              setQrContent(qr.content);
                              setQrChannel(qr.channel ?? "__all__");
                              setQrCat(qr.category ?? "");
                              setQrOpen(true);
                            }}
                          >
                            <Edit2 size={12} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            disabled={qrDel.isPending}
                            onClick={() => {
                              if (window.confirm("¿Eliminar esta respuesta rápida?")) qrDel.mutate(qr.id);
                            }}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hours" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1"
              variant="outline"
              onClick={() => {
                setEditingBh(null);
                setBhName("");
                setBhTz("America/Guayaquil");
                setBhSchedule(structuredClone(DEFAULT_SCHEDULE));
                setBhHolidays("");
                setBhOpen(true);
              }}
            >
              <Plus size={14} /> Nuevo horario
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {bhQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando horarios…</p>}
            {businessHours.map((bh) => (
              <Card key={bh.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{bh.name}</CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditingBh(bh);
                        setBhName(bh.name);
                        setBhTz(bh.timezone);
                        setBhSchedule(normalizeSchedule(bh.schedule));
                        setBhHolidays(Array.isArray(bh.holidays) ? bh.holidays.join("\n") : "");
                        setBhOpen(true);
                      }}
                    >
                      <Edit2 size={12} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-2">Zona horaria: {bh.timezone}</p>
                  <div className="space-y-1 text-xs">
                    {Object.entries(normalizeSchedule(bh.schedule)).map(([day, slots]) => (
                      <div key={day} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground w-24 shrink-0">{dayLabel(day)}</span>
                        <span className={`font-medium text-right ${slots.length === 0 ? "text-muted-foreground" : ""}`}>
                          {formatScheduleSlots(slots)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="tags" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1"
              variant="outline"
              onClick={() => {
                setEditingTag(null);
                setTagName("");
                setTagColor("#6B7280");
                setTagOpen(true);
              }}
            >
              <Plus size={14} /> Nueva etiqueta
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {tagsQuery.isLoading && <p className="p-4 text-sm text-muted-foreground">Cargando…</p>}
              {!tagsQuery.isLoading && tags.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No hay etiquetas todavía.</p>
              )}
              <table className="w-full text-sm">
                <tbody>
                  {tags.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full border"
                            style={{ backgroundColor: t.color }}
                          />
                          <span className="font-medium">{t.name}</span>
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {t._count?.contacts ?? 0} contacto{(t._count?.contacts ?? 0) === 1 ? "" : "s"}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingTag(t);
                              setTagName(t.name);
                              setTagColor(t.color);
                              setTagOpen(true);
                            }}
                          >
                            <Edit2 size={12} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            disabled={tagDel.isPending}
                            onClick={() => {
                              if (window.confirm(`¿Eliminar «${t.name}»?`)) tagDel.mutate(t.id);
                            }}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dispOpen} onOpenChange={setDispOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDisp ? "Editar disposición" : "Nueva disposición"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={dName} onChange={(e) => setDName(e.target.value)} className="h-8 text-sm" disabled={!!editingDisp} />
            </div>
            <div>
              <Label className="text-xs">Categoría</Label>
              <Input value={dCat} onChange={(e) => setDCat(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="dn" checked={dNote} onCheckedChange={(c) => setDNote(Boolean(c))} />
              <Label htmlFor="dn" className="text-xs">
                Requiere nota
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="da" checked={dActive} onCheckedChange={(c) => setDActive(Boolean(c))} />
              <Label htmlFor="da" className="text-xs">
                Activa
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="dconv"
                checked={dConversion}
                onCheckedChange={(c) => setDConversion(Boolean(c))}
              />
              <Label htmlFor="dconv" className="text-xs">
                Cuenta como conversión (venta)
              </Label>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Las disposiciones marcadas como conversión alimentan las métricas de ventas y el
              enrutamiento por prioridad (PRIORITY_BASED).
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDispOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => dispSave.mutate()}
              disabled={!dName.trim() || dispSave.isPending || (editingDisp && !dName.trim())}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={slaOpen} onOpenChange={setSlaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSla ? "Editar política SLA" : "Nueva política SLA"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={sName} onChange={(e) => setSName(e.target.value)} className="h-8 text-sm" disabled={!!editingSla} />
            </div>
            <div>
              <Label className="text-xs">Primera respuesta (segundos)</Label>
              <Input type="number" value={sFirst} onChange={(e) => setSFirst(Number(e.target.value))} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Resolución (segundos)</Label>
              <Input type="number" value={sRes} onChange={(e) => setSRes(Number(e.target.value))} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Umbral alerta (%)</Label>
              <Input type="number" min={1} max={100} value={sWarn} onChange={(e) => setSWarn(Number(e.target.value))} className="h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSlaOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => slaSave.mutate()} disabled={!sName.trim() || slaSave.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingQr ? "Editar respuesta rápida" : "Nueva respuesta rápida"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Shortcode</Label>
              <Input value={qrCode} onChange={(e) => setQrCode(e.target.value)} className="h-8 text-sm font-mono" disabled={!!editingQr} />
            </div>
            <div>
              <Label className="text-xs">Título</Label>
              <Input value={qrTitle} onChange={(e) => setQrTitle(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Contenido</Label>
              <Textarea value={qrContent} onChange={(e) => setQrContent(e.target.value)} className="min-h-[100px] text-sm" />
            </div>
            <div>
              <Label className="text-xs">Canal</Label>
              <Select value={qrChannel} onValueChange={setQrChannel}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Categoría (opcional)</Label>
              <Input value={qrCat} onChange={(e) => setQrCat(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setQrOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => qrSave.mutate()} disabled={!qrCode.trim() || !qrTitle.trim() || !qrContent.trim() || qrSave.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tagOpen} onOpenChange={setTagOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingTag ? "Editar etiqueta" : "Nueva etiqueta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={tagName} onChange={(e) => setTagName(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={tagColor}
                  onChange={(e) => setTagColor(e.target.value)}
                  className="h-8 w-12 rounded border bg-background p-1"
                />
                <Input
                  value={tagColor}
                  onChange={(e) => setTagColor(e.target.value)}
                  className="h-8 text-sm font-mono"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTagOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => tagSave.mutate()} disabled={!tagName.trim() || tagSave.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bhOpen} onOpenChange={setBhOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingBh ? "Editar horario" : "Nuevo horario laboral"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={bhName} onChange={(e) => setBhName(e.target.value)} className="h-8 text-sm" disabled={!!editingBh} />
            </div>
            <div>
              <Label className="text-xs">Zona horaria</Label>
              <Select value={bhTz} onValueChange={setBhTz}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.some((tz) => tz.value === bhTz) ? null : (
                    <SelectItem value={bhTz}>{bhTz}</SelectItem>
                  )}
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <BusinessHoursScheduleEditor value={bhSchedule} onChange={setBhSchedule} />
            <div>
              <Label className="text-xs">Días feriados (uno por línea, formato AAAA-MM-DD)</Label>
              <Textarea
                value={bhHolidays}
                onChange={(e) => setBhHolidays(e.target.value)}
                className="min-h-[72px] text-xs font-mono"
                placeholder={"2026-01-01\n2026-05-01\n2026-12-25"}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                En estas fechas la cola se considera fuera de horario todo el día.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBhOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => bhSave.mutate()} disabled={!bhName.trim() || bhSave.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
