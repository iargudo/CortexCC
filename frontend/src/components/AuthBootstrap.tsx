import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";

/** Restaura sesión desde tokens en localStorage (GET /auth/me). */
export function AuthBootstrap() {
  const hydrate = useAuthStore((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return null;
}
