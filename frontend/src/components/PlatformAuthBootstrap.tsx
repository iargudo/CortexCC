import { useEffect } from "react";
import { usePlatformAuthStore } from "@/stores/platformAuthStore";

export function PlatformAuthBootstrap() {
  const hydrate = usePlatformAuthStore((s) => s.hydrate);
  const hydrated = usePlatformAuthStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrate, hydrated]);

  return null;
}
