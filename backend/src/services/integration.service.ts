import { Prisma, type Channel } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { mapChannelType } from "../lib/channelTypes.js";
import { canonicalPhone, phoneCandidates } from "../lib/phone.js";
import { createConversationFromEscalation } from "./conversation.service.js";

type IntegrationUiStatus = "connected" | "warning" | "disconnected";
type IntegrationAppModeInput = "SNAPSHOT" | "EMBED" | "ACTIONS";
type IntegrationAppViewMode = "INLINE" | "MODAL" | "EXTERNAL_TAB";

function channelUiStatus(ch: Channel | undefined): IntegrationUiStatus {
  if (!ch) return "disconnected";
  if (ch.status === "active") return "connected";
  return "warning";
}

async function upsertContact(input: {
  phone?: string;
  name?: string;
  external_id?: string;
  source_system?: string;
}) {
  const phone = canonicalPhone(input.phone);
  const variants = phoneCandidates(phone);
  const existing =
    (variants.length > 0 &&
      (await prisma.contact.findFirst({
        where: {
          OR: [{ phone: { in: variants } }, { phone_wa: { in: variants } }],
        },
      }))) ||
    (input.external_id &&
      (await prisma.contact.findFirst({
        where: { external_id: input.external_id, source_system: input.source_system },
      })));

  if (existing) {
    return prisma.contact.update({
      where: { id: existing.id },
      data: {
        name: input.name ?? existing.name,
        phone: phone ?? existing.phone,
        phone_wa: phone ?? existing.phone_wa,
        external_id: input.external_id ?? existing.external_id,
        source_system: input.source_system ?? existing.source_system,
      },
    });
  }

  return prisma.contact.create({
    data: {
      name: input.name,
      phone,
      phone_wa: phone,
      external_id: input.external_id,
      source_system: input.source_system,
    },
  });
}

async function resolveChannel(channelType: string) {
  const type = mapChannelType(channelType);
  const ch = await prisma.channel.findFirst({ where: { type } });
  if (!ch) throw new HttpError(503, `No channel configured for ${type}`);
  return ch;
}

function normalizeSourceToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asJson(v: unknown): Prisma.InputJsonValue {
  return asObject(v) as Prisma.InputJsonValue;
}

function enumOrThrow<T extends string>(value: string | undefined, allowed: readonly T[], field: string): T {
  const normalized = String(value ?? "").trim().toUpperCase();
  if ((allowed as readonly string[]).includes(normalized)) return normalized as T;
  throw new HttpError(400, `${field} invalid`);
}

function stringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function normalizeMatchToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function parseViewMode(value: unknown): IntegrationAppViewMode {
  const normalized = normalizeMatchToken(value).toUpperCase();
  if (normalized === "MODAL") return "MODAL";
  if (normalized === "EXTERNAL_TAB") return "EXTERNAL_TAB";
  return "INLINE";
}

function getByPath(root: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), root);
}

function renderTemplate(input: string, data: Record<string, unknown>): string {
  return input.replace(/\{\{([^}]+)\}\}/g, (_full, tokenRaw) => {
    const token = String(tokenRaw).trim();
    const [pathPart, filterPart] = token.split("|");
    const value = getByPath(data, pathPart.trim());
    if (value == null || value === "") {
      if (filterPart?.startsWith("default:")) return filterPart.slice("default:".length).trim();
      return "";
    }
    return String(value);
  });
}

