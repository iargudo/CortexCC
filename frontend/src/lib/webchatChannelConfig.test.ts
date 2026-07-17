import { describe, expect, it } from "vitest";
import {
  buildWebChatConfig,
  defaultWebChatForm,
  parseWebChatForm,
  validateWebChatForm,
} from "./webchatChannelConfig";

describe("webchatChannelConfig", () => {
  it("builds agenthub config", () => {
    const form = defaultWebChatForm();
    form.agentHubBaseUrl = "https://agenthub.example.com";
    form.agentHubApiKey = "k1";
    expect(buildWebChatConfig(form)).toEqual({
      agenthub: {
        baseUrl: "https://agenthub.example.com",
        apiPrefix: "/api/v1",
        apiKey: "k1",
      },
    });
  });

  it("preserva claves existentes del config al construir", () => {
    const form = defaultWebChatForm();
    form.agentHubBaseUrl = "https://agenthub.example.com";
    form.agentHubApiKey = "k1";
    const out = buildWebChatConfig(form, { widgetTitle: "Hola", agenthub: { baseUrl: "old", apiKey: "old" } });
    expect(out).toEqual({
      widgetTitle: "Hola",
      agenthub: {
        baseUrl: "https://agenthub.example.com",
        apiPrefix: "/api/v1",
        apiKey: "k1",
      },
    });
  });

  it("parses stored config", () => {
    const parsed = parseWebChatForm({
      agenthub: { baseUrl: "https://agenthub.example.com", apiPrefix: "/api/v2", apiKey: "k1" },
    });
    expect(parsed.agentHubBaseUrl).toBe("https://agenthub.example.com");
    expect(parsed.agentHubApiPrefix).toBe("/api/v2");
    expect(parsed.agentHubApiKey).toBe("k1");
  });

  it("valida baseUrl + apiKey", () => {
    const form = defaultWebChatForm();
    expect(validateWebChatForm(form)).toMatch(/Base URL/i);
    form.agentHubBaseUrl = "not-a-url";
    expect(validateWebChatForm(form)).toMatch(/URL válida/i);
    form.agentHubBaseUrl = "https://agenthub.example.com";
    expect(validateWebChatForm(form)).toMatch(/API Key/i);
    form.agentHubApiKey = "k1";
    expect(validateWebChatForm(form)).toBeNull();
  });
});
