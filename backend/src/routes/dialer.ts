import { Router, type Express } from "express";
import { parse } from "csv-parse/sync";
import multer from "multer";
import { getPrisma } from "../lib/prisma.js";
import { canonicalPhone, phoneCandidates } from "../lib/phone.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { HttpError } from "../middleware/errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { routeParam } from "../utils/routeParams.js";
import { enqueueDialerProgressive, enqueueDialerPredictive } from "../queue/bull.js";
import { originateOutboundCall } from "../services/voice/voiceCallController.service.js";
import type { Server } from "socket.io";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

async function findSystemContactByPhone(rawPhone: string | undefined) {
  const variants = phoneCandidates(rawPhone);
  if (variants.length === 0) return null;
  return getPrisma().contact.findFirst({
    where: { OR: [{ phone: { in: variants } }, { phone_wa: { in: variants } }] },
  });
}

async function resolveDialerContact(input: {
  phone?: string;
  name?: string;
  contact_id?: string;
}): Promise<{ contactId: string | null; phone: string } | null> {
  if (input.contact_id) {
    const contact = await getPrisma().contact.findUnique({ where: { id: input.contact_id } });
    if (!contact) return null;
    const phone =
      canonicalPhone(contact.phone) ?? canonicalPhone(contact.phone_wa) ?? canonicalPhone(input.phone);
    if (!phone) return null;
    return { contactId: contact.id, phone };
  }

  const phone = canonicalPhone(input.phone);
  if (!phone) return null;

  const existing = await findSystemContactByPhone(input.phone);
  if (existing) {
    const displayName = input.name?.trim();
    if (displayName && !existing.name?.trim()) {
      await getPrisma().contact.update({
        where: { id: existing.id },
        data: { name: displayName },
      });
    }
    return {
      contactId: existing.id,
      phone: canonicalPhone(existing.phone) ?? canonicalPhone(existing.phone_wa) ?? phone,
    };
  }

  const created = await getPrisma().contact.create({
    data: {
      name: input.name?.trim() || phone,
      phone,
      phone_wa: phone,
      source_system: "dialer",
    },
  });
  return { contactId: created.id, phone };
}

async function addContactsToCampaign(
  campaignId: string,
  rows: Array<{ phone?: string; name?: string; contact_id?: string }>
) {
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const resolved = await resolveDialerContact(row);
    if (!resolved) {
      skipped += 1;
      continue;
    }

    const duplicate = await getPrisma().dialerCampaignContact.findFirst({
      where: { campaign_id: campaignId, phone: resolved.phone },
    });
    if (duplicate) {
      skipped += 1;
      continue;
    }

    await getPrisma().dialerCampaignContact.create({
      data: {
        campaign_id: campaignId,
        contact_id: resolved.contactId,
        phone: resolved.phone,
      },
    });
    imported += 1;
  }

  return { imported, skipped };
}

function getIo(app: Express): Server | null {
  return (app.get("io") as Server | undefined) ?? null;
}

