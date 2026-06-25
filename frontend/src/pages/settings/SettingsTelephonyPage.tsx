import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Phone, Server, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { VoiceChannelFields } from "@/components/settings/VoiceChannelFields";
import { apiJson } from "@/lib/api";
import { buildVoiceConfig } from "@/lib/voiceChannelConfig";
import {
  buildTelephonyPayload,
  defaultTelephonyForm,
  parseTelephonyForm,
  type AriTestResult,
  type TelephonyForm,
  type TelephonySettingsView,
} from "@/lib/telephonySettings";

export default function SettingsTelephonyPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<TelephonyForm>(defaultTelephonyForm());
  const [ariTestResult, setAriTestResult] = useState<AriTestResult | null>(null);

  const query = useQuery({
    queryKey: ["settings", "telephony"],
    queryFn: () => apiJson<TelephonySettingsView>("/settings/telephony"),
  });

  useEffect(() => {
    if (!query.data) return;
    setForm(parseTelephonyForm(query.data));
    setAriTestResult(null);
  }, [query.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      apiJson<TelephonySettingsView>("/settings/telephony", {
        method: "PUT",
        body: JSON.stringify(buildTelephonyPayload(form)),
      }),
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ["settings", "telephony"] });
      void qc.invalidateQueries({ queryKey: ["settings", "channels"] });
      setForm(parseTelephonyForm(saved));
      if (saved.validation.warnings.length > 0) {
        saved.validation.warnings.forEach((w) => toast.warning(w));
      }
      toast.success("Telefonía guardada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testAriMut = useMutation({
    mutationFn: () => {
      const ariBaseUrl =
        query.data?.derived.ariBaseUrl ||
        `http://${form.pbxHost.trim()}:${form.pbxAriPort || "8074"}`;
      const config = buildVoiceConfig({
        ...form.voice,
        ariBaseUrl,
      });
      return apiJson<AriTestResult>("/settings/channels/voice/test", {
        method: "POST",
        body: JSON.stringify({ config }),
      });
    },
    onSuccess: (r) => {
      setAriTestResult(r);
      if (r.ok) {
        toast.success(r.detail ?? "Conexión ARI correcta");
        r.warnings?.forEach((w) => toast.warning(w));
      } else {
        toast.error(r.detail ?? "Error de conexión ARI");
      }
    },
    onError: (e: Error) => {
      setAriTestResult({ ok: false, detail: e.message });
      toast.error(e.message);
    },
  });

  const derivedPreview = query.data?.derived;
  const validation = query.data?.validation;
  const voiceStatus = query.data?.voiceChannel.status;
  const needsSetup = !query.isLoading && !query.error && !query.data?.pbxHost?.trim();

  const patchForm = (patch: Partial<TelephonyForm>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6 w-full max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Phone size={20} />
            Telefonía / PBX
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Un solo host Asterisk alimenta el softphone de agentes (WSS/SIP) y la plataforma de contact center (ARI).
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={() => saveMut.mutate()}
            disabled={!form.pbxHost.trim() || saveMut.isPending}
            className="gap-1.5"
          >
            {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar telefonía
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={testAriMut.isPending}
            onClick={() => {
              if (!form.pbxHost.trim() || !form.voice.ariUsername.trim() || !form.voice.ariPassword.trim()) {
                toast.error("Completa host PBX, usuario y contraseña ARI antes de probar");
                return;
              }
              setAriTestResult(null);
              testAriMut.mutate();
            }}
          >
            {testAriMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            Probar ARI
          </Button>
        </div>
      </div>

      {query.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {query.error && <p className="text-sm text-destructive">{(query.error as Error).message}</p>}

      {needsSetup && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Server size={15} />
              Configura tu central en 3 pasos
            </CardTitle>
            <CardDescription>
              Aún no hay un host PBX definido. Indica un solo host de Asterisk y el resto se deriva
              automáticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1.5">
            <p>
              <span className="text-foreground font-semibold">1.</span> Escribe el host/FQDN del PBX
              y los puertos WSS (softphone) y ARI (backend).
            </p>
            <p>
              <span className="text-foreground font-semibold">2.</span> Completa las credenciales ARI
              y prueba la conexión con la central.
            </p>
            <p>
              <span className="text-foreground font-semibold">3.</span> Activa el canal de voz en{" "}
              <Link to="/settings/channels" className="text-foreground underline">
                Configuración → Canales
              </Link>{" "}
              y asigna extensiones a los agentes en{" "}
              <Link to="/settings/users" className="text-foreground underline">
                Usuarios
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}

      {validation && (validation.warnings.length > 0 || validation.errors.length > 0) && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle size={14} />
              Estado de la configuración
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            {validation.errors.map((e) => (
              <p key={e} className="text-destructive">
                {e}
              </p>
            ))}
            {validation.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server size={16} />
            Host PBX (Asterisk)
          </CardTitle>
          <CardDescription>
            IP o FQDN del servidor. Se derivan automáticamente las URLs de softphone y ARI.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-3">
            <Label className="text-xs">Host / FQDN</Label>
            <Input
              placeholder="pbx.empresa.com o 192.168.1.10"
              value={form.pbxHost}
              onChange={(e) => patchForm({ pbxHost: e.target.value })}
              className="h-8 text-sm font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Puerto WSS (softphone)</Label>
            <Input
              value={form.pbxWssPort}
              onChange={(e) => patchForm({ pbxWssPort: e.target.value })}
              className="h-8 text-sm font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Puerto ARI (backend)</Label>
            <Input
              value={form.pbxAriPort}
              onChange={(e) => patchForm({ pbxAriPort: e.target.value })}
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="md:col-span-3 rounded-md bg-muted/50 p-3 space-y-1 text-[11px] font-mono text-muted-foreground">
            <p>
              <span className="text-foreground font-semibold">Softphone:</span>{" "}
              {derivedPreview?.sipServer || `wss://${form.pbxHost || "…"}:${form.pbxWssPort}/ws`}
            </p>
            <p>
              <span className="text-foreground font-semibold">Realm SIP:</span>{" "}
              {derivedPreview?.sipRealm || form.pbxHost || "…"}
            </p>
            <p>
              <span className="text-foreground font-semibold">ARI backend:</span>{" "}
              {derivedPreview?.ariBaseUrl || `http://${form.pbxHost || "…"}:${form.pbxAriPort}`}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agentes — Softphone (WSS/SIP)</CardTitle>
          <CardDescription>
            Configuración compartida por todos los agentes. Las extensiones se asignan por usuario.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Nombre para mostrar</Label>
            <Input
              value={form.displayName}
              onChange={(e) => patchForm({ displayName: e.target.value })}
              className="h-8 text-sm"
              placeholder="Cortex Agent"
            />
          </div>
          <div>
            <Label className="text-xs">Rango de extensiones</Label>
            <div className="flex items-center gap-2">
              <Input
                value={form.extensionRangeStart}
                onChange={(e) => patchForm({ extensionRangeStart: e.target.value })}
                className="h-8 text-sm font-mono"
              />
              <span className="text-xs text-muted-foreground">—</span>
              <Input
                value={form.extensionRangeEnd}
                onChange={(e) => patchForm({ extensionRangeEnd: e.target.value })}
                className="h-8 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">ICE timeout (ms)</Label>
            <Input
              value={form.iceGatheringTimeout}
              onChange={(e) => patchForm({ iceGatheringTimeout: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Servidores STUN (uno por línea)</Label>
            <Textarea
              value={form.stunServers}
              onChange={(e) => patchForm({ stunServers: e.target.value })}
              className="min-h-[72px] text-xs font-mono"
            />
          </div>
        </CardContent>
      </Card>
      </div>

      <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Plataforma — Canal VOICE (ARI)</CardTitle>
              <CardDescription>
                Credenciales y parámetros operativos del backend con Asterisk Stasis.
              </CardDescription>
            </div>
            {voiceStatus ? (
              <Badge variant={voiceStatus === "active" ? "default" : "secondary"} className="text-[10px] shrink-0">
                Canal {voiceStatus}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] shrink-0">
                Sin canal VOICE
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!query.data?.voiceChannel.id && (
            <p className="text-xs text-amber-600 mb-3">
              Aún no existe un canal VOICE. Se creará automáticamente al guardar si completas usuario y
              contraseña ARI. Luego actívalo en{" "}
              <Link to="/settings/channels" className="underline">
                Configuración → Canales
              </Link>{" "}
              para habilitar llamadas en el inbox.
            </p>
          )}
          <VoiceChannelFields
            form={form.voice}
            onChange={(patch) => {
              setForm((prev) => ({ ...prev, voice: { ...prev.voice, ...patch } }));
              setAriTestResult(null);
            }}
            derivedAriBaseUrl={
              derivedPreview?.ariBaseUrl || `http://${form.pbxHost.trim()}:${form.pbxAriPort}`
            }
            onTestAri={() => {
              if (!form.pbxHost.trim() || !form.voice.ariUsername.trim() || !form.voice.ariPassword.trim()) {
                toast.error("Completa host PBX, usuario y contraseña ARI antes de probar");
                return;
              }
              setAriTestResult(null);
              testAriMut.mutate();
            }}
            ariTestPending={testAriMut.isPending}
            ariTestResult={ariTestResult}
          />
        </CardContent>
      </Card>
      </div>
      </div>
    </div>
  );
}
