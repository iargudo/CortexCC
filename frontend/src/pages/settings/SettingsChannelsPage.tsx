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

type ApiChannel = {
  id: string;
  name: string;
  type: ChannelType;
  status: string;
  conversations_today: number;
};

const TYPES: ChannelType[] = ["WHATSAPP", "EMAIL", "VOICE", "WEBCHAT", "TEAMS"];
type WhatsAppProvider = "ultramsg" | "twilio" | "360dialog";
type WhatsAppForm = {
  provider: WhatsAppProvider;
  ultraInstanceId: string;
  ultraToken: string;
  ultraBaseUrl: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFrom: string;
  twilioApiBaseUrl: string;
  dialogApiKey: string;
  dialogPhoneNumberId: string;
  dialogBaseUrl: string;
};
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
type VoiceForm = {
  ariBaseUrl: string;
  ariApp: string;
  ariUsername: string;
  ariPassword: string;
  extensionField: string;
  callerIdField: string;
  dialedNumberField: string;
  pollFallbackSec: string;
};

const defaultWhatsAppForm = (): WhatsAppForm => ({
  provider: "ultramsg",
  ultraInstanceId: "",
  ultraToken: "",
  ultraBaseUrl: "https://api.ultramsg.com",
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioFrom: "",
  twilioApiBaseUrl: "https://api.twilio.com",
  dialogApiKey: "",
  dialogPhoneNumberId: "",
  dialogBaseUrl: "https://waba-v2.360dialog.io",
});

function parseWhatsAppForm(config: unknown): WhatsAppForm {
  const form = defaultWhatsAppForm();
  const c = (config ?? {}) as Record<string, unknown>;
  const provider = String(c.provider ?? "ultramsg") as WhatsAppProvider;
  form.provider = provider === "twilio" || provider === "360dialog" ? provider : "ultramsg";
  form.ultraInstanceId = String(c.instanceId ?? "");
  form.ultraToken = String(c.token ?? "");
  form.ultraBaseUrl = String(c.baseUrl ?? form.ultraBaseUrl);
  form.twilioAccountSid = String(c.accountSid ?? "");
  form.twilioAuthToken = String(c.authToken ?? "");
  form.twilioFrom = String(c.from ?? "");
  form.twilioApiBaseUrl = String(c.apiBaseUrl ?? form.twilioApiBaseUrl);
  form.dialogApiKey = String(c.apiKey ?? "");
  form.dialogPhoneNumberId = String(c.phoneNumberId ?? "");
  form.dialogBaseUrl = String(c.baseUrl ?? form.dialogBaseUrl);
  return form;
}

function buildWhatsAppConfig(form: WhatsAppForm): object {
  if (form.provider === "ultramsg") {
    return {
      provider: "ultramsg",
      instanceId: form.ultraInstanceId.trim(),
      token: form.ultraToken.trim(),
      baseUrl: form.ultraBaseUrl.trim() || "https://api.ultramsg.com",
    };
  }
  if (form.provider === "twilio") {
    return {
      provider: "twilio",
      accountSid: form.twilioAccountSid.trim(),
      authToken: form.twilioAuthToken.trim(),
      from: form.twilioFrom.trim(),
      apiBaseUrl: form.twilioApiBaseUrl.trim() || "https://api.twilio.com",
    };
  }
  return {
    provider: "360dialog",
    apiKey: form.dialogApiKey.trim(),
    phoneNumberId: form.dialogPhoneNumberId.trim() || undefined,
    baseUrl: form.dialogBaseUrl.trim() || "https://waba-v2.360dialog.io",
  };
}

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

const defaultVoiceForm = (): VoiceForm => ({
  ariBaseUrl: "http://localhost:8088",
  ariApp: "cortexcc",
  ariUsername: "",
  ariPassword: "",
  extensionField: "endpoint",
  callerIdField: "caller.number",
  dialedNumberField: "dialplan.exten",
  pollFallbackSec: "15",
});

