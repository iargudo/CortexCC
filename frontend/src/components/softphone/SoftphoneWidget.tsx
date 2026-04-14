import { useState, useEffect, useRef } from "react";
import {
  Phone, PhoneOff, PhoneIncoming, PhoneOutgoing, PhoneForwarded,
  Mic, MicOff, Pause, Play, Settings, History, X, Delete,
  Wifi, WifiOff, Loader2, Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSipPhone } from "@/hooks/useSipPhone";
import { useSipStore } from "@/stores/sipStore";
import { SoftphoneConfig } from "./SoftphoneConfig";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiJson } from "@/lib/api";

const DIALPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const DIALPAD_LETTERS: Record<string, string> = {
  "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL",
  "6": "MNO", "7": "PQRS", "8": "TUV", "9": "WXYZ",
};

export function SoftphoneWidget({ onClose }: { onClose: () => void }) {
  const {
    registrationState, currentCall,
    register, unregister, call, answer, reject, hangup,
    toggleMute, toggleHold, sendDtmf, blindTransfer,
  } = useSipPhone();

  const { config, setConfig, callHistory, isConfigOpen, setConfigOpen } = useSipStore();
  const [dialNumber, setDialNumber] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [activeTab, setActiveTab] = useState<string>("dialpad");
  const [callTimer, setCallTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadedConfigRef = useRef(false);

  useEffect(() => {
    if (loadedConfigRef.current) return;
    loadedConfigRef.current = true;
    void (async () => {
      try {
        const remote = await apiJson<{
          server: string;
          realm: string;
          displayName: string;
          stunServers: string[];
          iceGatheringTimeout: number;
          extension: string;
          password: string;
        }>("/settings/softphone/me");
        setConfig({
          server: remote.server ?? "",
          realm: remote.realm ?? "",
          displayName: remote.displayName ?? "",
          stunServers: Array.isArray(remote.stunServers) && remote.stunServers.length > 0
            ? remote.stunServers
            : ["stun:stun.l.google.com:19302"],
          iceGatheringTimeout: typeof remote.iceGatheringTimeout === "number" ? remote.iceGatheringTimeout : 5000,
          extension: remote.extension ?? "",
          password: remote.password ?? "",
        });
      } catch (err) {
        console.warn("[SOFTPHONE] failed to load persisted config", err);
      }
    })();
  }, [setConfig]);

  // Call timer
  useEffect(() => {
    if (currentCall?.state === "active" || currentCall?.state === "on_hold") {
      timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000);
    } else {
      setCallTimer(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentCall?.state]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleDial = (key: string) => {
    setDialNumber((prev) => prev + key);
    if (currentCall?.state === "active") {
      sendDtmf(key);
    }
  };

  const handleCall = () => {
    const target = dialNumber.trim();
    if (!target) {
      console.info("[SOFTPHONE] call blocked: empty target");
      return;
    }
    if (registrationState !== "registered") {
      console.info("[SOFTPHONE] call blocked: sip not registered", { registrationState, target });
      return;
    }
    console.info("[SOFTPHONE] dialing", {
      target,
      registrationState,
    });
    call(target);
    setDialNumber("");
  };

  const handleTransfer = () => {
    if (transferTarget.trim()) {
      blindTransfer(transferTarget.trim());
      setShowTransfer(false);
      setTransferTarget("");
    }
  };

  const regIcon = registrationState === "registered"
    ? <Wifi size={12} className="text-emerald-500" />
    : registrationState === "registering"
      ? <Loader2 size={12} className="animate-spin text-amber-500" />
      : <WifiOff size={12} className="text-muted-foreground" />;

  const regLabel = registrationState === "registered"
    ? "Conectado"
    : registrationState === "registering"
      ? "Conectando..."
      : registrationState === "error"
        ? "Error"
        : "Desconectado";

  // ─── Incoming call ringing view ───
  if (currentCall?.state === "ringing" && currentCall.direction === "inbound") {
    return (
      <div className="w-72 bg-card border rounded-xl shadow-2xl p-4 z-50 animate-slide-in-right">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
            <PhoneIncoming size={24} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Llamada entrante</p>
            <p className="text-xs text-muted-foreground font-mono mt-1">{currentCall.remoteDisplayName}</p>
            <p className="text-[10px] text-muted-foreground">{currentCall.remoteUri}</p>
          </div>
          <div className="flex justify-center gap-3">
            <Button
              size="icon"
              className="h-12 w-12 rounded-full bg-emerald-500 hover:bg-emerald-600"
              onClick={answer}
            >
              <Phone size={20} className="text-white" />
            </Button>
            <Button
              size="icon"
              variant="destructive"
              className="h-12 w-12 rounded-full"
              onClick={reject}
            >
              <PhoneOff size={20} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Active call view ───
  if (currentCall && currentCall.state !== "ended") {
    return (
      <div className="w-72 bg-card border rounded-xl shadow-2xl p-4 z-50 animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            {currentCall.direction === "inbound"
              ? <PhoneIncoming size={12} className="text-primary" />
              : <PhoneOutgoing size={12} className="text-primary" />}
            <span className="text-[10px] text-muted-foreground uppercase font-medium">
              {currentCall.direction === "inbound" ? "Entrante" : "Saliente"}
            </span>
          </div>
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
            currentCall.state === "active" && "bg-emerald-500/15 text-emerald-600",
            currentCall.state === "connecting" && "bg-amber-500/15 text-amber-600",
            currentCall.state === "on_hold" && "bg-amber-500/15 text-amber-600",
            currentCall.state === "ringing" && "bg-primary/15 text-primary",
          )}>
            {currentCall.state === "active" ? "En curso"
              : currentCall.state === "connecting" ? "Conectando..."
                : currentCall.state === "on_hold" ? "En espera"
                  : "Timbrando..."}
          </span>
        </div>

        {/* Call info */}
        <div className="text-center mb-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center text-sm font-bold mb-2">
            {currentCall.remoteDisplayName.slice(0, 2).toUpperCase()}
          </div>
          <p className="text-sm font-semibold">{currentCall.remoteDisplayName}</p>
          <p className="text-xs text-muted-foreground font-mono">{currentCall.remoteUri}</p>
          {(currentCall.state === "active" || currentCall.state === "on_hold") && (
            <p className={cn(
              "text-lg font-mono mt-1",
              currentCall.state === "on_hold" ? "text-amber-500 animate-pulse" : "text-emerald-500"
            )}>
              {formatTime(callTimer)}
            </p>
          )}
          {currentCall.held && (
            <p className="text-[10px] text-amber-500 animate-pulse mt-0.5">⏸ En espera</p>
          )}
          {currentCall.muted && (
            <p className="text-[10px] text-destructive mt-0.5">🔇 Silenciado</p>
          )}
        </div>

        {/* Transfer panel */}
        {showTransfer ? (
          <div className="space-y-2 mb-3">
            <p className="text-xs font-medium">Transferir a:</p>
            <Input
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
              placeholder="Extensión o número"
              className="h-7 text-xs font-mono"
            />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleTransfer}>
                <PhoneForwarded size={12} className="mr-1" /> Transferir
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowTransfer(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* In-call DTMF pad */}
            {currentCall.state === "active" && (
              <div className="grid grid-cols-3 gap-1 mb-3">
                {DIALPAD_KEYS.map((k) => (
                  <Button
                    key={k}
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs font-mono"
                    onClick={() => sendDtmf(k)}
                  >
                    {k}
                  </Button>
                ))}
              </div>
            )}

            {/* Call controls */}
            <div className="flex justify-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={toggleMute}
                title={currentCall.muted ? "Reactivar micrófono" : "Silenciar"}
              >
                {currentCall.muted
                  ? <MicOff size={16} className="text-destructive" />
                  : <Mic size={16} />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={toggleHold}
                title={currentCall.held ? "Reanudar" : "En espera"}
              >
                {currentCall.held
                  ? <Play size={16} className="text-amber-500" />
                  : <Pause size={16} />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => setShowTransfer(true)}
                title="Transferir"
              >
                <PhoneForwarded size={16} />
              </Button>
              <Button
                variant="destructive"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={hangup}
                title="Colgar"
              >
                <PhoneOff size={16} />
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ─── Config view ───
  if (isConfigOpen) {
    return (
      <div className="w-72 bg-card border rounded-xl shadow-2xl p-4 z-50 animate-slide-in-right">
        <SoftphoneConfig
          onClose={() => setConfigOpen(false)}
          onSave={() => {
            void (async () => {
              try {
                await apiJson("/settings/softphone/me", {
                  method: "PUT",
                  body: JSON.stringify({
                    server: config.server,
                    realm: config.realm,
                    displayName: config.displayName,
                    stunServers: config.stunServers,
                    iceGatheringTimeout: config.iceGatheringTimeout,
                    extension: config.extension,
                    password: config.password,
                  }),
                });
                setConfigOpen(false);
                await register();
              } catch (err) {
                console.error("[SOFTPHONE] failed to persist config", err);
              }
            })();
          }}
        />
      </div>
    );
  }

  // ─── Default idle view ───
  return (
    <div className="w-72 bg-card border rounded-xl shadow-2xl z-50 animate-slide-in-right overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-1.5">
          <Volume2 size={12} className="text-muted-foreground" />
          <span className="text-xs font-medium">Softphone</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (registrationState === "registered") unregister();
              else register();
            }}
            className="flex items-center gap-1 hover:opacity-70 transition-opacity"
            title={regLabel}
          >
            {regIcon}
            <span className="text-[10px] text-muted-foreground">{regLabel}</span>
          </button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setConfigOpen(true)}>
            <Settings size={10} />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClose}>
            <X size={10} />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full rounded-none border-b h-8">
          <TabsTrigger value="dialpad" className="text-xs flex-1 h-7">Teclado</TabsTrigger>
          <TabsTrigger value="history" className="text-xs flex-1 h-7">
            Historial {callHistory.length > 0 && `(${callHistory.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dialpad" className="p-3 mt-0 space-y-3">
          {/* Number input */}
          <div className="relative">
            <Input
              value={dialNumber}
              onChange={(e) => setDialNumber(e.target.value)}
              placeholder="Número o extensión"
              className="h-9 text-sm font-mono pr-8 text-center"
              onKeyDown={(e) => e.key === "Enter" && handleCall()}
            />
            {dialNumber && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0.5 top-0.5 h-8 w-8"
                onClick={() => setDialNumber((p) => p.slice(0, -1))}
              >
                <Delete size={14} className="text-muted-foreground" />
              </Button>
            )}
          </div>

          {/* Dialpad */}
          <div className="grid grid-cols-3 gap-1">
            {DIALPAD_KEYS.map((k) => (
              <button
                key={k}
                onClick={() => handleDial(k)}
                className="h-11 rounded-lg flex flex-col items-center justify-center hover:bg-muted transition-colors active:bg-muted/80"
              >
                <span className="text-sm font-medium font-mono">{k}</span>
                {DIALPAD_LETTERS[k] && (
                  <span className="text-[8px] text-muted-foreground tracking-wider">
                    {DIALPAD_LETTERS[k]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Call button */}
          <Button
            className="w-full h-10 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white"
            onClick={handleCall}
            disabled={!dialNumber.trim() || registrationState !== "registered"}
          >
            <Phone size={16} className="mr-2" />
            Llamar
          </Button>

          {registrationState !== "registered" && (
            <p className="text-[10px] text-center text-muted-foreground">
              {registrationState === "error"
                ? "Error de conexión. Revise la configuración."
                : "Configure y conecte el servidor SIP para llamar."}
            </p>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          {callHistory.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              <History size={24} className="mx-auto mb-2 opacity-30" />
              Sin llamadas recientes
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto scrollbar-thin">
              {callHistory.map((entry) => (
                <button
                  key={entry.id}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors text-left border-b last:border-0"
                  onClick={() => {
                    setDialNumber(entry.remoteUri.replace("sip:", "").split("@")[0]);
                    setActiveTab("dialpad");
                  }}
                >
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                    entry.answered ? "bg-emerald-500/10" : "bg-destructive/10"
                  )}>
                    {entry.direction === "inbound"
                      ? <PhoneIncoming size={12} className={entry.answered ? "text-emerald-500" : "text-destructive"} />
                      : <PhoneOutgoing size={12} className={entry.answered ? "text-emerald-500" : "text-destructive"} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{entry.remoteDisplayName}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      {entry.remoteUri.replace("sip:", "").split("@")[0]}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-muted-foreground">
                      {entry.endedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {entry.answered && (
                      <p className="text-[10px] text-muted-foreground">{formatTime(entry.duration)}</p>
                    )}
                    {!entry.answered && (
                      <p className="text-[10px] text-destructive">Perdida</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
