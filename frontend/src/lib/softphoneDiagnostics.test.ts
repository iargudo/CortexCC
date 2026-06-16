import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { checkSoftphoneConfig, getCallBlockReason } from "./softphoneDiagnostics";
import type { SipConfig } from "@/stores/sipStore";

const baseConfig: SipConfig = {
  server: "wss://pbx.local:8089/ws",
  realm: "pbx.local",
  extension: "7004",
  password: "secret",
  displayName: "Agent",
  stunServers: ["stun:stun.l.google.com:19302"],
  iceGatheringTimeout: 5000,
};

describe("softphoneDiagnostics", () => {
  beforeEach(() => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
  });
  it("flags missing extension", () => {
    const result = checkSoftphoneConfig({ ...baseConfig, extension: "" });
    expect(result.canRegister).toBe(false);
    expect(result.issue).toMatch(/extensión SIP/i);
  });

  it("flags missing server", () => {
    const result = checkSoftphoneConfig({ ...baseConfig, server: "" });
    expect(result.canRegister).toBe(false);
    expect(result.issue).toMatch(/servidor/i);
  });

  it("blocks calls when not registered", () => {
    const reason = getCallBlockReason({ config: baseConfig, registrationState: "unregistered" });
    expect(reason).toMatch(/Conecte el softphone/i);
  });
});
