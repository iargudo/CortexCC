import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Contact } from "@/data/mock";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, ExternalLink, MessageSquare, Upload, Download, Merge } from "lucide-react";
import { apiFetch, apiJson } from "@/lib/api";
import { ContactDetailDrawer } from "@/components/contacts/ContactDetailDrawer";
import { useAuthStore } from "@/stores/authStore";

export default function ContactsPage() {
  const qc = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => (searchParams.get("search") ?? "").trim());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerContact, setDrawerContact] = useState<Contact | null>(null);
  const drawerCloseTimerRef = useRef<number | null>(null);

  const openDrawer = (c: Contact) => {
    if (drawerCloseTimerRef.current != null) {
      window.clearTimeout(drawerCloseTimerRef.current);
      drawerCloseTimerRef.current = null;
    }
    setDrawerContact(c);
    setDrawerOpen(true);
  };

  useEffect(() => {
    const s = searchParams.get("search");
    if (s !== null) {
      setSearch(s);
      setDebouncedSearch(s.trim());
    }
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => clearTimeout(t);
  }, [search]);
  const [importOpen, setImportOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newTags, setNewTags] = useState("");

  const listQuery = useQuery({
    queryKey: ["contacts", debouncedSearch],
    enabled: isAuthenticated,
    queryFn: () =>
      apiJson<{ data: Contact[]; meta: { total: number } }>(
        `/contacts?search=${encodeURIComponent(debouncedSearch)}&limit=100&page=1`
      ),
  });

  const contacts = listQuery.data?.data ?? [];

  const mergeMut = useMutation({
    mutationFn: () =>
      apiJson<Contact>("/contacts/merge", {
        method: "POST",
        body: JSON.stringify({ source_id: mergeSource, target_id: mergeTarget }),
      }),
    onSuccess: () => {
      toast.success("Contactos fusionados");
      setMergeOpen(false);
      setMergeSource("");
      setMergeTarget("");
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiJson<Contact>("/contacts", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim() || undefined,
          phone: newPhone.trim() || undefined,
          tags: newTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      }),
    onSuccess: () => {
      toast.success("Contacto creado");
      setNewContactOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setNewTags("");
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = async () => {
    try {
      const res = await apiFetch("/contacts/export");
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || res.statusText);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "contacts.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportación lista");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al exportar");
    }
  };

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch("/contacts/import", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || res.statusText);
      }
      return res.json() as Promise<{ imported: number }>;
    },
    onSuccess: (d) => {
      toast.success(`Importados: ${d.imported}`);
      setImportOpen(false);
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Contactos</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setImportOpen(true)}>
            <Upload size={14} /> Importar
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => void exportCsv()}>
            <Download size={14} /> Exportar
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setMergeOpen(true)}>
            <Merge size={14} /> Merge
          </Button>
          <Button size="sm" className="gap-1" onClick={() => setNewContactOpen(true)}>
            <Plus size={14} /> Nuevo
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, teléfono, email..."
            className="pl-8 h-9 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {listQuery.isError && (
        <p className="text-sm text-destructive">{(listQuery.error as Error).message}</p>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left p-3 font-medium">Nombre</th>
                <th className="text-left p-3 font-medium">Teléfono</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">Origen</th>
                <th className="text-left p-3 font-medium">Tags</th>
                <th className="text-center p-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.isLoading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground text-sm">
                    Cargando…
                  </td>
                </tr>
              )}
              {!listQuery.isLoading &&
                contacts.map((c) => (
                  <tr
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => openDrawer(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDrawer(c);
                      }
                    }}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                          {(c.name || "?")
                            .trim()
                            .split(/\s+/)
                            .filter(Boolean)
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2) || "?"}
                        </div>
                        <span className="font-medium">{c.name || "Sin nombre"}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{c.phone || "—"}</td>
                    <td className="p-3 text-muted-foreground">{c.email || "—"}</td>
                    <td className="p-3 text-muted-foreground capitalize">{c.source_system || "—"}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {(c.tags ?? []).map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex justify-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Próximamente"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MessageSquare size={12} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Ver detalle"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDrawer(c);
                          }}
                        >
                          <ExternalLink size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!listQuery.isLoading && contacts.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground text-sm">
                    No hay contactos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Importar contactos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload size={32} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">CSV con columnas name, email, phone, tags</p>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importMut.mutate(f);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={importMut.isPending}
                onClick={() => fileRef.current?.click()}
              >
                Seleccionar archivo
              </Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">También acepta columnas en español: nombre, telefono, email, tags</p>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={async () => {
                  try {
                    const res = await apiFetch("/import/templates/contacts");
                    const text = await res.text();
                    const blob = new Blob([text], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "contacts-template.csv";
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch {
                    toast.error("No se pudo descargar el template");
                  }
                }}
              >
                <Download size={10} className="mr-1 inline" /> Descargar template
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setImportOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Merge size={16} /> Merge de contactos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              El origen se elimina y sus datos se fusionan en el destino.
            </p>
            <div className="space-y-2">
              <Label className="text-sm">Contacto origen (se eliminará)</Label>
              <Select value={mergeSource} onValueChange={setMergeSource}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Contacto destino (se conservará)</Label>
              <Select value={mergeTarget} onValueChange={setMergeTarget}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {contacts
                    .filter((c) => c.id !== mergeSource)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setMergeOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!mergeSource || !mergeTarget || mergeMut.isPending}
              variant="destructive"
              onClick={() => mergeMut.mutate()}
            >
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo contacto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 col-span-2">
                <Label className="text-sm">Nombre *</Label>
                <Input className="h-9 text-sm" placeholder="Nombre completo" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Email</Label>
                <Input
                  className="h-9 text-sm"
                  type="email"
                  placeholder="email@ejemplo.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Teléfono</Label>
                <Input className="h-9 text-sm" placeholder="+593..." value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Tags</Label>
              <Input
                className="h-9 text-sm"
                placeholder="VIP, Cobranza (separar por coma)"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setNewContactOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!newName.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Crear contacto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {drawerContact && (
        <ContactDetailDrawer
          key={drawerContact.id}
          contact={drawerContact}
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) {
              if (drawerCloseTimerRef.current != null) {
                window.clearTimeout(drawerCloseTimerRef.current);
              }
              drawerCloseTimerRef.current = window.setTimeout(() => {
                drawerCloseTimerRef.current = null;
                setDrawerContact(null);
              }, 280);
            }
          }}
        />
      )}
    </div>
  );
}
