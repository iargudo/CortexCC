import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WebChatForm } from "@/lib/webchatChannelConfig";

type Props = {
  form: WebChatForm;
  onChange: (patch: Partial<WebChatForm>) => void;
};

export function WebChatChannelFields({ form, onChange }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        El widget de WebChat vive en AgentHub. CortexCC recibe la conversación al escalar a un
        humano y responde a través de AgentHub usando estos datos.
      </p>
      <div className="space-y-3 rounded-md border bg-muted/40 p-3">
        <Label className="text-xs font-semibold">Integración AgentHub</Label>
        <div>
          <Label className="text-xs">Base URL</Label>
          <Input
            placeholder="https://agenthub.midominio.com"
            value={form.agentHubBaseUrl}
            onChange={(e) => onChange({ agentHubBaseUrl: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">API Prefix (opcional)</Label>
          <Input
            placeholder="/api/v1"
            value={form.agentHubApiPrefix}
            onChange={(e) => onChange({ agentHubApiPrefix: e.target.value })}
            className="h-8 text-sm font-mono"
          />
        </div>
        <div>
          <Label className="text-xs">API Key (AgentHub)</Label>
          <Input
            placeholder="Clave de AgentHub (VALID_API_KEYS)"
            type="password"
            value={form.agentHubApiKey}
            onChange={(e) => onChange({ agentHubApiKey: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
