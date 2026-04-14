import { useSipStore } from "@/stores/sipStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Settings, X, Server, User, Key, Globe } from "lucide-react";

interface Props {
  onClose: () => void;
  onSave: () => void;
}

export function SoftphoneConfig({ onClose, onSave }: Props) {
  const { config, setConfig } = useSipStore();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings size={14} className="text-muted-foreground" />
          <span className="text-sm font-medium">Configuración SIP</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X size={12} />
        </Button>
      </div>

      <div className="space-y-2.5">
        <div>
          <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <Server size={10} /> Servidor WebSocket (WSS)
          </Label>
          <Input
            value={config.server}
            onChange={(e) => setConfig({ server: e.target.value })}
            placeholder="wss://pbx.example.com:8089/ws"
            className="h-7 text-xs font-mono"
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <Globe size={10} /> Dominio SIP (Realm)
          </Label>
          <Input
            value={config.realm}
            onChange={(e) => setConfig({ realm: e.target.value })}
            placeholder="pbx.example.com"
            className="h-7 text-xs font-mono"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <User size={10} /> Extensión
            </Label>
            <Input
              value={config.extension}
              onChange={(e) => setConfig({ extension: e.target.value })}
              placeholder="1001"
              className="h-7 text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <Key size={10} /> Contraseña
            </Label>
            <Input
              type="password"
              value={config.password}
              onChange={(e) => setConfig({ password: e.target.value })}
              placeholder="••••••"
              className="h-7 text-xs font-mono"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1">Nombre para mostrar</Label>
          <Input
            value={config.displayName}
            onChange={(e) => setConfig({ displayName: e.target.value })}
            placeholder="Agente Ana García"
            className="h-7 text-xs"
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1">STUN Servers (separados por coma)</Label>
          <Input
            value={config.stunServers.join(", ")}
            onChange={(e) =>
              setConfig({
                stunServers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
            placeholder="stun:stun.l.google.com:19302"
            className="h-7 text-xs font-mono"
          />
        </div>
      </div>

      <Button
        className="w-full h-8 text-xs"
        onClick={onSave}
        disabled={!config.server || !config.extension || !config.realm}
      >
        Guardar y Conectar
      </Button>

      <p className="text-[10px] text-muted-foreground text-center">
        Compatible con Asterisk (chan_pjsip) y FreeSWITCH (mod_verto / mod_sofia)
      </p>
    </div>
  );
}
