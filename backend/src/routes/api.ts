import { Router, type Express } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma.js";
import { mapChannelType } from "../lib/channelTypes.js";
import { authMiddleware, requireAuth } from "../middleware/auth.js";
import { integrationApiKeyMiddleware } from "../middleware/integrationAuth.js";
import { requireAnyPermission, requirePermission } from "../middleware/requirePermission.js";
import { HttpError } from "../middleware/errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { routeParam } from "../utils/routeParams.js";
import * as authService from "../services/auth.service.js";
import * as conversationService from "../services/conversation.service.js";
import * as contactService from "../services/contact.service.js";
import * as dashboardService from "../services/dashboard.service.js";
import * as reportService from "../services/report.service.js";
import * as qualityService from "../services/quality.service.js";
import * as integrationService from "../services/integration.service.js";
import * as inboundService from "../services/inbound.service.js";
import { ingestVoiceCallEvent } from "../services/voiceInbound.service.js";
import { RoutingEngine } from "../routing/RoutingEngine.js";
import { enqueueRouting } from "../queue/bull.js";
import { createAdapterForType } from "../channels/registry.js";
import { getWhatsAppConfigValidationError } from "../channels/whatsapp/config.js";
import { getEmailConfigValidationError } from "../channels/email/config.js";
import { getVoiceConfigValidationError } from "../channels/voice/config.js";
import type { Server } from "socket.io";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function getIo(app: Express): Server | null {
  return (app.get("io") as Server | undefined) ?? null;
}

/** Emite a la sala del agente/supervisor y actualiza cola/supervisor (misma forma que el motor de routing). */
async function notifyUserOfConversationAssignment(
  app: Express,
  params: {
    conversationId: string;
    targetUserId: string;
    /** Si viene, la notificación es TRANSFER_RECEIVED (derivación manual); si no, NEW_ASSIGNMENT. */
    fromAgentLabel?: string | null;
  }
) {
  const io = getIo(app);
  if (!io) return;
  const full = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    include: { contact: true, channel: true, queue: { select: { id: true, name: true } } },
  });
  const { conversationId, targetUserId } = params;
  io.to(`user:${targetUserId}`).emit("conversation:assigned", {
    conversationId,
    contact_name: full?.contact?.name,
    channel: full?.channel.type,
    queue: full?.queue?.name,
  });
  io.to(`user:${targetUserId}`).emit("notification:new", {
    type: params.fromAgentLabel ? "TRANSFER_RECEIVED" : "NEW_ASSIGNMENT",
    conversation_id: conversationId,
    data: {
      contact_name: full?.contact?.name,
      channel: full?.channel?.type,
      queue: full?.queue?.name,
      ...(params.fromAgentLabel ? { from_agent: params.fromAgentLabel } : {}),
    },
    timestamp: new Date().toISOString(),
  });
  if (full?.queue_id) {
    io.to(`queue:${full.queue_id}`).emit("queue:updated", { queueId: full.queue_id });
    io.emit("supervisor:live_update", { type: "assign", conversationId, queueId: full.queue_id });
  }
}

function isSupervisor(user: Express.Request["authUser"]): boolean {
  return Boolean(user?.roles?.some((r) => r.name === "supervisor" || r.name === "admin"));
}

function conversationViewer(req: Express.Request) {
  const u = req.authUser!;
  return { userId: u.id, isSupervisor: isSupervisor(u) };
}

const limiter = rateLimit({ windowMs: 60_000, max: 300 });