export function buildDialerRouter(app: Express): Router {
  const r = Router();

  r.get(
    "/campaigns",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (_req, res) => {
      const items = await getPrisma().dialerCampaign.findMany({
        include: {
          channel: { select: { id: true, name: true, type: true } },
          queue: { select: { id: true, name: true } },
          _count: { select: { contacts: true, sessions: true } },
        },
        orderBy: { created_at: "desc" },
      });
      res.json(items);
    })
  );

  r.get(
    "/campaigns/joinable",
    requireAuth,
    asyncHandler(async (_req, res) => {
      const items = await getPrisma().dialerCampaign.findMany({
        where: { status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          mode: true,
          status: true,
          channel: { select: { id: true, name: true } },
          _count: { select: { contacts: true } },
        },
        orderBy: { name: "asc" },
      });
      res.json(items);
    })
  );

  r.get(
    "/campaigns/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const campaign = await getPrisma().dialerCampaign.findUnique({
        where: { id: routeParam(req, "id") },
        include: {
          channel: { select: { id: true, name: true, type: true } },
          queue: { select: { id: true, name: true } },
          _count: { select: { contacts: true, sessions: true } },
        },
      });
      if (!campaign) throw new HttpError(404, "Campaign not found");
      res.json(campaign);
    })
  );

  r.post(
    "/campaigns",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const body = req.body as {
        name?: string;
        channel_id?: string;
        queue_id?: string;
        mode?: string;
        pacing_sec?: number;
        max_attempts?: number;
        caller_id?: string;
        predictive_ratio?: number;
        max_lines?: number;
      };
      if (!body.name?.trim()) throw new HttpError(400, "name required");
      if (!body.channel_id) throw new HttpError(400, "channel_id required");
      const created = await getPrisma().dialerCampaign.create({
        data: {
          name: body.name.trim(),
          channel_id: body.channel_id,
          queue_id: body.queue_id || null,
          mode: (body.mode?.toUpperCase() as never) || "PREVIEW",
          pacing_sec: body.pacing_sec ?? 30,
          max_attempts: body.max_attempts ?? 3,
          caller_id: body.caller_id ?? null,
          predictive_ratio: body.predictive_ratio ?? 1.2,
          max_lines: body.max_lines ?? 5,
        },
      });
      res.status(201).json(created);
    })
  );

  r.patch(
    "/campaigns/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const body = req.body as {
        name?: string;
        channel_id?: string;
        queue_id?: string | null;
        mode?: string;
        pacing_sec?: number;
        max_attempts?: number;
        caller_id?: string | null;
        predictive_ratio?: number;
        max_lines?: number;
      };
      const data: Record<string, unknown> = {};
      if (body.name?.trim()) data.name = body.name.trim();
      if (body.channel_id) data.channel_id = body.channel_id;
      if (body.queue_id !== undefined) data.queue_id = body.queue_id || null;
      if (body.mode) data.mode = body.mode.toUpperCase();
      if (body.pacing_sec !== undefined) data.pacing_sec = body.pacing_sec;
      if (body.max_attempts !== undefined) data.max_attempts = body.max_attempts;
      if (body.caller_id !== undefined) data.caller_id = body.caller_id || null;
      if (body.predictive_ratio !== undefined) data.predictive_ratio = body.predictive_ratio;
      if (body.max_lines !== undefined) data.max_lines = body.max_lines;
      if (Object.keys(data).length === 0) throw new HttpError(400, "No fields to update");

      const updated = await getPrisma().dialerCampaign.update({
        where: { id: routeParam(req, "id") },
        data,
        include: {
          channel: { select: { id: true, name: true, type: true } },
          queue: { select: { id: true, name: true } },
          _count: { select: { contacts: true, sessions: true } },
        },
      });
      res.json(updated);
    })
  );

  r.patch(
    "/campaigns/:id/status",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const status = String(req.body?.status ?? "").toUpperCase();
      if (!["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"].includes(status)) {
        throw new HttpError(400, "invalid status");
      }
      const updated = await getPrisma().dialerCampaign.update({
        where: { id: routeParam(req, "id") },
        data: { status: status as never },
      });
      if (status === "ACTIVE") {
        if (updated.mode === "PROGRESSIVE") await enqueueDialerProgressive({ campaignId: updated.id });
        if (updated.mode === "PREDICTIVE") await enqueueDialerPredictive({ campaignId: updated.id });
      }
      res.json(updated);
    })
  );

  r.delete(
    "/campaigns/:id",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      await getPrisma().dialerCampaign.delete({ where: { id: routeParam(req, "id") } });
      res.status(204).send();
    })
  );

  r.get(
    "/campaigns/:id/contacts",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const campaignId = routeParam(req, "id");
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const search = String(req.query.search ?? "").trim();
      const skip = (page - 1) * limit;

      const where = {
        campaign_id: campaignId,
        ...(search
          ? {
              OR: [
                { phone: { contains: search } },
                { contact: { name: { contains: search, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      };

      const [rows, total] = await Promise.all([
        getPrisma().dialerCampaignContact.findMany({
          where,
          include: { contact: { select: { id: true, name: true, email: true, phone: true } } },
          orderBy: { created_at: "asc" },
          skip,
          take: limit,
        }),
        getPrisma().dialerCampaignContact.count({ where }),
      ]);

      res.json({ data: rows, meta: { page, limit, total } });
    })
  );

  r.post(
    "/campaigns/:id/contacts",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const body = req.body as {
        contact_ids?: string[];
        contacts?: Array<{ phone?: string; name?: string; contact_id?: string }>;
      };
      const campaignId = routeParam(req, "id");
      const rows: Array<{ phone?: string; name?: string; contact_id?: string }> = [];

      if (body.contact_ids?.length) {
        for (const contactId of body.contact_ids) {
          rows.push({ contact_id: contactId });
        }
      }
      if (body.contacts?.length) {
        rows.push(...body.contacts);
      }
      if (rows.length === 0) throw new HttpError(400, "contact_ids or contacts required");

      const result = await addContactsToCampaign(campaignId, rows);
      res.status(201).json(result);
    })
  );

  r.post(
    "/campaigns/:id/contacts/from-system",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const campaignId = routeParam(req, "id");
      const body = req.body as { tag?: string; search?: string };
      const where: {
        OR: Array<{ phone: { not: null } } | { phone_wa: { not: null } }>;
        tags?: { some: { tag: { name: string } } };
        AND?: Array<{
          OR: Array<
            | { name: { contains: string; mode: "insensitive" } }
            | { email: { contains: string; mode: "insensitive" } }
            | { phone: { contains: string } }
          >;
        }>;
      } = {
        OR: [{ phone: { not: null } }, { phone_wa: { not: null } }],
      };

      if (body.tag?.trim()) {
        where.tags = { some: { tag: { name: body.tag.trim() } } };
      }
      if (body.search?.trim()) {
        where.AND = [
          {
            OR: [
              { name: { contains: body.search.trim(), mode: "insensitive" } },
              { email: { contains: body.search.trim(), mode: "insensitive" } },
              { phone: { contains: body.search.trim() } },
            ],
          },
        ];
      }

      const systemContacts = await getPrisma().contact.findMany({
        where,
        select: { id: true },
        orderBy: { updated_at: "desc" },
        take: 500,
      });

      const result = await addContactsToCampaign(
        campaignId,
        systemContacts.map((c) => ({ contact_id: c.id }))
      );
      res.status(201).json({ ...result, scanned: systemContacts.length });
    })
  );

  r.patch(
    "/campaigns/:id/contacts/:contactId",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const campaignId = routeParam(req, "id");
      const dialerContactId = routeParam(req, "contactId");
      const status = String(req.body?.status ?? "").toUpperCase();
      if (!["PENDING", "DIALING", "CONTACTED", "COMPLETED", "DNC", "FAILED"].includes(status)) {
        throw new HttpError(400, "invalid status");
      }

      const existing = await getPrisma().dialerCampaignContact.findUnique({
        where: { id: dialerContactId },
      });
      if (!existing || existing.campaign_id !== campaignId) {
        throw new HttpError(404, "Dialer contact not found");
      }

      const updated = await getPrisma().dialerCampaignContact.update({
        where: { id: dialerContactId },
        data: { status: status as never },
        include: { contact: { select: { id: true, name: true, email: true, phone: true } } },
      });
      res.json(updated);
    })
  );

  r.delete(
    "/campaigns/:id/contacts/:contactId",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const campaignId = routeParam(req, "id");
      const dialerContactId = routeParam(req, "contactId");
      const existing = await getPrisma().dialerCampaignContact.findUnique({
        where: { id: dialerContactId },
      });
      if (!existing || existing.campaign_id !== campaignId) {
        throw new HttpError(404, "Dialer contact not found");
      }
      await getPrisma().dialerCampaignContact.delete({ where: { id: dialerContactId } });
      res.status(204).send();
    })
  );

  r.post(
    "/campaigns/:id/contacts/import",
    requireAuth,
    requirePermission("settings"),
    upload.single("file"),
    asyncHandler(async (req, res) => {
      const file = req.file;
      if (!file) throw new HttpError(400, "CSV file required");
      const rows = parse(file.buffer.toString("utf8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Array<{ phone?: string; name?: string; contact_id?: string }>;

      const result = await addContactsToCampaign(routeParam(req, "id"), rows);
      res.json(result);
    })
  );

  r.get(
    "/campaigns/:id/stats",
    requireAuth,
    requirePermission("settings"),
    asyncHandler(async (req, res) => {
      const campaignId = routeParam(req, "id");
      const grouped = await getPrisma().dialerCampaignContact.groupBy({
        by: ["status"],
        where: { campaign_id: campaignId },
        _count: true,
      });
      res.json({ by_status: grouped });
    })
  );

  r.post(
    "/sessions/join",
    requireAuth,
    asyncHandler(async (req, res) => {
      const campaignId = String(req.body?.campaign_id ?? "");
      if (!campaignId) throw new HttpError(400, "campaign_id required");
      const session = await getPrisma().dialerSession.upsert({
        where: {
          agent_user_id_campaign_id: {
            agent_user_id: req.authUser!.id,
            campaign_id: campaignId,
          },
        },
        create: {
          agent_user_id: req.authUser!.id,
          campaign_id: campaignId,
          status: "IDLE",
        },
        update: { status: "IDLE" },
        include: { campaign: true },
      });
      res.json(session);
    })
  );

  r.get(
    "/sessions/me/next",
    requireAuth,
    asyncHandler(async (req, res) => {
      const campaignId = String(req.query.campaign_id ?? "");
      if (!campaignId) throw new HttpError(400, "campaign_id required");
      const next = await getPrisma().dialerCampaignContact.findFirst({
        where: {
          campaign_id: campaignId,
          status: "PENDING",
          OR: [{ next_call_at: null }, { next_call_at: { lte: new Date() } }],
        },
        orderBy: { created_at: "asc" },
        include: { contact: true },
      });
      res.json(next);
    })
  );

  r.post(
    "/sessions/me/dial",
    requireAuth,
    asyncHandler(async (req, res) => {
      const campaignId = String(req.body?.campaign_id ?? "");
      const contactId = String(req.body?.dialer_contact_id ?? "");
      if (!campaignId || !contactId) throw new HttpError(400, "campaign_id and dialer_contact_id required");

      const campaign = await getPrisma().dialerCampaign.findUnique({
        where: { id: campaignId },
        include: { channel: true },
      });
      if (!campaign) throw new HttpError(404, "Campaign not found");

      const dialerContact = await getPrisma().dialerCampaignContact.findUnique({
        where: { id: contactId },
      });
      if (!dialerContact || dialerContact.campaign_id !== campaignId) {
        throw new HttpError(404, "Dialer contact not found");
      }

      const out = await originateOutboundCall({
        io: getIo(app),
        channel: campaign.channel,
        agentUserId: req.authUser!.id,
        phone: dialerContact.phone,
        contactId: dialerContact.contact_id ?? undefined,
        campaignId,
        dialerContactId: dialerContact.id,
      });

      await getPrisma().dialerCampaignContact.update({
        where: { id: dialerContact.id },
        data: { status: "DIALING", attempts: { increment: 1 } },
      });
      await getPrisma().dialerSession.updateMany({
        where: { agent_user_id: req.authUser!.id, campaign_id: campaignId },
        data: { status: "DIALING", current_contact_id: dialerContact.id },
      });

      res.status(201).json(out);
    })
  );

  return r;
}
