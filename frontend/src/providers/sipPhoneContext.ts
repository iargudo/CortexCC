import { createContext, useContext } from "react";
import type { useSipPhone } from "@/hooks/useSipPhone";

export type SipPhoneContextValue = ReturnType<typeof useSipPhone> & {
  dialFromContext: (target: string, conversationId?: string) => Promise<void>;
  openSoftphoneRef: { current: (() => void) | null };
};

export const SipPhoneContext = createContext<SipPhoneContextValue | null>(null);

export function useSipPhoneContext(): SipPhoneContextValue {
  const ctx = useContext(SipPhoneContext);
  if (!ctx) throw new Error("useSipPhoneContext must be used within SipPhoneProvider");
  return ctx;
}
