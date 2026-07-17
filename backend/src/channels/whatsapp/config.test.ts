import { describe, expect, it } from "vitest";
import {
  getWhatsAppConfigValidationError,
  parseWhatsAppChannelConfig,
} from "./config.js";

describe("parseWhatsAppChannelConfig", () => {
  it("parses ultramsg provider", () => {
    const cfg = parseWhatsAppChannelConfig({
      provider: "ultramsg",
      instanceId: "instance123",
      token: "tok",
    });
    expect(cfg.provider).toBe("ultramsg");
    if (cfg.provider === "ultramsg") {
      expect(cfg.baseUrl).toBe("https://api.ultramsg.com");
    }
  });

  it("parses twilio provider", () => {
    const cfg = parseWhatsAppChannelConfig({
      provider: "twilio",
      accountSid: "AC123",
      authToken: "secret",
      from: "whatsapp:+14155238886",
    });
    expect(cfg.provider).toBe("twilio");
  });

  it("parses 360dialog provider", () => {
    const cfg = parseWhatsAppChannelConfig({
      provider: "360dialog",
      apiKey: "key-abc",
    });
    expect(cfg.provider).toBe("360dialog");
  });
});

describe("getWhatsAppConfigValidationError", () => {
  it("returns undefined for valid ultramsg config", () => {
    expect(
      getWhatsAppConfigValidationError({
        provider: "ultramsg",
        instanceId: "i1",
        token: "t1",
      })
    ).toBeUndefined();
  });

  it("rejects unknown provider", () => {
    const err = getWhatsAppConfigValidationError({ provider: "meta-cloud" });
    expect(err).toBeDefined();
  });

  it("requires twilio credentials", () => {
    const err = getWhatsAppConfigValidationError({
      provider: "twilio",
      accountSid: "AC123",
    });
    expect(err).toMatch(/authToken|from/i);
  });

  it("accepts agenthub-only config (handoff, sin proveedor)", () => {
    expect(
      getWhatsAppConfigValidationError({
        agenthub: { baseUrl: "https://agenthub.example.com", apiPrefix: "/api/v1", apiKey: "k1" },
      })
    ).toBeUndefined();
  });

  it("accepts agenthub without apiPrefix (usa default en runtime)", () => {
    expect(
      getWhatsAppConfigValidationError({
        agenthub: { baseUrl: "https://agenthub.example.com", apiKey: "k1" },
      })
    ).toBeUndefined();
  });

  it("rejects agenthub-only with invalid baseUrl", () => {
    const err = getWhatsAppConfigValidationError({
      agenthub: { baseUrl: "not-a-url", apiKey: "k1" },
    });
    expect(err).toMatch(/agenthub\.baseUrl/);
  });

  it("rejects agenthub-only without apiKey", () => {
    const err = getWhatsAppConfigValidationError({
      agenthub: { baseUrl: "https://agenthub.example.com" },
    });
    expect(err).toMatch(/agenthub\.apiKey/);
  });

  it("valida proveedor y relay cuando ambos están presentes", () => {
    expect(
      getWhatsAppConfigValidationError({
        provider: "ultramsg",
        instanceId: "i1",
        token: "t1",
        agenthub: { baseUrl: "https://agenthub.example.com", apiKey: "k1" },
      })
    ).toBeUndefined();

    const err = getWhatsAppConfigValidationError({
      provider: "ultramsg",
      instanceId: "i1",
      token: "t1",
      agenthub: { baseUrl: "bad", apiKey: "k1" },
    });
    expect(err).toMatch(/agenthub\.baseUrl/);
  });
});
