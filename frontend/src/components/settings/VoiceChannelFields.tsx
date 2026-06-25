import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AriTestResult, VoiceForm } from "@/lib/voiceChannelConfig";
import { Loader2, Lock, Zap } from "lucide-react";

type Props = {
  form: VoiceForm;
  onChange: (patch: Partial<VoiceForm>) => void;
  onTestAri?: () => void;
  ariTestPending?: boolean;
  ariTestResult?: AriTestResult | null;
  /** Si se define, la URL ARI se deriva del host PBX y no es editable aquí. */
  derivedAriBaseUrl?: string;
  /** Si es true, toda la configuración se gobierna desde Telefonía y aquí es de solo lectura. */
  readOnly?: boolean;
};

export function VoiceChannelFields({
  form,
  onChange,
  onTestAri,
  ariTestPending,
  ariTestResult,
  derivedAriBaseUrl,
  readOnly = false,
}: Props) {
  const ro = readOnly;
  const inputCls = (extra = "") => `h-8 text-sm ${extra} ${ro ? "bg-muted/50 cursor-default" : ""}`.trim();

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {ro && (
        <div className="md:col-span-2 rounded-md border bg-muted/40 px-3 py-2 flex items-start gap-2">
          <Lock size={13} className="text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-snug">
            La telefonía está centralizada. Estos parámetros se gestionan en{" "}
            <Link to="/settings/telephony" className="text-foreground underline">
              Configuración → Telefonía
            </Link>
            . Aquí solo puedes activar o desactivar el canal y probar la conexión.
          </p>
        </div>
      )}

      <Label className="text-xs font-semibold md:col-span-2">Asterisk ARI</Label>
      <p className="text-[11px] text-muted-foreground md:col-span-2">
        Debe coincidir con <code className="text-[10px]">ari.conf</code>: usuario, contraseña y nombre de app Stasis.
      </p>
      <div className="md:col-span-2">
        <Label className="text-[11px] text-muted-foreground">URL base ARI</Label>
        {derivedAriBaseUrl ? (
          <>
            <Input value={derivedAriBaseUrl} readOnly className="h-8 text-sm font-mono bg-muted/50" />
            <p className="text-[10px] text-muted-foreground mt-1">
              Derivada del host PBX. Configúrala en{" "}
              <span className="text-foreground">Configuración → Telefonía</span>.
            </p>
          </>
        ) : (
          <Input
            placeholder="http://localhost:8074"
            value={form.ariBaseUrl}
            onChange={(e) => onChange({ ariBaseUrl: e.target.value })}
            readOnly={ro}
            className={inputCls()}
          />
        )}
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground">App Stasis</Label>
        <Input
          placeholder="cortexcc"
          value={form.ariApp}
          onChange={(e) => onChange({ ariApp: e.target.value })}
          readOnly={ro}
          className={inputCls("font-mono")}
        />
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground">Usuario ARI</Label>
        <Input
          placeholder="cortexcc"
          value={form.ariUsername}
          onChange={(e) => onChange({ ariUsername: e.target.value })}
          readOnly={ro}
          className={inputCls("font-mono")}
        />
      </div>
      <div className="md:col-span-2">
        <Label className="text-[11px] text-muted-foreground">Contraseña ARI</Label>
        <Input
          placeholder="Misma que en ari.conf"
          type="password"
          value={form.ariPassword}
          onChange={(e) => onChange({ ariPassword: e.target.value })}
          readOnly={ro}
          className={inputCls()}
        />
      </div>
      {onTestAri && (
        <div className="md:col-span-2 space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={ariTestPending}
            onClick={onTestAri}
          >
            {ariTestPending ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            Probar conexión ARI
          </Button>
          {ariTestResult && (
            <div
              className={`rounded-md border px-3 py-2 text-[11px] ${
                ariTestResult.ok
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                  : "border-destructive/30 bg-destructive/5 text-destructive"
              }`}
            >
              <p>{ariTestResult.detail ?? (ariTestResult.ok ? "Conexión ARI correcta" : "Error de conexión ARI")}</p>
              {ariTestResult.warnings?.map((warning) => (
                <p key={warning} className="mt-1 text-amber-700 dark:text-amber-300">
                  {warning}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <Label className="text-xs font-semibold pt-2 md:col-span-2">Trunk y salientes</Label>
      <p className="text-[11px] text-muted-foreground md:col-span-2">
        El endpoint debe coincidir con el nombre en <code className="text-[10px]">pjsip_trunk.conf</code> (sin el número).
      </p>
      <div className="md:col-span-2">
        <Label className="text-[11px] text-muted-foreground">Endpoint trunk saliente</Label>
        <Input
          placeholder="PJSIP/carrier-trunk"
          value={form.outboundTrunkEndpoint}
          onChange={(e) => onChange({ outboundTrunkEndpoint: e.target.value })}
          readOnly={ro}
          className={inputCls("font-mono")}
        />
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground">Contexto dialplan saliente</Label>
        <Input
          placeholder="outbound-trunk"
          value={form.outboundContext}
          onChange={(e) => onChange({ outboundContext: e.target.value })}
          readOnly={ro}
          className={inputCls("font-mono")}
        />
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground">Caller ID saliente</Label>
        <Input
          placeholder="+34900123456"
          value={form.defaultCallerId}
          onChange={(e) => onChange({ defaultCallerId: e.target.value })}
          readOnly={ro}
          className={inputCls("font-mono")}
        />
      </div>
      <div className="md:col-span-2">
        <Label className="text-[11px] text-muted-foreground">Plantilla endpoint agente</Label>
        <Input
          placeholder="PJSIP/{extension}"
          value={form.agentEndpointTemplate}
          onChange={(e) => onChange({ agentEndpointTemplate: e.target.value })}
          readOnly={ro}
          className={inputCls("font-mono")}
        />
      </div>

      <Label className="text-xs font-semibold pt-2 md:col-span-2">Comportamiento de llamada</Label>
      <div>
        <Label className="text-[11px] text-muted-foreground">Timeout de timbre (seg)</Label>
        <Input
          type="number"
          min={5}
          max={120}
          placeholder="30"
          value={form.ringTimeoutSec}
          onChange={(e) => onChange({ ringTimeoutSec: e.target.value })}
          readOnly={ro}
          className={inputCls()}
        />
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground">Música en espera (MOH)</Label>
        <Input
          placeholder="default"
          value={form.mohClass}
          onChange={(e) => onChange({ mohClass: e.target.value })}
          readOnly={ro}
          className={inputCls()}
        />
      </div>
      <div className="flex items-center justify-between rounded-md border px-3 py-2 md:col-span-2">
        <div>
          <Label className="text-xs">Grabación de llamadas</Label>
          <p className="text-[11px] text-muted-foreground">Graba automáticamente todas las llamadas del bridge ARI. Las grabaciones se almacenan y se vinculan a la conversación.</p>
        </div>
        <Switch
          checked={form.recordingEnabled}
          disabled={ro}
          onCheckedChange={(checked) => onChange({ recordingEnabled: checked })}
        />
      </div>

      <Label className="text-xs font-semibold pt-2 md:col-span-2">Mapeo de eventos ARI</Label>
      <p className="text-[11px] text-muted-foreground md:col-span-2">
        Rutas del payload ARI. Solo cambia si Asterisk o la versión de ARI lo requieren.
      </p>
      <div>
        <Label className="text-[11px] text-muted-foreground">Campo caller ID</Label>
        <Input
          placeholder="channel.caller.number"
          value={form.callerIdField}
          onChange={(e) => onChange({ callerIdField: e.target.value })}
          readOnly={ro}
          className={inputCls("font-mono")}
        />
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground">Campo número marcado</Label>
        <Input
          placeholder="channel.dialplan.exten"
          value={form.dialedNumberField}
          onChange={(e) => onChange({ dialedNumberField: e.target.value })}
          readOnly={ro}
          className={inputCls("font-mono")}
        />
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground">Campo extensión</Label>
        <Input
          placeholder="endpoint"
          value={form.extensionField}
          onChange={(e) => onChange({ extensionField: e.target.value })}
          readOnly={ro}
          className={inputCls("font-mono")}
        />
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground">Reintento WS (seg)</Label>
        <Input
          type="number"
          min={5}
          max={120}
          placeholder="15"
          value={form.pollFallbackSec}
          onChange={(e) => onChange({ pollFallbackSec: e.target.value })}
          readOnly={ro}
          className={inputCls()}
        />
      </div>
    </div>
  );
}
