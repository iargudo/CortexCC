import crypto from "node:crypto";
import { getPrisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";

function randomPassword(length = 12): string {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}

export async function assignSoftphoneExtension(userId: string, extension?: string, password?: string) {
  const org = await getPrisma().organizationSettings.findUnique({ where: { id: "default" } });
  const rangeStart = org?.sip_extension_range_start ?? 7001;
  const rangeEnd = org?.sip_extension_range_end ?? 7099;

  let ext = extension?.trim();
  if (ext) {
    const taken = await getPrisma().user.findFirst({
      where: { sip_extension: ext, NOT: { id: userId } },
    });
    if (taken) throw new HttpError(409, `Extension ${ext} already assigned`);
    const num = Number(ext);
    if (!Number.isInteger(num) || num < rangeStart || num > rangeEnd) {
      throw new HttpError(400, `Extension must be between ${rangeStart} and ${rangeEnd}`);
    }
  } else {
    const used = await getPrisma().user.findMany({
      where: { sip_extension: { not: null } },
      select: { sip_extension: true },
    });
    const usedSet = new Set(used.map((u) => u.sip_extension).filter(Boolean));
    let found: string | null = null;
    for (let i = rangeStart; i <= rangeEnd; i += 1) {
      const candidate = String(i);
      if (!usedSet.has(candidate)) {
        found = candidate;
        break;
      }
    }
    if (!found) throw new HttpError(409, "No available extensions in configured range");
    ext = found;
  }

  const pwd = password?.trim() || randomPassword();
  const user = await getPrisma().user.update({
    where: { id: userId },
    data: { sip_extension: ext, sip_password: pwd },
    select: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      sip_extension: true,
    },
  });

  return { user, password: pwd };
}

export async function bulkAssignSoftphoneExtensions(userIds: string[]) {
  const results: Array<{ userId: string; extension: string; password: string }> = [];
  for (const userId of userIds) {
    const out = await assignSoftphoneExtension(userId);
    results.push({
      userId,
      extension: out.user.sip_extension!,
      password: out.password,
    });
  }
  return results;
}

export async function exportSoftphoneEndpoints() {
  const org = await getPrisma().organizationSettings.findUnique({ where: { id: "default" } });
  const users = await getPrisma().user.findMany({
    where: { sip_extension: { not: null }, sip_password: { not: null } },
    select: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      sip_extension: true,
      sip_password: true,
    },
    orderBy: { sip_extension: "asc" },
  });

  return {
    server: org?.sip_server ?? "",
    realm: org?.sip_realm ?? "",
    stunServers: org?.sip_stun_servers ?? [],
    turnServers: org?.sip_turn_servers ?? [],
    endpoints: users.map((u) => ({
      userId: u.id,
      email: u.email,
      displayName: `${u.first_name} ${u.last_name}`.trim(),
      extension: u.sip_extension,
      password: u.sip_password,
    })),
  };
}

export function renderPjsipEndpoints(
  endpoints: Array<{ extension: string; password: string }>,
  fromDomain = "localhost"
): string {
  const domain = fromDomain.trim() || "localhost";
  const blocks: string[] = [];
  for (const ep of endpoints) {
    blocks.push(`[${ep.extension}]
type=endpoint
context=from-internal
disallow=all
allow=ulaw
auth=${ep.extension}-auth
aors=${ep.extension}
transport=transport-wss
from_user=${ep.extension}
from_domain=${domain}
webrtc=yes
media_encryption=dtls
dtls_auto_generate_cert=yes
ice_support=yes
rtcp_mux=yes
use_avpf=yes
media_use_received_transport=yes
direct_media=no
rtp_symmetric=yes
rewrite_contact=yes
force_rport=yes

[${ep.extension}-auth]
type=auth
auth_type=userpass
username=${ep.extension}
password=${ep.password}

[${ep.extension}]
type=aor
max_contacts=1
remove_existing=yes
remove_unavailable=yes
qualify_frequency=0
`);
  }
  return blocks.join("\n");
}
