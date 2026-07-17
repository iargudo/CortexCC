import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  conversation: {
    findFirst: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
  message: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("../lib/prisma.js", () => ({ getPrisma: () => mockPrisma }));
// Side-effect modules imported by inbound.service (only used by ingestIncomingMessage).
vi.mock("../queue/bull.js", () => ({ enqueueRouting: vi.fn() }));
vi.mock("../routing/coordinationDispatcher.js", () => ({ resolveInboundQueueId: vi.fn() }));
vi.mock("./slaCheck.service.js", () => ({ scheduleInitialSlaCheck: vi.fn() }));
vi.mock("./queuePolicy.service.js", () => ({ onConversationEnqueued: vi.fn() }));

import { attachInboundBySourceRef } from "./inbound.service.js";

describe("attachInboundBySourceRef", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.conversation.update.mockResolvedValue({});
  });

  it("throws when no conversation matches the source_ref_id (no silent fallback)", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    await expect(
      attachInboundBySourceRef({ source_ref_id: "missing", content: "hi" })
    ).rejects.toThrow(/No conversation found/);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it("creates a CONTACT message on the matched conversation", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
    mockPrisma.message.findFirst.mockResolvedValue(null);
    mockPrisma.message.create.mockResolvedValue({ id: "msg-1" });

    const result = await attachInboundBySourceRef({
      source_ref_id: "ref-1",
      content: "hola",
      external_message_id: "ext-1",
    });

    expect(result).toEqual({ conversation_id: "conv-1", message_id: "msg-1", deduped: false });
    const createArg = mockPrisma.message.create.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      conversation_id: "conv-1",
      sender_type: "CONTACT",
      content: "hola",
    });
    expect(mockPrisma.conversation.update).toHaveBeenCalled();
  });

  it("is idempotent on external_message_id (dedupes without creating a new message)", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
    mockPrisma.message.findFirst.mockResolvedValue({ id: "existing-msg" });

    const result = await attachInboundBySourceRef({
      source_ref_id: "ref-1",
      content: "hola",
      external_message_id: "dup-1",
    });

    expect(result).toEqual({
      conversation_id: "conv-1",
      message_id: "existing-msg",
      deduped: true,
    });
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
  });
});