export async function handleGenericEscalation(body: {
  source_system: string;
  channel_type: string;
  contact: { phone?: string; name?: string; external_id?: string };
  event_type?: string;
  conversation_ref_id?: string;
  escalation_reason?: string;
  context?: unknown;
  preferred_queue?: string;
  priority?: number;
}) {
  const sourceSystem = normalizeSourceToken(body.source_system);
  const eventType = body.event_type ? normalizeSourceToken(body.event_type) : "escalation";
  const channel = await resolveChannel(body.channel_type);
  const contact = await upsertContact({
    phone: body.contact.phone,
    name: body.contact.name,
    external_id: body.contact.external_id,
    source_system: sourceSystem,
  });
  const id = await createConversationFromEscalation({
    channelId: channel.id,
    contactId: contact.id,
    queueId: body.preferred_queue,
    source: `${sourceSystem}_${eventType}`,
    sourceRef: body.conversation_ref_id,
    reason: body.escalation_reason,
    context: body.context,
    priority: body.priority,
  });
  return { conversation_id: id };
}

/** Estado agregado para la pantalla de integraciones (JWT + permiso settings). */
export async function getIntegrationsUiSummary(): Promise<{
  integrations: {
    id: string;
    name: string;
    description: string;
    status: IntegrationUiStatus;
    lastSync: string;
    stats: Record<string, string | number>;
    endpoint: string;
  }[];
}> {
  const channels = await prisma.channel.findMany();
  const pick = (type: Channel["type"]) => channels.find((c) => c.type === type);
  const wa = pick("WHATSAPP");
  const teams = pick("TEAMS");
  const voiceCh = pick("VOICE");

  const last = (ch: Channel | undefined) =>
    ch?.updated_at
      ? `Actualizado ${ch.updated_at.toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}`
      : "Sin canal configurado";

  const integrations = [
    {
      id: "asterisk",
      name: "Asterisk PBX",
      description: "Central telefónica — WebRTC y SIP",
      status: channelUiStatus(voiceCh),
      lastSync: last(voiceCh),
      stats: {},
      endpoint: (voiceCh?.config as { sip_endpoint?: string })?.sip_endpoint ?? "wss://pbx.empresa.com/ws",
    },
    {
      id: "ultramsg",
      name: "UltraMsg (WhatsApp)",
      description: "Proveedor WhatsApp Business API",
      status: channelUiStatus(wa),
      lastSync: last(wa),
      stats: {},
      endpoint: "https://api.ultramsg.com",
    },
    {
      id: "graph",
      name: "Microsoft Graph (Teams)",
      description: "API de Microsoft Teams — Bot Framework",
      status: channelUiStatus(teams),
      lastSync: last(teams),
      stats: {},
      endpoint: "https://graph.microsoft.com",
    },
  ];

  return {
    integrations: integrations.filter((integration) => integration.status === "connected"),
  };
}

export async function listIntegrationApps() {
  const rows = await prisma.integrationApp.findMany({ orderBy: [{ name: "asc" }] });
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    icon: r.icon,
    mode: r.mode,
    auth_type: r.auth_type,
    base_url: r.base_url,
    credentials_ref: r.credentials_ref,
    is_active: r.is_active,
    config: r.config,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  }));
}

export async function createIntegrationApp(input: {
  key?: string;
  name?: string;
  icon?: string;
  mode?: string;
  auth_type?: string;
  base_url?: string | null;
  credentials_ref?: string | null;
  config?: unknown;
  is_active?: boolean;
}) {
  if (!input.key?.trim()) throw new HttpError(400, "key required");
  if (!input.name?.trim()) throw new HttpError(400, "name required");
  const mode = enumOrThrow(input.mode, ["SNAPSHOT", "EMBED", "ACTIONS"] as const, "mode");
  const authType = enumOrThrow(input.auth_type, ["NONE", "API_KEY", "OAUTH2", "JWT"] as const, "auth_type");
  return prisma.integrationApp.create({
    data: {
      key: input.key.trim().toLowerCase(),
      name: input.name.trim(),
      icon: input.icon?.trim() || "Link",
      mode,
      auth_type: authType,
      base_url: stringOrNull(input.base_url),
      credentials_ref: stringOrNull(input.credentials_ref),
      config: asJson(input.config),
      is_active: input.is_active ?? true,
    },
  });
}

