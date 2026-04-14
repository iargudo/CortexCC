import {
  Inbox, LayoutDashboard, Users, ShieldCheck, Settings, Headphones, Phone, BarChart3, BookOpen, UserCog, Link, Shield,
  FileBarChart, ArrowUpDown, UserCircle2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import logo from "@/assets/logo.png";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { AgentStatusDot } from "@/components/StatusBadge";
import { useAuthStore } from "@/stores/authStore";
import { apiJson } from "@/lib/api";

const mainItems = [
  { title: "Inbox", url: "/", icon: Inbox, inboxBadge: true as const },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Colas en vivo", url: "/queues-live", icon: ArrowUpDown },
  { title: "Supervisor", url: "/supervisor", icon: ShieldCheck },
  { title: "Contactos", url: "/contacts", icon: Users },
  { title: "Calidad", url: "/quality", icon: BarChart3 },
  { title: "Reportes", url: "/reports", icon: FileBarChart },
];

const settingsItems = [
  { title: "Colas", url: "/settings/queues", icon: Phone },
  { title: "Canales", url: "/settings/channels", icon: Headphones },
  { title: "Equipos", url: "/settings/teams", icon: UserCog },
  { title: "Skills", url: "/settings/skills", icon: BookOpen },
  { title: "Roles", url: "/settings/roles", icon: Shield },
  { title: "Usuarios", url: "/settings/users", icon: UserCircle2 },
  { title: "Integraciones", url: "/settings/integrations", icon: Link },
  { title: "General", url: "/settings/general", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const user = useAuthStore(s => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isActive = (path: string) => location.pathname === path || (path !== "/" && location.pathname.startsWith(path));

  const inboxCountQuery = useQuery({
    queryKey: ["conversations", "inbox-badge-count"],
    queryFn: async () => {
      const res = await apiJson<{ meta: { total: number } }>("/conversations?tab=mine&limit=1&page=1");
      return res.meta.total;
    },
    enabled: hydrated && isAuthenticated,
  });
  const inboxCount = inboxCountQuery.data ?? 0;
  const inboxBadgeLabel = inboxCount > 99 ? "99+" : String(inboxCount);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader
        className={cn(
          "border-b border-slate-700/40 bg-[#0f172a] p-0",
          collapsed ? "py-5 px-2" : "py-8 px-4",
        )}
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="flex shrink-0 items-center justify-center">
            <img
              src={logo}
              alt="Cortex Contact Center"
              className={cn("object-contain", collapsed ? "h-9 w-9" : "h-11 w-11")}
            />
          </div>
          {!collapsed ? (
            <div className="space-y-1">
              <p className="text-xl font-bold tracking-tight leading-snug text-white">Cortex Contact Center</p>
              <p className="text-sm font-normal leading-snug text-[#94a3b8]">Sistema Omnicanal de Atención</p>
            </div>
          ) : null}
        </div>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin">
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} end={item.url === "/"} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && (
                        <span className="flex-1 flex items-center justify-between gap-2">
                          {item.title}
                          {"inboxBadge" in item && item.inboxBadge && inboxCount > 0 ? (
                            <span className="bg-sidebar-primary text-sidebar-primary-foreground text-[10px] font-bold min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full shrink-0">
                              {inboxBadgeLabel}
                            </span>
                          ) : null}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Configuración</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold text-sidebar-accent-foreground">
              {user?.name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "AG"}
            </div>
            <AgentStatusDot status={user?.status || "OFFLINE"} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-sidebar-background" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.name || "Agente"}</p>
              <p className="text-[10px] text-sidebar-foreground/60 capitalize">{user?.role || "agente"}</p>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
