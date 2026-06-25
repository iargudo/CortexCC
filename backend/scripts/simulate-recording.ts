/**
 * Simula una llamada entrante con grabacion para poder ver el reproductor de audio en el inbox.
 *
 * Crea: contacto, conversacion, mensajes de voz (ringing → active → ended),
 * un VoiceCall, y un archivo WAV de prueba con un tono de 1 segundo.
 *
 * Uso: npx tsx scripts/simulate-recording.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

function generateTestWav(): Buffer {
  const sampleRate = 8000;
  const durationSec = 3;
  const numSamples = sampleRate * durationSec;
  const byteRate = sampleRate * 2;
  const dataSize = numSamples * 2;
  const fileSize = 36 + dataSize;

  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(fileSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);       // chunk size
  buf.writeUInt16LE(1, 20);        // PCM
  buf.writeUInt16LE(1, 22);        // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(2, 32);        // block align
  buf.writeUInt16LE(16, 34);       // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = 440 + Math.sin(t * 2) * 200;
    const sample = Math.round(Math.sin(2 * Math.PI * freq * t) * 16000);
    buf.writeInt16LE(sample, 44 + i * 2);
  }

  return buf;
}

async function main() {
  const voiceChannel = await prisma.channel.findFirst({
    where: { type: "VOICE" },
  });
  if (!voiceChannel) {
    console.error("No hay canal VOICE configurado. Configura telefonia primero.");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    orderBy: { created_at: "asc" },
  });
  if (!user) {
    console.error("No hay usuarios.");
    process.exit(1);
  }

  const queue = await prisma.queue.findFirst({ where: { is_active: true } });

  // 1. Contacto
  const contact = await prisma.contact.upsert({
    where: { id: "sim-recording-contact" },
    update: {},
    create: {
      id: "sim-recording-contact",
      name: "Demo Grabacion",
      phone: "+593991234567",
      source_system: "voice",
    },
  });
  console.log("Contacto:", contact.id, contact.name);

  // 2. Conversacion
  const now = new Date();
  const conversation = await prisma.conversation.create({
    data: {
      channel_id: voiceChannel.id,
      contact_id: contact.id,
      queue_id: queue?.id,
      status: "RESOLVED",
      source: "voice",
      source_ref_id: `sim-channel-${Date.now()}`,
      subject: "+593991234567",
      last_message_at: now,
      last_message_preview: "[Llamada finalizada]",
    },
  });
  console.log("Conversacion:", conversation.id);

  // 3. Asignacion
  await prisma.conversationAssignment.create({
    data: {
      conversation_id: conversation.id,
      user_id: user.id,
      reason: "simulation",
    },
  });

  // 4. Generar archivo WAV y guardarlo en storage local
  const wavBuffer = generateTestWav();
  const storageKey = `recordings/demo/sim-call-${Date.now()}.wav`;
  const storageDir = path.resolve("uploads", "recordings", "demo");
  fs.mkdirSync(storageDir, { recursive: true });
  const filePath = path.join(storageDir, `sim-call-${Date.now()}.wav`);
  fs.writeFileSync(filePath, wavBuffer);
  const recordingUrl = `/api/files/${encodeURIComponent(storageKey)}`;

  // Also write with the actual storage key path
  const actualPath = path.resolve("uploads", storageKey);
  fs.mkdirSync(path.dirname(actualPath), { recursive: true });
  fs.writeFileSync(actualPath, wavBuffer);
  console.log("WAV generado:", actualPath, `(${wavBuffer.length} bytes)`);

  const startedAt = new Date(now.getTime() - 185_000); // 3 min 5 seg atras
  const endedAt = now;
  const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

  // 5. VoiceCall
  const voiceCall = await prisma.voiceCall.create({
    data: {
      external_call_id: `sim-${Date.now()}`,
      asterisk_channel_id: `sim-channel-${Date.now()}`,
      remote_uri: "+593991234567",
      direction: "inbound",
      state: "ended",
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: durationSeconds,
      user_id: user.id,
      conversation_id: conversation.id,
      channel_id: voiceChannel.id,
      contact_id: contact.id,
      metadata: {
        recording_url: recordingUrl,
        recording_name: `sim-call-demo`,
        source: "simulation",
      },
    },
  });
  console.log("VoiceCall:", voiceCall.id);

  // 6. Mensajes de voz
  const msgRinging = await prisma.message.create({
    data: {
      conversation_id: conversation.id,
      sender_type: "SYSTEM",
      content_type: "VOICE_CALL",
      content: "[Llamada entrante]",
      metadata: {
        external_call_id: voiceCall.external_call_id,
        voice_call_id: voiceCall.id,
        state: "ringing",
        direction: "inbound",
        caller_number: "+593991234567",
      },
      is_internal: false,
      delivery_status: "delivered",
      created_at: new Date(startedAt.getTime() - 5000),
    },
  });

  const msgActive = await prisma.message.create({
    data: {
      conversation_id: conversation.id,
      sender_type: "SYSTEM",
      content_type: "VOICE_CALL",
      content: "[Llamada en curso]",
      metadata: {
        external_call_id: voiceCall.external_call_id,
        voice_call_id: voiceCall.id,
        state: "active",
        direction: "inbound",
        caller_number: "+593991234567",
      },
      is_internal: false,
      delivery_status: "delivered",
      created_at: startedAt,
    },
  });

  const msgEnded = await prisma.message.create({
    data: {
      conversation_id: conversation.id,
      sender_type: "SYSTEM",
      content_type: "VOICE_CALL",
      content: "[Llamada finalizada]",
      metadata: {
        external_call_id: voiceCall.external_call_id,
        voice_call_id: voiceCall.id,
        state: "ended",
        direction: "inbound",
        caller_number: "+593991234567",
        duration_seconds: durationSeconds,
      },
      call_recording_url: recordingUrl,
      call_duration_seconds: durationSeconds,
      is_internal: false,
      delivery_status: "delivered",
      created_at: endedAt,
    },
  });

  console.log("\n--- Simulacion completada ---");
  console.log(`Conversacion: ${conversation.id}`);
  console.log(`Contacto: ${contact.name} (${contact.phone})`);
  console.log(`Duracion: ${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")}`);
  console.log(`Recording URL: ${recordingUrl}`);
  console.log(`Mensajes: ${msgRinging.id}, ${msgActive.id}, ${msgEnded.id}`);
  console.log(`\nAbre el inbox y busca la conversacion con "+593991234567" para ver el reproductor de audio.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
