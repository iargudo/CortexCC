import { describe, expect, it } from "vitest";
import {
  hashRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
} from "./jwt.js";

describe("jwt helpers", () => {
  it("signs and verifies access tokens", () => {
    const token = signAccessToken({ sub: "user-1", email: "a@test.local", tenantKey: "local" });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.email).toBe("a@test.local");
    expect(payload.tenantKey).toBe("local");
  });

  it("generates unique refresh tokens", () => {
    const a = signRefreshToken();
    const b = signRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });

  it("hashes refresh tokens deterministically", () => {
    const plain = "refresh-token-plain";
    expect(hashRefreshToken(plain)).toBe(hashRefreshToken(plain));
    expect(hashRefreshToken(plain)).not.toBe(plain);
  });
});