function parseVoiceForm(config: unknown): VoiceForm {
  const form = defaultVoiceForm();
  const c = (config ?? {}) as Record<string, unknown>;
  form.ariBaseUrl = String(c.ariBaseUrl ?? form.ariBaseUrl);
  form.ariApp = String(c.ariApp ?? form.ariApp);
  form.ariUsername = String(c.ariUsername ?? "");
  form.ariPassword = String(c.ariPassword ?? "");
  form.extensionField = String(c.extensionField ?? form.extensionField);
  form.callerIdField = String(c.callerIdField ?? form.callerIdField);
  form.dialedNumberField = String(c.dialedNumberField ?? form.dialedNumberField);
  form.pollFallbackSec = String(c.pollFallbackSec ?? form.pollFallbackSec);
  return form;
}

function buildVoiceConfig(form: VoiceForm): object {
  return {
    provider: "asterisk_ari",
    ariBaseUrl: form.ariBaseUrl.trim(),
    ariApp: form.ariApp.trim(),
    ariUsername: form.ariUsername.trim(),
    ariPassword: form.ariPassword,
    extensionField: form.extensionField.trim() || "endpoint",
    callerIdField: form.callerIdField.trim() || "caller.number",
    dialedNumberField: form.dialedNumberField.trim() || "dialplan.exten",
    pollFallbackSec: Number(form.pollFallbackSec || "15"),
  };
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

  const { data: channels = [], isLoading, error } = useQuery({
    queryKey: ["settings", "channels"],
    queryFn: () => apiJson<ApiChannel[]>("/settings/channels"),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["settings", "channels"] });

  const testMut = useMutation({
    mutationFn: (id: string) => apiJson<{ ok: boolean; detail?: string }>(`/settings/channels/${id}/test`, { method: "POST" }),
    onSuccess: (r) => {
      toast.success(r.ok ? "Canal OK" : "Revisar canal");
      if (r.detail) toast.message(r.detail);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      let config: object;
      if (editing.type === "WHATSAPP") {
        config = buildWhatsAppConfig(waForm);
      } else if (editing.type === "EMAIL") {
        config = buildEmailConfig(emailForm);
      } else if (editing.type === "VOICE") {
        config = buildVoiceConfig(voiceForm);
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
        config = buildWhatsAppConfig(waForm);
      } else if (cType === "EMAIL") {
        config = buildEmailConfig(emailForm);
      } else if (cType === "VOICE") {
        config = buildVoiceConfig(voiceForm);
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
    const webhookUrl = `${getApiBase()}/webhooks/whatsapp/${channelId}`;
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
        <DialogContent className="sm:max-w-md">
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
              <div>
                <Label className="text-xs">Config (JSON)</Label>
                {editing.type === "WHATSAPP" ? (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Proveedor</Label>
                      <Select
                        value={waForm.provider}
                        onValueChange={(v) =>
                          setWaForm((prev) => ({
                            ...prev,
                            provider: v as WhatsAppProvider,
                          }))
                        }
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ultramsg">UltraMsg</SelectItem>
                          <SelectItem value="twilio">Twilio</SelectItem>
                          <SelectItem value="360dialog">360Dialog</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {waForm.provider === "ultramsg" && (
                      <>
                        <div>
                          <Label className="text-xs">Instance ID</Label>
                          <Input
                            value={waForm.ultraInstanceId}
                            onChange={(e) => setWaForm((prev) => ({ ...prev, ultraInstanceId: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Token</Label>
                          <Input
                            value={waForm.ultraToken}
                            onChange={(e) => setWaForm((prev) => ({ ...prev, ultraToken: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Base URL</Label>
                          <Input
                            value={waForm.ultraBaseUrl}
                            onChange={(e) => setWaForm((prev) => ({ ...prev, ultraBaseUrl: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                      </>
                    )}

                    {waForm.provider === "twilio" && (
                      <>
                        <div>
                          <Label className="text-xs">Account SID</Label>
                          <Input
                            value={waForm.twilioAccountSid}
                            onChange={(e) => setWaForm((prev) => ({ ...prev, twilioAccountSid: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Auth Token</Label>
                          <Input
                            value={waForm.twilioAuthToken}
                            onChange={(e) => setWaForm((prev) => ({ ...prev, twilioAuthToken: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">From (whatsapp:+...)</Label>
                          <Input
                            value={waForm.twilioFrom}
                            onChange={(e) => setWaForm((prev) => ({ ...prev, twilioFrom: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">API Base URL</Label>
                          <Input
                            value={waForm.twilioApiBaseUrl}
                            onChange={(e) => setWaForm((prev) => ({ ...prev, twilioApiBaseUrl: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                      </>
                    )}

                    {waForm.provider === "360dialog" && (
                      <>
                        <div>
                          <Label className="text-xs">API Key</Label>
                          <Input
                            value={waForm.dialogApiKey}
                            onChange={(e) => setWaForm((prev) => ({ ...prev, dialogApiKey: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Phone Number ID (opcional)</Label>
                          <Input
                            value={waForm.dialogPhoneNumberId}
                            onChange={(e) => setWaForm((prev) => ({ ...prev, dialogPhoneNumberId: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Base URL</Label>
                          <Input
                            value={waForm.dialogBaseUrl}
                            onChange={(e) => setWaForm((prev) => ({ ...prev, dialogBaseUrl: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {editing.type === "EMAIL" ? (
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <Label className="text-xs font-semibold md:col-span-2">SMTP (salida)</Label>
                        <Input placeholder="smtp.gmail.com" value={emailForm.smtpHost} onChange={(e) => setEmailForm((p) => ({ ...p, smtpHost: e.target.value }))} className="h-8 text-sm" />
                        <Input placeholder="587" value={emailForm.smtpPort} onChange={(e) => setEmailForm((p) => ({ ...p, smtpPort: e.target.value }))} className="h-8 text-sm" />
                        <Select value={emailForm.smtpSecure} onValueChange={(v) => setEmailForm((p) => ({ ...p, smtpSecure: v as "true" | "false" }))}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="SMTP Secure" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="false">STARTTLS (false)</SelectItem>
                            <SelectItem value="true">SSL/TLS (true)</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input placeholder="usuario SMTP" value={emailForm.smtpUser} onChange={(e) => setEmailForm((p) => ({ ...p, smtpUser: e.target.value }))} className="h-8 text-sm" />
                        <Input placeholder="password SMTP" value={emailForm.smtpPass} onChange={(e) => setEmailForm((p) => ({ ...p, smtpPass: e.target.value }))} className="h-8 text-sm" type="password" />
                        <Input placeholder="from@dominio.com (opcional)" value={emailForm.fromEmail} onChange={(e) => setEmailForm((p) => ({ ...p, fromEmail: e.target.value }))} className="h-8 text-sm" />
                        <Input placeholder="Nombre remitente (opcional)" value={emailForm.fromName} onChange={(e) => setEmailForm((p) => ({ ...p, fromName: e.target.value }))} className="h-8 text-sm" />
                        <Label className="text-xs font-semibold pt-2 md:col-span-2">IMAP (entrada)</Label>
                        <Input placeholder="imap.gmail.com" value={emailForm.imapHost} onChange={(e) => setEmailForm((p) => ({ ...p, imapHost: e.target.value }))} className="h-8 text-sm" />
                        <Input placeholder="993" value={emailForm.imapPort} onChange={(e) => setEmailForm((p) => ({ ...p, imapPort: e.target.value }))} className="h-8 text-sm" />
                        <Select value={emailForm.imapSecure} onValueChange={(v) => setEmailForm((p) => ({ ...p, imapSecure: v as "true" | "false" }))}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="IMAP Secure" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">SSL/TLS (true)</SelectItem>
                            <SelectItem value="false">Plain/STARTTLS (false)</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input placeholder="usuario IMAP" value={emailForm.imapUser} onChange={(e) => setEmailForm((p) => ({ ...p, imapUser: e.target.value }))} className="h-8 text-sm" />
                        <Input placeholder="password IMAP" value={emailForm.imapPass} onChange={(e) => setEmailForm((p) => ({ ...p, imapPass: e.target.value }))} className="h-8 text-sm" type="password" />
                        <Input placeholder="INBOX" value={emailForm.imapMailbox} onChange={(e) => setEmailForm((p) => ({ ...p, imapMailbox: e.target.value }))} className="h-8 text-sm" />
                        <Input
                          placeholder="Intervalo polling (segundos)"
                          value={emailForm.pollIntervalSec}
                          onChange={(e) => setEmailForm((p) => ({ ...p, pollIntervalSec: e.target.value }))}
                          className="h-8 text-sm md:col-span-2"
                        />
                        <Label className="text-xs font-semibold pt-2 md:col-span-2">Filtro de Subject (opcional)</Label>
                        <Select
                          value={emailForm.subjectFilterMode}
                          onValueChange={(v) => setEmailForm((p) => ({ ...p, subjectFilterMode: v as "contains" | "equals" | "regex" }))}
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
                          value={emailForm.subjectFilterValue}
                          onChange={(e) => setEmailForm((p) => ({ ...p, subjectFilterValue: e.target.value }))}
                          className="h-8 text-sm md:col-span-2"
                        />
                      </div>
                    ) : editing.type === "VOICE" ? (
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <Label className="text-xs font-semibold md:col-span-2">Asterisk ARI</Label>
                        <Input
                          placeholder="http://localhost:8088"
                          value={voiceForm.ariBaseUrl}
                          onChange={(e) => setVoiceForm((p) => ({ ...p, ariBaseUrl: e.target.value }))}
                          className="h-8 text-sm md:col-span-2"
                        />
                        <Input
                          placeholder="ARI App (ej: cortexcc)"
                          value={voiceForm.ariApp}
                          onChange={(e) => setVoiceForm((p) => ({ ...p, ariApp: e.target.value }))}
                          className="h-8 text-sm"
                        />
                        <Input
                          placeholder="Usuario ARI"
                          value={voiceForm.ariUsername}
                          onChange={(e) => setVoiceForm((p) => ({ ...p, ariUsername: e.target.value }))}
                          className="h-8 text-sm"
                        />
                        <Input
                          placeholder="Password ARI"
                          type="password"
                          value={voiceForm.ariPassword}
                          onChange={(e) => setVoiceForm((p) => ({ ...p, ariPassword: e.target.value }))}
                          className="h-8 text-sm md:col-span-2"
                        />
                        <Label className="text-xs font-semibold pt-2 md:col-span-2">Mapeo de evento</Label>
                        <Input
                          placeholder="caller.number"
                          value={voiceForm.callerIdField}
                          onChange={(e) => setVoiceForm((p) => ({ ...p, callerIdField: e.target.value }))}
                          className="h-8 text-sm"
                        />
                        <Input
                          placeholder="dialplan.exten"
                          value={voiceForm.dialedNumberField}
                          onChange={(e) => setVoiceForm((p) => ({ ...p, dialedNumberField: e.target.value }))}
                          className="h-8 text-sm"
                        />
                        <Input
                          placeholder="endpoint"
                          value={voiceForm.extensionField}
                          onChange={(e) => setVoiceForm((p) => ({ ...p, extensionField: e.target.value }))}
                          className="h-8 text-sm"
                        />
                        <Input
                          placeholder="Reintento WS (segundos)"
                          value={voiceForm.pollFallbackSec}
                          onChange={(e) => setVoiceForm((p) => ({ ...p, pollFallbackSec: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                    ) : (
                      <Textarea value={cConfig} onChange={(e) => setCConfig(e.target.value)} className="min-h-[120px] text-xs font-mono" />
                    )}
                  </>
                )}
              </div>
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
        <DialogContent className="sm:max-w-md">
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
                  if (nextType === "VOICE") setVoiceForm(defaultVoiceForm());
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
            <div>
              <Label className="text-xs">Config (JSON)</Label>
              {cType === "WHATSAPP" ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Proveedor</Label>
                    <Select
                      value={waForm.provider}
                      onValueChange={(v) =>
                        setWaForm((prev) => ({
                          ...prev,
                          provider: v as WhatsAppProvider,
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ultramsg">UltraMsg</SelectItem>
                        <SelectItem value="twilio">Twilio</SelectItem>
                        <SelectItem value="360dialog">360Dialog</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {waForm.provider === "ultramsg" && (
                    <>
                      <div>
                        <Label className="text-xs">Instance ID</Label>
                        <Input
                          value={waForm.ultraInstanceId}
                          onChange={(e) => setWaForm((prev) => ({ ...prev, ultraInstanceId: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Token</Label>
                        <Input
                          value={waForm.ultraToken}
                          onChange={(e) => setWaForm((prev) => ({ ...prev, ultraToken: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Base URL</Label>
                        <Input
                          value={waForm.ultraBaseUrl}
                          onChange={(e) => setWaForm((prev) => ({ ...prev, ultraBaseUrl: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                    </>
                  )}

                  {waForm.provider === "twilio" && (
                    <>
                      <div>
                        <Label className="text-xs">Account SID</Label>
                        <Input
                          value={waForm.twilioAccountSid}
                          onChange={(e) => setWaForm((prev) => ({ ...prev, twilioAccountSid: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Auth Token</Label>
                        <Input
                          value={waForm.twilioAuthToken}
                          onChange={(e) => setWaForm((prev) => ({ ...prev, twilioAuthToken: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">From (whatsapp:+...)</Label>
                        <Input
                          value={waForm.twilioFrom}
                          onChange={(e) => setWaForm((prev) => ({ ...prev, twilioFrom: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">API Base URL</Label>
                        <Input
                          value={waForm.twilioApiBaseUrl}
                          onChange={(e) => setWaForm((prev) => ({ ...prev, twilioApiBaseUrl: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                    </>
                  )}

                  {waForm.provider === "360dialog" && (
                    <>
                      <div>
                        <Label className="text-xs">API Key</Label>
                        <Input
                          value={waForm.dialogApiKey}
                          onChange={(e) => setWaForm((prev) => ({ ...prev, dialogApiKey: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Phone Number ID (opcional)</Label>
                        <Input
                          value={waForm.dialogPhoneNumberId}
                          onChange={(e) => setWaForm((prev) => ({ ...prev, dialogPhoneNumberId: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Base URL</Label>
                        <Input
                          value={waForm.dialogBaseUrl}
                          onChange={(e) => setWaForm((prev) => ({ ...prev, dialogBaseUrl: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  {cType === "EMAIL" ? (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <Label className="text-xs font-semibold md:col-span-2">SMTP (salida)</Label>
                      <Input placeholder="smtp.gmail.com" value={emailForm.smtpHost} onChange={(e) => setEmailForm((p) => ({ ...p, smtpHost: e.target.value }))} className="h-8 text-sm" />
                      <Input placeholder="587" value={emailForm.smtpPort} onChange={(e) => setEmailForm((p) => ({ ...p, smtpPort: e.target.value }))} className="h-8 text-sm" />
                      <Select value={emailForm.smtpSecure} onValueChange={(v) => setEmailForm((p) => ({ ...p, smtpSecure: v as "true" | "false" }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="SMTP Secure" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="false">STARTTLS (false)</SelectItem>
                          <SelectItem value="true">SSL/TLS (true)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input placeholder="usuario SMTP" value={emailForm.smtpUser} onChange={(e) => setEmailForm((p) => ({ ...p, smtpUser: e.target.value }))} className="h-8 text-sm" />
                      <Input placeholder="password SMTP" value={emailForm.smtpPass} onChange={(e) => setEmailForm((p) => ({ ...p, smtpPass: e.target.value }))} className="h-8 text-sm" type="password" />
                      <Input placeholder="from@dominio.com (opcional)" value={emailForm.fromEmail} onChange={(e) => setEmailForm((p) => ({ ...p, fromEmail: e.target.value }))} className="h-8 text-sm" />
                      <Input placeholder="Nombre remitente (opcional)" value={emailForm.fromName} onChange={(e) => setEmailForm((p) => ({ ...p, fromName: e.target.value }))} className="h-8 text-sm" />
                      <Label className="text-xs font-semibold pt-2 md:col-span-2">IMAP (entrada)</Label>
                      <Input placeholder="imap.gmail.com" value={emailForm.imapHost} onChange={(e) => setEmailForm((p) => ({ ...p, imapHost: e.target.value }))} className="h-8 text-sm" />
                      <Input placeholder="993" value={emailForm.imapPort} onChange={(e) => setEmailForm((p) => ({ ...p, imapPort: e.target.value }))} className="h-8 text-sm" />
                      <Select value={emailForm.imapSecure} onValueChange={(v) => setEmailForm((p) => ({ ...p, imapSecure: v as "true" | "false" }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="IMAP Secure" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">SSL/TLS (true)</SelectItem>
                          <SelectItem value="false">Plain/STARTTLS (false)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input placeholder="usuario IMAP" value={emailForm.imapUser} onChange={(e) => setEmailForm((p) => ({ ...p, imapUser: e.target.value }))} className="h-8 text-sm" />
                      <Input placeholder="password IMAP" value={emailForm.imapPass} onChange={(e) => setEmailForm((p) => ({ ...p, imapPass: e.target.value }))} className="h-8 text-sm" type="password" />
                      <Input placeholder="INBOX" value={emailForm.imapMailbox} onChange={(e) => setEmailForm((p) => ({ ...p, imapMailbox: e.target.value }))} className="h-8 text-sm" />
                      <Input
                        placeholder="Intervalo polling (segundos)"
                        value={emailForm.pollIntervalSec}
                        onChange={(e) => setEmailForm((p) => ({ ...p, pollIntervalSec: e.target.value }))}
                        className="h-8 text-sm md:col-span-2"
                      />
                      <Label className="text-xs font-semibold pt-2 md:col-span-2">Filtro de Subject (opcional)</Label>
                      <Select
                        value={emailForm.subjectFilterMode}
                        onValueChange={(v) => setEmailForm((p) => ({ ...p, subjectFilterMode: v as "contains" | "equals" | "regex" }))}
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
                        value={emailForm.subjectFilterValue}
                        onChange={(e) => setEmailForm((p) => ({ ...p, subjectFilterValue: e.target.value }))}
                        className="h-8 text-sm md:col-span-2"
                      />
                    </div>
                  ) : cType === "VOICE" ? (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <Label className="text-xs font-semibold md:col-span-2">Asterisk ARI</Label>
                      <Input
                        placeholder="http://localhost:8088"
                        value={voiceForm.ariBaseUrl}
                        onChange={(e) => setVoiceForm((p) => ({ ...p, ariBaseUrl: e.target.value }))}
                        className="h-8 text-sm md:col-span-2"
                      />
                      <Input
                        placeholder="ARI App (ej: cortexcc)"
                        value={voiceForm.ariApp}
                        onChange={(e) => setVoiceForm((p) => ({ ...p, ariApp: e.target.value }))}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="Usuario ARI"
                        value={voiceForm.ariUsername}
                        onChange={(e) => setVoiceForm((p) => ({ ...p, ariUsername: e.target.value }))}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="Password ARI"
                        type="password"
                        value={voiceForm.ariPassword}
                        onChange={(e) => setVoiceForm((p) => ({ ...p, ariPassword: e.target.value }))}
                        className="h-8 text-sm md:col-span-2"
                      />
                      <Label className="text-xs font-semibold pt-2 md:col-span-2">Mapeo de evento</Label>
                      <Input
                        placeholder="caller.number"
                        value={voiceForm.callerIdField}
                        onChange={(e) => setVoiceForm((p) => ({ ...p, callerIdField: e.target.value }))}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="dialplan.exten"
                        value={voiceForm.dialedNumberField}
                        onChange={(e) => setVoiceForm((p) => ({ ...p, dialedNumberField: e.target.value }))}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="endpoint"
                        value={voiceForm.extensionField}
                        onChange={(e) => setVoiceForm((p) => ({ ...p, extensionField: e.target.value }))}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="Reintento WS (segundos)"
                        value={voiceForm.pollFallbackSec}
                        onChange={(e) => setVoiceForm((p) => ({ ...p, pollFallbackSec: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                  ) : (
                    <Textarea value={cConfig} onChange={(e) => setCConfig(e.target.value)} className="min-h-[100px] text-xs font-mono" />
                  )}
                </>
              )}
            </div>
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
