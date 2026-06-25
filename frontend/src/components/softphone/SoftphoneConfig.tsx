import { useState } from "react";
import { useSipStore } from "@/stores/sipStore";
import { checkSoftphoneConfig } from "@/lib/softphoneDiagnostics";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Settings, X, Server, User, Key, Globe, Lock, ChevronDown, Wifi } from "lucide-react";

interface Props {
  onClose: () => void;
  onSave: () => void;
}

export function SoftphoneConfig({ onClose, onSave }: Props) {
  const { config, setConfig } = useSipStore();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const configCheck = checkSoftphoneConfig(config);
  const certUrl = config.server?.trim().startsWith("wss://")
    ? config.server.trim().replace(/^wss:\/\//, "https://")
    : "";

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

      {!configCheck.canRegister && configCheck.issue && (
        <p className="text-[10px] text-destructive leading-snug">{configCheck.issue}</p>
      )}

      <div className="rounded-md border bg-muted/30 px-2.5 py-2 flex items-start gap-1.5">
        <Lock size={11} className="text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[10px] text-muted-foreground leading-snug">
          La central la gestiona el administrador en{" "}
          <span className="text-foreground">Configuración → Telefonía</span>. Tu extensión se
          asigna en <span className="text-foreground">Configuración → Usuarios</span>.
        </p>
      </div>

      <div className="space-y-2.5">
        <div>
          <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <Server size={10} /> Servidor WebSocket (WSS)
          </Label>
          <Input
            value={config.server}
            readOnly
            placeholder="Sin configurar"
            className="h-7 text-xs font-mono bg-muted/50 cursor-default"
          />
          {certUrl && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Si es <code>self-signed</code>, abre{" "}
              <button
                type="button"
                className="underline hover:text-foreground"
                onClick={() => window.open(certUrl, "_blank", "noopener,noreferrer")}
              >
                {certUrl}
              </button>{" "}
              y acepta el certificado; luego vuelve y conecta.
            </p>
          )}
        </div>

        <div>
          <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <Globe size={10} /> Dominio SIP (Realm)
          </Label>
          <Input
            value={config.realm}
            readOnly
            placeholder="Sin configurar"
            className="h-7 text-xs font-mono bg-muted/50 cursor-default"
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <User size={10} /> Extensión
          </Label>
          <Input
            value={config.extension}
            readOnly
            placeholder="Sin asignar"
            className="h-7 text-xs font-mono bg-muted/50 cursor-default"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown
            size={11}
            className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}
          />
          Avanzado
        </button>

        {showAdvanced && (
          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <Key size={10} /> Contraseña SIP
            </Label>
            <Input
              type="password"
              value={config.password}
              onChange={(e) => setConfig({ password: e.target.value })}
              placeholder="••••••"
              className="h-7 text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Normalmente la asigna el administrador. Solo cámbiala si tu central lo requiere.
            </p>
          </div>
        )}
      </div>

      <Button className="w-full h-8 text-xs gap-1.5" onClick={onSave} disabled={!configCheck.canRegister}>
        <Wifi size={12} />
        Conectar
      </Button>

      <p className="text-[10px] text-muted-foreground text-center">
        Compatible con Asterisk (chan_pjsip) y FreeSWITCH (mod_verto / mod_sofia)
      </p>
    </div>
  );
}
