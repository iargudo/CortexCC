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
});