export function buildApiRouter(app: Express): Router {
  const r = Router();
  r.use(limiter);

  r.get(
    "/health",
    asyncHandler(async (_req, res) => {
      res.json({ ok: true, service: "cortex-contact-backend" });
    })
  );

  r.post(
    "/auth/login",
    asyncHandler(async (req, res) => {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) throw new HttpError(400, "email and password required");
      const out = await authService.loginWithPassword(email, password);
      res.json(out);
    })
  );

  r.post(
    "/auth/refresh",
    asyncHandler(async (req, res) => {
      const token = (req.body as { refreshToken?: string }).refreshToken;
      if (!token) throw new HttpError(400, "refreshToken required");
      const out = await authService.refreshSession(token);
      res.json(out);
    })
  );

  r.post(
    "/auth/logout",
    asyncHandler(async (req, res) => {
      const token = (req.body as { refreshToken?: string }).refreshToken;
      if (token) await authService.revokeRefreshToken(token);
      res.json({ ok: true });
    })
  );

  r.get(
    "/integrations/status",
    integrationApiKeyMiddleware,
    asyncHandler(async (_req, res) => {
      let database = false;
      try {
        await prisma.$queryRaw`SELECT 1`;
        database = true;
      } catch {
        database = false;
      }
      let redis = false;
      try {
        const { getRedis } = await import("../lib/redis.js");
        const pong = await getRedis().ping();
        redis = pong === "PONG";
      } catch {
        redis = false;
      }
      res.json({
        ok: database && redis,
        database,
        redis,
        agenthub: true,
        collect: true,
        voice: true,
      });
    })
  );

  r.post(
    "/integrations/escalate",
    integrationApiKeyMiddleware,
    asyncHandler(async (req, res) => {
      const body = req.body as {
        source_system?: string;
        channel_type?: string;
        contact?: { phone?: string; name?: string; external_id?: string };
      };
      if (!body.source_system?.trim()) throw new HttpError(400, "source_system required");
      if (!body.channel_type?.trim()) throw new HttpError(400, "channel_type required");
      if (!body.contact || (body.contact.phone == null && body.contact.external_id == null)) {
        throw new HttpError(400, "contact with phone or external_id required");
      }
      const out = await integrationService.handleGenericEscalation({
        source_system: body.source_system,
        channel_type: body.channel_type,
        contact: body.contact,
        event_type: (req.body as { event_type?: string }).event_type,
        conversation_ref_id: (req.body as { conversation_ref_id?: string }).conversation_ref_id,
        escalation_reason: (req.body as { escalation_reason?: string }).escalation_reason,
        context: (req.body as { context?: unknown }).context,
        preferred_queue: (req.body as { preferred_queue?: string }).preferred_queue,
        priority: (req.body as { priority?: number }).priority,
      });
      res.status(201).json(out);
    })
  );

  r.post(
    "/webhooks/whatsapp/:channelId",
    asyncHandler(async (req, res) => {
      const channelId = routeParam(req, "channelId");
      const ch = await prisma.channel.findUnique({ where: { id: channelId } });
      if (!ch) throw new HttpError(404, "channel not found");

      // ACK inmediato para cumplir SLAs estrictos de proveedores (p. ej. 5s).
      res.status(202).json({ ok: true, accepted: true });

      void (async () => {
        try {
          const adapter = createAdapterForType(ch.type);
          await adapter.initialize(ch);
          const incoming = await adapter.parseIncoming(req.body);
          const ingestion = await inboundService.ingestIncomingMessage(ch.id, incoming);
          const io = getIo(app);
          io?.to(`conversation:${ingestion.conversation_id}`).emit("message:new", {
            conversationId: ingestion.conversation_id,
          });
          const assignments = await prisma.conversationAssignment.findMany({
            where: { conversation_id: ingestion.conversation_id, ended_at: null },
            select: { user_id: true },
          });
          for (const a of assignments) {
            io?.to(`user:${a.user_id}`).emit("message:new", {
              conversationId: ingestion.conversation_id,
            });
          }
        } catch (error) {
          console.error("whatsapp webhook async processing error", {
            channelId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();
    })
  );

  r.use(authMiddleware);

  r.get(
    "/auth/me",
    asyncHandler(async (req, res) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.authUser!.id },
        include: { roles: { include: { role: true } } },
      });
      res.json(authService.toAuthUserResponse(user));
    })
  );

  r.put(
    "/auth/profile",
    asyncHandler(async (req, res) => {
      const body = req.body as { name?: string; email?: string; max_concurrent?: number };
      const updated = await authService.changeProfile(req.authUser!.id, body);
      res.json(updated);
    })
  );

  r.put(
    "/auth/status",
    asyncHandler(async (req, res) => {
      const { status } = req.body as { status?: string };
      if (!status) throw new HttpError(400, "status required");
      const updated = await authService.setAgentStatus(req.authUser!.id, status);
      getIo(app)?.emit("agent:status_changed", { userId: req.authUser!.id, status });
      res.json(updated);
    })
  );

  r.post(
    "/voice/calls/logs",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body as {
        external_call_id?: string;
        remote_uri?: string;
        remote_display_name?: string;
        direction?: string;
        state?: string;
        started_at?: string;
        ended_at?: string;
        duration_seconds?: number;
        metadata?: Record<string, unknown>;
      };

      const stateRaw = String(body.state ?? "").toLowerCase();
      const state =
        stateRaw === "ringing" || stateRaw === "active" || stateRaw === "hold" || stateRaw === "ended"
          ? stateRaw
          : null;
      if (!state) throw new HttpError(400, "state invalid");

      const directionRaw = String(body.direction ?? "outbound").toLowerCase();
      const direction = directionRaw === "inbound" ? "inbound" : "outbound";

      const externalCallId = String(body.external_call_id ?? "").trim();
      if (!externalCallId) throw new HttpError(400, "external_call_id required");

      const remoteUri = String(body.remote_uri ?? "").trim();
      if (!remoteUri) throw new HttpError(400, "remote_uri required");

      const startedAtRaw = body.started_at ? new Date(body.started_at) : null;
      const endedAtRaw = body.ended_at ? new Date(body.ended_at) : null;
      const startedAt = startedAtRaw && !Number.isNaN(startedAtRaw.getTime()) ? startedAtRaw : null;
      const endedAt = endedAtRaw && !Number.isNaN(endedAtRaw.getTime()) ? endedAtRaw : null;

      const row = await prisma.voiceCall.create({
        data: {
          user_id: req.authUser!.id,
          external_call_id: externalCallId,
          remote_uri: remoteUri,
          remote_display_name: body.remote_display_name ? String(body.remote_display_name) : null,
          direction,
          state,
          started_at: startedAt,
          ended_at: endedAt,
          duration_seconds:
            typeof body.duration_seconds === "number" && Number.isFinite(body.duration_seconds)
              ? Math.max(0, Math.round(body.duration_seconds))
              : null,
          metadata: {
            source: "softphone_widget",
            ...(body.metadata ?? {}),
          },
        },
      });

      res.status(201).json({
        id: row.id,
        external_call_id: row.external_call_id,
        state: row.state,
      });
    })
  );

  r.get(
    "/voice/calls/logs",
    requireAuth,
    asyncHandler(async (req, res) => {
      const page = Math.max(1, Number(req.query.page ?? 1));
      const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
      const skip = (page - 1) * limit;

      const where = { user_id: req.authUser!.id };
      const [items, total] = await Promise.all([
        prisma.voiceCall.findMany({
          where,
          orderBy: { created_at: "desc" },
          skip,
          take: limit,
        }),
        prisma.voiceCall.count({ where }),
      ]);

      res.json({ items, page, limit, total });
    })
  );

  r.post(
    "/voice/calls/events",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body as {
        conversation_id?: string;
        external_call_id?: string;
        remote_uri?: string;
        remote_display_name?: string;
        direction?: string;
        state?: string;
        started_at?: string;
        ended_at?: string;
        duration_seconds?: number;
        metadata?: Record<string, unknown>;
      };

      const stateRaw = String(body.state ?? "").toLowerCase();
      const state =
        stateRaw === "ringing" || stateRaw === "active" || stateRaw === "hold" || stateRaw === "ended"
          ? stateRaw
          : null;
      if (!state) throw new HttpError(400, "state invalid");

      const directionRaw = String(body.direction ?? "outbound").toLowerCase();
      const direction = directionRaw === "inbound" ? "inbound" : "outbound";

      const externalCallId = String(body.external_call_id ?? "").trim();
      if (!externalCallId) throw new HttpError(400, "external_call_id required");

      const conversationId = String(body.conversation_id ?? "").trim();
      if (!conversationId) throw new HttpError(400, "conversation_id required");
      await conversationService.assertAgentCanAccessConversation(conversationId, conversationViewer(req));

      const remoteUri = String(body.remote_uri ?? "").trim();
      const incomingTimestamp = body.ended_at || body.started_at;
      const ts = incomingTimestamp ? new Date(incomingTimestamp) : new Date();

      const out = await ingestVoiceCallEvent(
        {
          conversationId,
          externalCallId,
          callerNumber: direction === "inbound" ? remoteUri : undefined,
          dialedNumber: direction === "outbound" ? remoteUri : undefined,
          callerName: body.remote_display_name || undefined,
          direction,
          state,
          timestamp: Number.isNaN(ts.getTime()) ? new Date() : ts,
          durationSeconds:
            typeof body.duration_seconds === "number" && Number.isFinite(body.duration_seconds)
              ? Math.max(0, Math.round(body.duration_seconds))
              : undefined,
          metadata: {
            source: "softphone_widget",
            reported_by_user_id: req.authUser!.id,
            ...(body.metadata ?? {}),
          },
        },
        getIo(app)
      );
      console.log("[voice] softphone event accepted", {
        userId: req.authUser!.id,
        conversationId,
        externalCallId,
        state,
        direction,
        remoteUri,
      });
      res.status(201).json(out);
    })
  );

  r.post(
    "/auth/change-password",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { current_password, new_password } = req.body as {
        current_password?: string;
        new_password?: string;
      };
      if (!current_password || !new_password) {
        throw new HttpError(400, "current_password and new_password required");
      }
      res.json(
        await authService.changePassword(req.authUser!.id, current_password, new_password)
      );
    })
  );

  r.get(
    "/dashboard/stats",
    requireAuth,
    asyncHandler(async (_req, res) => {
      res.json(await dashboardService.getDashboardStats());
    })
  );

  r.get(
    "/reports/volume",
    requireAuth,
    requirePermission("reports"),
    asyncHandler(async (req, res) => {
      const from = new Date(String(req.query.date_from ?? Date.now()));
      const to = new Date(String(req.query.date_to ?? Date.now()));
      res.json(await reportService.volumeReport(from, to));
    })
  );

  r.get(
    "/reports/productivity",
    requireAuth,
    requirePermission("reports"),
    asyncHandler(async (req, res) => {
      const from = new Date(String(req.query.date_from ?? Date.now()));
      const to = new Date(String(req.query.date_to ?? Date.now()));
      res.json(await reportService.productivityReport(from, to));
    })
  );

  r.get(
    "/reports/sla",
    requireAuth,
    requirePermission("reports"),
    asyncHandler(async (req, res) => {
      const from = new Date(String(req.query.date_from ?? Date.now()));
      const to = new Date(String(req.query.date_to ?? Date.now()));
      res.json(await reportService.slaReport(from, to));
    })
  );

  r.get(
    "/reports/summary",
    requireAuth,
    requirePermission("reports"),
    asyncHandler(async (req, res) => {
      const from = new Date(String(req.query.date_from ?? Date.now()));
      const to = new Date(String(req.query.date_to ?? Date.now()));
      res.json(await reportService.summaryKpis(from, to));
    })
  );

  r.get(
    "/reports/hourly",
    requireAuth,
    requirePermission("reports"),
    asyncHandler(async (req, res) => {
      const from = new Date(String(req.query.date_from ?? Date.now()));
      const to = new Date(String(req.query.date_to ?? Date.now()));
      res.json(await reportService.hourlyVolumeReport(from, to));
    })
  );

  r.get(
    "/reports/csat",
    requireAuth,
    requirePermission("reports"),
    asyncHandler(async (req, res) => {
      const from = new Date(String(req.query.date_from ?? Date.now()));
      const to = new Date(String(req.query.date_to ?? Date.now()));
      res.json(await reportService.csatTrendReport(from, to));
    })
  );

  r.get(
    "/reports/export",
    requireAuth,
    requirePermission("reports"),
    asyncHandler(async (req, res) => {
      const type = String(req.query.type ?? "volume");
      const from = new Date(String(req.query.date_from ?? Date.now()));
      const to = new Date(String(req.query.date_to ?? Date.now()));
      const { filename, body } = await reportService.exportReportCsv(type, from, to);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(body);
    })
  );

  r.get(
    "/quality/pending",
    requireAuth,
    requirePermission("quality"),
    asyncHandler(async (_req, res) => {
      res.json(await qualityService.listPending());
    })
  );

  r.get(
    "/quality/evaluations",
    requireAuth,
    requirePermission("quality"),
    asyncHandler(async (_req, res) => {
      res.json(await qualityService.listEvaluations());
    })
  );

  r.post(
    "/quality/evaluations",
    requireAuth,
    requirePermission("quality"),
    asyncHandler(async (req, res) => {
      const body = req.body as {
        conversation_id: string;
        categories: { saludo: number; empatia: number; resolucion: number; cierre: number };
        comment: string;
      };
      const row = await qualityService.createEvaluation({
        ...body,
        evaluatorId: req.authUser!.id,
      });
      res.status(201).json(row);
    })
  );

  r.get(
    "/search/global",
    requireAuth,
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? "").trim();
      const limit = Math.min(15, Math.max(1, Number(req.query.limit ?? 8)));
      if (q.length < 2) {
        res.json({ conversations: [], contacts: [] });
        return;
      }
      res.json(
        await conversationService.inboxGlobalSearch({
          userId: req.authUser!.id,
          q,
          limit,
          isSupervisor: isSupervisor(req.authUser!),
        })
      );
    })
  );

  r.get(
    "/conversations",
    requireAuth,
    asyncHandler(async (req, res) => {
      const tab = String(req.query.tab ?? "mine");
      const channel = req.query.channel ? String(req.query.channel) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);
      const out = await conversationService.listConversations({
        userId: req.authUser!.id,
        tab,
        channel,
        status,
        page,
        limit,
        isSupervisor: Boolean(isSupervisor(req.authUser)),
      });
      res.json(out);
    })
  );

  r.post(
    "/conversations",
    requireAuth,
    requirePermission("inbox"),
    asyncHandler(async (req, res) => {
      const conv = await conversationService.createManualConversation(
        req.authUser!.id,
        req.body,
        conversationViewer(req)
      );
      res.status(201).json(conv);
    })
  );

  r.get(
    "/conversations/:id/context",
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await conversationService.getEscalationContext(routeParam(req, "id"), conversationViewer(req)));
    })
  );

  r.get(
    "/conversations/:id/integrations",
    requireAuth,
    asyncHandler(async (req, res) => {
      const roleNames = req.authUser!.roles.map((r) => r.name);
      await conversationService.assertAgentCanAccessConversation(routeParam(req, "id"), conversationViewer(req));
      res.json(await integrationService.getConversationIntegrationWorkspace(routeParam(req, "id"), roleNames));
    })
  );

  r.get(
    "/conversations/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await conversationService.getConversation(routeParam(req, "id"), conversationViewer(req)));
    })
  );

  r.post(
    "/conversations/:id/accept",
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await conversationService.acceptConversation(routeParam(req, "id"), req.authUser!.id));
    })
  );

  r.post(
    "/conversations/:id/reject",
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await conversationService.rejectConversation(routeParam(req, "id"), req.authUser!.id));
    })
  );

  r.post(
    "/conversations/:id/hold",
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await conversationService.holdConversation(routeParam(req, "id"), conversationViewer(req)));
    })
  );

  r.post(
    "/conversations/:id/resume",
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await conversationService.resumeConversation(routeParam(req, "id"), conversationViewer(req)));
    })
  );

  r.post(
    "/conversations/:id/resolve",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { disposition_id, note } = req.body as { disposition_id?: string; note?: string };
      if (!disposition_id) throw new HttpError(400, "disposition_id required");
      res.json(
        await conversationService.resolveConversation(
          routeParam(req, "id"),
          disposition_id,
          note,
          conversationViewer(req)
        )
      );
    })
  );

  r.post(
    "/conversations/:id/transfer",
    requireAuth,
    asyncHandler(async (req, res) => {
      const id = routeParam(req, "id");
      const body = req.body as {
        target_type?: string;
        target_id?: string;
        queue_id?: string;
        reason?: string;
      };
      const conv = await conversationService.transferConversation(
        id,
        body,
        req.authUser!.id,
        isSupervisor(req.authUser)
      );
      if (body.target_id && (body.target_type === "agent" || body.target_type === "supervisor")) {
        const label =
          `${req.authUser!.first_name} ${req.authUser!.last_name}`.trim() || req.authUser!.email;
        await notifyUserOfConversationAssignment(app, {
          conversationId: id,
          targetUserId: body.target_id,
          fromAgentLabel: label,
        });
      }
      res.json(conv);
    })
  );

  r.get(
    "/conversations/:id/messages",
    requireAuth,
    asyncHandler(async (req, res) => {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 50);
      res.json(await conversationService.listMessages(routeParam(req, "id"), page, limit, conversationViewer(req)));
    })
  );

  r.post(
    "/conversations/:id/messages",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { content, content_type, is_internal } = req.body as {
        content?: string;
        content_type?: string;
        is_internal?: boolean;
      };
      if (!content) throw new HttpError(400, "content required");
      const msg = await conversationService.appendMessage(
        routeParam(req, "id"),
        {
          userId: req.authUser!.id,
          content,
          content_type,
          is_internal,
          sender_type: "AGENT",
        },
        conversationViewer(req)
      );
      getIo(app)?.to(`conversation:${routeParam(req, "id")}`).emit("message:new", { conversationId: routeParam(req, "id"), message: msg });
      res.status(201).json(msg);
    })
  );

  r.post(
    "/conversations/:id/messages/email",
    requireAuth,
    upload.array("attachments", 10),
    asyncHandler(async (req, res) => {
      const { to, cc, subject, body } = req.body as {
        to?: string;
        cc?: string;
        subject?: string;
        body?: string;
      };
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const attachments = files.map((f) => ({
        filename: f.originalname,
        mime_type: f.mimetype || "application/octet-stream",
        size_bytes: f.size,
        storage_url: `data:${f.mimetype || "application/octet-stream"};base64,${f.buffer.toString("base64")}`,
      }));
      const msg = await conversationService.appendMessage(
        routeParam(req, "id"),
        {
          userId: req.authUser!.id,
          content: body ?? "",
          content_type: "EMAIL",
          metadata: { to, cc, subject },
          email_subject: subject,
          email_cc: cc,
          attachments,
          sender_type: "AGENT",
        },
        conversationViewer(req)
      );
      res.status(201).json(msg);
    })
  );

  r.get(
    "/contacts",
    requireAuth,
    requirePermission("contacts"),
    asyncHandler(async (req, res) => {
      const search = req.query.search ? String(req.query.search) : undefined;
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);
      res.json(await contactService.listContacts(search, page, limit));
    })
  );

  r.get(
    "/contacts/:id",
    requireAuth,
    requirePermission("contacts"),
    asyncHandler(async (req, res) => {
      res.json(await contactService.getContact(routeParam(req, "id")));
    })
  );

  r.post(
    "/contacts",
    requireAuth,
    requirePermission("contacts"),
    asyncHandler(async (req, res) => {
      res.status(201).json(await contactService.createContact(req.body));
    })
  );

  r.put(
    "/contacts/:id",
    requireAuth,
    requirePermission("contacts"),
    asyncHandler(async (req, res) => {
      res.json(await contactService.updateContact(routeParam(req, "id"), req.body));
    })
  );

  r.delete(
    "/contacts/:id",
    requireAuth,
    requirePermission("contacts"),
    asyncHandler(async (req, res) => {
      await contactService.deleteContact(routeParam(req, "id"));
      res.status(204).send();
    })
  );

  r.post(
    "/contacts/import",
    requireAuth,
    requirePermission("contacts"),
    upload.single("file"),
    asyncHandler(async (req, res) => {
      const file = req.file;
      if (!file) throw new HttpError(400, "file required");
      const records = parse(file.buffer.toString("utf8"), { columns: true, skip_empty_lines: true }) as Record<
        string,
        string
      >[];
      let n = 0;
      for (const row of records) {
        const name = row.name ?? row.nombre ?? row.Name;
        if (!name) continue;
        await contactService.createContact({
          name,
          email: row.email,
          phone: row.phone ?? row.telefono,
          tags: row.tags ? row.tags.split(",").map((t) => t.trim()) : [],
        });
        n++;
      }
      res.json({ imported: n });
    })
  );

  r.get(
    "/contacts/export",
    requireAuth,
    requirePermission("contacts"),
    asyncHandler(async (_req, res) => {
      const rows = await prisma.contact.findMany({ take: 10_000 });
      const header = "id,name,email,phone\n";
      const body = rows.map((c) => `${c.id},${c.name ?? ""},${c.email ?? ""},${c.phone ?? ""}`).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=contacts.csv");
      res.send(header + body);
    })
  );

  r.post(
    "/contacts/merge",
    requireAuth,
    requirePermission("contacts"),
    asyncHandler(async (req, res) => {
      const { source_id, target_id } = req.body as { source_id?: string; target_id?: string };
      if (!source_id || !target_id) throw new HttpError(400, "source_id and target_id required");
      res.json(await contactService.mergeContacts(source_id, target_id));
    })
  );

  r.get(
    "/contacts/:id/timeline",
    requireAuth,
    requirePermission("contacts"),
    asyncHandler(async (req, res) => {
      res.json(await contactService.timeline(routeParam(req, "id")));
    })
  );

  r.get(
    "/contacts/:id/notes",
    requireAuth,
    requirePermission("contacts"),
    asyncHandler(async (req, res) => {
      res.json(await contactService.listNotes(routeParam(req, "id")));
    })
  );

  r.post(
    "/contacts/:id/notes",
    requireAuth,
    requirePermission("contacts"),
    asyncHandler(async (req, res) => {
      const { content } = req.body as { content?: string };
      if (!content) throw new HttpError(400, "content required");
      res.status(201).json(await contactService.addNote(routeParam(req, "id"), req.authUser!.id, content));
    })
  );

  r.put(
    "/contacts/:id/tags",
    requireAuth,
    requirePermission("contacts"),
    asyncHandler(async (req, res) => {
      const { tags } = req.body as { tags?: string[] };
      if (!tags) throw new HttpError(400, "tags required");
      res.json(await contactService.setTags(routeParam(req, "id"), tags));
    })
  );

  r.get(
    "/agents",
    requireAuth,
    asyncHandler(async (_req, res) => {
      const users = await prisma.user.findMany({
        include: {
          skills: { include: { skill: true } },
          teams: { include: { team: true } },
          assignments: { where: { ended_at: null } },
        },
      });
      res.json(
        users.map((u) => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          email: u.email,
          avatar: u.avatar_url,
          status: u.status,
          max_concurrent: u.max_concurrent,
          active_conversations: u.assignments.length,
          skills: u.skills.map((s) => ({ name: s.skill.name, proficiency: s.proficiency })),
          teams: u.teams.map((t) => t.team.name),
          resolved_today: 0,
          status_since: u.status_since.toISOString(),
        }))
      );
    })
  );

  r.get(
    "/agents/online",
    requireAuth,
    asyncHandler(async (_req, res) => {
      const users = await prisma.user.findMany({
        where: { status: { in: ["ONLINE", "BUSY"] } },
        include: { skills: { include: { skill: true } }, assignments: { where: { ended_at: null } } },
      });
      res.json(
        users.map((u) => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          email: u.email,
          status: u.status,
          max_concurrent: u.max_concurrent,
          active_conversations: u.assignments.length,
          skills: u.skills.map((s) => ({ name: s.skill.name, proficiency: s.proficiency })),
        }))
      );
    })
  );

  r.get(
    "/agents/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const u = await prisma.user.findUnique({
        where: { id: routeParam(req, "id") },
        include: { skills: { include: { skill: true } }, assignments: { where: { ended_at: null } } },
      });
      if (!u) throw new HttpError(404, "Not found");
      res.json({
        id: u.id,
        name: `${u.first_name} ${u.last_name}`,
        email: u.email,
        status: u.status,
        max_concurrent: u.max_concurrent,
        active_conversations: u.assignments.length,
        skills: u.skills.map((s) => ({ name: s.skill.name, proficiency: s.proficiency })),
      });
    })
  );

  r.put(
    "/agents/:id/status",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { status } = req.body as { status?: string };
      if (!status) throw new HttpError(400, "status required");
      const u = await prisma.user.update({
        where: { id: routeParam(req, "id") },
        data: { status: status as never, status_since: new Date() },
      });
      getIo(app)?.emit("agent:status_changed", { userId: u.id, status: u.status });
      res.json({ id: u.id, status: u.status });
    })
  );

  r.get(
    "/queues",
    requireAuth,
    asyncHandler(async (_req, res) => {
      const queues = await prisma.queue.findMany({
        include: { team: true, _count: { select: { conversations: { where: { status: "WAITING" } } } } },
      });
      const queueIds = queues.map((q) => q.id);
      const teamIds = [...new Set(queues.map((q) => q.team_id).filter(Boolean))] as string[];

      const activeByQueue = await prisma.conversation.groupBy({
        by: ["queue_id", "status"],
        where: { queue_id: { not: null } },
        _count: true,
      });
      const map = new Map<string, { waiting: number; active: number }>();
      for (const row of activeByQueue) {
        if (!row.queue_id) continue;
        const cur = map.get(row.queue_id) ?? { waiting: 0, active: 0 };
        if (row.status === "WAITING") cur.waiting += row._count;
        if (row.status === "ACTIVE" || row.status === "ASSIGNED") cur.active += row._count;
        map.set(row.queue_id, cur);
      }

      const onlineByTeam = new Map<string, number>();
      if (teamIds.length) {
        const onlineMembers = await prisma.teamMember.findMany({
          where: { team_id: { in: teamIds }, user: { status: "ONLINE" } },
          select: { team_id: true },
        });
        for (const m of onlineMembers) {
          onlineByTeam.set(m.team_id, (onlineByTeam.get(m.team_id) ?? 0) + 1);
        }
      }

      const weekAgo = new Date(Date.now() - 7 * 86_400_000);
      const waitAvgs =
        queueIds.length > 0
          ? await prisma.conversation.groupBy({
              by: ["queue_id"],
              where: {
                queue_id: { in: queueIds },
                resolved_at: { gte: weekAgo },
                wait_time_seconds: { not: null },
              },
              _avg: { wait_time_seconds: true },
            })
          : [];
      const waitMap = new Map<string, number>();
      for (const w of waitAvgs) {
        if (!w.queue_id) continue;
        const v = w._avg.wait_time_seconds;
        waitMap.set(w.queue_id, Math.round(typeof v === "number" ? v : Number(v ?? 0)));
      }

      const sod = new Date();
      sod.setHours(0, 0, 0, 0);
      const slaRows =
        queueIds.length > 0
          ? await prisma.conversation.groupBy({
              by: ["queue_id", "sla_breached"],
              where: { queue_id: { in: queueIds }, resolved_at: { gte: sod } },
              _count: { _all: true },
            })
          : [];
      const slaByQueue = new Map<string, { ok: number; bad: number }>();
      for (const row of slaRows) {
        if (!row.queue_id) continue;
        const cur = slaByQueue.get(row.queue_id) ?? { ok: 0, bad: 0 };
        if (row.sla_breached) cur.bad += row._count._all;
        else cur.ok += row._count._all;
        slaByQueue.set(row.queue_id, cur);
      }

      res.json(
        queues.map((q) => {
          const sla = slaByQueue.get(q.id);
          const slaTotal = (sla?.ok ?? 0) + (sla?.bad ?? 0);
          const slaPercent = slaTotal === 0 ? 100 : Math.round(((sla?.ok ?? 0) / slaTotal) * 100);
          return {
            id: q.id,
            name: q.name,
            description: q.description,
            team_id: q.team_id,
            team: q.team?.name,
            routing_strategy: q.routing_strategy,
            waiting: map.get(q.id)?.waiting ?? 0,
            active: map.get(q.id)?.active ?? 0,
            agents_online: q.team_id ? onlineByTeam.get(q.team_id) ?? 0 : 0,
            sla_percent: slaPercent,
            avg_wait_seconds: waitMap.get(q.id) ?? 0,
            max_wait_seconds: q.max_wait_seconds,
            is_active: q.is_active,
          };
        })
      );
    })
  );

  r.get(
    "/queues/live",
    requireAuth,
    requirePermission("supervisor"),
    asyncHandler(async (_req, res) => {
      const queues = await prisma.queue.findMany();
      res.json(queues);
    })
  );

  r.get(
    "/queues/:id/waiting",
    requireAuth,
    asyncHandler(async (req, res) => {
      const rows = await prisma.conversation.findMany({
        where: { queue_id: routeParam(req, "id"), status: "WAITING" },
        include: {
          contact: { include: { tags: { include: { tag: true } } } },
          channel: true,
          queue: { select: { name: true } },
          messages: {
            orderBy: { created_at: "asc" },
            take: 100,
            include: {
              attachments: true,
              sender: { select: { first_name: true, last_name: true } },
            },
          },
        },
      });
      const { mapConversation } = await import("../services/conversationMapper.js");
      res.json(await Promise.all(rows.map((c) => mapConversation(c, null))));
    })
  );

  r.get(
    "/queues/:id/active",
    requireAuth,
    asyncHandler(async (req, res) => {
      const rows = await prisma.conversation.findMany({
        where: {
          queue_id: routeParam(req, "id"),
          status: { in: ["ASSIGNED", "ACTIVE", "WRAP_UP", "ON_HOLD"] },
        },
        include: {
          contact: { include: { tags: { include: { tag: true } } } },
          channel: true,
          queue: { select: { name: true } },
          messages: {
            orderBy: { created_at: "asc" },
            take: 100,
            include: {
              attachments: true,
              sender: { select: { first_name: true, last_name: true } },
            },
          },
        },
      });
      const { mapConversation } = await import("../services/conversationMapper.js");
      res.json(await Promise.all(rows.map((c) => mapConversation(c, null))));
    })
  );

  r.post(
    "/queues",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const body = req.body as {
        name: string;
        description?: string;
        team?: string;
        routing_strategy?: string;
        max_wait_seconds?: number;
      };
      const team = body.team
        ? await prisma.team.findFirst({ where: { name: body.team } })
        : null;
      const q = await prisma.queue.create({
        data: {
          name: body.name,
          description: body.description,
          team_id: team?.id,
          routing_strategy: (body.routing_strategy as never) ?? "ROUND_ROBIN",
          max_wait_seconds: body.max_wait_seconds ?? 300,
        },
      });
      res.status(201).json(q);
    })
  );

  r.put(
    "/queues/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const q = await prisma.queue.update({ where: { id: routeParam(req, "id") }, data: req.body });
      res.json(q);
    })
  );

  r.delete(
    "/queues/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      await prisma.queue.delete({ where: { id: routeParam(req, "id") } });
      res.status(204).send();
    })
  );

  r.post(
    "/routing/assign",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body as {
        conversation_id?: string;
        strategy?: string;
        target_type?: string;
        target_id?: string;
        queue_id?: string;
        reason?: string;
      };
      if (!body.conversation_id) throw new HttpError(400, "conversation_id required");
      if (body.target_type === "auto" || !body.target_type) {
        await enqueueRouting({ conversationId: body.conversation_id });
        res.json({ ok: true, mode: "queued" });
        return;
      }
      await conversationService.transferConversation(
        body.conversation_id,
        {
          target_type: body.target_type === "ai" ? "agent" : body.target_type,
          target_id: body.target_id,
          queue_id: body.queue_id,
          reason: body.reason,
        },
        req.authUser!.id,
        isSupervisor(req.authUser)
      );
      const resolvedType = body.target_type === "ai" ? "agent" : body.target_type;
      if (
        body.target_id &&
        (resolvedType === "agent" || resolvedType === "supervisor")
      ) {
        const label =
          `${req.authUser!.first_name} ${req.authUser!.last_name}`.trim() || req.authUser!.email;
        await notifyUserOfConversationAssignment(app, {
          conversationId: body.conversation_id,
          targetUserId: body.target_id,
          fromAgentLabel: label,
        });
      }
      res.json({ ok: true });
    })
  );

  r.get(
    "/routing/recommend",
    requireAuth,
    asyncHandler(async (req, res) => {
      const conversationId = String(req.query.conversation_id ?? "");
      const strategy = String(req.query.strategy ?? "LEAST_BUSY") as never;
      const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!conv?.queue_id) throw new HttpError(400, "Conversation has no queue");
      const engine = new RoutingEngine(prisma, getIo(app));
      const agentId = await engine.recommendAgent(conv.queue_id, strategy);
      res.json({ agent_id: agentId });
    })
  );

  r.get(
    "/settings/channels/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const ch = await prisma.channel.findUnique({ where: { id: routeParam(req, "id") } });
      if (!ch) throw new HttpError(404, "channel not found");
      res.json(ch);
    })
  );

  r.get(
    "/settings/channels",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (_req, res) => {
      const channels = await prisma.channel.findMany();
      const counts = await prisma.conversation.groupBy({ by: ["channel_id"], _count: true, where: { created_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } });
      const map = new Map(counts.map((c) => [c.channel_id, c._count]));
      res.json(
        channels.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          status: c.status,
          conversations_today: map.get(c.id) ?? 0,
        }))
      );
    })
  );

  r.post(
    "/settings/channels",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const body = req.body as { name?: string; type?: string; status?: string; config?: object };
      if (!body.name?.trim() || !body.type?.trim()) {
        throw new HttpError(400, "name and type are required");
      }
      const mappedType = mapChannelType(body.type);
      if (mappedType === "WHATSAPP") {
        const error = getWhatsAppConfigValidationError(body.config ?? {});
        if (error) throw new HttpError(400, `Invalid WhatsApp channel config: ${error}`);
      }
      if (mappedType === "EMAIL") {
        const error = getEmailConfigValidationError(body.config ?? {});
        if (error) throw new HttpError(400, `Invalid EMAIL channel config: ${error}`);
      }
      if (mappedType === "VOICE") {
        const error = getVoiceConfigValidationError(body.config ?? {});
        if (error) throw new HttpError(400, `Invalid VOICE channel config: ${error}`);
      }
      const ch = await prisma.channel.create({
        data: {
          name: body.name.trim(),
          type: mappedType,
          status: body.status ?? "active",
          config: (body.config as object) ?? {},
        },
      });
      res.status(201).json(ch);
    })
  );

  r.delete(
    "/settings/channels/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      try {
        await prisma.channel.delete({ where: { id: routeParam(req, "id") } });
        res.status(204).send();
      } catch {
        throw new HttpError(409, "Channel is in use or could not be deleted");
      }
    })
  );

  r.post(
    "/settings/channels/:id/test",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const ch = await prisma.channel.findUnique({ where: { id: routeParam(req, "id") } });
      if (!ch) throw new HttpError(404, "Channel not found");
      const adapter = createAdapterForType(ch.type);
      await adapter.initialize(ch);
      const health = await adapter.healthCheck(ch);
      res.json({ ok: health.ok, detail: health.detail });
    })
  );

  r.put(
    "/settings/channels/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const body = req.body as { config?: object; status?: string; name?: string };
      const existing = await prisma.channel.findUnique({ where: { id: routeParam(req, "id") } });
      if (!existing) throw new HttpError(404, "channel not found");
      if (existing.type === "WHATSAPP" && body.config !== undefined) {
        const error = getWhatsAppConfigValidationError(body.config);
        if (error) throw new HttpError(400, `Invalid WhatsApp channel config: ${error}`);
      }
      if (existing.type === "EMAIL" && body.config !== undefined) {
        const error = getEmailConfigValidationError(body.config);
        if (error) throw new HttpError(400, `Invalid EMAIL channel config: ${error}`);
      }
      if (existing.type === "VOICE" && body.config !== undefined) {
        const error = getVoiceConfigValidationError(body.config);
        if (error) throw new HttpError(400, `Invalid VOICE channel config: ${error}`);
      }
      const ch = await prisma.channel.update({
        where: { id: routeParam(req, "id") },
        data: {
          ...(body.config !== undefined ? { config: body.config } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
        },
      });
      res.json(ch);
    })
  );

  r.get(
    "/settings/skills",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (_req, res) => {
      res.json(await prisma.skill.findMany());
    })
  );
  r.post(
    "/settings/skills",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.status(201).json(await prisma.skill.create({ data: req.body }));
    })
  );
  r.put(
    "/settings/skills/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.json(await prisma.skill.update({ where: { id: routeParam(req, "id") }, data: req.body }));
    })
  );
  r.delete(
    "/settings/skills/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      await prisma.skill.delete({ where: { id: routeParam(req, "id") } });
      res.status(204).send();
    })
  );

  r.get(
    "/settings/teams",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (_req, res) => {
      const teams = await prisma.team.findMany({ include: { _count: { select: { members: true } } } });
      res.json(
        teams.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          member_count: t._count.members,
        }))
      );
    })
  );
  r.post(
    "/settings/teams",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.status(201).json(await prisma.team.create({ data: req.body }));
    })
  );
  r.put(
    "/settings/teams/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.json(await prisma.team.update({ where: { id: routeParam(req, "id") }, data: req.body }));
    })
  );
  r.delete(
    "/settings/teams/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      await prisma.team.delete({ where: { id: routeParam(req, "id") } });
      res.status(204).send();
    })
  );

  r.get(
    "/settings/roles",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (_req, res) => {
      res.json(await prisma.role.findMany());
    })
  );
  r.post(
    "/settings/roles",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.status(201).json(await prisma.role.create({ data: req.body }));
    })
  );
  r.put(
    "/settings/roles/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.json(await prisma.role.update({ where: { id: routeParam(req, "id") }, data: req.body }));
    })
  );
  r.delete(
    "/settings/roles/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      await prisma.role.delete({ where: { id: routeParam(req, "id") } });
      res.status(204).send();
    })
  );

  r.get(
    "/settings/dispositions",
    requireAuth,
    requirePermission("inbox"),
    asyncHandler(async (_req, res) => {
      res.json(await prisma.disposition.findMany());
    })
  );
  r.post(
    "/settings/dispositions",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.status(201).json(await prisma.disposition.create({ data: req.body }));
    })
  );
  r.put(
    "/settings/dispositions/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.json(await prisma.disposition.update({ where: { id: routeParam(req, "id") }, data: req.body }));
    })
  );
  r.delete(
    "/settings/dispositions/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      await prisma.disposition.delete({ where: { id: routeParam(req, "id") } });
      res.status(204).send();
    })
  );

  r.get(
    "/settings/quick-replies",
    requireAuth,
    asyncHandler(async (_req, res) => {
      res.json(await prisma.quickReply.findMany());
    })
  );
  r.post(
    "/settings/quick-replies",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.status(201).json(await prisma.quickReply.create({ data: req.body }));
    })
  );
  r.put(
    "/settings/quick-replies/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.json(await prisma.quickReply.update({ where: { id: routeParam(req, "id") }, data: req.body }));
    })
  );
  r.delete(
    "/settings/quick-replies/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      await prisma.quickReply.delete({ where: { id: routeParam(req, "id") } });
      res.status(204).send();
    })
  );

  r.get(
    "/settings/sla-policies",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (_req, res) => {
      res.json(await prisma.slaPolicy.findMany());
    })
  );
  r.post(
    "/settings/sla-policies",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.status(201).json(await prisma.slaPolicy.create({ data: req.body }));
    })
  );
  r.put(
    "/settings/sla-policies/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.json(await prisma.slaPolicy.update({ where: { id: routeParam(req, "id") }, data: req.body }));
    })
  );
  r.delete(
    "/settings/sla-policies/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      await prisma.slaPolicy.delete({ where: { id: routeParam(req, "id") } });
      res.status(204).send();
    })
  );

  r.get(
    "/settings/business-hours",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (_req, res) => {
      res.json(await prisma.businessHours.findMany());
    })
  );
  r.post(
    "/settings/business-hours",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.status(201).json(await prisma.businessHours.create({ data: req.body }));
    })
  );
  r.put(
    "/settings/business-hours/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.json(await prisma.businessHours.update({ where: { id: routeParam(req, "id") }, data: req.body }));
    })
  );

  r.get(
    "/settings/email-templates",
    requireAuth,
    asyncHandler(async (_req, res) => {
      res.json(await prisma.emailTemplate.findMany());
    })
  );
  r.post(
    "/settings/email-templates",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.status(201).json(await prisma.emailTemplate.create({ data: req.body }));
    })
  );
  r.put(
    "/settings/email-templates/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.json(await prisma.emailTemplate.update({ where: { id: routeParam(req, "id") }, data: req.body }));
    })
  );
  r.delete(
    "/settings/email-templates/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      await prisma.emailTemplate.delete({ where: { id: routeParam(req, "id") } });
      res.status(204).send();
    })
  );

  r.get(
    "/settings/integrations-summary",
    requireAuth,
    requireAnyPermission("settings", "supervisor"),
    asyncHandler(async (_req, res) => {
      res.json(await integrationService.getIntegrationsUiSummary());
    })
  );

  r.get(
    "/settings/integration-apps",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (_req, res) => {
      res.json(await integrationService.listIntegrationApps());
    })
  );

  r.post(
    "/settings/integration-apps",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.status(201).json(await integrationService.createIntegrationApp(req.body));
    })
  );

  r.post(
    "/settings/integration-apps/bootstrap-real-examples",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (_req, res) => {
      res.status(201).json(await integrationService.bootstrapRealWebExamples());
    })
  );

  r.put(
    "/settings/integration-apps/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.json(await integrationService.updateIntegrationApp(routeParam(req, "id"), req.body));
    })
  );

  r.delete(
    "/settings/integration-apps/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      await integrationService.deleteIntegrationApp(routeParam(req, "id"));
      res.status(204).send();
    })
  );

  r.get(
    "/settings/integration-bindings",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (_req, res) => {
      res.json(await integrationService.listIntegrationBindings());
    })
  );

  r.post(
    "/settings/integration-bindings",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.status(201).json(await integrationService.createIntegrationBinding(req.body));
    })
  );

  r.put(
    "/settings/integration-bindings/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      res.json(await integrationService.updateIntegrationBinding(routeParam(req, "id"), req.body));
    })
  );

  r.delete(
    "/settings/integration-bindings/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      await integrationService.deleteIntegrationBinding(routeParam(req, "id"));
      res.status(204).send();
    })
  );

  r.get(
    "/settings/ai-assistants-preview",
    requireAuth,
    asyncHandler(async (_req, res) => {
      res.json(integrationService.getAiAssistantsPreview());
    })
  );

  r.get(
    "/settings/general",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (_req, res) => {
      const org = await prisma.organizationSettings.findUnique({ where: { id: "default" } });
      res.json(org);
    })
  );
  r.put(
    "/settings/general",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const org = await prisma.organizationSettings.upsert({
        where: { id: "default" },
        create: { id: "default", ...req.body },
        update: req.body,
      });
      res.json(org);
    })
  );

  r.get(
    "/settings/softphone/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const org = await prisma.organizationSettings.findUnique({ where: { id: "default" } });
      const user = await prisma.user.findUnique({
        where: { id: req.authUser!.id },
        select: { sip_extension: true, sip_password: true },
      });

      res.json({
        server: org?.sip_server ?? "",
        realm: org?.sip_realm ?? "",
        displayName: org?.sip_display_name ?? "",
        stunServers: org?.sip_stun_servers ?? ["stun:stun.l.google.com:19302"],
        iceGatheringTimeout: org?.sip_ice_gathering_timeout ?? 5000,
        extension: user?.sip_extension ?? "",
        password: user?.sip_password ?? "",
      });
    })
  );

  r.put(
    "/settings/softphone/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body as {
        server?: string;
        realm?: string;
        displayName?: string;
        stunServers?: string[];
        iceGatheringTimeout?: number;
        extension?: string;
        password?: string;
      };

      const canUpdateShared = req.authUser!.roles.some((r) => r.name === "admin" || r.name === "supervisor");
      const trimmedExtension = String(body.extension ?? "").trim();
      const rawPassword = String(body.password ?? "");

      await prisma.user.update({
        where: { id: req.authUser!.id },
        data: {
          sip_extension: trimmedExtension || null,
          sip_password: rawPassword || null,
        },
      });

      if (canUpdateShared) {
        const stunServers =
          Array.isArray(body.stunServers) && body.stunServers.length > 0
            ? body.stunServers.map((s) => String(s).trim()).filter(Boolean)
            : ["stun:stun.l.google.com:19302"];
        const iceGatheringTimeout =
          typeof body.iceGatheringTimeout === "number" && Number.isFinite(body.iceGatheringTimeout)
            ? Math.max(1000, Math.min(30000, Math.round(body.iceGatheringTimeout)))
            : 5000;

        await prisma.organizationSettings.upsert({
          where: { id: "default" },
          create: {
            id: "default",
            sip_server: String(body.server ?? "").trim() || null,
            sip_realm: String(body.realm ?? "").trim() || null,
            sip_display_name: String(body.displayName ?? "").trim() || null,
            sip_stun_servers: stunServers,
            sip_ice_gathering_timeout: iceGatheringTimeout,
          },
          update: {
            sip_server: String(body.server ?? "").trim() || null,
            sip_realm: String(body.realm ?? "").trim() || null,
            sip_display_name: String(body.displayName ?? "").trim() || null,
            sip_stun_servers: stunServers,
            sip_ice_gathering_timeout: iceGatheringTimeout,
          },
        });
      }

      const org = await prisma.organizationSettings.findUnique({ where: { id: "default" } });
      const user = await prisma.user.findUnique({
        where: { id: req.authUser!.id },
        select: { sip_extension: true, sip_password: true },
      });

      res.json({
        ok: true,
        shared_updated: canUpdateShared,
        config: {
          server: org?.sip_server ?? "",
          realm: org?.sip_realm ?? "",
          displayName: org?.sip_display_name ?? "",
          stunServers: org?.sip_stun_servers ?? ["stun:stun.l.google.com:19302"],
          iceGatheringTimeout: org?.sip_ice_gathering_timeout ?? 5000,
          extension: user?.sip_extension ?? "",
          password: user?.sip_password ?? "",
        },
      });
    })
  );

  r.get(
    "/import/templates/contacts",
    requireAuth,
    requirePermission("contacts"),
    asyncHandler(async (_req, res) => {
      res.setHeader("Content-Type", "text/csv");
      res.send("name,email,phone,tags\n");
    })
  );

  r.post(
    "/supervisor/force-assign",
    requireAuth,
    requirePermission("supervisor"),
    asyncHandler(async (req, res) => {
      const { conversation_id, agent_id } = req.body as { conversation_id?: string; agent_id?: string };
      if (!conversation_id || !agent_id) throw new HttpError(400, "invalid body");
      await conversationService.transferConversation(
        conversation_id,
        { target_type: "agent", target_id: agent_id },
        req.authUser!.id,
        true
      );
      const label =
        `${req.authUser!.first_name} ${req.authUser!.last_name}`.trim() || req.authUser!.email;
      await notifyUserOfConversationAssignment(app, {
        conversationId: conversation_id,
        targetUserId: agent_id,
        fromAgentLabel: label,
      });
      res.json({ ok: true });
    })
  );

  r.get(
    "/supervisor/live-board",
    requireAuth,
    requirePermission("supervisor"),
    asyncHandler(async (_req, res) => {
      res.json(await dashboardService.getDashboardStats());
    })
  );

  r.get(
    "/users",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (_req, res) => {
      res.json(
        await prisma.user.findMany({
          include: { roles: { include: { role: true } }, skills: { include: { skill: true } } },
        })
      );
    })
  );

  r.post(
    "/users",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const { email, password, first_name, last_name, roleNames } = req.body as {
        email: string;
        password: string;
        first_name: string;
        last_name: string;
        roleNames?: string[];
      };
      const created = await authService.registerUser({
        email,
        password,
        first_name,
        last_name,
        roleNames,
      });
      res.status(201).json(created);
    })
  );

  r.put(
    "/users/:id/skills",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const { skills } = req.body as { skills?: { skill_id: string; proficiency: number }[] };
      if (!skills) throw new HttpError(400, "skills required");
      await prisma.userSkill.deleteMany({ where: { user_id: routeParam(req, "id") } });
      await prisma.userSkill.createMany({
        data: skills.map((s) => ({
          user_id: routeParam(req, "id"),
          skill_id: s.skill_id,
          proficiency: s.proficiency,
        })),
      });
      res.json({ ok: true });
    })
  );

  r.put(
    "/users/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const updated = await authService.adminUpdateUser(routeParam(req, "id"), req.body);
      res.json(updated);
    })
  );

  return r;
}
