import { Search, Bell, Phone, LogOut, User, ChevronDown, Loader2, MessageSquare } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { AgentStatusDot } from "@/components/StatusBadge";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { useNavigate } from "react-router-dom";
import type { AgentStatus, Contact, Conversation } from "@/data/mock";
import { SoftphoneWidget } from "@/components/softphone/SoftphoneWidget";
import { useSipStore } from "@/stores/sipStore";
import { apiJson } from "@/lib/api";
import { ChannelBadge } from "@/components/ChannelIcon";
import { useBellNotificationsStore } from "@/stores/bellNotificationsStore";

const statusOptions: { value: AgentStatus; label: string; emoji: string }[] = [
  { value: "ONLINE", label: "En línea", emoji: "🟢" },
  { value: "AWAY", label: "Ausente", emoji: "🟡" },
  { value: "BUSY", label: "Ocupado", emoji: "🔴" },
  { value: "ON_BREAK", label: "En descanso", emoji: "🟣" },
  { value: "OFFLINE", label: "Desconectado", emoji: "⚫" },
];

export function HeaderBar() {
  const [softphoneOpen, setSoftphoneOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const { user, setStatus, logout, isAuthenticated } = useAuthStore();
  const { registrationState, currentCall } = useSipStore();
  const navigate = useNavigate();
  const notifRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const softphoneRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const searchQuery = useQuery({
    queryKey: ["search", "global", searchDebounced],
    enabled: isAuthenticated && searchDebounced.length >= 2,
    queryFn: () =>
      apiJson<{ conversations: Conversation[]; contacts: Contact[] }>(
        `/search/global?q=${encodeURIComponent(searchDebounced)}&limit=8`
      ),
  });

  const notifications = useBellNotificationsStore((s) => s.items);
  const markAllRead = useBellNotificationsStore((s) => s.markAllRead);
  const markRead = useBellNotificationsStore((s) => s.markRead);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const hasActiveCall = !!currentCall && currentCall.state !== "ended";

  useEffect(() => {
    if (currentCall?.direction === "inbound" && currentCall.state === "ringing") {
      setSoftphoneOpen(true);
    }
  }, [currentCall]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
      if (softphoneRef.current && !softphoneRef.current.contains(e.target as Node)) setSoftphoneOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header className="h-14 border-b bg-card flex items-center px-3 gap-3 shrink-0">
      <SidebarTrigger />

      {/* Search */}
      <div className="flex-1 max-w-md" ref={searchRef}>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar conversaciones, contactos… (mín. 2 caracteres)"
            className="h-8 pl-8 text-sm bg-muted/50 border-none"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
          />
          {searchOpen && searchDebounced.length >= 2 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-card border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto scrollbar-thin">
              {searchQuery.isLoading && (
                <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" /> Buscando…
                </div>
              )}
              {searchQuery.error && (
                <p className="p-3 text-xs text-destructive">{(searchQuery.error as Error).message}</p>
              )}
              {searchQuery.data && !searchQuery.isLoading && (
                <div className="py-1">
                  {(searchQuery.data.conversations?.length ?? 0) === 0 && (searchQuery.data.contacts?.length ?? 0) === 0 && (
                    <p className="p-3 text-xs text-muted-foreground">Sin resultados.</p>
                  )}
                  {searchQuery.data.conversations?.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-start gap-2 border-b border-border/50"
                      onClick={() => {
                        navigate(`/?conversation=${encodeURIComponent(c.id)}`);
                        setSearchOpen(false);
                        setSearchInput("");
                        setSearchDebounced("");
                      }}
                    >
                      <MessageSquare size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{c.contact.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{c.last_message || c.subject || "—"}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <ChannelBadge channel={c.channel} />
                          <span className="text-[10px] text-muted-foreground">{c.status}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                  {searchQuery.data.contacts?.map((ct) => (
                    <button
                      key={ct.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-start gap-2 border-b border-border/50 last:border-0"
                      onClick={() => {
                        navigate(`/contacts?search=${encodeURIComponent(ct.name)}`);
                        setSearchOpen(false);
                        setSearchInput("");
                        setSearchDebounced("");
                      }}
                    >
                      <User size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{ct.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {[ct.email, ct.phone].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <Button variant="ghost" size="icon" className="relative h-8 w-8" onClick={() => setNotifOpen(!notifOpen)}>
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 bg-destructive text-destructive-foreground rounded-full text-[10px] flex items-center justify-center font-bold">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-card border rounded-lg shadow-lg z-50 animate-slide-in-right">
              <div className="p-3 border-b flex items-center justify-between">
                <span className="text-sm font-medium">Notificaciones</span>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline disabled:opacity-40"
                  disabled={unreadCount === 0}
                  onClick={() => markAllRead()}
                >
                  Marcar todo leído
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto scrollbar-thin">
                {notifications.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground text-center">
                    Aquí verás asignaciones y transferencias recibidas por socket. También se muestran toasts en pantalla.
                  </p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className={cn(
                        "w-full text-left p-3 border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors",
                        !n.read && "bg-primary/5"
                      )}
                      onClick={() => {
                        markRead(n.id);
                        if (n.conversationId) {
                          navigate(`/?conversation=${encodeURIComponent(n.conversationId)}`);
                        }
                        setNotifOpen(false);
                      }}
                    >
                      <div className="flex items-start gap-2">
                        {!n.read && <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                        <div className={cn("min-w-0", !n.read ? "" : "ml-4")}>
                          <p className="text-sm font-medium">{n.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {new Date(n.at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Softphone */}
        <div className="relative" ref={softphoneRef}>
          <Button
            variant={hasActiveCall ? "default" : registrationState === "registered" ? "ghost" : "ghost"}
            size="icon"
            className={cn("h-8 w-8 relative", hasActiveCall && "animate-pulse-dot")}
            onClick={() => setSoftphoneOpen(!softphoneOpen)}
          >
            <Phone size={16} />
            {registrationState === "registered" && !hasActiveCall && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500" />
            )}
            {hasActiveCall && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-destructive animate-pulse" />
            )}
          </Button>

          <div className={cn("absolute right-0 top-full mt-2 z-50", softphoneOpen ? "block" : "hidden")}>
            <SoftphoneWidget onClose={() => setSoftphoneOpen(false)} />
          </div>
        </div>

        {/* Agent status + profile */}
        <div className="relative pl-2 border-l" ref={statusRef}>
          <button onClick={() => setStatusOpen(!statusOpen)} className="flex items-center gap-2 hover:bg-muted/50 rounded-lg px-2 py-1 transition-colors">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                {user?.name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "AG"}
              </div>
              <AgentStatusDot status={user?.status || "OFFLINE"} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-card" />
            </div>
            <ChevronDown size={12} className="text-muted-foreground" />
          </button>

          {statusOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-card border rounded-lg shadow-lg z-50 animate-slide-in-right">
              <div className="p-3 border-b">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <div className="p-1">
                <p className="text-[10px] font-medium text-muted-foreground px-2 py-1">Estado</p>
                {statusOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={async () => {
                      try {
                        await setStatus(opt.value);
                        setStatusOpen(false);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "No se pudo actualizar el estado");
                      }
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors hover:bg-muted",
                      user?.status === opt.value && "bg-muted font-medium"
                    )}
                  >
                    <span>{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="border-t p-1">
                <button
                  onClick={() => { navigate("/profile"); setStatusOpen(false); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors hover:bg-muted"
                >
                  <User size={14} /> Mi perfil
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await logout();
                      navigate("/login");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Error al cerrar sesión");
                      navigate("/login");
                    }
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors hover:bg-muted text-destructive"
                >
                  <LogOut size={14} /> Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
