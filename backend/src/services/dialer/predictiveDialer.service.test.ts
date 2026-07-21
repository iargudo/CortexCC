import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();

vi.mock("../../lib/prisma.js", () => ({
  getPrisma: () => ({
    dialerSession: { findFirst },
  }),
}));

vi.mock("../../queue/bull.js", () => ({
  enqueueDialerPredictive: vi.fn(),
}));

vi.mock("../../channels/voice/config.js", () => ({
  parseVoiceChannelConfig: vi.fn(),
}));

vi.mock("../voice/ariClient.js", () => ({
  createAriClient: vi.fn(),
}));

vi.mock("../voice/voiceSessionStore.js", () => ({
  saveVoiceSession: vi.fn(),
}));

vi.mock("../voice/voiceCall.service.js", () => ({
  ingestVoiceCallEvent: vi.fn(),
}));

import { assignPredictiveAnswerToAgent } from "./predictiveDialer.service.js";

describe("assignPredictiveAnswerToAgent", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("does not assign when no ONLINE idle session exists", async () => {
    findFirst.mockResolvedValue(null);
    await assignPredictiveAnswerToAgent(null, "camp-1", "trunk-1", "contact-1");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "IDLE",
          agent: { status: "ONLINE", sip_extension: { not: null } },
        }),
      })
    );
  });
});
