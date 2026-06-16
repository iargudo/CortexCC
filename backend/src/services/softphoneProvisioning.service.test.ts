import { describe, expect, it } from "vitest";
import { renderPjsipEndpoints } from "./softphoneProvisioning.service.js";

describe("renderPjsipEndpoints", () => {
  it("renders endpoint, auth and aor blocks per agent", () => {
    const out = renderPjsipEndpoints([
      { extension: "1001", password: "pass-one" },
      { extension: "1002", password: "pass-two" },
    ]);

    expect(out).toContain("[1001]");
    expect(out).toContain("auth=1001-auth");
    expect(out).toContain("password=pass-one");
    expect(out).toContain("webrtc=yes");
    expect(out).toContain("[1002-auth]");
    expect(out).toContain("password=pass-two");
    expect(out).toContain("type=aor");
  });

  it("returns empty string for no endpoints", () => {
    expect(renderPjsipEndpoints([])).toBe("");
  });
});
