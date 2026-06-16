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
});
