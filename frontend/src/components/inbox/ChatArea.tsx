import { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { type Conversation, type EscalationHistoryItem, type Message } from "@/data/mock";
import type { QuickReply } from "@/data/mock";
import { apiFetch, apiJson } from "@/lib/api";
import { TransferDialog } from "@/components/inbox/TransferDialog";
import { ResolveDialog } from "@/components/inbox/ResolveDialog";
import { EmailThreadView } from "@/components/inbox/EmailThreadView";
import { EmailTemplateSelector, type EmailTemplate } from "@/components/email/EmailTemplates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Paperclip, Send, StickyNote, ArrowRightLeft, CheckCircle, Pause, Bot, Play,
  Check, X, Bold, Italic, Link as LinkIcon, List, Underline, AlignLeft,
  Strikethrough, FileText, UserCheck, Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

export function ChatArea({ conversation }: { conversation: Conversation }) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const cid = conversation.id;
  const bump = () => {
    void qc.invalidateQueries({ queryKey: ["conversations"] });
    void qc.invalidateQueries({ queryKey: ["conversation", cid] });
  };

  const acceptMut = useMutation({
    mutationFn: () => apiJson<Conversation>(`/conversations/${cid}/accept`, { method: "POST" }),
    onSuccess: () => {
      bump();
      toast.success("Conversación aceptada");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "No se pudo aceptar la conversación"),
  });
  const rejectMut = useMutation({
    mutationFn: () => apiJson(`/conversations/${cid}/reject`, { method: "POST" }),
    onSuccess: () => {
      bump();
      toast.success("Asignación rechazada");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "No se pudo rechazar la asignación"),
  });

  // Misma instancia de useMutation al cambiar de conversación: si isPending quedó colgado,
  // los botones usan disabled:pointer-events-none y parece que "no hacen nada".
  useEffect(() => {
    acceptMut.reset();
    rejectMut.reset();
    holdMut.reset();
    resumeMut.reset();
    sendMut.reset();
    emailMut.reset();
  }, [cid]);
  const holdMut = useMutation({
    mutationFn: () => apiJson<Conversation>(`/conversations/${cid}/hold`, { method: "POST" }),
    onSuccess: () => {
      bump();
      toast.success("En espera");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resumeMut = useMutation({
    mutationFn: () => apiJson<Conversation>(`/conversations/${cid}/resume`, { method: "POST" }),
    onSuccess: () => {
      bump();
      toast.success("Conversación retomada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sendMut = useMutation({
    mutationFn: (body: { content: string; is_internal: boolean }) =>
      apiJson(`/conversations/${cid}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: body.content,
          is_internal: body.is_internal,
          content_type: "TEXT",
        }),
      }),
    onSuccess: () => {
      bump();
      toast.success("Mensaje enviado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const emailMut = useMutation({
    mutationFn: async (payload: { to: string; cc: string; subject: string; body: string; attachments: File[] }) => {
      const form = new FormData();
      form.append("to", payload.to);
      form.append("cc", payload.cc);
      form.append("subject", payload.subject);
      form.append("body", payload.body);
      for (const file of payload.attachments) {
        form.append("attachments", file);
      }
      const res = await apiFetch(`/conversations/${cid}/messages/email`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        let msg = res.statusText;
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          // ignore malformed error body
        }
        throw new Error(msg || "No se pudo enviar correo");
      }
      return res.json();
    },
    onSuccess: () => {
      bump();
      setEmailAttachments([]);
      toast.success("Correo enviado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  // Email composer state
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [emailAttachments, setEmailAttachments] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emailFileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const qrQuery = useQuery({
    queryKey: ["settings", "quick-replies", "inbox"],
    queryFn: () => apiJson<QuickReply[]>("/settings/quick-replies"),
  });
  const quickRepliesList = qrQuery.data ?? [];

  const isEmail = conversation.channel === "EMAIL";
  const isWaiting = conversation.status === "WAITING";
  const isAssigned = conversation.status === "ASSIGNED";
  const isPrivileged =
    me?.role === "admin" || me?.role === "supervisor";
  /** Misma regla que el API: mensajes al contacto solo en ACTIVE / ON_HOLD / WRAP_UP (salvo admin/supervisor). */
  const canSendOutbound =
    isPrivileged ||
    conversation.status === "ACTIVE" ||
    conversation.status === "ON_HOLD" ||
    conversation.status === "WRAP_UP";
  /** Aceptar/rechazar solo si la asignación abierta es del usuario logueado (evita 404 en vista "Todas" u otras). */
  const acceptActionsForMe =
    isAssigned && Boolean(me?.id) && conversation.assigned_user_id === me.id;

  const terminalStatus =
    conversation.status === "RESOLVED" ||
    conversation.status === "ABANDONED" ||
    conversation.status === "TRANSFERRED";
  const cannotResolveAsAgent =
    !isPrivileged &&
    (terminalStatus ||
      conversation.status === "WAITING" ||
      conversation.status === "ASSIGNED");
  const cannotTransferAsAgent =
    !isPrivileged &&
    (terminalStatus ||
      conversation.status === "WAITING" ||
      (conversation.status === "ASSIGNED" && !acceptActionsForMe));

  // Initialize email fields from conversation
  useEffect(() => {
    if (isEmail) {
      setEmailTo(conversation.contact.email || "");
      setEmailSubject(conversation.subject ? `RE: ${conversation.subject.replace(/^RE:\s*/i, "")}` : "");
      setEmailAttachments([]);
    }
  }, [conversation.id, isEmail, conversation.contact.email, conversation.subject]);

  // Scroll to bottom (chat only)
  useEffect(() => {
    if (!isEmail) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation.messages.length, isEmail]);

  // Slash commands
  const filteredQuickReplies = useMemo(() => {
    if (!showSlashMenu) return [];
    return quickRepliesList.filter(qr =>
      qr.shortcode.toLowerCase().includes(slashFilter.toLowerCase()) ||
      qr.title.toLowerCase().includes(slashFilter.toLowerCase())
    );
  }, [showSlashMenu, slashFilter, quickRepliesList]);

  const handleMessageChange = (value: string) => {
    setMessage(value);
    if (value.startsWith("/")) {
      setShowSlashMenu(true);
      setSlashFilter(value);
    } else {
      setShowSlashMenu(false);
      setSlashFilter("");
    }
  };

  const insertQuickReply = (content: string) => {
    setMessage(content);
    setShowSlashMenu(false);
    setSlashFilter("");
    textareaRef.current?.focus();
  };

  const handleSend = () => {
    if (!message.trim()) return;
    if (!isInternal && !canSendOutbound) {
      toast.error("Acepta la conversación o espera a que esté activa para escribir al contacto.");
      return;
    }
    const text = message.trim();
    setMessage("");
    setShowSlashMenu(false);
    if (isEmail && !isInternal) {
      if (!emailTo.trim()) {
        toast.error("Indica un destinatario");
        return;
      }
      emailMut.mutate({
        to: emailTo.trim(),
        cc: emailCc.trim(),
        subject: emailSubject.trim() || "(sin asunto)",
        body: text,
        attachments: emailAttachments,
      });
      return;
    }
    sendMut.mutate({ content: text, is_internal: isInternal });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !isEmail) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      setShowSlashMenu(false);
    }
  };

  const timelineMessages = useMemo(() => {
    const history = conversation.escalation_context?.conversation_history ?? [];
    if (!history.length) return conversation.messages;

    const historyMessages: Message[] = history.map((item: EscalationHistoryItem, idx: number) => {
      const role = item.role.toLowerCase();
      const senderType: Message["sender_type"] =
        role === "assistant" ? "BOT" : role === "user" ? "CONTACT" : "SYSTEM";
      const senderName =
        senderType === "BOT"
          ? conversation.escalation_context?.agent_name || "IA"
          : senderType === "CONTACT"
            ? "Cliente"
            : undefined;
      return {
        id: `escalation-history-${conversation.id}-${idx}`,
        conversation_id: conversation.id,
        sender_type: senderType,
        sender_name: senderName,
        content: item.content,
        content_type: "TEXT",
        is_internal: false,
        delivery_status: "sent",
        created_at: item.timestamp || conversation.last_message_at,
      };
    });

    const handoffMarker: Message = {
      id: `escalation-handoff-${conversation.id}`,
      conversation_id: conversation.id,
      sender_type: "SYSTEM",
      content: "Inicio de atencion humana",
      content_type: "SYSTEM_EVENT",
      is_internal: false,
      delivery_status: "sent",
      created_at: conversation.messages[0]?.created_at || conversation.last_message_at,
    };

    return [...historyMessages, handoffMarker, ...conversation.messages];
  }, [conversation]);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b px-4 flex items-center gap-3 bg-card shrink-0 sticky top-0 z-20">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{conversation.contact.name}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {conversation.queue_name} {conversation.assigned_agent && `• ${conversation.assigned_agent}`}
            {isEmail && conversation.subject && ` • ${conversation.subject}`}
          </p>
        </div>
        <div className="ml-auto flex gap-1 shrink-0">
          {conversation.status === "ON_HOLD" ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={resumeMut.isPending}
              onClick={() => resumeMut.mutate()}
              title="Retomar"
              aria-label="Retomar"
            >
              <Play size={14} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={holdMut.isPending || conversation.status === "WAITING" || conversation.status === "RESOLVED"}
              onClick={() => holdMut.mutate()}
              title="Espera"
              aria-label="Espera"
            >
              <Pause size={14} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={cannotTransferAsAgent}
            onClick={() => setTransferOpen(true)}
            title="Transferir"
            aria-label="Transferir"
          >
            <ArrowRightLeft size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-status-online"
            disabled={cannotResolveAsAgent}
            onClick={() => setResolveOpen(true)}
            title="Resolver"
            aria-label="Resolver"
          >
            <CheckCircle size={14} />
          </Button>
        </div>
      </div>

      {/* Accept/Reject bar — shrink-0 + z-index por encima del área de scroll/composer */}
      {(isAssigned || isWaiting) && (
        <div className="relative z-30 shrink-0 bg-primary/5 border-b px-4 py-3 flex items-center justify-between gap-3 animate-slide-in-right sticky top-14">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {isWaiting
                ? "Conversación en cola"
                : acceptActionsForMe
                  ? "Conversación asignada a ti"
                  : "Conversación asignada a otro agente"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isWaiting
                ? "Esperando asignación de agente"
                : acceptActionsForMe
                  ? "Acepta para comenzar a atender"
                  : conversation.assigned_agent
                    ? `Agente: ${conversation.assigned_agent}`
                    : "No puedes aceptar esta conversación desde tu sesión."}
            </p>
          </div>
          {acceptActionsForMe && (
            <div className="flex gap-2 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-destructive"
                disabled={rejectMut.isPending || acceptMut.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  rejectMut.mutate();
                }}
              >
                <X size={14} /> Rechazar
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1"
                disabled={acceptMut.isPending || rejectMut.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  acceptMut.mutate();
                }}
              >
                <Check size={14} /> Aceptar
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ─── MESSAGE AREA ─── */}
      {isEmail ? (
        /* Email thread view */
        <EmailThreadView
          messages={conversation.messages}
          subject={conversation.subject}
          contactName={conversation.contact.name}
          contactEmail={conversation.contact.email}
          agentName={conversation.assigned_agent}
        />
      ) : (
        /* Chat bubble view */
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 scrollbar-thin bg-background">
          {timelineMessages.map(msg => {
            if (msg.sender_type === "SYSTEM") {
              const isHumanHandoffMarker =
                msg.id.startsWith("escalation-handoff-") ||
                msg.content.toLowerCase().includes("inicio de atencion humana");
              if (isHumanHandoffMarker) {
                return (
                  <div key={msg.id} className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-border" />
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                        <UserCheck size={12} />
                        Inicio de atención humana
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  </div>
                );
              }
              return (
                <div key={msg.id} className="flex justify-center">
                  <span className="text-[11px] text-muted-foreground bg-surface-system-event px-3 py-1 rounded-full">
                    {msg.content}
                  </span>
                </div>
              );
            }

            const isAgent = msg.sender_type === "AGENT";
            const isBot = msg.sender_type === "BOT";
            const isNote = msg.is_internal;
            const isOutgoingBubble = isAgent || isBot;

            return (
              <div key={msg.id} className={cn("flex", isOutgoingBubble ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[70%] rounded-lg px-3 py-2",
                  isNote && "bg-surface-internal-note border border-status-away/30",
                  isAgent && !isNote && "bg-surface-agent-msg text-primary-foreground",
                  isBot && !isNote && "bg-surface-bot-msg border",
                  !isAgent && !isBot && !isNote && "bg-surface-contact-msg",
                )}>
                  {(isBot || isNote || !isOutgoingBubble) && (
                    <div className="flex items-center gap-1 mb-1">
                      {isBot && <Bot size={12} className="text-muted-foreground" />}
                      {isNote && <StickyNote size={12} className="text-status-away" />}
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {isNote ? "Nota interna" : msg.sender_name || (isAgent ? "Agente" : "Cliente")}
                      </span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.content_type === "IMAGE" && (!msg.attachments || msg.attachments.length === 0) && (
                    <div className="mt-2 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground">
                      <ImageIcon size={12} />
                      Imagen recibida (sin URL en webhook)
                    </div>
                  )}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {msg.attachments.map((att, idx) => {
                        const hasPublicUrl = Boolean(att.url && /^https?:\/\//i.test(att.url));
                        const isImage = att.mime_type.startsWith("image/") && hasPublicUrl;
                        if (isImage) {
                          return (
                            <a
                              key={`${msg.id}-att-${idx}`}
                              href={att.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block"
                            >
                              <img
                                src={att.url}
                                alt={att.filename || "Imagen"}
                                className="max-w-full max-h-72 rounded border object-contain bg-background/40"
                                loading="lazy"
                              />
                            </a>
                          );
                        }
                        if (!hasPublicUrl) {
                          return (
                            <div key={`${msg.id}-att-${idx}`} className="text-xs text-muted-foreground">
                              {att.filename || "Adjunto"} (sin URL pública)
                            </div>
                          );
                        }
                        return (
                          <a
                            key={`${msg.id}-att-${idx}`}
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-xs underline"
                          >
                            {att.filename || "Adjunto"}
                          </a>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-1 mt-1">
                    {isAgent && !isNote && msg.delivery_status === "read" && <Check size={10} className="text-primary-foreground/60" />}
                    {isAgent && !isNote && msg.delivery_status === "delivered" && <Check size={10} className="text-primary-foreground/60" />}
                    <span className={cn("text-[10px]", isAgent && !isNote ? "text-primary-foreground/60" : "text-muted-foreground")}>
                      {new Date(msg.created_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {timelineMessages.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {isWaiting ? "Conversación en cola — esperando asignación" : "Sin mensajes aún"}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* ─── COMPOSER ─── */}
      <div className="shrink-0 border-t bg-card">
        {/* Tab switcher */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-1">
          <button
            onClick={() => setIsInternal(false)}
            className={cn("text-xs font-medium px-2 py-1 rounded transition-colors",
              !isInternal ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {isEmail ? "Responder" : "Respuesta"}
          </button>
          <button
            onClick={() => setIsInternal(true)}
            className={cn("text-xs font-medium px-2 py-1 rounded transition-colors flex items-center gap-1",
              isInternal ? "bg-surface-internal-note text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <StickyNote size={12} /> Nota interna
          </button>
          {!isEmail && (
            <span className="text-[10px] text-muted-foreground ml-auto">
              Escribe <code className="bg-muted px-1 rounded">/</code> para respuestas rápidas
            </span>
          )}
        </div>

        {/* Email-specific header fields */}
        {isEmail && !isInternal && (
          <div className="px-3 pt-1 space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-12 shrink-0 text-right">Para:</span>
              <Input
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="h-7 text-xs border-none bg-muted/30 focus-visible:ring-1"
                placeholder="destinatario@email.com"
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-1.5 shrink-0"
                onClick={() => setShowCc(!showCc)}
              >
                CC
              </Button>
            </div>
            {showCc && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-12 shrink-0 text-right">CC:</span>
                <Input
                  value={emailCc}
                  onChange={(e) => setEmailCc(e.target.value)}
                  className="h-7 text-xs border-none bg-muted/30 focus-visible:ring-1"
                  placeholder="cc@email.com"
                />
              </div>
            )}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-12 shrink-0 text-right">Asunto:</span>
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="h-7 text-xs border-none bg-muted/30 focus-visible:ring-1"
                placeholder="Asunto del correo"
              />
            </div>
          </div>
        )}

        {/* Rich text toolbar for email */}
        {isEmail && !isInternal && (
          <div className="flex items-center gap-0.5 px-3 pt-2 pb-1 border-b mx-3">
            <Button variant="ghost" size="icon" className="h-7 w-7"><Bold size={13} /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7"><Italic size={13} /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7"><Underline size={13} /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7"><Strikethrough size={13} /></Button>
            <div className="w-px h-4 bg-border mx-1" />
            <Button variant="ghost" size="icon" className="h-7 w-7"><List size={13} /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7"><AlignLeft size={13} /></Button>
            <div className="w-px h-4 bg-border mx-1" />
            <Button variant="ghost" size="icon" className="h-7 w-7"><LinkIcon size={13} /></Button>
            <div className="w-px h-4 bg-border mx-1" />
            <Popover open={templateOpen} onOpenChange={setTemplateOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                  <FileText size={13} /> Plantilla
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3" align="start">
                <EmailTemplateSelector
                  onSelect={(t: EmailTemplate) => {
                    setEmailSubject(t.subject);
                    setMessage(t.body);
                    setTemplateOpen(false);
                  }}
                  onClose={() => setTemplateOpen(false)}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        <div className="px-3 pb-3 pt-2">
          <div className="relative">
            {/* Slash command menu */}
            {showSlashMenu && (
              <div className="absolute bottom-full mb-1 left-0 w-full bg-card border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto scrollbar-thin">
                {qrQuery.isLoading ? (
                  <p className="p-3 text-xs text-muted-foreground">Cargando respuestas rápidas…</p>
                ) : filteredQuickReplies.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    No hay respuestas rápidas. Configúralas en Configuración → General (respuestas rápidas).
                  </p>
                ) : (
                  filteredQuickReplies.map((qr) => (
                    <button
                      key={qr.id}
                      type="button"
                      onClick={() => insertQuickReply(qr.content)}
                      className="w-full text-left px-3 py-2 hover:bg-muted transition-colors flex items-center gap-3 border-b last:border-0"
                    >
                      <span className="text-xs font-mono text-primary shrink-0">{qr.shortcode}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{qr.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{qr.content}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => {
                  if (isEmail && !isInternal) emailFileInputRef.current?.click();
                }}
              >
                <Paperclip size={16} />
              </Button>
              <input
                ref={emailFileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (!files.length) return;
                  setEmailAttachments((prev) => [...prev, ...files].slice(0, 10));
                  e.currentTarget.value = "";
                }}
              />
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={e => handleMessageChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isInternal
                    ? "Escribir nota interna..."
                    : isEmail
                      ? "Redactar cuerpo del correo..."
                      : "Escribir mensaje..."
                }
                className={cn(
                  "min-h-[36px] max-h-[200px] resize-none text-sm",
                  isInternal && "bg-surface-internal-note/30 border-status-away/30",
                  isEmail && !isInternal && "min-h-[80px]",
                )}
                rows={isEmail ? 4 : 1}
              />
              <Button
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={
                  !message.trim() ||
                  sendMut.isPending ||
                  emailMut.isPending ||
                  (!isInternal && !canSendOutbound)
                }
                onClick={handleSend}
                title={isEmail ? "Enviar correo" : "Enviar mensaje"}
              >
                <Send size={16} />
              </Button>
            </div>
            {isEmail && !isInternal && emailAttachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {emailAttachments.map((f, idx) => (
                  <button
                    key={`${f.name}-${idx}`}
                    type="button"
                    className="text-xs px-2 py-1 rounded border bg-muted/40 hover:bg-muted"
                    onClick={() => setEmailAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    title="Quitar adjunto"
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        conversationId={cid}
        conversationContact={conversation.contact.name}
      />
      <ResolveDialog
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        conversationId={cid}
        conversationContact={conversation.contact.name}
      />
    </div>
  );
}
