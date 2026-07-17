import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildWhatsAppWebhookUrl } from "@/lib/webhookUrls";
import {
  WHATSAPP_PROVIDER_OPTIONS,
  type WhatsAppForm,
  type WhatsAppMode,
  type WhatsAppProvider,
} from "@/lib/whatsappChannelConfig";
import { Copy } from "lucide-react";
import { toast } from "sonner";

type Props = {
  form: WhatsAppForm;
  onChange: (patch: Partial<WhatsAppForm> | ((prev: WhatsAppForm) => WhatsAppForm)) => void;
  channelId?: string;
};

const WEBHOOK_HINTS: Record<WhatsAppProvider, string> = {
  ultramsg:
    "En UltraMsg → Instance settings, configura la URL de webhook para mensajes entrantes (message received).",
  twilio:
    "En Twilio Console → Messaging → WhatsApp senders, configura el webhook entrante (POST) con esta URL.",
  "360dialog":
    "En 360dialog Hub → Webhook, registra esta URL para recibir eventos de mensajes (formato Cloud API).",
};

export function WhatsAppChannelFields({ form, onChange, channelId }: Props) {
  const setPatch = (patch: Partial<WhatsAppForm>) => onChange((prev) => ({ ...prev, ...patch }));
  const selectedProvider = WHATSAPP_PROVIDER_OPTIONS.find((p) => p.value === form.provider);
  const webhookUrl = channelId ? buildWhatsAppWebhookUrl(channelId) : null;

  const copyWebhook = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("Webhook copiado");
    } catch {
      toast.error("No se pudo copiar el webhook");
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Modo de conexión</Label>
        <Select value={form.mode} onValueChange={(v) => setPatch({ mode: v as WhatsAppMode })}>
          <SelectTrigger className="h-8 text-sm mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="direct">Directo (proveedor)</SelectItem>
            <SelectItem value="agenthub">Vía AgentHub (handoff)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          {form.mode === "agenthub"
            ? "El número lo gestiona AgentHub (el bot responde allí). CortexCC solo recibe y responde al escalar a un humano; no se guardan credenciales del proveedor."
            : "CortexCC es dueño del número y habla directo con el proveedor de WhatsApp."}
        </p>
      </div>

      {form.mode === "agenthub" && (
        <div className="space-y-3 rounded-md border bg-muted/40 p-3">
          <Label className="text-xs font-semibold">Integración AgentHub</Label>
          <div>
            <Label className="text-xs">Base URL</Label>
            <Input
              placeholder="https://agenthub.midominio.com"
              value={form.agentHubBaseUrl}
              onChange={(e) => setPatch({ agentHubBaseUrl: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">API Prefix (opcional)</Label>
            <Input
              placeholder="/api/v1"
              value={form.agentHubApiPrefix}
              onChange={(e) => setPatch({ agentHubApiPrefix: e.target.value })}
              className="h-8 text-sm font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">API Key (AgentHub)</Label>
            <Input
              placeholder="Clave de AgentHub (VALID_API_KEYS)"
              type="password"
              value={form.agentHubApiKey}
              onChange={(e) => setPatch({ agentHubApiKey: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}

      {form.mode === "direct" && (
      <div>
        <Label className="text-xs">Proveedor WhatsApp</Label>
        <Select value={form.provider} onValueChange={(v) => setPatch({ provider: v as WhatsAppProvider })}>
          <SelectTrigger className="h-8 text-sm mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WHATSAPP_PROVIDER_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedProvider && (
          <p className="text-[11px] text-muted-foreground mt-1.5">{selectedProvider.description}</p>
        )}
      </div>
      )}

      {form.mode === "direct" && form.provider === "ultramsg" && (
        <>
          <div>
            <Label className="text-xs">Instance ID</Label>
            <Input
              placeholder="instance12345"
              value={form.ultraInstanceId}
              onChange={(e) => setPatch({ ultraInstanceId: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Token</Label>
            <Input
              placeholder="Token de la instancia"
              type="password"
              value={form.ultraToken}
              onChange={(e) => setPatch({ ultraToken: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Base URL (opcional)</Label>
            <Input
              placeholder="https://api.ultramsg.com"
              value={form.ultraBaseUrl}
              onChange={(e) => setPatch({ ultraBaseUrl: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
        </>
      )}

      {form.mode === "direct" && form.provider === "twilio" && (
        <>
          <div>
            <Label className="text-xs">Account SID</Label>
            <Input
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={form.twilioAccountSid}
              onChange={(e) => setPatch({ twilioAccountSid: e.target.value })}
              className="h-8 text-sm font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Auth Token</Label>
            <Input
              placeholder="Token de autenticación"
              type="password"
              value={form.twilioAuthToken}
              onChange={(e) => setPatch({ twilioAuthToken: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">From (número remitente)</Label>
            <Input
              placeholder="whatsapp:+14155238886"
              value={form.twilioFrom}
              onChange={(e) => setPatch({ twilioFrom: e.target.value })}
              className="h-8 text-sm font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Formato requerido por Twilio: <code className="text-[10px]">whatsapp:+&lt;E164&gt;</code>
            </p>
          </div>
          <div>
            <Label className="text-xs">API Base URL (opcional)</Label>
            <Input
              placeholder="https://api.twilio.com"
              value={form.twilioApiBaseUrl}
              onChange={(e) => setPatch({ twilioApiBaseUrl: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
        </>
      )}

      {form.mode === "direct" && form.provider === "360dialog" && (
        <>
          <div>
            <Label className="text-xs">API Key (D360-API-KEY)</Label>
            <Input
              placeholder="Clave API de 360dialog"
              type="password"
              value={form.dialogApiKey}
              onChange={(e) => setPatch({ dialogApiKey: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Phone Number ID (opcional)</Label>
            <Input
              placeholder="ID del número WABA"
              value={form.dialogPhoneNumberId}
              onChange={(e) => setPatch({ dialogPhoneNumberId: e.target.value })}
              className="h-8 text-sm font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Base URL (opcional)</Label>
            <Input
              placeholder="https://waba-v2.360dialog.io"
              value={form.dialogBaseUrl}
              onChange={(e) => setPatch({ dialogBaseUrl: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
        </>
      )}

      {form.mode === "direct" && webhookUrl && (
        <div className="rounded-md border bg-muted/40 p-3 space-y-2">
          <Label className="text-xs">URL de webhook (mensajes entrantes)</Label>
          <div className="flex items-center gap-2">
            <Input readOnly value={webhookUrl} className="h-8 text-xs font-mono" />
            <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => void copyWebhook()}>
              <Copy size={12} />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">{WEBHOOK_HINTS[form.provider]}</p>
        </div>
      )}
    </div>
  );
}
