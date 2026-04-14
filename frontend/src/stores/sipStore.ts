import { create } from "zustand";

export interface SipConfig {
  server: string; // WSS URI, e.g. wss://pbx.example.com:8089/ws
  realm: string; // SIP domain/realm
  extension: string; // SIP extension/username
  password: string; // SIP password
  displayName: string;
  stunServers: string[]; // STUN/TURN servers
  iceGatheringTimeout: number; // ms
}

export type SipRegistrationState = "unregistered" | "registering" | "registered" | "error";
export type CallDirection = "inbound" | "outbound";
export type CallState = "idle" | "ringing" | "connecting" | "active" | "on_hold" | "ended";

export interface CallInfo {
  id: string;
  conversationId?: string;
  direction: CallDirection;
  remoteUri: string;
  remoteDisplayName: string;
  state: CallState;
  startedAt: Date | null;
  answeredAt: Date | null;
  endedAt: Date | null;
  muted: boolean;
  held: boolean;
}

export interface CallHistoryEntry {
  id: string;
  direction: CallDirection;
  remoteUri: string;
  remoteDisplayName: string;
  startedAt: Date;
  endedAt: Date;
  duration: number; // seconds
  answered: boolean;
}

interface SipState {
  config: SipConfig;
  registrationState: SipRegistrationState;
  registrationError: string | null;
  currentCall: CallInfo | null;
  callHistory: CallHistoryEntry[];
  isConfigOpen: boolean;

  setConfig: (config: Partial<SipConfig>) => void;
  setRegistrationState: (state: SipRegistrationState, error?: string) => void;
  setCurrentCall: (call: CallInfo | null) => void;
  updateCurrentCall: (updates: Partial<CallInfo>) => void;
  addToHistory: (entry: CallHistoryEntry) => void;
  setConfigOpen: (open: boolean) => void;
  clearHistory: () => void;
}

const DEFAULT_CONFIG: SipConfig = {
  server: "",
  realm: "",
  extension: "",
  password: "",
  displayName: "",
  stunServers: ["stun:stun.l.google.com:19302"],
  iceGatheringTimeout: 5000,
};

export const useSipStore = create<SipState>((set) => ({
  config: DEFAULT_CONFIG,
  registrationState: "unregistered",
  registrationError: null,
  currentCall: null,
  callHistory: [],
  isConfigOpen: false,

  setConfig: (partial) =>
    set((s) => ({ config: { ...s.config, ...partial } })),

  setRegistrationState: (state, error) =>
    set({ registrationState: state, registrationError: error || null }),

  setCurrentCall: (call) => set({ currentCall: call }),

  updateCurrentCall: (updates) =>
    set((s) => ({
      currentCall: s.currentCall ? { ...s.currentCall, ...updates } : null,
    })),

  addToHistory: (entry) =>
    set((s) => ({ callHistory: [entry, ...s.callHistory].slice(0, 100) })),

  setConfigOpen: (open) => set({ isConfigOpen: open }),

  clearHistory: () => set({ callHistory: [] }),
}));
