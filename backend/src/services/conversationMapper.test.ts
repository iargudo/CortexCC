import { describe, expect, it } from "vitest";
import { mapContact, mapConversation, mapMessage } from "./conversationMapper.js";

function baseMessage(overrides: Partial<Parameters<typeof mapMessage>[0]> = {}) {
  return {
    id: "msg-1",
    conversation_id: "conv-1",
    sender_type: "AGENT" as const,
    sender_id: null,
    content: "Hola",
    content_type: "TEXT",
    metadata: { voice_state: "active" },
    call_duration_seconds: null,
    call_recording_url: null,
    is_internal: false,
    delivery_status: "SENT",
    created_at: new Date("2026-06-01T10:00:00.000Z"),
    sender: { first_name: "Ana", last_name: "Pérez" },
    ...overrides,
  };
}

describe("mapMessage", () => {
  it("maps agent sender name and ISO timestamp", () => {
    const out = mapMessage(baseMessage());
    expect(out.sender_name).toBe("Ana Pérez");
    expect(out.created_at).toBe("2026-06-01T10:00:00.000Z");
    expect(out.content_type).toBe("TEXT");
  });

  it("maps email content type to HTML for API consumers", () => {
    const out = mapMessage(baseMessage({ content_type: "EMAIL", content: "<p>Hi</p>" }));
    expect(out.content_type).toBe("HTML");
  });

  it("maps voice call events", () => {
    const out = mapMessage(
      baseMessage({
        content_type: "VOICE_CALL",
        content: "[Llamada en curso]",
        call_duration_seconds: 42,
        call_recording_url: "https://rec.example/a.wav",
      })
    );
    expect(out.content_type).toBe("VOICE_CALL");
    expect(out.call_duration_seconds).toBe(42);
    expect(out.call_recording_url).toBe("https://rec.example/a.wav");
  });

  it("maps attachments to API shape", () => {
    const out = mapMessage({
      ...baseMessage({ content_type: "FILE" }),
      attachments: [
        {
          filename: "doc.pdf",
          mime_type: "application/pdf",
          size_bytes: 1024,
          storage_url: "https://cdn/doc.pdf",
        } as never,
      ],
    });
    expect(out.content_type).toBe("DOCUMENT");
    expect(out.attachments).toEqual([
      {
        filename: "doc.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
        url: "https://cdn/doc.pdf",
      },
    ]);
  });
});

describe("mapContact", () => {
  it("flattens tags and optional fields", () => {
    const out = mapContact({
      id: "c1",
      name: "Cliente",
      email: "a@b.com",
      phone: "0991234567",
      phone_wa: null,
      teams_id: null,
      source_system: "whatsapp",
      metadata: { vip: true },
      tags: [{ tag: { name: "VIP" } }, { tag: { name: "Cobranza" } }],
    } as never);
    expect(out.tags).toEqual(["VIP", "Cobranza"]);
    expect(out.metadata).toEqual({ vip: true });
    expect(out.phone_wa).toBeUndefined();
  });
});

describe("mapConversation", () => {
  it("includes assignee, queue and last message preview", () => {
    const created = new Date("2026-06-01T09:00:00.000Z");
    const out = mapConversation(
      {
        id: "conv-1",
        status: "ASSIGNED",
        priority: 2,
        subject: "Consulta",
        source: "whatsapp",
        escalation_reason: null,
        escalation_context: null,
        last_message_preview: "Último mensaje",
        last_message_at: new Date("2026-06-01T10:05:00.000Z"),
        wait_time_seconds: 120,
        unread_agent_count: 1,
        created_at: created,
        channel: { type: "WHATSAPP" },
        contact: {
          id: "c1",
          name: "Cliente",
          email: null,
          phone: "099",
          phone_wa: null,
          teams_id: null,
          source_system: null,
          metadata: null,
          tags: [],
        },
        queue: { name: "Soporte" },
        messages: [baseMessage()],
      } as never,
      { displayName: "Ana Pérez", userId: "u1" }
    );

    expect(out.channel).toBe("WHATSAPP");
    expect(out.queue_name).toBe("Soporte");
    expect(out.assigned_agent).toBe("Ana Pérez");
    expect(out.assigned_user_id).toBe("u1");
    expect(out.last_message).toBe("Último mensaje");
    expect(out.unread_count).toBe(1);
    expect(out.messages).toHaveLength(1);
  });
});