export async function updateIntegrationApp(
  id: string,
  input: {
    key?: string;
    name?: string;
    icon?: string;
    mode?: string;
    auth_type?: string;
    base_url?: string | null;
    credentials_ref?: string | null;
    config?: unknown;
    is_active?: boolean;
  }
) {
  const existing = await prisma.integrationApp.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Integration app not found");
  const mode = input.mode
    ? enumOrThrow(input.mode, ["SNAPSHOT", "EMBED", "ACTIONS"] as const, "mode")
    : existing.mode;
  const authType = input.auth_type
    ? enumOrThrow(input.auth_type, ["NONE", "API_KEY", "OAUTH2", "JWT"] as const, "auth_type")
    : existing.auth_type;
  return prisma.integrationApp.update({
    where: { id },
    data: {
      ...(input.key !== undefined ? { key: input.key.trim().toLowerCase() } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.icon !== undefined ? { icon: input.icon.trim() || "Link" } : {}),
      mode,
      auth_type: authType,
      ...(input.base_url !== undefined ? { base_url: stringOrNull(input.base_url) } : {}),
      ...(input.credentials_ref !== undefined ? { credentials_ref: stringOrNull(input.credentials_ref) } : {}),
      ...(input.config !== undefined ? { config: asJson(input.config) } : {}),
      ...(input.is_active !== undefined ? { is_active: Boolean(input.is_active) } : {}),
    },
  });
}

export async function deleteIntegrationApp(id: string) {
  await prisma.integrationApp.delete({ where: { id } });
  return { ok: true };
}

export async function listIntegrationBindings() {
  const rows = await prisma.integrationAppBinding.findMany({
    include: { app: true },
    orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    app_id: r.app_id,
    app_key: r.app.key,
    app_name: r.app.name,
    scope_type: r.scope_type,
    scope_id: r.scope_id,
    placement: r.placement,
    sort_order: r.sort_order,
    is_visible: r.is_visible,
    rules: r.rules,
  }));
}

export async function createIntegrationBinding(input: {
  app_id?: string;
  scope_type?: string;
  scope_id?: string | null;
  placement?: string;
  sort_order?: number;
  is_visible?: boolean;
  rules?: unknown;
}) {
  if (!input.app_id?.trim()) throw new HttpError(400, "app_id required");
  const app = await prisma.integrationApp.findUnique({ where: { id: input.app_id } });
  if (!app) throw new HttpError(404, "Integration app not found");
  const scopeType = enumOrThrow(input.scope_type, ["GLOBAL", "CHANNEL", "QUEUE", "ROLE"] as const, "scope_type");
  return prisma.integrationAppBinding.create({
    data: {
      app: { connect: { id: input.app_id } },
      scope_type: scopeType,
      scope_id: stringOrNull(input.scope_id),
      placement: input.placement?.trim() || "right_rail",
      sort_order: typeof input.sort_order === "number" ? Math.round(input.sort_order) : 0,
      is_visible: input.is_visible ?? true,
      rules: asJson(input.rules),
    },
  });
}

export async function updateIntegrationBinding(
  id: string,
  input: {
    app_id?: string;
    scope_type?: string;
    scope_id?: string | null;
    placement?: string;
    sort_order?: number;
    is_visible?: boolean;
    rules?: unknown;
  }
) {
  const existing = await prisma.integrationAppBinding.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Integration binding not found");
  const scopeType = input.scope_type
    ? enumOrThrow(input.scope_type, ["GLOBAL", "CHANNEL", "QUEUE", "ROLE"] as const, "scope_type")
    : existing.scope_type;
  if (input.app_id) {
    const app = await prisma.integrationApp.findUnique({ where: { id: input.app_id } });
    if (!app) throw new HttpError(404, "Integration app not found");
  }
  return prisma.integrationAppBinding.update({
    where: { id },
    data: {
      ...(input.app_id !== undefined ? { app: { connect: { id: input.app_id } } } : {}),
      scope_type: scopeType,
      ...(input.scope_id !== undefined ? { scope_id: stringOrNull(input.scope_id) } : {}),
      ...(input.placement !== undefined ? { placement: input.placement.trim() || "right_rail" } : {}),
      ...(input.sort_order !== undefined ? { sort_order: Math.round(input.sort_order) } : {}),
      ...(input.is_visible !== undefined ? { is_visible: Boolean(input.is_visible) } : {}),
      ...(input.rules !== undefined ? { rules: asJson(input.rules) } : {}),
    },
  });
}

