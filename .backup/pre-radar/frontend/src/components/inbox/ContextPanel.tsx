import { useEffect, useMemo, useRef, useState } from "react";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiJson } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";
import {
  type Conversation,
  type ConversationIntegrationRuntimeApp,
  type ConversationIntegrationsWorkspace,
  type EscalationCredito,
  type QuickReply,
} from "@/data/mock";
import { ChannelBadge } from "@/components/ChannelIcon";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Bot,
  Clock,
  FileText,
  Tag,
  User,
  ExternalLink,
  CreditCard,
  Link,
  MapPinned,
  Wallet,
  UserCircle2,
  Sparkles,
  LayoutGrid,
  PanelRightOpen,
  PanelRightClose,
  Maximize2,
  ExternalLink as ExternalOpenIcon,
} from "lucide-react";
import { ContactDetailDrawer } from "@/components/contacts/ContactDetailDrawer";
import { ContactInteractionHistory } from "@/components/contacts/ContactInteractionHistory";

function toPascalCaseIconName(value: string): string {
  return value
    .trim()
    .replace(/[_\s-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function resolveLucideIcon(iconName: string | null | undefined): LucideIcon {
  const fallback = Link;
  const raw = String(iconName ?? "").trim();
  if (!raw) return fallback;

  const candidates = [raw, toPascalCaseIconName(raw)];
  for (const candidate of candidates) {
    const icon = (LucideIcons as Record<string, unknown>)[candidate];
    if (typeof icon === "function" || (typeof icon === "object" && icon !== null)) {
      return icon as LucideIcon;
    }
  }
  return fallback;
}

export function ContextPanel({ conversation }: { conversation: Conversation }) {
  const DEFAULT_PANEL_WIDTH = 384;
  const MIN_PANEL_WIDTH = 320;
  const MAX_PANEL_WIDTH = 1120;
  const WORKSPACE_WIDTH_RATIO = 0.68;
  const [detailOpen, setDetailOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<string>("context");
  const [expandedEmbed, setExpandedEmbed] = useState<ConversationIntegrationRuntimeApp | null>(null);
  const [wideWorkspace, setWideWorkspace] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [lastNormalWidth, setLastNormalWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const activePointerIdRef = useRef<number | null>(null);
  const contact = conversation.contact;

  const qrQuery = useQuery({
    queryKey: ["settings", "quick-replies", "context-panel"],
    queryFn: () => apiJson<QuickReply[]>("/settings/quick-replies"),
  });
  const quickRepliesList = qrQuery.data ?? [];

  const integrationsQuery = useQuery({
    queryKey: ["conversation", conversation.id, "integrations-workspace"],
    queryFn: () =>
      apiJson<ConversationIntegrationsWorkspace>(`/conversations/${encodeURIComponent(conversation.id)}/integrations`),
  });

  const integrationApps = useMemo(
    () => [...(integrationsQuery.data?.apps ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [integrationsQuery.data?.apps]
  );

  useEffect(() => {
    if (activePanel === "context") return;
    if (!integrationApps.some((app) => app.id === activePanel)) {
      setActivePanel("context");
    }
  }, [activePanel, integrationApps]);

  const selectedApp: ConversationIntegrationRuntimeApp | null =
    activePanel === "context" ? null : integrationApps.find((app) => app.id === activePanel) ?? null;
  const isInlineEmbedSelected =
    selectedApp?.mode === "EMBED" && selectedApp.view_mode !== "EXTERNAL_TAB";
  const isEscalationContextPanel = activePanel === "context";
  const canResizeSelectedApp = Boolean(selectedApp) && !isEscalationContextPanel;

  const clampPanelWidth = (nextWidth: number) => {
    const maxByViewport = Math.max(
      MIN_PANEL_WIDTH,
      Math.min(MAX_PANEL_WIDTH, window.innerWidth - 280)
    );
    return Math.min(maxByViewport, Math.max(MIN_PANEL_WIDTH, nextWidth));
  };

  useEffect(() => {
    if (!isInlineEmbedSelected) setWideWorkspace(false);
  }, [isInlineEmbedSelected]);

  useEffect(() => {
    if (!canResizeSelectedApp) return;
    const onResize = () => {
      setPanelWidth((current) => clampPanelWidth(current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [canResizeSelectedApp]);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canResizeSelectedApp) return;
    event.preventDefault();
    const handleElement = event.currentTarget;
    activePointerIdRef.current = event.pointerId;
    handleElement.setPointerCapture(event.pointerId);
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (activePointerIdRef.current !== null && moveEvent.pointerId !== activePointerIdRef.current) return;
      const next = window.innerWidth - moveEvent.clientX;
      const clamped = clampPanelWidth(next);
      setPanelWidth(clamped);
      if (!wideWorkspace) {
        setLastNormalWidth(clamped);
      }
    };

    const onPointerUp = (upEvent?: PointerEvent) => {
      if (upEvent && activePointerIdRef.current !== null && upEvent.pointerId !== activePointerIdRef.current) return;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (
        activePointerIdRef.current !== null &&
        handleElement.hasPointerCapture(activePointerIdRef.current)
      ) {
        handleElement.releasePointerCapture(activePointerIdRef.current);
      }
      activePointerIdRef.current = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("blur", onWindowBlur);
    };

    const onWindowBlur = () => onPointerUp();

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("blur", onWindowBlur);
  };

  const handleWorkspaceToggle = () => {
    if (!canResizeSelectedApp) return;
    if (wideWorkspace) {
      setWideWorkspace(false);
      setPanelWidth(clampPanelWidth(lastNormalWidth));
      return;
    }

    setLastNormalWidth(clampPanelWidth(panelWidth));
    setWideWorkspace(true);
    setPanelWidth(clampPanelWidth(Math.max(panelWidth, Math.round(window.innerWidth * WORKSPACE_WIDTH_RATIO))));
  };

  const renderContextBase = () => (
    <>
      {/* Contact info */}
      <div className="p-4">
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="flex items-center gap-3 mb-3 w-full text-left rounded-lg p-1 -m-1 hover:bg-muted/60 transition-colors"
          title="Ver detalle del contacto"
        >
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0">
            {contact.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">{contact.name}</p>
            <p className="text-xs text-muted-foreground">{contact.source_system || "Directo"}</p>
          </div>
        </button>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {contact.phone && (
            <div className="flex items-center gap-2">
              <p className="flex items-center gap-2 flex-1">
                <User size={12} /> {contact.phone}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  void apiJson("/voice/calls/originate", {
                    method: "POST",
                    body: JSON.stringify({
                      phone: contact.phone,
                      conversation_id: conversation.id,
                      contact_id: contact.id,
                    }),
                  })
                    .then(() => toast.success("Llamada iniciada"))
                    .catch((err) => toast.error(err instanceof Error ? err.message : "Error al llamar"));
                }}
              >
                <Phone size={12} className="mr-1" /> Llamar
              </Button>
            </div>
          )}
          {contact.email && (
            <p className="flex items-center gap-2">
              <FileText size={12} /> {contact.email}
            </p>
          )}
        </div>
        {contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {contact.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                <Tag size={10} className="mr-0.5" />
                {tag}
              </Badge>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="mt-3 text-xs text-primary flex items-center gap-1 hover:underline"
        >
          <ExternalLink size={10} /> Ver detalle del contacto
        </button>
      </div>

      <Separator />

      {/* Escalation context */}
      {conversation.source !== "direct" && (
        <>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Bot size={14} className="text-primary" />
              <span className="text-xs font-medium">Contexto de escalamiento</span>
            </div>
            <div className="bg-muted rounded-lg p-3 space-y-2">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase">Origen</p>
                <p className="text-xs">
                  {conversation.source
                    .replace("_escalation", "")
                    .replace("_", " ")
                    .replace(/\b\w/g, (l) => l.toUpperCase())}
                </p>
              </div>
              {conversation.escalation_reason && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase">Razón</p>
                  <p className="text-xs">{conversation.escalation_reason}</p>
                </div>
              )}
              {conversation.escalation_context?.creditos && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase flex items-center gap-1">
                    <CreditCard size={10} /> Créditos
                  </p>
                  {conversation.escalation_context.creditos.map((c: EscalationCredito, i: number) => (
                    <div key={i} className="text-xs mt-1 bg-card rounded p-2">
                      <p>
                        Monto: <span className="font-medium">${c.monto_vencido}</span>
                      </p>
                      <p>
                        Mora: <span className="font-medium">{c.dias_mora} días</span>
                      </p>
                      <p>Producto: {c.producto}</p>
                    </div>
                  ))}
                </div>
              )}
              {conversation.escalation_context?.campana && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase">Campaña</p>
                  <p className="text-xs">{conversation.escalation_context.campana.nombre}</p>
                </div>
              )}
              {conversation.escalation_context?.agent_name && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase">Agente IA</p>
                  <p className="text-xs">{conversation.escalation_context.agent_name}</p>
                </div>
              )}
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Conversation info */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Clock size={14} className="text-muted-foreground" />
          <span className="text-xs font-medium">Info de conversación</span>
        </div>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <p>
            Canal: <ChannelBadge channel={conversation.channel} />
          </p>
          <p>Cola: {conversation.queue_name}</p>
          <p>Creada: {new Date(conversation.messages[0]?.created_at || conversation.last_message_at).toLocaleString("es")}</p>
          {conversation.wait_time_seconds && <p>Tiempo en cola: {conversation.wait_time_seconds}s</p>}
        </div>
      </div>

      <Separator />

      {/* Quick replies */}
      <div className="p-4">
        <p className="text-xs font-medium mb-2">Respuestas rápidas</p>
        <div className="space-y-1">
          {qrQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Cargando…</p>
          ) : quickRepliesList.length === 0 ? (
            <p className="text-xs text-muted-foreground">Ninguna configurada. Añádelas en Configuración → General.</p>
          ) : (
            quickRepliesList.slice(0, 12).map((qr) => (
              <button
                key={qr.id}
                type="button"
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                onClick={() => {
                  void navigator.clipboard.writeText(qr.content).then(
                    () => toast.success("Texto copiado al portapapeles"),
                    () => toast.error("No se pudo copiar")
                  );
                }}
              >
                <span className="font-mono text-foreground">{qr.shortcode}</span>
                <span className="block text-[10px] text-muted-foreground truncate">{qr.title}</span>
              </button>
            ))
          )}
        </div>
      </div>
      {integrationApps.length === 0 && !integrationsQuery.isLoading && (
        <>
          <Separator />
          <div className="p-4">
            <p className="text-xs font-medium">Apps del rail</p>
            <p className="text-xs text-muted-foreground mt-1">
              No hay apps que hagan match con esta conversación. Revisa en Integraciones: `scope_type/scope_id`, `rules.sources`,
              `is_visible` y `placement=right_rail`.
            </p>
          </div>
        </>
      )}

      <Separator />

      <ContactInteractionHistory
        contactId={contact.id}
        currentConversationId={conversation.id}
        variant="compact"
        onViewAll={() => setDetailOpen(true)}
      />
    </>
  );

  const renderIntegrationApp = (app: ConversationIntegrationRuntimeApp) => (
    <div className="p-4 h-full min-h-0 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{app.name}</p>
        </div>
        {app.mode === "EMBED" && (
          <div className="flex items-center gap-1 shrink-0">
            {app.embed_url && app.view_mode !== "EXTERNAL_TAB" && (
              <Button
                size="icon"
                variant={wideWorkspace ? "default" : "outline"}
                className="h-8 w-8"
                onClick={handleWorkspaceToggle}
                title={wideWorkspace ? "Vista normal" : "Modo trabajo"}
                aria-label={wideWorkspace ? "Vista normal" : "Modo trabajo"}
              >
                {wideWorkspace ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              </Button>
            )}
            {app.embed_url && app.view_mode !== "EXTERNAL_TAB" && (
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => setExpandedEmbed(app)}
                title="Ver grande"
                aria-label="Ver grande"
              >
                <Maximize2 size={14} />
              </Button>
            )}
            {app.embed_url && (
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => window.open(app.embed_url, "_blank", "noopener,noreferrer")}
                title="Abrir en pestaña"
                aria-label="Abrir en pestaña"
              >
                <ExternalOpenIcon size={14} />
              </Button>
            )}
          </div>
        )}
      </div>
      {app.mode === "SNAPSHOT" && (
        <div className="space-y-2">
          {app.snapshot?.length ? (
            app.snapshot.map((card, idx) => (
              <div key={`${app.id}-snap-${idx}`} className="rounded-md border bg-muted/30 p-2">
                <p className="text-[10px] uppercase text-muted-foreground">{card.label}</p>
                <p className="text-xs font-medium">{card.value || "—"}</p>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">Sin datos para mostrar.</p>
          )}
        </div>
      )}
      {app.mode === "EMBED" && (
        <div className="space-y-2 flex-1 min-h-0 flex flex-col">
          {app.view_mode === "EXTERNAL_TAB" ? (
            <p className="text-xs text-muted-foreground">
              Esta integración está configurada para abrirse en pestaña externa (sitios reales con login/transacciones suelen
              bloquear iframes).
            </p>
          ) : (
            <div className="rounded-md border overflow-hidden bg-background flex-1 min-h-0">
              {app.embed_url ? (
                <iframe
                  src={app.embed_url}
                  title={app.name}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              ) : (
                <p className="text-xs text-muted-foreground p-3">Esta integración no tiene URL embebida configurada.</p>
              )}
            </div>
          )}
        </div>
      )}
      {app.mode === "ACTIONS" && (
        <div className="space-y-2">
          {app.actions?.length ? (
            app.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="w-full rounded-md border px-3 py-2 text-xs text-left hover:bg-muted/40"
                onClick={() => toast.message(`Acción pendiente: ${action.label}`)}
              >
                {action.label}
              </button>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No hay acciones configuradas.</p>
          )}
        </div>
      )}
    </div>
  );

  const asideWidth = canResizeSelectedApp ? clampPanelWidth(panelWidth) : undefined;

  return (
    <aside
      className={`relative h-full min-h-0 shrink-0 border-l bg-card flex ${
        canResizeSelectedApp ? (isResizing ? "" : "transition-[width] duration-150") : "transition-all"
      } ${!canResizeSelectedApp ? (wideWorkspace ? "w-[68vw] max-w-[1120px]" : "w-[24rem]") : ""}`}
      style={canResizeSelectedApp ? { width: `${asideWidth}px` } : undefined}
    >
      {canResizeSelectedApp && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar panel lateral"
          className="group absolute left-0 top-0 h-full w-3 -translate-x-1/2 cursor-col-resize select-none"
          onPointerDown={startResize}
        >
          <div className="mx-auto h-full w-px bg-border/70 transition-colors group-hover:bg-primary/80" />
          <div className="pointer-events-none absolute top-1/2 left-1/2 h-8 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border/80 shadow-sm transition-colors group-hover:bg-primary/90" />
        </div>
      )}
      <div className={`flex-1 min-w-0 ${selectedApp ? "overflow-hidden" : "overflow-y-auto scrollbar-thin"}`}>
        {selectedApp ? renderIntegrationApp(selectedApp) : renderContextBase()}
      </div>
      <div className="w-14 border-l bg-muted/20 py-2 flex flex-col items-center gap-2">
        <button
          type="button"
          title="Contexto base"
          className={`w-10 h-10 rounded-md border text-xs flex items-center justify-center ${
            activePanel === "context" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
          }`}
          onClick={() => setActivePanel("context")}
        >
          <LayoutGrid size={16} />
        </button>
        {integrationsQuery.isLoading && <span className="text-[10px] text-muted-foreground">...</span>}
        {integrationApps.map((app) => {
          const Icon = resolveLucideIcon(app.icon);
          return (
            <button
              key={app.id}
              type="button"
              title={`${app.name} · ${app.match_explain}`}
              className={`w-10 h-10 rounded-md border text-xs flex items-center justify-center ${
                activePanel === app.id ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
              }`}
              onClick={() => setActivePanel(app.id)}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>
      <ContactDetailDrawer contact={contact} open={detailOpen} onOpenChange={setDetailOpen} />
      <Dialog open={Boolean(expandedEmbed)} onOpenChange={(open) => !open && setExpandedEmbed(null)}>
        <DialogContent className="max-w-[96vw] w-[96vw] h-[90vh] p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>{expandedEmbed?.name ?? "Integración"}</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-4 h-full">
            {expandedEmbed?.embed_url ? (
              <iframe
                src={expandedEmbed.embed_url}
                title={expandedEmbed.name}
                className="w-full h-[calc(90vh-90px)] border rounded-md"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            ) : (
              <p className="text-xs text-muted-foreground">No hay URL disponible para mostrar.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
