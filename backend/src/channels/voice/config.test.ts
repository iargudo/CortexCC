import { describe, expect, it } from "vitest";
import {
  buildAgentEndpoint,
  getVoiceConfigValidationError,
  parseVoiceChannelConfig,
} from "./config.js";

const validConfig = {
  ariBaseUrl: "http://asterisk.local:8088/ari",
  ariUsername: "cortex",
  ariPassword: "secret",
};

describe("parseVoiceChannelConfig", () => {
  it("parses minimal valid Asterisk ARI config with defaults", () => {
    const cfg = parseVoiceChannelConfig(validConfig);
    expect(cfg.provider).toBe("asterisk_ari");
    expect(cfg.ariApp).toBe("cortexcc");
    expect(cfg.agentEndpointTemplate).toBe("PJSIP/{extension}");
    expect(cfg.ringTimeoutSec).toBe(30);
  });

  it("accepts custom outbound and recording options", () => {
    const cfg = parseVoiceChannelConfig({
      ...validConfig,
      outboundTrunkEndpoint: "PJSIP/my-trunk",
      recordingEnabled: true,
      defaultCallerId: "+593999999999",
    });
    expect(cfg.outboundTrunkEndpoint).toBe("PJSIP/my-trunk");
    expect(cfg.recordingEnabled).toBe(true);
    expect(cfg.defaultCallerId).toBe("+593999999999");
  });
});

describe("getVoiceConfigValidationError", () => {
  it("returns undefined for valid config", () => {
    expect(getVoiceConfigValidationError(validConfig)).toBeUndefined();
  });

  it("reports missing required fields", () => {
    const err = getVoiceConfigValidationError({ ariUsername: "x" });
    expect(err).toBeDefined();
    expect(err).toMatch(/ariBaseUrl/i);
    expect(err).toMatch(/ariPassword/i);
  });

  it("rejects invalid URLs", () => {
    const err = getVoiceConfigValidationError({
      ...validConfig,
      ariBaseUrl: "not-a-url",
    });
    expect(err).toMatch(/ariBaseUrl/i);
  });
});

describe("buildAgentEndpoint", () => {
  it("substitutes extension in template", () => {
    const cfg = parseVoiceChannelConfig(validConfig);
    expect(buildAgentEndpoint(cfg, "1001")).toBe("PJSIP/1001");
  });
});
