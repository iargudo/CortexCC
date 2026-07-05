import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Building2, LogOut, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlatformAuthStore } from "@/stores/platformAuthStore";
import logo from "@/assets/logo.png";

const navItems = [
  { to: "/platform/tenants", label: "Tenants", icon: Building2 },
  { to: "/platform/admins", label: "Administradores", icon: Users },
];

export default function PlatformLayout() {
  const user = usePlatformAuthStore((s) => s.user);
  const logout = usePlatformAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/platform/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="border-b bg-background">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src={logo} alt="Cortex" className="w-8 h-8 object-contain shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-sm flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-primary shrink-0" />
                Administración de plataforma
              </div>
              <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
            <Button variant="ghost" size="sm" onClick={() => void handleLogout()} className="ml-2">
              <LogOut className="w-4 h-4 mr-1" />
              Salir
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
