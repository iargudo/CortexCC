import { describe, expect, it } from "vitest";
import {
  buildAriBaseUrl,
  buildSipServer,
  derivePbxUrls,
  extractHostFromAriUrl,
  extractHostFromSipServer,
  normalizePbxHost,
  resolvePbxHost,
  validateTelephonyConsistency,
} from "./pbxHost.js";

describe("pbxHost", () => {
  it("normalizes plain host, URL and wss URL", () => {
    expect(normalizePbxHost("pbx.example.com")).toBe("pbx.example.com");
    expect(normalizePbxHost("http://192.168.1.10:8074")).toBe("192.168.1.10");
    expect(normalizePbxHost("wss://192.168.1.10:8089/ws")).toBe("192.168.1.10");
  });

  it("builds derived URLs with default ports", () => {
    const derived = derivePbxUrls("pbx.example.com");
    expect(derived.sipServer).toBe("wss://pbx.example.com:8089/ws");
    expect(derived.sipRealm).toBe("pbx.example.com");
    expect(derived.ariBaseUrl).toBe("http://pbx.example.com:8074");
  });

  it("extracts host from sip and ari URLs", () => {
    expect(extractHostFromSipServer("wss://10.0.0.5:8089/ws")).toBe("10.0.0.5");
    expect(extractHostFromAriUrl("http://10.0.0.5:8074")).toBe("10.0.0.5");
  });

  it("resolves host preferring explicit pbx_host", () => {
    expect(
      resolvePbxHost({
        pbxHost: "pbx.local",
        sipServer: "wss://other:8089/ws",
        ariBaseUrl: "http://other:8074",
      })
    ).toBe("pbx.local");
    expect(
      resolvePbxHost({
        sipServer: "wss://from-sip:8089/ws",
        ariBaseUrl: "http://from-ari:8074",
      })
    ).toBe("from-sip");
  });

  it("warns when sip and ari hosts diverge", () => {
    const result = validateTelephonyConsistency({
      pbxHost: "pbx.local",
      sipServer: buildSipServer("other.local"),
      sipRealm: "other.local",
      ariBaseUrl: buildAriBaseUrl("pbx.local"),
      voiceChannelExists: true,
      voiceChannelStatus: "active",
    });
    expect(result.warnings.some((w) => w.includes("sip_server"))).toBe(true);
    expect(result.ok).toBe(true);
  });
});
