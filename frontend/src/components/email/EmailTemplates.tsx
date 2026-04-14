import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2, FileText, Variable } from "lucide-react";
import { apiJson } from "@/lib/api";

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  variables: string[];
}

type ApiEmailTemplate = EmailTemplate;

const EMAIL_TEMPLATES_KEY = ["settings", "email-templates"] as const;

function mapTemplate(t: ApiEmailTemplate): EmailTemplate {
  return {
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    category: t.category || "general",
    variables: Array.isArray(t.variables) ? t.variables : [],
  };
}

interface TemplateSelectorProps {
  onSelect: (template: EmailTemplate) => void;
  onClose: () => void;
}

export function EmailTemplateSelector({ onSelect, onClose }: TemplateSelectorProps) {
  const [filter, setFilter] = useState("");
  const q = useQuery({
    queryKey: EMAIL_TEMPLATES_KEY,
    queryFn: () => apiJson<ApiEmailTemplate[]>("/settings/email-templates"),
  });
  const templates = (q.data ?? []).map(mapTemplate);
  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(filter.toLowerCase()) ||
      t.category.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <Input
        placeholder="Buscar plantilla..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="h-7 text-xs"
      />
      {q.isLoading && <p className="text-xs text-muted-foreground py-2">Cargando plantillas…</p>}
      {q.error && <p className="text-xs text-destructive py-2">{(q.error as Error).message}</p>}
      <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
        {filtered.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              onSelect(t);
              onClose();
            }}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors border"
          >
            <div className="flex items-center gap-2">
              <FileText size={12} className="text-muted-foreground shrink-0" />
              <span className="text-xs font-medium">{t.name}</span>
              <Badge variant="secondary" className="text-[9px] ml-auto">{t.category}</Badge>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{t.subject}</p>
          </button>
        ))}
        {!q.isLoading && filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">No se encontraron plantillas</p>
        )}
      </div>
    </div>
  );
}

export function EmailTemplatesManager() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: EMAIL_TEMPLATES_KEY,
    queryFn: () => apiJson<ApiEmailTemplate[]>("/settings/email-templates"),
  });
  const templates = (q.data ?? []).map(mapTemplate);

  const [editOpen, setEditOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [formName, setFormName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formCategory, setFormCategory] = useState("");

  const createMut = useMutation({
    mutationFn: (body: { name: string; subject: string; body: string; category: string; variables: string[] }) =>
      apiJson<ApiEmailTemplate>("/settings/email-templates", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: EMAIL_TEMPLATES_KEY });
      toast.success("Plantilla creada");
      setEditOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (args: { id: string; body: Record<string, unknown> }) =>
      apiJson<ApiEmailTemplate>(`/settings/email-templates/${args.id}`, {
        method: "PUT",
        body: JSON.stringify(args.body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: EMAIL_TEMPLATES_KEY });
      toast.success("Plantilla actualizada");
      setEditOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      apiJson(`/settings/email-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: EMAIL_TEMPLATES_KEY });
      toast.success("Plantilla eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditingTemplate(null);
    setFormName("");
    setFormSubject("");
    setFormBody("");
    setFormCategory("general");
    setEditOpen(true);
  };

  const openEdit = (t: EmailTemplate) => {
    setEditingTemplate(t);
    setFormName(t.name);
    setFormSubject(t.subject);
    setFormBody(t.body);
    setFormCategory(t.category);
    setEditOpen(true);
  };

  const extractVariables = (text: string): string[] => {
    const matches = text.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))];
  };

  const handleSave = () => {
    const vars = extractVariables(`${formSubject} ${formBody}`);
    const payload = {
      name: formName,
      subject: formSubject,
      body: formBody,
      category: formCategory,
      variables: vars,
    };
    if (editingTemplate) {
      updateMut.mutate({ id: editingTemplate.id, body: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1" onClick={openNew}>
          <Plus size={14} /> Nueva plantilla
        </Button>
      </div>

      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.isLoading && <p className="text-sm text-muted-foreground">Cargando plantillas…</p>}

      <div className="space-y-2">
        {templates.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">{t.name}</span>
                <Badge variant="secondary" className="text-[9px]">{t.category}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate ml-6">{t.subject}</p>
              <div className="flex flex-wrap gap-1 mt-1 ml-6">
                {t.variables.map((v) => (
                  <span key={v} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-1 shrink-0 ml-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                <Edit2 size={12} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate(t.id)}
              >
                <Trash2 size={12} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Editar plantilla" : "Nueva plantilla de email"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="h-8 text-sm"
                  placeholder="Nombre de la plantilla"
                />
              </div>
              <div>
                <Label className="text-xs">Categoría</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="facturación">Facturación</SelectItem>
                    <SelectItem value="cobranza">Cobranza</SelectItem>
                    <SelectItem value="soporte">Soporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Asunto</Label>
              <Input
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
                className="h-8 text-sm font-mono"
                placeholder="RE: {{variable}}"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                Cuerpo
                <span className="text-muted-foreground font-normal">— Usa {"{{variable}}"} para campos dinámicos</span>
              </Label>
              <Textarea value={formBody} onChange={(e) => setFormBody(e.target.value)} className="min-h-[160px] text-sm font-mono" />
            </div>
            {(formSubject + formBody).includes("{{") && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Variables detectadas:</p>
                <div className="flex flex-wrap gap-1">
                  {extractVariables(`${formSubject} ${formBody}`).map((v) => (
                    <Badge key={v} variant="secondary" className="text-[9px] font-mono gap-1">
                      <Variable size={8} /> {v}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formName || !formSubject || !formBody || saving}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
