import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChannelIcon } from "@/components/ChannelIcon";
import type { ChannelType } from "@/data/mock";
import { Plus, Edit2, Settings, Zap, Eye, Copy } from "lucide-react";
import { apiJson, getApiBase } from "@/lib/api";
import { buildWhatsAppWebhookUrl } from "@/lib/webhookUrls";
import { VoiceChannelFields } from "@/components/settings/VoiceChannelFields";
import { WhatsAppChannelFields } from "@/components/settings/WhatsAppChannelFields";
import {
  buildWhatsAppConfig,
  defaultWhatsAppForm,
  parseWhatsAppForm,
  validateWhatsAppForm,
  whatsAppProviderLabel,
  type WhatsAppForm,
} from "@/lib/whatsappChannelConfig";
import {
  buildVoiceConfig,
  defaultVoiceForm,
  parseVoiceForm,
  type AriTestResult,
  type VoiceForm,
} from "@/lib/voiceChannelConfig";
import type { TelephonySettingsView } from "@/lib/telephonySettings";

type ApiChannel = {
  id: string;
  name: string;
  type: ChannelType;
  status: string;
  conversations_today: number;
  whatsapp_provider?: string;
};

const TYPES: ChannelType[] = ["WHATSAPP", "EMAIL", "VOICE", "WEBCHAT", "TEAMS"];
type EmailForm = {
  smtpHost: string;
  smtpPort: string;
  smtpSecure: "true" | "false";
  smtpUser: string;
  smtpPass: string;
  fromEmail: string;
  fromName: string;
  imapHost: string;
  imapPort: string;
  imapSecure: "true" | "false";
  imapUser: string;
  imapPass: string;
  imapMailbox: string;
  pollIntervalSec: string;
  subjectFilterMode: "contains" | "equals" | "regex";
  subjectFilterValue: string;
};
const defaultEmailForm = (): EmailForm => ({
  smtpHost: "",
  smtpPort: "587",
  smtpSecure: "false",
  smtpUser: "",
  smtpPass: "",
  fromEmail: "",
  fromName: "",
  imapHost: "",
  imapPort: "993",
  imapSecure: "true",
  imapUser: "",
  imapPass: "",
  imapMailbox: "INBOX",
  pollIntervalSec: "30",
  subjectFilterMode: "contains",
  subjectFilterValue: "",
});

function parseEmailForm(config: unknown): EmailForm {
  const form = defaultEmailForm();
  const c = (config ?? {}) as Record<string, unknown>;
  form.smtpHost = String(c.smtpHost ?? "");
  form.smtpPort = String(c.smtpPort ?? "587");
  form.smtpSecure = String(c.smtpSecure ?? "false") === "true" ? "true" : "false";
  form.smtpUser = String(c.smtpUser ?? "");
  form.smtpPass = String(c.smtpPass ?? "");
  form.fromEmail = String(c.fromEmail ?? "");
  form.fromName = String(c.fromName ?? "");
  form.imapHost = String(c.imapHost ?? "");
  form.imapPort = String(c.imapPort ?? "993");
  form.imapSecure = String(c.imapSecure ?? "true") === "false" ? "false" : "true";
  form.imapUser = String(c.imapUser ?? "");
  form.imapPass = String(c.imapPass ?? "");
  form.imapMailbox = String(c.imapMailbox ?? "INBOX");
  form.pollIntervalSec = String(c.pollIntervalSec ?? "30");
  const mode = String(c.subjectFilterMode ?? "contains");
  form.subjectFilterMode = mode === "equals" || mode === "regex" ? mode : "contains";
  form.subjectFilterValue = String(c.subjectFilterValue ?? "");
  return form;
}

function buildEmailConfig(form: EmailForm): object {
  return {
    provider: "smtp_imap",
    smtpHost: form.smtpHost.trim(),
    smtpPort: Number(form.smtpPort || "587"),
    smtpSecure: form.smtpSecure === "true",
    smtpUser: form.smtpUser.trim(),
    smtpPass: form.smtpPass,
    fromEmail: form.fromEmail.trim() || undefined,
    fromName: form.fromName.trim() || undefined,
    imapHost: form.imapHost.trim(),
    imapPort: Number(form.imapPort || "993"),
    imapSecure: form.imapSecure === "true",
    imapUser: form.imapUser.trim(),
    imapPass: form.imapPass,
    imapMailbox: form.imapMailbox.trim() || "INBOX",
    pollIntervalSec: Number(form.pollIntervalSec || "30"),
    subjectFilterMode: form.subjectFilterValue.trim() ? form.subjectFilterMode : undefined,
    subjectFilterValue: form.subjectFilterValue.trim() || undefined,
  };
}

