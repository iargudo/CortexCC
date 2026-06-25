import { getPrisma } from "../../lib/prisma.js";
import { parseVoiceChannelConfig } from "../../channels/voice/config.js";
import { createAriClient } from "./ariClient.js";
import { getStorage } from "../storage.service.js";

export type RecordingUploadJobData = {
  tenantKey: string;
  recordingName: string;
  conversationId?: string;
  channelConfigId?: string;
};

export async function processRecordingUpload(data: RecordingUploadJobData): Promise<void> {
  const { recordingName, conversationId, channelConfigId } = data;

  if (!channelConfigId) {
    console.error("[recording] No channelConfigId, cannot retrieve ARI config");
    return;
  }

  const channel = await getPrisma().channel.findUnique({ where: { id: channelConfigId } });
  if (!channel) {
    console.error("[recording] Channel not found:", channelConfigId);
    return;
  }

  const cfg = parseVoiceChannelConfig(channel.config);
  const ari = createAriClient(cfg);

  let audioBuffer: Buffer;
  try {
    audioBuffer = await ari.getRecordingFile(recordingName);
  } catch (err) {
    console.error("[recording] Failed to download from Asterisk:", err);
    return;
  }

  const storageKey = `recordings/${data.tenantKey}/${recordingName}.wav`;
  const storage = getStorage();
  let recordingUrl: string;
  try {
    recordingUrl = await storage.upload(storageKey, audioBuffer, "audio/wav");
  } catch (err) {
    console.error("[recording] Failed to upload to storage:", err);
    return;
  }

  await ari.deleteRecording(recordingName).catch((err) =>
    console.warn("[recording] Failed to clean up Asterisk recording:", err)
  );

  if (conversationId) {
    const voiceCall = await getPrisma().voiceCall.findFirst({
      where: { conversation_id: conversationId },
      orderBy: { created_at: "desc" },
    });

    if (voiceCall) {
      const durationSeconds = voiceCall.ended_at && voiceCall.started_at
        ? Math.round((voiceCall.ended_at.getTime() - voiceCall.started_at.getTime()) / 1000)
        : undefined;

      await getPrisma().voiceCall.update({
        where: { id: voiceCall.id },
        data: {
          metadata: {
            ...((voiceCall.metadata as Record<string, unknown>) ?? {}),
            recording_url: recordingUrl,
            recording_name: recordingName,
          },
        },
      });

      const endedMessage = await getPrisma().message.findFirst({
        where: {
          conversation_id: conversationId,
          content_type: "VOICE_CALL",
          content: "[Llamada finalizada]",
        },
        orderBy: { created_at: "desc" },
      });

      if (endedMessage) {
        await getPrisma().message.update({
          where: { id: endedMessage.id },
          data: {
            call_recording_url: recordingUrl,
            call_duration_seconds: durationSeconds ?? endedMessage.call_duration_seconds,
          },
        });
      }
    }
  }

  console.log("[recording] Upload complete:", { recordingName, conversationId, storageKey });
}
