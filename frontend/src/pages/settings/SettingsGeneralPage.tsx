import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { BusinessHours, Disposition, QuickReply, SlaPolicy } from "@/data/mock";
import type { ChannelType } from "@/data/mock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit2, Trash2, Clock, MessageCircle, FileCheck, Calendar } from "lucide-react";
import { apiJson } from "@/lib/api";

const BH_DEFAULT_SCHEDULE = {
  monday: [{ start: "09:00", end: "18:00" }],
  tuesday: [{ start: "09:00", end: "18:00" }],
  wednesday: [{ start: "09:00", end: "18:00" }],
  thursday: [{ start: "09:00", end: "18:00" }],
  friday: [{ start: "09:00", end: "18:00" }],
  saturday: [] as { start: string; end: string }[],
  sunday: [] as { start: string; end: string }[],
};

const CHANNELS: ChannelType[] = ["WHATSAPP", "EMAIL", "VOICE", "WEBCHAT", "TEAMS"];

export default function SettingsGeneralPage() {
  const qc = useQueryClient();
  const invalidate = (key: readonly string[]) => void qc.invalidateQueries({ queryKey: key });

  const dispQuery = useQuery({
    queryKey: ["settings", "dispositions", "all"],
    queryFn: () => apiJson<Disposition[]>("/settings/dispositions"),
  });
  const slaQuery = useQuery({
    queryKey: ["settings", "sla-policies"],
    queryFn: () => apiJson<SlaPolicy[]>("/settings/sla-policies"),
  });
  const qrQuery = useQuery({
    queryKey: ["settings", "quick-replies"],
    queryFn: () => apiJson<QuickReply[]>("/settings/quick-replies"),
  });
  const bhQuery = useQuery({
    queryKey: ["settings", "business-hours"],
    queryFn: () => apiJson<BusinessHours[]>("/settings/business-hours"),
  });

  const [dispOpen, setDispOpen] = useState(false);
  const [editingDisp, setEditingDisp] = useState<Disposition | null>(null);
  const [dName, setDName] = useState("");
  const [dCat, setDCat] = useState("general");
  const [dNote, setDNote] = useState(false);
  const [dActive, setDActive] = useState(true);

  const dispSave = useMutation({
    mutationFn: async () => {
      const body = { name: dName.trim(), category: dCat, requires_note: dNote, is_active: dActive };
      if (editingDisp) {
        await apiJson(`/settings/dispositions/${editingDisp.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiJson("/settings/dispositions", { method: "POST", body: JSON.stringify(body) });
      }
    },
    onSuccess: () => {
      invalidate(["settings", "dispositions", "all"]);
      toast.success(editingDisp ? "Disposición actualizada" : "Disposición creada");
      setDispOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dispDel = useMutation({
    mutationFn: (id: string) => apiJson(`/settings/dispositions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["settings", "dispositions", "all"]);
      toast.success("Eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [slaOpen, setSlaOpen] = useState(false);
  const [editingSla, setEditingSla] = useState<SlaPolicy | null>(null);
  const [sName, setSName] = useState("");
  const [sFirst, setSFirst] = useState(300);
  const [sRes, setSRes] = useState(3600);
  const [sWarn, setSWarn] = useState(80);

  const slaSave = useMutation({
    mutationFn: async () => {
      const body = {
        name: sName.trim(),
        first_response_seconds: sFirst,
        resolution_seconds: sRes,
        warning_threshold_pct: sWarn,
      };
      if (editingSla) {
        await apiJson(`/settings/sla-policies/${editingSla.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiJson("/settings/sla-policies", { method: "POST", body: JSON.stringify(body) });
      }
    },
    onSuccess: () => {
      invalidate(["settings", "sla-policies"]);
      toast.success(editingSla ? "Política actualizada" : "Política creada");
      setSlaOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const slaDel = useMutation({
    mutationFn: (id: string) => apiJson(`/settings/sla-policies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["settings", "sla-policies"]);
      toast.success("Política eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [qrOpen, setQrOpen] = useState(false);
  const [editingQr, setEditingQr] = useState<QuickReply | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [qrTitle, setQrTitle] = useState("");
  const [qrContent, setQrContent] = useState("");
  const [qrChannel, setQrChannel] = useState<string>("__all__");
  const [qrCat, setQrCat] = useState("");

  const qrSave = useMutation({
    mutationFn: async () => {
      const body = {
        shortcode: qrCode.trim(),
        title: qrTitle.trim(),
        content: qrContent,
        channel: qrChannel === "__all__" ? null : qrChannel,
        category: qrCat.trim() || null,
      };
      if (editingQr) {
        await apiJson(`/settings/quick-replies/${editingQr.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiJson("/settings/quick-replies", { method: "POST", body: JSON.stringify(body) });
      }
    },
    onSuccess: () => {
      invalidate(["settings", "quick-replies"]);
      invalidate(["settings", "quick-replies", "inbox"]);
      invalidate(["settings", "quick-replies", "context-panel"]);
      toast.success(editingQr ? "Respuesta actualizada" : "Respuesta creada");
      setQrOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const qrDel = useMutation({
    mutationFn: (id: string) => apiJson(`/settings/quick-replies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["settings", "quick-replies"]);
      invalidate(["settings", "quick-replies", "inbox"]);
      invalidate(["settings", "quick-replies", "context-panel"]);
      toast.success("Eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [bhOpen, setBhOpen] = useState(false);
  const [editingBh, setEditingBh] = useState<BusinessHours | null>(null);
  const [bhName, setBhName] = useState("");
  const [bhTz, setBhTz] = useState("America/Guayaquil");
  const [bhJson, setBhJson] = useState("");

  const bhSave = useMutation({
    mutationFn: async () => {
      let schedule: unknown;
      try {
        schedule = JSON.parse(bhJson) as unknown;
      } catch {
        throw new Error("JSON de horario inválido");
      }
      const body = { name: bhName.trim(), timezone: bhTz, schedule };
      if (editingBh) {
        await apiJson(`/settings/business-hours/${editingBh.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiJson("/settings/business-hours", { method: "POST", body: JSON.stringify(body) });
      }
    },
    onSuccess: () => {
      invalidate(["settings", "business-hours"]);
      toast.success(editingBh ? "Horario actualizado" : "Horario creado");
      setBhOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dispositions = dispQuery.data ?? [];
  const slaPolicies = slaQuery.data ?? [];
  const quickReplies = qrQuery.data ?? [];
  const businessHours = bhQuery.data ?? [];

  const err = dispQuery.error || slaQuery.error || qrQuery.error || bhQuery.error;

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <h1 className="text-xl font-bold">Configuración general</h1>
      {err && <p className="text-sm text-destructive">{(err as Error).message}</p>}

      <Tabs defaultValue="dispositions">
        <TabsList>
          <TabsTrigger value="dispositions" className="gap-1">
            <FileCheck size={12} /> Disposiciones
          </TabsTrigger>
          <TabsTrigger value="sla" className="gap-1">
            <Clock size={12} /> SLA
          </TabsTrigger>
          <TabsTrigger value="quick-replies" className="gap-1">
            <MessageCircle size={12} /> Respuestas rápidas
          </TabsTrigger>
          <TabsTrigger value="hours" className="gap-1">
            <Calendar size={12} /> Horarios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dispositions" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1"
              variant="outline"
              onClick={() => {
                setEditingDisp(null);
                setDName("");
                setDCat("general");
                setDNote(false);
                setDActive(true);
                setDispOpen(true);
              }}
            >
              <Plus size={14} /> Nueva disposición
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {dispQuery.isLoading && <p className="p-4 text-sm text-muted-foreground">Cargando…</p>}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left p-3 font-medium">Nombre</th>
                    <th className="text-left p-3 font-medium">Categoría</th>
                    <th className="text-center p-3 font-medium">Requiere nota</th>
                    <th className="text-center p-3 font-medium">Estado</th>
                    <th className="text-center p-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {dispositions.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="p-3 font-medium">{d.name}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className="text-[10px]">
                          {d.category}
                        </Badge>
                      </td>
                      <td className="text-center p-3">{d.requires_note ? "Sí" : "No"}</td>
                      <td className="text-center p-3">
                        <Badge variant={d.is_active ? "default" : "secondary"} className="text-[10px]">
                          {d.is_active ? "Activa" : "Inactiva"}
                        </Badge>
                      </td>
                      <td className="text-center p-3">
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingDisp(d);
                              setDName(d.name);
                              setDCat(d.category);
                              setDNote(d.requires_note);
                              setDActive(d.is_active);
                              setDispOpen(true);
                            }}
                          >
                            <Edit2 size={12} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            disabled={dispDel.isPending}
                            onClick={() => {
                              if (window.confirm(`¿Eliminar «${d.name}»?`)) dispDel.mutate(d.id);
                            }}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sla" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1"
              variant="outline"
              onClick={() => {
                setEditingSla(null);
                setSName("");
                setSFirst(300);
                setSRes(3600);
                setSWarn(80);
                setSlaOpen(true);
              }}
            >
              <Plus size={14} /> Nueva política
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {slaQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando SLA…</p>}
            {slaPolicies.map((s) => (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{s.name}</CardTitle>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingSla(s);
                          setSName(s.name);
                          setSFirst(s.first_response_seconds);
                          setSRes(s.resolution_seconds);
                          setSWarn(s.warning_threshold_pct);
                          setSlaOpen(true);
                        }}
                      >
                        <Edit2 size={12} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        disabled={slaDel.isPending}
                        onClick={() => {
                          if (window.confirm(`¿Eliminar política «${s.name}»?`)) slaDel.mutate(s.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted rounded p-2">
                      <p className="text-muted-foreground">1ra respuesta</p>
                      <p className="font-medium">
                        {s.first_response_seconds < 3600
                          ? `${s.first_response_seconds}s`
                          : `${Math.floor(s.first_response_seconds / 3600)}h`}
                      </p>
                    </div>
                    <div className="bg-muted rounded p-2">
                      <p className="text-muted-foreground">Resolución</p>
                      <p className="font-medium">
                        {s.resolution_seconds < 3600
                          ? `${Math.floor(s.resolution_seconds / 60)}m`
                          : `${Math.floor(s.resolution_seconds / 3600)}h`}
                      </p>
                    </div>
                    <div className="bg-muted rounded p-2 col-span-2">
                      <p className="text-muted-foreground">Umbral de alerta</p>
                      <p className="font-medium">{s.warning_threshold_pct}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="quick-replies" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1"
              variant="outline"
              onClick={() => {
                setEditingQr(null);
                setQrCode("");
                setQrTitle("");
                setQrContent("");
                setQrChannel("__all__");
                setQrCat("");
                setQrOpen(true);
              }}
            >
              <Plus size={14} /> Nueva respuesta
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {qrQuery.isLoading && <p className="p-4 text-sm text-muted-foreground">Cargando…</p>}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left p-3 font-medium">Shortcode</th>
                    <th className="text-left p-3 font-medium">Título</th>
                    <th className="text-left p-3 font-medium">Contenido</th>
                    <th className="text-center p-3 font-medium">Canal</th>
                    <th className="text-center p-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {quickReplies.map((qr) => (
                    <tr key={qr.id} className="border-b last:border-0">
                      <td className="p-3 font-mono text-primary text-xs">{qr.shortcode}</td>
                      <td className="p-3 font-medium">{qr.title}</td>
                      <td className="p-3 text-muted-foreground max-w-xs truncate">{qr.content}</td>
                      <td className="text-center p-3">{qr.channel || "Todos"}</td>
                      <td className="text-center p-3">
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingQr(qr);
                              setQrCode(qr.shortcode);
                              setQrTitle(qr.title);
                              setQrContent(qr.content);
                              setQrChannel(qr.channel ?? "__all__");
                              setQrCat(qr.category ?? "");
                              setQrOpen(true);
                            }}
                          >
                            <Edit2 size={12} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            disabled={qrDel.isPending}
                            onClick={() => {
                              if (window.confirm("¿Eliminar esta respuesta rápida?")) qrDel.mutate(qr.id);
                            }}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hours" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1"
              variant="outline"
              onClick={() => {
                setEditingBh(null);
                setBhName("");
                setBhTz("America/Guayaquil");
                setBhJson(JSON.stringify(BH_DEFAULT_SCHEDULE, null, 2));
                setBhOpen(true);
              }}
            >
              <Plus size={14} /> Nuevo horario
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {bhQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando horarios…</p>}
            {businessHours.map((bh) => (
              <Card key={bh.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{bh.name}</CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditingBh(bh);
                        setBhName(bh.name);
                        setBhTz(bh.timezone);
                        setBhJson(JSON.stringify(bh.schedule ?? BH_DEFAULT_SCHEDULE, null, 2));
                        setBhOpen(true);
                      }}
                    >
                      <Edit2 size={12} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-2">Zona horaria: {bh.timezone}</p>
                  <div className="space-y-1 text-xs">
                    {typeof bh.schedule === "object" &&
                      bh.schedule !== null &&
                      Object.entries(bh.schedule as Record<string, { start: string; end: string }[]>).map(([day, slots]) => (
                        <div key={day} className="flex items-center justify-between gap-2">
                          <span className="capitalize text-muted-foreground w-24 shrink-0">{day}</span>
                          <span className="font-medium text-right">
                            {Array.isArray(slots) ? slots.map((slot) => `${slot.start} - ${slot.end}`).join(", ") : "—"}
                          </span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={dispOpen} onOpenChange={setDispOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDisp ? "Editar disposición" : "Nueva disposición"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={dName} onChange={(e) => setDName(e.target.value)} className="h-8 text-sm" disabled={!!editingDisp} />
            </div>
            <div>
              <Label className="text-xs">Categoría</Label>
              <Input value={dCat} onChange={(e) => setDCat(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="dn" checked={dNote} onCheckedChange={(c) => setDNote(Boolean(c))} />
              <Label htmlFor="dn" className="text-xs">
                Requiere nota
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="da" checked={dActive} onCheckedChange={(c) => setDActive(Boolean(c))} />
              <Label htmlFor="da" className="text-xs">
                Activa
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDispOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => dispSave.mutate()}
              disabled={!dName.trim() || dispSave.isPending || (editingDisp && !dName.trim())}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={slaOpen} onOpenChange={setSlaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSla ? "Editar política SLA" : "Nueva política SLA"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={sName} onChange={(e) => setSName(e.target.value)} className="h-8 text-sm" disabled={!!editingSla} />
            </div>
            <div>
              <Label className="text-xs">Primera respuesta (segundos)</Label>
              <Input type="number" value={sFirst} onChange={(e) => setSFirst(Number(e.target.value))} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Resolución (segundos)</Label>
              <Input type="number" value={sRes} onChange={(e) => setSRes(Number(e.target.value))} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Umbral alerta (%)</Label>
              <Input type="number" min={1} max={100} value={sWarn} onChange={(e) => setSWarn(Number(e.target.value))} className="h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSlaOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => slaSave.mutate()} disabled={!sName.trim() || slaSave.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingQr ? "Editar respuesta rápida" : "Nueva respuesta rápida"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Shortcode</Label>
              <Input value={qrCode} onChange={(e) => setQrCode(e.target.value)} className="h-8 text-sm font-mono" disabled={!!editingQr} />
            </div>
            <div>
              <Label className="text-xs">Título</Label>
              <Input value={qrTitle} onChange={(e) => setQrTitle(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Contenido</Label>
              <Textarea value={qrContent} onChange={(e) => setQrContent(e.target.value)} className="min-h-[100px] text-sm" />
            </div>
            <div>
              <Label className="text-xs">Canal</Label>
              <Select value={qrChannel} onValueChange={setQrChannel}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Categoría (opcional)</Label>
              <Input value={qrCat} onChange={(e) => setQrCat(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setQrOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => qrSave.mutate()} disabled={!qrCode.trim() || !qrTitle.trim() || !qrContent.trim() || qrSave.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bhOpen} onOpenChange={setBhOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBh ? "Editar horario" : "Nuevo horario laboral"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={bhName} onChange={(e) => setBhName(e.target.value)} className="h-8 text-sm" disabled={!!editingBh} />
            </div>
            <div>
              <Label className="text-xs">Zona horaria</Label>
              <Input value={bhTz} onChange={(e) => setBhTz(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Schedule (JSON)</Label>
              <Textarea value={bhJson} onChange={(e) => setBhJson(e.target.value)} className="min-h-[200px] text-xs font-mono" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBhOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => bhSave.mutate()} disabled={!bhName.trim() || bhSave.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
