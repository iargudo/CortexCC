import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Conversation } from "@/data/mock";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Ear, MessageSquare, Phone, Mic, MicOff, Volume2,
  PhoneOff, AlertCircle, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiJson } from "@/lib/api";

type MonitorMode = "listen" | "whisper" | "barge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentName: string;
  agentId: string;
}

export function SupervisorMonitorDialog({ open, onOpenChange, agentName, agentId }: Props) {
  const [mode, setMode] = useState<MonitorMode>("listen");
  const [isActive, setIsActive] = useState(false);
  const [muted, setMuted] = useState(false);

  const convQuery = useQuery({
    queryKey: ["conversations", "all", "monitor", agentId],
    enabled: open && Boolean(agentId),
    queryFn: () => apiJson<{ data: Conversation[] }>("/conversations?tab=all&limit=200&page=1"),
  });

  const agentConvs = useMemo(() => {
    const list = convQuery.data?.data ?? [];
    return list.filter((c) => c.assigned_agent === agentName && c.status === "ACTIVE");
  }, [convQuery.data, agentName]);

  const modeConfig = {
    listen: {
      label: "Escuchar",
      icon: <Ear size={16} />,
      description: "Escuchas la conversación sin que el agente ni el contacto lo sepan.",
      color: "bg-emerald-500",
      activeLabel: "Escuchando...",
    },
    whisper: {
      label: "Susurrar",
      icon: <MessageSquare size={16} />,
      description: "Solo el agente escucha tu voz. El contacto no oye nada.",
      color: "bg-amber-500",
      activeLabel: "Susurrando...",
    },
    barge: {
      label: "Irrumpir",
      icon: <Phone size={16} />,
      description: "Te unes a la conversación. Tanto el agente como el contacto te escuchan.",
      color: "bg-destructive",
      activeLabel: "En conferencia...",
    },
  };

  const currentMode = modeConfig[mode];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye size={16} /> Monitor de Supervisión
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
              {agentName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <p className="text-sm font-medium">{agentName}</p>
              <p className="text-xs text-muted-foreground">
                {convQuery.isLoading ? "…" : `${agentConvs.length} conversación${agentConvs.length !== 1 ? "es" : ""} activa${agentConvs.length !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(["listen", "whisper", "barge"] as MonitorMode[]).map((m) => {
              const config = modeConfig[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setIsActive(false);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all",
                    mode === m ? "border-primary bg-primary/5" : "border-transparent bg-muted/30 hover:bg-muted/50"
                  )}
                >
                  <div
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center",
                      mode === m ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {config.icon}
                  </div>
                  <span className="text-xs font-medium">{config.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
            <AlertCircle size={14} className="text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">{currentMode.description}</p>
          </div>

          {agentConvs.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Conversaciones activas</p>
              {agentConvs.map((conv) => (
                <div
                  key={conv.id}
                  className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/30 transition-colors"
                >
                  <span className="text-sm">{conv.contact.name}</span>
                  <Badge variant="secondary" className="text-[9px]">
                    {conv.channel}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              {convQuery.isLoading ? "Cargando…" : "El agente no tiene conversaciones activas"}
            </p>
          )}

          {isActive ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2">
                <span className={cn("w-2.5 h-2.5 rounded-full animate-pulse", currentMode.color)} />
                <span className="text-sm font-medium">{currentMode.activeLabel}</span>
              </div>

              <div className="flex justify-center gap-3">
                {mode !== "listen" && (
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" onClick={() => setMuted(!muted)}>
                    {muted ? <MicOff size={16} className="text-destructive" /> : <Mic size={16} />}
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full">
                  <Volume2 size={16} />
                </Button>
                <Button variant="destructive" size="icon" className="h-10 w-10 rounded-full" onClick={() => setIsActive(false)}>
                  <PhoneOff size={16} />
                </Button>
              </div>
            </div>
          ) : (
            <Button className="w-full gap-2" onClick={() => setIsActive(true)} disabled={agentConvs.length === 0}>
              {currentMode.icon}
              Iniciar {currentMode.label}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