export async function deleteIntegrationBinding(id: string) {
  await prisma.integrationAppBinding.delete({ where: { id } });
  return { ok: true };
}

export async function bootstrapRealWebExamples() {
  const examples: Array<{
    key: string;
    name: string;
    icon: string;
    mode: "EMBED" | "SNAPSHOT";
    auth_type: "NONE";
    base_url: string;
    config: Prisma.InputJsonValue;
    binding_scope_type: "GLOBAL" | "CHANNEL";
    binding_scope_id: string | null;
    sort_order: number;
  }> = [
    {
      key: "openstreetmap_lookup",
      name: "OpenStreetMap",
      icon: "MapPinned",
      mode: "EMBED",
      auth_type: "NONE",
      base_url: "https://www.openstreetmap.org",
      config: {
        view_mode: "MODAL",
        embed_path_template: "/export/embed.html?layer=mapnik",
      },
      binding_scope_type: "GLOBAL",
      binding_scope_id: null,
      sort_order: 40,
    },
    {
      key: "stripe_dashboard",
      name: "Stripe Dashboard",
      icon: "Wallet",
      mode: "EMBED",
      auth_type: "NONE",
      base_url: "https://dashboard.stripe.com",
      config: {
        view_mode: "EXTERNAL_TAB",
      },
      binding_scope_type: "GLOBAL",
      binding_scope_id: null,
      sort_order: 50,
    },
    {
      key: "zendesk_workspace",
      name: "Zendesk",
      icon: "Link",
      mode: "EMBED",
      auth_type: "NONE",
      base_url: "https://www.zendesk.com",
      config: {
        view_mode: "EXTERNAL_TAB",
      },
      binding_scope_type: "GLOBAL",
      binding_scope_id: null,
      sort_order: 60,
    },
    {
      key: "hubspot_workspace",
      name: "HubSpot CRM",
      icon: "UserCircle2",
      mode: "EMBED",
      auth_type: "NONE",
      base_url: "https://app.hubspot.com",
      config: {
        view_mode: "EXTERNAL_TAB",
      },
      binding_scope_type: "GLOBAL",
      binding_scope_id: null,
      sort_order: 70,
    },
    {
      key: "knowledge_snapshot",
      name: "Knowledge Snapshot",
      icon: "Sparkles",
      mode: "SNAPSHOT",
      auth_type: "NONE",
      base_url: "https://example.com",
      config: {
        cards: [
          { label: "Canal", value: "{{conversation.channel_type}}" },
          { label: "Fuente", value: "{{conversation.source}}" },
          { label: "Contacto", value: "{{contact.name|default:Sin nombre}}" },
        ],
      },
      binding_scope_type: "GLOBAL",
      binding_scope_id: null,
      sort_order: 30,
    },
  ];

  for (const ex of examples) {
    const app = await prisma.integrationApp.upsert({
      where: { key: ex.key },
      create: {
        key: ex.key,
        name: ex.name,
        icon: ex.icon,
        mode: ex.mode,
        auth_type: ex.auth_type,
        base_url: ex.base_url,
        config: ex.config,
        is_active: true,
      },
      update: {
        name: ex.name,
        icon: ex.icon,
        mode: ex.mode,
        auth_type: ex.auth_type,
        base_url: ex.base_url,
        config: ex.config,
        is_active: true,
      },
    });

    await prisma.integrationAppBinding.upsert({
      where: { id: `bootstrap-bind-${ex.key}` },
      create: {
        id: `bootstrap-bind-${ex.key}`,
        app_id: app.id,
        scope_type: ex.binding_scope_type,
        scope_id: ex.binding_scope_id,
        placement: "right_rail",
        sort_order: ex.sort_order,
        is_visible: true,
      },
      update: {
        app_id: app.id,
        scope_type: ex.binding_scope_type,
        scope_id: ex.binding_scope_id,
        sort_order: ex.sort_order,
        is_visible: true,
      },
    });
  }

  return { ok: true, count: examples.length };
}

