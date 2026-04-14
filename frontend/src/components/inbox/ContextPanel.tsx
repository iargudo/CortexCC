import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { type Conversation, type EscalationCredito, type QuickReply } from "@/data/mock";
import { apiJson } from "@/lib/api";
import { ChannelBadge } from "@/components/ChannelIcon";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Bot, Clock, FileText, Tag, User, ExternalLink, CreditCard } from "lucide-react";
import { ContactDetailDrawer } from "@/components/contacts/ContactDetailDrawer";

export function ContextPanel({ conversation }: { conversation: Conversation }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const contact = conversation.contact;

  const qrQuery = useQuery({
    queryKey: ["settings", "quick-replies", "context-panel"],
    queryFn: () => apiJson<QuickReply[]>("/settings/quick-replies"),
  });
  const quickRepliesList = qrQuery.data ?? [];

  return (
    <aside className="w-72 h-full min-h-0 shrink-0 border-l bg-card overflow-y-auto scrollbar-thin">
      {/* Contact info */}
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
            {contact.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div>
            <p className="font-medium text-sm">{contact.name}</p>
            <p className="text-xs text-muted-foreground">{contact.source_system || "Directo"}</p>
          </div>
        </div>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {contact.phone && <p className="flex items-center gap-2"><User size={12} /> {contact.phone}</p>}
          {contact.email && <p className="flex items-center gap-2"><FileText size={12} /> {contact.email}</p>}
        </div>
        {contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {contact.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                <Tag size={10} className="mr-0.5" />{tag}
              </Badge>
            ))}
          </div>
        )}
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
                <p className="text-xs">{conversation.source.replace("_escalation", "").replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}</p>
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
                      <p>Monto: <span className="font-medium">${c.monto_vencido}</span></p>
                      <p>Mora: <span className="font-medium">{c.dias_mora} días</span></p>
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
              <button onClick={() => setDetailOpen(true)} className="text-xs text-primary flex items-center gap-1 hover:underline">
                <ExternalLink size={10} /> Ver detalle del contacto
              </button>
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
          <p>Canal: <ChannelBadge channel={conversation.channel} /></p>
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
            <p className="text-xs text-muted-foreground">
              Ninguna configurada. Añádelas en Configuración → General.
            </p>
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
      <ContactDetailDrawer contact={contact} open={detailOpen} onOpenChange={setDetailOpen} />
    </aside>
  );
}
