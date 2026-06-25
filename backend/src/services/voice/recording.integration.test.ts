/**
 * Integration test for the call recording pipeline.
 *
 * Tests the full flow: bridgeChannels starts recording → handleStasisEnd
 * enqueues upload → processRecordingUpload downloads from ARI, uploads to
 * storage, and updates the DB records.
 *
 * All external dependencies (ARI, Prisma, Redis, BullMQ, storage) are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockAri = {
  stopMoh: vi.fn().mockResolvedValue(undefined),
  answerChannel: vi.fn().mockResolvedValue(undefined),
  createBridge: vi.fn().mockResolvedValue({ id: "bridge-001" }),
  addChannelToBridge: vi.fn().mockResolvedValue(undefined),
  recordBridge: vi.fn().mockResolvedValue(undefined),
  getRecordingFile: vi.fn().mockResolvedValue(Buffer.from("fake-wav-data")),
  deleteRecording: vi.fn().mockResolvedValue(undefined),
};

vi.mock("./ariClient.js", () => ({
  createAriClient: () => mockAri,
}));

const mockStorage = {
  upload: vi.fn().mockResolvedValue("/api/files/recordings%2Ftest-tenant%2Fcall-conv-123-1000.wav"),
  getSignedUrl: vi.fn().mockResolvedValue("/api/files/test"),
  delete: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../storage.service.js", () => ({
  getStorage: () => mockStorage,
  getLocalStorage: () => null,
}));

let savedSessions: Record<string, unknown> = {};

vi.mock("./voiceSessionStore.js", () => ({
  getVoiceSession: vi.fn(async (channelId: string) => savedSessions[channelId] ?? null),
  saveVoiceSession: vi.fn(async (session: Record<string, unknown>) => {
    savedSessions[session.channelId as string] = session;
  }),
  updateVoiceSession: vi.fn(async (channelId: string, patch: Record<string, unknown>) => {
    const current = (savedSessions[channelId] as Record<string, unknown>) ?? {
      channelId,
      direction: "inbound",
      state: "ringing",
      updatedAt: new Date().toISOString(),
    };
    const next = { ...current, ...patch, channelId, updatedAt: new Date().toISOString() };
    savedSessions[channelId] = next;
    return next;
  }),
  deleteVoiceSession: vi.fn(async (channelId: string) => {
    delete savedSessions[channelId];
  }),
}));

const enqueueRecordingUploadMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../queue/bull.js", () => ({
  enqueueRouting: vi.fn().mockResolvedValue(undefined),
  enqueueRecordingUpload: (...args: unknown[]) => enqueueRecordingUploadMock(...args),
}));

const fakeConversation = (id: string) => ({
  id,
  channel_id: "ch-1",
  contact_id: "contact-1",
  status: "ASSIGNED",
  source: "voice",
  source_ref_id: "caller-ch",
  last_message_preview: null,
  last_message_at: new Date(),
  unread_agent_count: 0,
  queue_id: "q-1",
  subject: "Test call",
  created_at: new Date(),
  updated_at: new Date(),
});

const mockPrisma = {
  conversation: {
    findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(fakeConversation(where.id))
    ),
    findFirst: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue(fakeConversation("conv-123")),
  },
  conversationAssignment: {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  },
  voiceCall: {
    findFirst: vi.fn().mockResolvedValue({
      id: "vc-001",
      conversation_id: "conv-123",
      started_at: new Date("2026-01-01T10:00:00Z"),
      ended_at: new Date("2026-01-01T10:05:00Z"),
      metadata: {},
    }),
    create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "vc-001", ...data })),
    update: vi.fn().mockResolvedValue({}),
  },
  message: {
    findFirst: vi.fn().mockResolvedValue({
      id: "msg-ended",
      conversation_id: "conv-123",
      content_type: "VOICE_CALL",
      content: "[Llamada finalizada]",
      call_recording_url: null,
      call_duration_seconds: null,
    }),
    create: vi.fn().mockImplementation(({ data }) =>
      Promise.resolve({ id: "msg-001", ...data, attachments: [], sender: null })
    ),
    update: vi.fn().mockResolvedValue({}),
  },
  channel: {
    findUnique: vi.fn().mockResolvedValue({
      id: "ch-1",
      type: "VOICE",
      config: {
        provider: "asterisk_ari",
        ariBaseUrl: "http://asterisk:8088",
        ariApp: "cortexcc",
        ariUsername: "cortex",
        ariPassword: "secret",
        recordingEnabled: true,
      },
    }),
  },
  contact: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "contact-1" }),
  },
  queue: {
    findFirst: vi.fn().mockResolvedValue({ id: "q-1" }),
  },
};

vi.mock("../../lib/prisma.js", () => ({
  getPrisma: () => mockPrisma,
}));

vi.mock("../../lib/tenantContext.js", () => ({
  getCurrentTenantKey: () => "test-tenant",
}));

vi.mock("../../lib/socketRooms.js", () => ({
  emitTenantLiveEvent: vi.fn(),
  conversationRoom: vi.fn((_t: string, id: string) => `conversation:${id}`),
  userRoom: vi.fn((_t: string, id: string) => `user:${id}`),
}));

vi.mock("../slaCheck.service.js", () => ({
  scheduleInitialSlaCheck: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../conversationMapper.js", () => ({
  mapMessage: (m: Record<string, unknown>) => m,
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { bridgeChannels, handleStasisEnd } from "./voiceCallController.service.js";
import { processRecordingUpload } from "./recording.service.js";
import { updateVoiceSession, getVoiceSession } from "./voiceSessionStore.js";
import type { VoiceChannelConfig } from "../../channels/voice/config.js";
import type { Channel } from "@prisma/client";

const baseCfg: VoiceChannelConfig = {
  provider: "asterisk_ari",
  ariBaseUrl: "http://asterisk:8088",
  ariApp: "cortexcc",
  ariUsername: "cortex",
  ariPassword: "secret",
  callerIdField: "channel.caller.number",
  dialedNumberField: "channel.dialplan.exten",
  extensionField: "endpoint",
  pollFallbackSec: 15,
  outboundTrunkEndpoint: "PJSIP/carrier-trunk",
  outboundContext: "outbound-trunk",
  agentEndpointTemplate: "PJSIP/{extension}",
  ringTimeoutSec: 30,
  mohClass: "default",
  recordingEnabled: true,
};

const baseCfgNoRecording: VoiceChannelConfig = { ...baseCfg, recordingEnabled: false };

const fakeChannel = {
  id: "ch-1",
  type: "VOICE",
  config: baseCfg as object,
} as Channel;

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Call Recording Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savedSessions = {};
  });

  describe("bridgeChannels — recording start", () => {
    it("starts bridge recording when recordingEnabled is true", async () => {
      await bridgeChannels(null, baseCfg, "caller-ch", "agent-ch", "conv-123");

      expect(mockAri.createBridge).toHaveBeenCalledWith("mixing");
      expect(mockAri.addChannelToBridge).toHaveBeenCalledTimes(2);
      expect(mockAri.recordBridge).toHaveBeenCalledOnce();

      const [bridgeId, recordingName] = mockAri.recordBridge.mock.calls[0];
      expect(bridgeId).toBe("bridge-001");
      expect(recordingName).toMatch(/^call-conv-123-\d+$/);

      expect(updateVoiceSession).toHaveBeenCalledWith("caller-ch", expect.objectContaining({
        bridgeId: "bridge-001",
        state: "active",
        recordingName: expect.stringMatching(/^call-conv-123-\d+$/),
      }));
    });

    it("does NOT start recording when recordingEnabled is false", async () => {
      await bridgeChannels(null, baseCfgNoRecording, "caller-ch", "agent-ch", "conv-456");

      expect(mockAri.recordBridge).not.toHaveBeenCalled();

      expect(updateVoiceSession).toHaveBeenCalledWith("caller-ch", expect.objectContaining({
        bridgeId: "bridge-001",
        state: "active",
        recordingName: undefined,
      }));
    });

    it("continues bridging even if recording fails", async () => {
      mockAri.recordBridge.mockRejectedValueOnce(new Error("ARI recording error"));

      await bridgeChannels(null, baseCfg, "caller-ch", "agent-ch", "conv-789");

      expect(mockAri.createBridge).toHaveBeenCalled();
      expect(updateVoiceSession).toHaveBeenCalled();
    });
  });

  describe("handleStasisEnd — recording enqueue", () => {
    it("enqueues recording upload when session has recordingName", async () => {
      savedSessions["caller-ch"] = {
        channelId: "caller-ch",
        conversationId: "conv-123",
        channelConfigId: "ch-1",
        direction: "inbound",
        state: "active",
        recordingName: "call-conv-123-1000",
        updatedAt: new Date().toISOString(),
      };

      await handleStasisEnd(null, fakeChannel, { channel: { id: "caller-ch" } });

      expect(enqueueRecordingUploadMock).toHaveBeenCalledWith({
        recordingName: "call-conv-123-1000",
        conversationId: "conv-123",
        channelConfigId: "ch-1",
      });
    });

    it("does NOT enqueue when session has no recordingName", async () => {
      savedSessions["caller-ch2"] = {
        channelId: "caller-ch2",
        conversationId: "conv-456",
        channelConfigId: "ch-1",
        direction: "inbound",
        state: "active",
        updatedAt: new Date().toISOString(),
      };

      await handleStasisEnd(null, fakeChannel, { channel: { id: "caller-ch2" } });

      expect(enqueueRecordingUploadMock).not.toHaveBeenCalled();
    });
  });

  describe("processRecordingUpload — full pipeline", () => {
    it("downloads from ARI, uploads to storage, updates DB, cleans up Asterisk", async () => {
      await processRecordingUpload({
        tenantKey: "test-tenant",
        recordingName: "call-conv-123-1000",
        conversationId: "conv-123",
        channelConfigId: "ch-1",
      });

      // 1. Downloaded recording from ARI
      expect(mockAri.getRecordingFile).toHaveBeenCalledWith("call-conv-123-1000");

      // 2. Uploaded to storage with correct key
      expect(mockStorage.upload).toHaveBeenCalledWith(
        "recordings/test-tenant/call-conv-123-1000.wav",
        Buffer.from("fake-wav-data"),
        "audio/wav"
      );

      // 3. Cleaned up Asterisk recording
      expect(mockAri.deleteRecording).toHaveBeenCalledWith("call-conv-123-1000");

      // 4. Updated VoiceCall metadata
      expect(mockPrisma.voiceCall.update).toHaveBeenCalledWith({
        where: { id: "vc-001" },
        data: {
          metadata: expect.objectContaining({
            recording_url: "/api/files/recordings%2Ftest-tenant%2Fcall-conv-123-1000.wav",
            recording_name: "call-conv-123-1000",
          }),
        },
      });

      // 5. Updated Message with recording URL and duration
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: "msg-ended" },
        data: {
          call_recording_url: "/api/files/recordings%2Ftest-tenant%2Fcall-conv-123-1000.wav",
          call_duration_seconds: 300, // 5 minutes
        },
      });
    });

    it("returns early when channelConfigId is missing", async () => {
      await processRecordingUpload({
        tenantKey: "test-tenant",
        recordingName: "call-x-1000",
      });

      expect(mockAri.getRecordingFile).not.toHaveBeenCalled();
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it("returns early when channel is not found in DB", async () => {
      mockPrisma.channel.findUnique.mockResolvedValueOnce(null);

      await processRecordingUpload({
        tenantKey: "test-tenant",
        recordingName: "call-x-1000",
        channelConfigId: "nonexistent",
      });

      expect(mockAri.getRecordingFile).not.toHaveBeenCalled();
    });

    it("handles ARI download failure gracefully", async () => {
      mockAri.getRecordingFile.mockRejectedValueOnce(new Error("ARI 404"));

      await processRecordingUpload({
        tenantKey: "test-tenant",
        recordingName: "call-conv-123-1000",
        conversationId: "conv-123",
        channelConfigId: "ch-1",
      });

      expect(mockStorage.upload).not.toHaveBeenCalled();
      expect(mockPrisma.voiceCall.update).not.toHaveBeenCalled();
    });

    it("handles storage upload failure gracefully", async () => {
      mockStorage.upload.mockRejectedValueOnce(new Error("Disk full"));

      await processRecordingUpload({
        tenantKey: "test-tenant",
        recordingName: "call-conv-123-1000",
        conversationId: "conv-123",
        channelConfigId: "ch-1",
      });

      expect(mockAri.deleteRecording).not.toHaveBeenCalled();
      expect(mockPrisma.voiceCall.update).not.toHaveBeenCalled();
    });

    it("still completes when Asterisk cleanup fails", async () => {
      mockAri.deleteRecording.mockRejectedValueOnce(new Error("ARI error"));

      await processRecordingUpload({
        tenantKey: "test-tenant",
        recordingName: "call-conv-123-1000",
        conversationId: "conv-123",
        channelConfigId: "ch-1",
      });

      // Upload and DB updates should still happen
      expect(mockStorage.upload).toHaveBeenCalled();
      expect(mockPrisma.voiceCall.update).toHaveBeenCalled();
      expect(mockPrisma.message.update).toHaveBeenCalled();
    });

    it("skips DB updates when no conversationId", async () => {
      await processRecordingUpload({
        tenantKey: "test-tenant",
        recordingName: "call-standalone-1000",
        channelConfigId: "ch-1",
      });

      expect(mockAri.getRecordingFile).toHaveBeenCalled();
      expect(mockStorage.upload).toHaveBeenCalled();
      expect(mockAri.deleteRecording).toHaveBeenCalled();
      expect(mockPrisma.voiceCall.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.voiceCall.update).not.toHaveBeenCalled();
    });

    it("skips message update when no ended message exists", async () => {
      mockPrisma.message.findFirst.mockResolvedValueOnce(null);

      await processRecordingUpload({
        tenantKey: "test-tenant",
        recordingName: "call-conv-123-1000",
        conversationId: "conv-123",
        channelConfigId: "ch-1",
      });

      expect(mockPrisma.voiceCall.update).toHaveBeenCalled();
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
    });
  });

  describe("End-to-end flow simulation", () => {
    it("simulates full inbound call with recording: bridge → end → upload", async () => {
      // Step 1: Bridge channels (starts recording)
      await bridgeChannels(null, baseCfg, "caller-e2e", "agent-e2e", "conv-e2e");

      expect(mockAri.recordBridge).toHaveBeenCalledOnce();
      const recordingName = mockAri.recordBridge.mock.calls[0][1] as string;
      expect(recordingName).toMatch(/^call-conv-e2e-\d+$/);

      // Verify session was saved with recording name
      const session = await getVoiceSession("caller-e2e");
      expect(session).toBeTruthy();
      expect((session as Record<string, unknown>).recordingName).toBe(recordingName);

      // Step 2: Call ends (enqueues recording upload)
      // Simulate the session state as it would be after bridgeChannels
      savedSessions["caller-e2e"] = {
        ...savedSessions["caller-e2e"],
        channelConfigId: "ch-1",
      };

      await handleStasisEnd(null, fakeChannel, { channel: { id: "caller-e2e" } });

      expect(enqueueRecordingUploadMock).toHaveBeenCalledWith({
        recordingName,
        conversationId: "conv-e2e",
        channelConfigId: "ch-1",
      });

      // Step 3: Worker processes the upload
      await processRecordingUpload({
        tenantKey: "test-tenant",
        recordingName,
        conversationId: "conv-e2e",
        channelConfigId: "ch-1",
      });

      // Verify complete pipeline
      expect(mockAri.getRecordingFile).toHaveBeenCalledWith(recordingName);
      expect(mockStorage.upload).toHaveBeenCalledWith(
        `recordings/test-tenant/${recordingName}.wav`,
        expect.any(Buffer),
        "audio/wav"
      );
      expect(mockAri.deleteRecording).toHaveBeenCalledWith(recordingName);
      expect(mockPrisma.voiceCall.update).toHaveBeenCalled();
      expect(mockPrisma.message.update).toHaveBeenCalled();
    });
  });
});
