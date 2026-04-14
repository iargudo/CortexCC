import { describe, expect, it } from "vitest";
import { mapChannelType } from "./channelTypes.js";

describe("mapChannelType", () => {
  it("maps known strings", () => {
    expect(mapChannelType("whatsapp")).toBe("WHATSAPP");
    expect(mapChannelType("VOICE")).toBe("VOICE");
  });

  it("defaults to WEBCHAT", () => {
    expect(mapChannelType("unknown")).toBe("WEBCHAT");
  });
});
