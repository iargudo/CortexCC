import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ChannelType, Contact } from "@/data/mock";
import { ChannelBadge, ChannelIcon } from "@/components/ChannelIcon";
import { ConversationStatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User, Mail, Phone, Tag, Clock, MessageSquare, Plus, X, Edit2,
  ExternalLink, Calendar, FileText, Bot, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiJson } from "@/lib/api";

type TimelineRow = {
  id: string;
  status: string;
  created_at: string;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  channel: { type: ChannelType };
};

type NoteRow = {
  id: string;
  content: string;
  created_at: string;
  author: { first_name: string; last_name: string } | null;
};

interface Props {
  contact: Contact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactDetailDrawer({ contact, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [newTag, setNewTag] = useState("");
  const [tags, setTags] = useState(contact.tags ?? []);
  const [newNote, setNewNote] = useState("");

  const detailQuery = useQuery({
    queryKey: ["contacts", contact.id, "detail"],
    queryFn: () => apiJson<Contact>(`/contacts/${contact.id}`),
    enabled: open,
  });

  const display = detailQuery.data ?? contact;

  useEffect(() => {
    setTags((detailQuery.data ?? contact).tags ?? []);
  }, [contact.id, detailQuery.data, contact]);

  const timelineQuery = useQuery({
    queryKey: ["contacts", contact.id, "timeline"],
    queryFn: () => apiJson<TimelineRow[]>(`/contacts/${contact.id}/timeline`),
    enabled: open,
  });
  const notesQuery = useQuery({
    queryKey: ["contacts", contact.id, "notes"],
    queryFn: () => apiJson<NoteRow[]>(`/contacts/${contact.id}/notes`),
    enabled: open,
  });

  const timeline = timelineQuery.data ?? [];
  const ongoingStatuses = new Set(["WAITING", "ASSIGNED", "ACTIVE", "ON_HOLD"]);
  const active = timeline.filter((t) => ongoingStatuses.has(t.status));
  const historical = timeline.filter((t) => !ongoingStatuses.has(t.status));

  const tagsMut = useMutation({
    mutationFn: (next: string[]) =>
      apiJson<Contact>(`/contacts/${contact.id}/tags`, {
        method: "PUT",
        body: JSON.stringify({ tags: next }),
      }),
    onSuccess: (c) => {
      setTags(c.tags ?? []);
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      void qc.invalidateQueries({ queryKey: ["contacts", contact.id, "detail"] });
      toast.success("Tags actualizados");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const noteMut = useMutation({
    mutationFn: (content: string) =>
      apiJson(`/contacts/${contact.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      setNewNote("");
      void qc.invalidateQueries({ queryKey: ["contacts", contact.id, "notes"] });
      toast.success("Nota agregada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      const next = [...tags, newTag.trim()];
      setTags(next);
      setNewTag("");
      tagsMut.mutate(next);
    }
  };

  const removeTag = (tag: string) => {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    tagsMut.mutate(next);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
              {(display.name || "?")
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .map((n) => n[0])
                .join("")
                .slice(0, 2) || "?"}
            </div>
            <div>
              <p className="text-base font-semibold">{display.name || "Sin nombre"}</p>
              <p className="text-xs text-muted-foreground font-normal">{display.source_system || "Directo"}</p>
            </div>
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="info" className="mt-4">
          <TabsList className="w-full">
            <TabsTrigger value="info" className="flex-1 text-xs">Info</TabsTrigger>
            <TabsTrigger value="history" className="flex-1 text-xs">Historial ({timeline.length})</TabsTrigger>
            <TabsTrigger value="notes" className="flex-1 text-xs">Notas</TabsTrigger>
          </TabsList>

          {/* Info tab */}
          <TabsContent value="info" className="mt-3 space-y-4">
            <div className="space-y-2.5">
              {display.email && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Mail size={14} className="text-muted-foreground shrink-0" />
                  <span>{display.email}</span>
                </div>
              )}
              {display.phone && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Phone size={14} className="text-muted-foreground shrink-0" />
                  <span className="font-mono">{display.phone}</span>
                </div>
              )}
              {display.phone_wa && display.phone_wa !== display.phone && (
                <div className="flex items-center gap-2.5 text-sm">
                  <MessageSquare size={14} className="text-muted-foreground shrink-0" />
                  <span className="font-mono">{display.phone_wa}</span>
                  <span className="text-[10px] text-muted-foreground">(WhatsApp)</span>
                </div>
              )}
              {display.teams_id && (
                <div className="flex items-center gap-2.5 text-sm">
                  <User size={14} className="text-muted-foreground shrink-0" />
                  <span>{display.teams_id}</span>
                  <span className="text-[10px] text-muted-foreground">(Teams)</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Editable tags */}
            <div>
              <p className="text-xs font-medium mb-2 flex items-center gap-1">
                <Tag size={12} /> Etiquetas
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs px-2 py-0.5 gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-destructive"
                      aria-label={`Quitar etiqueta ${tag}`}
                    >
                      <X size={10} />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  placeholder="Nueva etiqueta..."
                  className="h-7 text-xs"
                  onKeyDown={e => e.key === "Enter" && addTag()}
                />
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={addTag}>
                  <Plus size={12} />
                </Button>
              </div>
            </div>

            <Separator />

            {/* Summary stats */}
            <div>
              <p className="text-xs font-medium mb-2">Resumen</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                  <p className="text-lg font-bold">{timeline.length}</p>
                  <p className="text-[10px] text-muted-foreground">Interacciones totales</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                  <p className="text-lg font-bold">{active.length}</p>
                  <p className="text-[10px] text-muted-foreground">Activas ahora</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                  <p className="text-lg font-bold">4.3</p>
                  <p className="text-[10px] text-muted-foreground">CSAT promedio</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                  <p className="text-lg font-bold">11m</p>
                  <p className="text-[10px] text-muted-foreground">AHT promedio</p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* History tab */}
          <TabsContent value="history" className="mt-3">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

              <div className="space-y-0">
                {/* Active conversations */}
                {timelineQuery.isLoading && (
                  <p className="text-xs text-muted-foreground pl-10">Cargando historial…</p>
                )}
                {!timelineQuery.isLoading && timeline.length === 0 && (
                  <p className="text-xs text-muted-foreground pl-10">No hay conversaciones asociadas a este contacto.</p>
                )}
                {active.map((conv) => (
                  <div key={conv.id} className="relative pl-10 pb-4">
                    <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full bg-primary ring-2 ring-background" />
                    <div className="border rounded-lg p-3 bg-primary/5">
                      <div className="flex items-center gap-2 mb-1">
                        <ChannelIcon channel={conv.channel.type} size={12} />
                        <span className="text-xs font-medium">
                          {conv.status === "WAITING" ? "En cola" : "Conversación activa"}
                        </span>
                        <ConversationStatusBadge status={conv.status as never} />
                      </div>
                      <p className="text-xs text-muted-foreground">{conv.last_message_preview || "—"}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                        <Calendar size={10} />
                        <span>
                          {new Date(conv.last_message_at ?? conv.created_at).toLocaleDateString("es", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                {historical.map((h) => (
                  <div key={h.id} className="relative pl-10 pb-4">
                    <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full bg-muted ring-2 ring-background" />
                    <div className="border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <ChannelIcon channel={h.channel.type} size={12} />
                        <span className="text-xs font-medium">Historial</span>
                        <ConversationStatusBadge status={h.status as never} />
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                        <span>
                          {new Date(h.created_at).toLocaleDateString("es", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Notes tab */}
          <TabsContent value="notes" className="mt-3 space-y-3">
            <div className="space-y-2">
              {notesQuery.isLoading && <p className="text-xs text-muted-foreground">Cargando notas…</p>}
              {(notesQuery.data ?? []).map((note) => (
                <div key={note.id} className="border rounded-lg p-3">
                  <p className="text-sm">{note.content}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                    <span>
                      {note.author
                        ? `${note.author.first_name} ${note.author.last_name}`.trim()
                        : "Sistema"}
                    </span>
                    <span>• {new Date(note.created_at).toLocaleDateString("es")}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Agregar nota..."
                className="h-8 text-xs"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                disabled={!newNote.trim() || noteMut.isPending}
                onClick={() => noteMut.mutate(newNote.trim())}
              >
                Agregar
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
