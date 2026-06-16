import { describe, expect, it } from "vitest";
import { mapChannelType } from "./channelTypes.js";

describe("mapChannelType", () => {
  it("maps all supported channel strings case-insensitively", () => {
    expect(mapChannelType("whatsapp")).toBe("WHATSAPP");
    expect(mapChannelType("VOICE")).toBe("VOICE");
    expect(mapChannelType("email")).toBe("EMAIL");
    expect(mapChannelType("Teams")).toBe("TEAMS");
    expect(mapChannelType("webchat")).toBe("WEBCHAT");
  });

  it("defaults unknown values to WEBCHAT", () => {
    expect(mapChannelType("unknown")).toBe("WEBCHAT");
    expect(mapChannelType("")).toBe("WEBCHAT");
  });
});
