export const DEFAULT_PBX_WSS_PORT = 8089;
export const DEFAULT_PBX_ARI_PORT = 8074;

export type PbxDerivedUrls = {
  host: string;
  wssPort: number;
  ariPort: number;
  sipServer: string;
  sipRealm: string;
  ariBaseUrl: string;
};

export function normalizePbxHost(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  let host = trimmed;
  if (/^https?:\/\//i.test(host)) {
    try {
      host = new URL(host).hostname;
    } catch {
      throw new Error("Host PBX inválido");
    }
  } else if (/^wss?:\/\//i.test(host)) {
    try {
      host = new URL(host).hostname;
    } catch {
      throw new Error("Host PBX inválido");
    }
  } else {
    host = host.replace(/^\/+|\/+$/g, "");
    const slash = host.indexOf("/");
    if (slash >= 0) host = host.slice(0, slash);
    const colon = host.indexOf(":");
    if (colon >= 0) host = host.slice(0, colon);
  }

  if (!host) throw new Error("Host PBX requerido");
  return host;
}

export function extractHostFromSipServer(sipServer: string | null | undefined): string | null {
  const raw = sipServer?.trim();
  if (!raw) return null;
  try {
    return normalizePbxHost(raw);
  } catch {
    return null;
  }
}

export function extractHostFromAriUrl(ariBaseUrl: string | null | undefined): string | null {
  const raw = ariBaseUrl?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.hostname || null;
  } catch {
    return null;
  }
}

export function extractPortFromSipServer(
  sipServer: string | null | undefined,
  fallback = DEFAULT_PBX_WSS_PORT
): number {
  const raw = sipServer?.trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.port) return Number(url.port);
  } catch {
    return fallback;
  }
  return fallback;
}

export function extractPortFromAriUrl(
  ariBaseUrl: string | null | undefined,
  fallback = DEFAULT_PBX_ARI_PORT
): number {
  const raw = ariBaseUrl?.trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.port) return Number(url.port);
  } catch {
    return fallback;
  }
  return fallback;
}

export function buildSipServer(host: string, wssPort = DEFAULT_PBX_WSS_PORT): string {
  const normalized = normalizePbxHost(host);
  return `wss://${normalized}:${wssPort}/ws`;
}

export function buildSipRealm(host: string): string {
  return normalizePbxHost(host);
}

export function buildAriBaseUrl(host: string, ariPort = DEFAULT_PBX_ARI_PORT): string {
  const normalized = normalizePbxHost(host);
  return `http://${normalized}:${ariPort}`;
}

export function derivePbxUrls(
  host: string,
  wssPort = DEFAULT_PBX_WSS_PORT,
  ariPort = DEFAULT_PBX_ARI_PORT
): PbxDerivedUrls {
  const normalized = normalizePbxHost(host);
  return {
    host: normalized,
    wssPort,
    ariPort,
    sipServer: buildSipServer(normalized, wssPort),
    sipRealm: normalized,
    ariBaseUrl: buildAriBaseUrl(normalized, ariPort),
  };
}

export function resolvePbxHost(input: {
  pbxHost?: string | null;
  sipServer?: string | null;
  ariBaseUrl?: string | null;
}): string | null {
  const explicit = input.pbxHost?.trim();
  if (explicit) {
    try {
      return normalizePbxHost(explicit);
    } catch {
      return null;
    }
  }
  return extractHostFromSipServer(input.sipServer) ?? extractHostFromAriUrl(input.ariBaseUrl);
}

export type TelephonyValidation = {
  ok: boolean;
  warnings: string[];
  errors: string[];
};

export function validateTelephonyConsistency(input: {
  pbxHost?: string | null;
  sipServer?: string | null;
  sipRealm?: string | null;
  ariBaseUrl?: string | null;
  voiceChannelStatus?: string | null;
  voiceChannelExists?: boolean;
}): TelephonyValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  const host = resolvePbxHost({
    pbxHost: input.pbxHost,
    sipServer: input.sipServer,
    ariBaseUrl: input.ariBaseUrl,
  });

  if (!host) {
    if (input.sipServer?.trim() || input.ariBaseUrl?.trim()) {
      warnings.push("Hay URLs de telefonía configuradas pero no se pudo resolver un host PBX unificado.");
    }
    return { ok: errors.length === 0, warnings, errors };
  }

  const sipHost = extractHostFromSipServer(input.sipServer);
  const ariHost = extractHostFromAriUrl(input.ariBaseUrl);

  if (sipHost && sipHost !== host) {
    warnings.push(`El host en sip_server (${sipHost}) no coincide con el host PBX (${host}).`);
  }
  if (ariHost && ariHost !== host) {
    warnings.push(`El host en ariBaseUrl (${ariHost}) no coincide con el host PBX (${host}).`);
  }
  if (input.sipRealm?.trim() && input.sipRealm.trim() !== host) {
    warnings.push(`sip_realm (${input.sipRealm.trim()}) difiere del host PBX (${host}).`);
  }

  if (!input.voiceChannelExists) {
    warnings.push("No hay canal VOICE creado. Crea uno en Configuración → Canales para habilitar ARI.");
  } else if (input.voiceChannelStatus && input.voiceChannelStatus !== "active") {
    warnings.push("El canal VOICE existe pero no está activo.");
  }

  if (!input.sipServer?.trim()) {
    warnings.push("Softphone sin sip_server configurado.");
  }
  if (!input.ariBaseUrl?.trim()) {
    warnings.push("Canal VOICE sin ariBaseUrl configurado.");
  }

  return { ok: errors.length === 0, warnings, errors };
}
