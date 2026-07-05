import { Navigate } from "react-router-dom";
import { usePlatformAuthStore } from "@/stores/platformAuthStore";

export function PlatformProtectedRoute({ children }: { children: React.ReactNode }) {
  const hydrated = usePlatformAuthStore((s) => s.hydrated);
  const isAuthenticated = usePlatformAuthStore((s) => s.isAuthenticated);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Cargando…
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/platform/login" replace />;
  }
  return <>{children}</>;
}