function channelConfigLabel(type: ChannelType): string {
  if (type === "WHATSAPP") return "Configuración WhatsApp";
  if (type === "VOICE") return "Configuración de voz";
  if (type === "EMAIL") return "Configuración de email";
  return "Config (JSON)";
}

function channelDialogClassName(type: ChannelType): string {
  if (type === "VOICE") return "sm:max-w-2xl max-h-[90vh] overflow-y-auto";
  if (type === "WHATSAPP") return "sm:max-w-lg max-h-[90vh] overflow-y-auto";
  return "sm:max-w-md";
}

function EmailChannelFields({
  form,
  onChange,
}: {
  form: EmailForm;
  onChange: (patch: Partial<EmailForm>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <Label className="text-xs font-semibold md:col-span-2">SMTP (salida)</Label>
      <Input placeholder="smtp.gmail.com" value={form.smtpHost} onChange={(e) => onChange({ smtpHost: e.target.value })} className="h-8 text-sm" />
      <Input placeholder="587" value={form.smtpPort} onChange={(e) => onChange({ smtpPort: e.target.value })} className="h-8 text-sm" />
      <Select value={form.smtpSecure} onValueChange={(v) => onChange({ smtpSecure: v as "true" | "false" })}>
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="SMTP Secure" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="false">STARTTLS (false)</SelectItem>
          <SelectItem value="true">SSL/TLS (true)</SelectItem>
        </SelectContent>
      </Select>
      <Input placeholder="usuario SMTP" value={form.smtpUser} onChange={(e) => onChange({ smtpUser: e.target.value })} className="h-8 text-sm" />
      <Input placeholder="password SMTP" value={form.smtpPass} onChange={(e) => onChange({ smtpPass: e.target.value })} className="h-8 text-sm" type="password" />
      <Input placeholder="from@dominio.com (opcional)" value={form.fromEmail} onChange={(e) => onChange({ fromEmail: e.target.value })} className="h-8 text-sm" />
      <Input placeholder="Nombre remitente (opcional)" value={form.fromName} onChange={(e) => onChange({ fromName: e.target.value })} className="h-8 text-sm" />
      <Label className="text-xs font-semibold pt-2 md:col-span-2">IMAP (entrada)</Label>
      <Input placeholder="imap.gmail.com" value={form.imapHost} onChange={(e) => onChange({ imapHost: e.target.value })} className="h-8 text-sm" />
      <Input placeholder="993" value={form.imapPort} onChange={(e) => onChange({ imapPort: e.target.value })} className="h-8 text-sm" />
      <Select value={form.imapSecure} onValueChange={(v) => onChange({ imapSecure: v as "true" | "false" })}>
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="IMAP Secure" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="true">SSL/TLS (true)</SelectItem>
          <SelectItem value="false">Plain/STARTTLS (false)</SelectItem>
        </SelectContent>
      </Select>
      <Input placeholder="usuario IMAP" value={form.imapUser} onChange={(e) => onChange({ imapUser: e.target.value })} className="h-8 text-sm" />
      <Input placeholder="password IMAP" value={form.imapPass} onChange={(e) => onChange({ imapPass: e.target.value })} className="h-8 text-sm" type="password" />
      <Input placeholder="INBOX" value={form.imapMailbox} onChange={(e) => onChange({ imapMailbox: e.target.value })} className="h-8 text-sm" />
      <Input
        placeholder="Intervalo polling (segundos)"
        value={form.pollIntervalSec}
        onChange={(e) => onChange({ pollIntervalSec: e.target.value })}
        className="h-8 text-sm md:col-span-2"
      />
      <Label className="text-xs font-semibold pt-2 md:col-span-2">Filtro de Subject (opcional)</Label>
      <Select
        value={form.subjectFilterMode}
        onValueChange={(v) => onChange({ subjectFilterMode: v as "contains" | "equals" | "regex" })}
      >
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Modo filtro subject" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="contains">Contiene</SelectItem>
          <SelectItem value="equals">Igual a</SelectItem>
          <SelectItem value="regex">Regex</SelectItem>
        </SelectContent>
      </Select>
      <Input
        placeholder='Ej: "Ticket #" o "^INC-[0-9]+$"'
        value={form.subjectFilterValue}
        onChange={(e) => onChange({ subjectFilterValue: e.target.value })}
        className="h-8 text-sm md:col-span-2"
      />
    </div>
  );
}

function ChannelConfigSection({
  channelType,
  channelId,
  waForm,
  onWaFormChange,
  emailForm,
  onEmailFormChange,
  voiceForm,
  onVoiceFormChange,
  cConfig,
  onCConfigChange,
  onTestAri,
  ariTestPending,
  ariTestResult,
  derivedAriBaseUrl,
}: {
  channelType: ChannelType;
  channelId?: string;
  waForm: WhatsAppForm;
  onWaFormChange: (patch: Partial<WhatsAppForm> | ((prev: WhatsAppForm) => WhatsAppForm)) => void;
  emailForm: EmailForm;
  onEmailFormChange: (patch: Partial<EmailForm>) => void;
  voiceForm: VoiceForm;
  onVoiceFormChange: (patch: Partial<VoiceForm>) => void;
  cConfig: string;
  onCConfigChange: (value: string) => void;
  onTestAri?: () => void;
  ariTestPending?: boolean;
  ariTestResult?: AriTestResult | null;
  derivedAriBaseUrl?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{channelConfigLabel(channelType)}</Label>
      {channelType === "WHATSAPP" ? (
        <WhatsAppChannelFields form={waForm} onChange={onWaFormChange} channelId={channelId} />
      ) : channelType === "EMAIL" ? (
        <EmailChannelFields form={emailForm} onChange={onEmailFormChange} />
      ) : channelType === "VOICE" ? (
        <VoiceChannelFields
          form={voiceForm}
          onChange={onVoiceFormChange}
          onTestAri={onTestAri}
          ariTestPending={ariTestPending}
          ariTestResult={ariTestResult}
          derivedAriBaseUrl={derivedAriBaseUrl}
        />
      ) : (
        <Textarea
          value={cConfig}
          onChange={(e) => onCConfigChange(e.target.value)}
          className="min-h-[120px] text-xs font-mono"
        />
      )}
    </div>
  );
}

export default function SettingsChannelsPage() {
  const qc = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ApiChannel | null>(null);
  const [cName, setCName] = useState("");
  const [cType, setCType] = useState<ChannelType>("WEBCHAT");
  const [cStatus, setCStatus] = useState("active");
  const [cConfig, setCConfig] = useState("{}\n");
  const [waForm, setWaForm] = useState<WhatsAppForm>(defaultWhatsAppForm());
  const [emailForm, setEmailForm] = useState<EmailForm>(defaultEmailForm());
  const [voiceForm, setVoiceForm] = useState<VoiceForm>(defaultVoiceForm());
  const [ariTestResult, setAriTestResult] = useState<AriTestResult | null>(null);

  const { data: channels = [], isLoading, error } = useQuery({
    queryKey: ["settings", "channels"],
    queryFn: () => apiJson<ApiChannel[]>("/settings/channels"),
  });

  const { data: telephony } = useQuery({
    queryKey: ["settings", "telephony"],
    queryFn: () => apiJson<TelephonySettingsView>("/settings/telephony"),
  });

  const derivedAriBaseUrl = telephony?.derived.ariBaseUrl || undefined;

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["settings", "channels"] });

  const testMut = useMutation({
    mutationFn: (id: string) =>
      apiJson<{ ok: boolean; detail?: string; warnings?: string[] }>(`/settings/channels/${id}/test`, { method: "POST" }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(r.detail ?? "Canal OK");
        r.warnings?.forEach((warning) => toast.warning(warning));
      } else {
        toast.error(r.detail ?? "Revisar canal");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testVoiceAriMut = useMutation({
    mutationFn: () => {
      const ariUrl = derivedAriBaseUrl ?? voiceForm.ariBaseUrl;
      return apiJson<AriTestResult>("/settings/channels/voice/test", {
        method: "POST",
        body: JSON.stringify({
          config: buildVoiceConfig({ ...voiceForm, ariBaseUrl: ariUrl }),
        }),
      });
    },
    onSuccess: (r) => {
      setAriTestResult(r);
      if (r.ok) {
        toast.success(r.detail ?? "Conexión ARI correcta");
        r.warnings?.forEach((warning) => toast.warning(warning));
      } else {
        toast.error(r.detail ?? "Error de conexión ARI");
      }
    },
    onError: (e: Error) => {
      setAriTestResult({ ok: false, detail: e.message });
      toast.error(e.message);
    },
  });

  const runVoiceAriTest = () => {
    const ariUrl = derivedAriBaseUrl ?? voiceForm.ariBaseUrl;
    if (!ariUrl.trim() || !voiceForm.ariUsername.trim() || !voiceForm.ariPassword.trim()) {
      toast.error("Completa URL ARI (o host PBX en Telefonía), usuario y contraseña antes de probar");
      return;
    }
    setAriTestResult(null);
    testVoiceAriMut.mutate();
  };

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      let config: object;
      if (editing.type === "WHATSAPP") {
        const waError = validateWhatsAppForm(waForm);
        if (waError) throw new Error(waError);
        config = buildWhatsAppConfig(waForm);
      } else if (editing.type === "EMAIL") {
        config = buildEmailConfig(emailForm);
      } else if (editing.type === "VOICE") {
        const ariUrl = derivedAriBaseUrl ?? voiceForm.ariBaseUrl;
        config = buildVoiceConfig({ ...voiceForm, ariBaseUrl: ariUrl });
      } else {
        try {
          config = JSON.parse(cConfig || "{}") as object;
        } catch {
          throw new Error("Config JSON inválido");
        }
      }
      await apiJson(`/settings/channels/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: cName.trim(), status: cStatus, config }),
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Canal actualizado");
      setEditOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      let config: object;
      if (cType === "WHATSAPP") {
        const waError = validateWhatsAppForm(waForm);
        if (waError) throw new Error(waError);
        config = buildWhatsAppConfig(waForm);
      } else if (cType === "EMAIL") {
        config = buildEmailConfig(emailForm);
      } else if (cType === "VOICE") {
        const ariUrl = derivedAriBaseUrl ?? voiceForm.ariBaseUrl;
        config = buildVoiceConfig({ ...voiceForm, ariBaseUrl: ariUrl });
      } else {
        try {
          config = JSON.parse(cConfig || "{}") as object;
        } catch {
          throw new Error("Config JSON inválido");
        }
      }
      await apiJson("/settings/channels", {
        method: "POST",
        body: JSON.stringify({ name: cName.trim(), type: cType, status: cStatus, config }),
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Canal creado");
      setCreateOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusLabel = (s: string) => {
    if (s === "active") return "Activo";
    if (s === "error") return "Error";
    return "Inactivo";
  };

  const copyChannelId = async (channelId: string) => {
    try {
      await navigator.clipboard.writeText(channelId);
      toast.success("ID copiado");
    } catch {
      toast.error("No se pudo copiar el ID");
    }
  };

  const copyWhatsAppWebhook = async (channelId: string) => {
    const webhookUrl = buildWhatsAppWebhookUrl(channelId);
    if (!webhookUrl) {
      toast.error("No se pudo construir el webhook (tenant no resuelto)");
      return;
    }
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("Webhook copiado");
    } catch {
      toast.error("No se pudo copiar el webhook");
    }
  };

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Canales</h1>
        <Button
          size="sm"
          className="gap-1"
          variant="outline"
          onClick={() => {
            setCName("");
            setCType("WEBCHAT");
            setCStatus("active");
            setCConfig("{}");
            setWaForm(defaultWhatsAppForm());
            setEmailForm(defaultEmailForm());
            setVoiceForm(defaultVoiceForm());
            setCreateOpen(true);
          }}
        >
          <Plus size={14} /> Nuevo canal
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <div className="grid grid-cols-2 gap-4">
        {channels.map((ch) => (
          <Card key={ch.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ChannelIcon channel={ch.type} size={16} />
                  {ch.name}
                </CardTitle>
                <Badge
                  variant={ch.status === "active" ? "default" : ch.status === "error" ? "destructive" : "secondary"}
                  className="text-[10px]"
                >
                  {statusLabel(ch.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Conversaciones hoy:{" "}
                  <span className="font-medium text-foreground">{ch.conversations_today}</span>
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => void copyChannelId(ch.id)}
                  >
                    <Copy size={10} /> Copiar ID
                  </Button>
                  {ch.type === "WHATSAPP" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => void copyWhatsAppWebhook(ch.id)}
                    >
                      Copiar webhook
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={testMut.isPending}
                    onClick={() => testMut.mutate(ch.id)}
                  >
                    <Zap size={10} /> Test
                  </Button>
                  {ch.type === "WEBCHAT" && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setPreviewOpen(true)}>
                      <Eye size={10} /> Preview
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      void (async () => {
                        setEditing(ch);
                        setAriTestResult(null);
                        setCName(ch.name);
                        setCStatus(ch.status);
                        try {
                          const full = await apiJson<{ config?: unknown }>(`/settings/channels/${ch.id}`);
                          const cfg = full.config ?? {};
                          setCConfig(JSON.stringify(cfg, null, 2));
                          if (ch.type === "WHATSAPP") setWaForm(parseWhatsAppForm(cfg));
                          if (ch.type === "EMAIL") setEmailForm(parseEmailForm(cfg));
                          if (ch.type === "VOICE") setVoiceForm(parseVoiceForm(cfg));
                        } catch {
                          setCConfig("{}");
                          if (ch.type === "WHATSAPP") setWaForm(defaultWhatsAppForm());
                          if (ch.type === "EMAIL") setEmailForm(defaultEmailForm());
                          if (ch.type === "VOICE") setVoiceForm(defaultVoiceForm());
                        }
                        setEditOpen(true);
                      })();
                    }}
                  >
                    <Settings size={10} /> Config
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                ID: <span className="font-mono text-foreground">{ch.id}</span>
                {ch.type === "WHATSAPP" && (
                  <>
                    {" "}
                    · Proveedor: <span className="text-foreground">{whatsAppProviderLabel(ch.whatsapp_provider)}</span>
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview del Widget WebChat</DialogTitle>
          </DialogHeader>
          <div className="relative bg-muted rounded-lg p-8 min-h-[400px]">
            <div className="absolute inset-0 rounded-lg overflow-hidden">
              <div className="bg-background p-4">
                <div className="h-10 bg-muted rounded mb-4 flex items-center px-3">
                  <div className="w-20 h-4 bg-border rounded" />
                  <div className="ml-auto flex gap-2">
                    <div className="w-12 h-4 bg-border rounded" />
                    <div className="w-12 h-4 bg-border rounded" />
                  </div>
                </div>
                <div className="space-y-3 px-8">
                  <div className="h-6 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-32 bg-muted rounded" />
                </div>
              </div>
            </div>
            <div className="absolute bottom-4 right-4 w-80">
              <div className="bg-card border rounded-xl shadow-xl overflow-hidden">
                <div className="bg-primary p-4 text-primary-foreground">
                  <p className="font-bold text-sm">Cortex Contact Center</p>
                  <p className="text-xs opacity-90">¿En qué podemos ayudarte?</p>
                </div>
                <div className="p-3 h-32 bg-background text-xs text-muted-foreground">Vista previa estática</div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setPreviewOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className={editing ? channelDialogClassName(editing.type) : "sm:max-w-md"}>
          <DialogHeader>
            <DialogTitle>Configurar canal</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Tipo: <span className="font-medium text-foreground">{editing.type}</span>
              </p>
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input value={cName} onChange={(e) => setCName(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Estado</Label>
                <Select value={cStatus} onValueChange={setCStatus}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="inactive">Inactivo</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <ChannelConfigSection
                channelType={editing.type}
                channelId={editing.id}
                waForm={waForm}
                onWaFormChange={setWaForm}
                emailForm={emailForm}
                onEmailFormChange={(patch) => setEmailForm((p) => ({ ...p, ...patch }))}
                voiceForm={voiceForm}
                onVoiceFormChange={(patch) => {
                  setVoiceForm((p) => ({ ...p, ...patch }));
                  setAriTestResult(null);
                }}
                cConfig={cConfig}
                onCConfigChange={setCConfig}
                onTestAri={runVoiceAriTest}
                ariTestPending={testVoiceAriMut.isPending}
                ariTestResult={ariTestResult}
                derivedAriBaseUrl={derivedAriBaseUrl}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => updateMut.mutate()} disabled={!cName.trim() || updateMut.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className={channelDialogClassName(cType)}>
          <DialogHeader>
            <DialogTitle>Nuevo canal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={cName} onChange={(e) => setCName(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={cType}
                onValueChange={(v) => {
                  const nextType = v as ChannelType;
                  setCType(nextType);
                  if (nextType === "WHATSAPP") setWaForm(defaultWhatsAppForm());
                  if (nextType === "EMAIL") setEmailForm(defaultEmailForm());
                  if (nextType === "VOICE") {
                    setVoiceForm(defaultVoiceForm());
                    setAriTestResult(null);
                  }
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={cStatus} onValueChange={setCStatus}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ChannelConfigSection
              channelType={cType}
              waForm={waForm}
              onWaFormChange={setWaForm}
              emailForm={emailForm}
              onEmailFormChange={(patch) => setEmailForm((p) => ({ ...p, ...patch }))}
              voiceForm={voiceForm}
              onVoiceFormChange={(patch) => {
                setVoiceForm((p) => ({ ...p, ...patch }));
                setAriTestResult(null);
              }}
              cConfig={cConfig}
              onCConfigChange={setCConfig}
              onTestAri={runVoiceAriTest}
              ariTestPending={testVoiceAriMut.isPending}
              ariTestResult={ariTestResult}
              derivedAriBaseUrl={derivedAriBaseUrl}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createMut.mutate()} disabled={!cName.trim() || createMut.isPending}>
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
