import { describe, expect, it } from "vitest";
import {
  buildWhatsAppConfig,
  defaultWhatsAppForm,
  parseWhatsAppForm,
  validateWhatsAppForm,
} from "./whatsappChannelConfig";

describe("whatsappChannelConfig", () => {
  it("builds twilio config", () => {
    const form = defaultWhatsAppForm();
    form.provider = "twilio";
    form.twilioAccountSid = "AC123";
    form.twilioAuthToken = "secret";
    form.twilioFrom = "whatsapp:+593991234567";
    expect(buildWhatsAppConfig(form)).toEqual({
      provider: "twilio",
      accountSid: "AC123",
      authToken: "secret",
      from: "whatsapp:+593991234567",
      apiBaseUrl: "https://api.twilio.com",
    });
  });

  it("builds 360dialog config", () => {
    const form = defaultWhatsAppForm();
    form.provider = "360dialog";
    form.dialogApiKey = "key-abc";
    form.dialogPhoneNumberId = "12345";
    expect(buildWhatsAppConfig(form)).toEqual({
      provider: "360dialog",
      apiKey: "key-abc",
      phoneNumberId: "12345",
      baseUrl: "https://waba-v2.360dialog.io",
    });
  });

  it("parses provider from stored config", () => {
    const parsed = parseWhatsAppForm({
      provider: "360dialog",
      apiKey: "k1",
      baseUrl: "https://waba-v2.360dialog.io",
    });
    expect(parsed.provider).toBe("360dialog");
    expect(parsed.dialogApiKey).toBe("k1");
  });

  it("validates required twilio fields", () => {
    const form = defaultWhatsAppForm();
    form.provider = "twilio";
    form.twilioAccountSid = "AC1";
    expect(validateWhatsAppForm(form)).toMatch(/Auth Token|From/i);
  });

  it("builds agenthub config in handoff mode (sin proveedor)", () => {
    const form = defaultWhatsAppForm();
    form.mode = "agenthub";
    form.agentHubBaseUrl = "https://agenthub.example.com";
    form.agentHubApiKey = "k1";
    expect(buildWhatsAppConfig(form)).toEqual({
      agenthub: {
        baseUrl: "https://agenthub.example.com",
        apiPrefix: "/api/v1",
        apiKey: "k1",
      },
    });
  });

  it("parses agenthub mode from stored config", () => {
    const parsed = parseWhatsAppForm({
      agenthub: { baseUrl: "https://agenthub.example.com", apiPrefix: "/api/v2", apiKey: "k1" },
    });
    expect(parsed.mode).toBe("agenthub");
    expect(parsed.agentHubBaseUrl).toBe("https://agenthub.example.com");
    expect(parsed.agentHubApiPrefix).toBe("/api/v2");
    expect(parsed.agentHubApiKey).toBe("k1");
  });

  it("validates agenthub mode requires baseUrl + apiKey válidos", () => {
    const form = defaultWhatsAppForm();
    form.mode = "agenthub";
    expect(validateWhatsAppForm(form)).toMatch(/Base URL/i);
    form.agentHubBaseUrl = "not-a-url";
    expect(validateWhatsAppForm(form)).toMatch(/URL válida/i);
    form.agentHubBaseUrl = "https://agenthub.example.com";
    expect(validateWhatsAppForm(form)).toMatch(/API Key/i);
    form.agentHubApiKey = "k1";
    expect(validateWhatsAppForm(form)).toBeNull();
  });
});
