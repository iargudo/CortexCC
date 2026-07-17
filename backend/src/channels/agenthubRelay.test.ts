import { describe, it, expect, vi, afterEach } from "vitest";
import { getAgentHubRelayConfig, sendAgentReplyToAgentHub } from "./agenthubRelay.js";

describe("getAgentHubRelayConfig", () => {
  it("returns null when agenthub config is absent", () => {
    expect(getAgentHubRelayConfig(null)).toBeNull();
    expect(getAgentHubRelayConfig({})).toBeNull();
    expect(getAgentHubRelayConfig({ agenthub: {} })).toBeNull();
  });

  it("returns null when baseUrl or apiKey is missing", () => {
    expect(getAgentHubRelayConfig({ agenthub: { baseUrl: "https://a" } })).toBeNull();
    expect(getAgentHubRelayConfig({ agenthub: { apiKey: "k" } })).toBeNull();
  });

  it("parses config and defaults apiPrefix to /api/v1", () => {
    const cfg = getAgentHubRelayConfig({ agenthub: { baseUrl: "https://a/", apiKey: "k" } });
    expect(cfg).toEqual({ baseUrl: "https://a/", apiPrefix: "/api/v1", apiKey: "k" });
  });

  it("respects a custom apiPrefix", () => {
    const cfg = getAgentHubRelayConfig({
      agenthub: { baseUrl: "https://a", apiKey: "k", apiPrefix: "/api/v2" },
    });
    expect(cfg?.apiPrefix).toBe("/api/v2");
  });
});

describe("sendAgentReplyToAgentHub", () => {
  const config = { baseUrl: "https://agenthub.test/", apiPrefix: "/api/v1", apiKey: "secret" };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to the agent/reply endpoint and returns ok with tracking id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { outboundTrackingId: "trk-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendAgentReplyToAgentHub({
      config,
      conversationRefId: "conv-1",
      channelType: "webchat",
      userId: "user-1",
      content: "hola",
    });

    expect(result).toEqual({ ok: true, external_id: "trk-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://agenthub.test/api/v1/integrations/agent/reply");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ "x-api-key": "secret" });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      conversationRefId: "conv-1",
      channelType: "webchat",
      userId: "user-1",
      content: "hola",
    });
  });

  it("returns ok:false with the AgentHub error text on non-2xx (e.g. widget disconnected / 24h window)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "WebChat delivery failed: widget disconnected",
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendAgentReplyToAgentHub({
      config,
      conversationRefId: "conv-1",
      channelType: "webchat",
      userId: "user-1",
      content: "hola",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("502");
    expect(result.error).toContain("widget disconnected");
  });

  it("returns ok:false when the request throws (network error)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendAgentReplyToAgentHub({
      config,
      conversationRefId: "conv-1",
      channelType: "whatsapp",
      userId: "593999",
      content: "hola",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });
});
