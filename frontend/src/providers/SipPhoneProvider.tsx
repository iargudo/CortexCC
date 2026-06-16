import { useEffect, useRef, type ReactNode } from "react";
import { useSipPhone } from "@/hooks/useSipPhone";
import { useAuthStore } from "@/stores/authStore";
import { useSipStore } from "@/stores/sipStore";
import { apiJson } from "@/lib/api";
import { checkSoftphoneConfig } from "@/lib/softphoneDiagnostics";
import { SipPhoneContext } from "@/providers/sipPhoneContext";

export function SipPhoneProvider({ children }: { children: ReactNode }) {
  const phone = useSipPhone();
  const openSoftphoneRef = { current: null as (() => void) | null };
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setConfig = useSipStore((s) => s.setConfig);
  const setRegistrationState = useSipStore((s) => s.setRegistrationState);
  const loadedConfigRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      loadedConfigRef.current = false;
      return;
    }
    if (loadedConfigRef.current) return;
    loadedConfigRef.current = true;
    void (async () => {
      try {
        const remote = await apiJson<{
          server: string;
          realm: string;
          displayName: string;
          stunServers: string[];
          iceGatheringTimeout: number;
          extension: string;
          password: string;
        }>("/settings/softphone/me");
        const nextConfig = {
          server: remote.server ?? "",
          realm: remote.realm ?? "",
          displayName: remote.displayName ?? "",
          stunServers: Array.isArray(remote.stunServers) && remote.stunServers.length > 0
            ? remote.stunServers
            : ["stun:stun.l.google.com:19302"],
          iceGatheringTimeout: typeof remote.iceGatheringTimeout === "number" ? remote.iceGatheringTimeout : 1500,
          extension: remote.extension ?? "",
          password: remote.password ?? "",
        };
        setConfig(nextConfig);
        const configCheck = checkSoftphoneConfig(nextConfig);
        if (!configCheck.canRegister) {
          setRegistrationState("error", configCheck.issue!);
        } else {
          setRegistrationState("unregistered", undefined);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo cargar la configuración del softphone";
        setRegistrationState("error", message);
        console.warn("[SOFTPHONE] failed to load persisted config", err);
      }
    })();
  }, [isAuthenticated, setConfig, setRegistrationState]);

  const dialFromContext = async (target: string, conversationId?: string) => {
    openSoftphoneRef.current?.();
    await phone.call(target, conversationId);
  };

  return (
    <SipPhoneContext.Provider value={{ ...phone, dialFromContext, openSoftphoneRef }}>
      {children}
    </SipPhoneContext.Provider>
  );
}
