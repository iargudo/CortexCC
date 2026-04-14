import { useEffect, useState } from "react";
import { useAuthStore, type AuthUser } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AgentStatusBadge } from "@/components/StatusBadge";
import { Separator } from "@/components/ui/separator";
import { User, Shield, Headphones, Save } from "lucide-react";
import type { AgentStatus } from "@/data/mock";
import { apiJson } from "@/lib/api";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user, updateProfile, setStatus } = useAuthStore();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [maxConcurrent, setMaxConcurrent] = useState(user?.max_concurrent || 5);
  const [saved, setSaved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setMaxConcurrent(user.max_concurrent);
  }, [user]);

  if (!user) return null;

  const handleSave = async () => {
    try {
      const updated = await apiJson<AuthUser>("/auth/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          max_concurrent: maxConcurrent,
        }),
      });
      updateProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Perfil actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    }
  };

  const handlePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error("Completa ambos campos");
      return;
    }
    setPwdLoading(true);
    try {
      await apiJson("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Contraseña actualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar la contraseña");
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">Mi perfil</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Headphones size={14} /> Estado actual
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <AgentStatusBadge status={user.status} />
            <Select
              value={user.status}
              onValueChange={async (v) => {
                try {
                  await setStatus(v as AgentStatus);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Error");
                }
              }}
            >
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ONLINE">🟢 En línea</SelectItem>
                <SelectItem value="AWAY">🟡 Ausente</SelectItem>
                <SelectItem value="BUSY">🔴 Ocupado</SelectItem>
                <SelectItem value="ON_BREAK">🟣 En descanso</SelectItem>
                <SelectItem value="OFFLINE">⚫ Desconectado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <User size={14} /> Información personal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-xl font-bold">
              {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <Badge variant="secondary" className="mt-1 capitalize">
                {user.role}
              </Badge>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Nombre completo</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Max. conversaciones simultáneas</Label>
              <Input
                type="number"
                value={maxConcurrent}
                onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                min={1}
                max={20}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Rol</Label>
              <Input value={user.role} disabled className="h-9 text-sm bg-muted" />
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={() => void handleSave()} className="gap-1">
              <Save size={14} /> {saved ? "¡Guardado!" : "Guardar cambios"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield size={14} /> Seguridad
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Contraseña actual</Label>
              <Input
                type="password"
                placeholder="••••••••"
                className="h-9 text-sm"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Nueva contraseña</Label>
              <Input
                type="password"
                placeholder="••••••••"
                className="h-9 text-sm"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" disabled={pwdLoading} onClick={() => void handlePassword()}>
              Cambiar contraseña
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
