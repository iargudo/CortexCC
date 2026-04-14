import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Disposition } from "@/data/mock";
import { apiJson } from "@/lib/api";
import { CheckCircle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  conversationContact: string;
}

export function ResolveDialog({
  open,
  onOpenChange,
  conversationId,
  conversationContact,
}: Props) {
  const qc = useQueryClient();
  const [dispositionId, setDispositionId] = useState("");
  const [notes, setNotes] = useState("");
  const [sendCsat, setSendCsat] = useState(true);

  const dispQuery = useQuery({
    queryKey: ["settings", "dispositions", "all"],
    enabled: open,
    queryFn: () => apiJson<Disposition[]>("/settings/dispositions"),
  });

  const dispositions = dispQuery.data ?? [];

  const resolveMut = useMutation({
    mutationFn: () =>
      apiJson(`/conversations/${conversationId}/resolve`, {
        method: "POST",
        body: JSON.stringify({
          disposition_id: dispositionId,
          note: notes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      toast.success(sendCsat ? "Conversación resuelta (CSAT pendiente de canal)" : "Conversación resuelta");
      onOpenChange(false);
      setDispositionId("");
      setNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedDisp = dispositions.find((d) => d.id === dispositionId);

  const handleResolve = () => {
    resolveMut.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle size={16} className="text-status-online" /> Resolver conversación
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Resolver la conversación con{" "}
            <span className="font-medium text-foreground">{conversationContact}</span>
          </p>

          <div className="space-y-2">
            <Label className="text-sm">Disposición *</Label>
            {dispQuery.isLoading && <p className="text-xs text-muted-foreground">Cargando disposiciones…</p>}
            {dispQuery.error && (
              <p className="text-xs text-destructive">{(dispQuery.error as Error).message}</p>
            )}
            {!dispQuery.isLoading && dispositions.filter((d) => d.is_active).length === 0 && (
              <p className="text-xs text-amber-600">
                No hay disposiciones activas. Crea al menos una en Configuración → General.
              </p>
            )}
            <Select value={dispositionId} onValueChange={setDispositionId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Seleccionar disposición..." />
              </SelectTrigger>
              <SelectContent>
                {dispositions
                  .filter((d) => d.is_active)
                  .map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      <div className="flex items-center gap-2">
                        <span>{d.name}</span>
                        <span className="text-muted-foreground text-xs">({d.category})</span>
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">
              Notas de cierre{" "}
              {selectedDisp?.requires_note && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Resumen de la atención brindada..."
              className="min-h-[80px] text-sm resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="csat" checked={sendCsat} onCheckedChange={(c) => setSendCsat(c === true)} />
            <Label htmlFor="csat" className="text-sm cursor-pointer">
              Enviar encuesta de satisfacción (CSAT)
            </Label>
          </div>
          <p className="text-[10px] text-muted-foreground">
            La encuesta CSAT se integrará cuando el canal lo soporte; por ahora solo queda registrada la preferencia en la UI.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleResolve}
            disabled={
              !dispositionId ||
              (selectedDisp?.requires_note && !notes.trim()) ||
              resolveMut.isPending
            }
            className="bg-status-online hover:bg-status-online/90 text-primary-foreground"
          >
            Resolver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