export async function getConversationIntegrationWorkspace(conversationId: string, roleNames: string[]) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      channel: true,
      queue: true,
      contact: true,
    },
  });
  if (!conversation) throw new HttpError(404, "Not found");

  const bindings = await prisma.integrationAppBinding.findMany({
    where: {
      placement: "right_rail",
      is_visible: true,
      app: { is_active: true },
    },
    include: { app: true },
    orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
  });

  const roleNamesNormalized = roleNames.map((r) => normalizeMatchToken(r));
  const channelTypeNormalized = normalizeMatchToken(conversation.channel.type);
  const queueIdNormalized = normalizeMatchToken(conversation.queue_id);
  const queueNameNormalized = normalizeMatchToken(conversation.queue?.name);

  const isMatch = (b: (typeof bindings)[number]): boolean => {
    if (b.scope_type === "GLOBAL") return true;
    const scopeIdNormalized = normalizeMatchToken(b.scope_id);
    if (b.scope_type === "CHANNEL") return scopeIdNormalized === channelTypeNormalized;
    if (b.scope_type === "QUEUE") return scopeIdNormalized === queueIdNormalized || scopeIdNormalized === queueNameNormalized;
    if (b.scope_type === "ROLE") return !!scopeIdNormalized && roleNamesNormalized.includes(scopeIdNormalized);
    return false;
  };

  const conversationData: Record<string, unknown> = {
    conversation: {
      id: conversation.id,
      source: conversation.source,
      source_ref_id: conversation.source_ref_id,
      escalation_reason: conversation.escalation_reason,
      channel_type: conversation.channel.type,
      queue_id: conversation.queue_id,
      queue_name: conversation.queue?.name ?? "",
      created_at: conversation.created_at.toISOString(),
    },
    contact: {
      id: conversation.contact.id,
      name: conversation.contact.name ?? "",
      email: conversation.contact.email ?? "",
      phone: conversation.contact.phone ?? "",
      phone_wa: conversation.contact.phone_wa ?? "",
      source_system: conversation.contact.source_system ?? "",
    },
  };

  const apps = bindings
    .filter((b) => isMatch(b))
    .filter((b) => {
      const rules = asObject(b.rules);
      const sourceRules = Array.isArray(rules.sources) ? rules.sources.map((s) => String(s)) : null;
      return !sourceRules || sourceRules.includes(conversation.source);
    })
    .reduce<
      Map<
        string,
        {
          id: string;
          key: string;
          name: string;
          icon: string;
          mode: IntegrationAppModeInput;
          view_mode: IntegrationAppViewMode;
          match_explain: string;
          sort_order: number;
          embed_url?: string;
          snapshot?: { label: string; value: string }[];
          actions?: { id: string; label: string; action_key: string }[];
        }
      >
    >((acc, binding) => {
      if (acc.has(binding.app_id)) return acc;
      const cfg = asObject(binding.app.config);
      const appOut: {
        id: string;
        key: string;
        name: string;
        icon: string;
        mode: IntegrationAppModeInput;
        view_mode: IntegrationAppViewMode;
        match_explain: string;
        sort_order: number;
        embed_url?: string;
        snapshot?: { label: string; value: string }[];
        actions?: { id: string; label: string; action_key: string }[];
      } = {
        id: binding.app.id,
        key: binding.app.key,
        name: binding.app.name,
        icon: binding.app.icon,
        mode: binding.app.mode as IntegrationAppModeInput,
        view_mode: parseViewMode(asObject(binding.app.config).view_mode),
        match_explain:
          binding.scope_type === "GLOBAL"
            ? "GLOBAL"
            : `${binding.scope_type}:${String(binding.scope_id ?? "").trim() || "n/a"}`,
        sort_order: binding.sort_order,
      };

      if (binding.app.mode === "EMBED" && binding.app.base_url) {
        const base = binding.app.base_url.replace(/\/$/, "");
        const pathTpl = String(cfg.embed_path_template ?? "");
        const path = pathTpl ? renderTemplate(pathTpl, conversationData) : "";
        appOut.embed_url = `${base}${path}`;
      }
      if (binding.app.mode === "SNAPSHOT") {
        const cardsRaw = Array.isArray(cfg.cards) ? cfg.cards : [];
        appOut.snapshot = cardsRaw
          .map((c, idx) => {
            const card = asObject(c);
            const label = String(card.label ?? `Campo ${idx + 1}`).trim();
            const valueTpl = String(card.value ?? "").trim();
            if (!valueTpl) return null;
            return {
              label,
              value: renderTemplate(valueTpl, conversationData),
            };
          })
          .filter((c): c is { label: string; value: string } => Boolean(c));
      }
      if (binding.app.mode === "ACTIONS") {
        const actionsRaw = Array.isArray(cfg.actions) ? cfg.actions : [];
        appOut.actions = actionsRaw
          .map((a, idx) => {
            const action = asObject(a);
            const actionKey = String(action.action_key ?? "").trim();
            const label = String(action.label ?? (actionKey || `Action ${idx + 1}`)).trim();
            if (!actionKey) return null;
            return {
              id: `${binding.app.id}-action-${idx}`,
              label,
              action_key: actionKey,
            };
          })
          .filter((a): a is { id: string; label: string; action_key: string } => Boolean(a));
      }

      acc.set(binding.app_id, appOut);
      return acc;
    }, new Map())
    .values();

  return {
    conversation_id: conversation.id,
    source: conversation.source,
    source_ref_id: conversation.source_ref_id,
    escalation_reason: conversation.escalation_reason,
    escalation_context: conversation.escalation_context,
    channel: { type: conversation.channel.type, name: conversation.channel.name },
    queue: conversation.queue ? { id: conversation.queue.id, name: conversation.queue.name } : null,
    contact: {
      id: conversation.contact.id,
      name: conversation.contact.name,
      email: conversation.contact.email,
      phone: conversation.contact.phone,
      phone_wa: conversation.contact.phone_wa,
      source_system: conversation.contact.source_system,
    },
    apps: Array.from(apps),
  };
}

/** Asistentes IA de demostración para el diálogo de asignación (sin motor real aún). */
export function getAiAssistantsPreview(): {
  agents: {
    id: string;
    name: string;
    type: string;
    status: string;
    capacity: string;
    avgResolutionTime: string;
    csatAvg: number;
    specialties: string[];
  }[];
} {
  return {
    agents: [
      {
        id: "ai-1",
        name: "AgentHub IA",
        type: "general",
        status: "active",
        capacity: "ilimitada",
        avgResolutionTime: "45s",
        csatAvg: 4.2,
        specialties: ["FAQ", "Consultas generales", "Estado de cuenta"],
      },
      {
        id: "ai-2",
        name: "Collect Bot",
        type: "collections",
        status: "active",
        capacity: "ilimitada",
        avgResolutionTime: "60s",
        csatAvg: 3.8,
        specialties: ["Cobranza", "Planes de pago", "Negociación"],
      },
      {
        id: "ai-3",
        name: "Soporte Técnico IA",
        type: "tech",
        status: "active",
        capacity: "ilimitada",
        avgResolutionTime: "90s",
        csatAvg: 4.0,
        specialties: ["API", "Integración", "Errores técnicos"],
      },
    ],
  };
}
