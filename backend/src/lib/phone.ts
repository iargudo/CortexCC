/**
 * Normaliza teléfonos para matching interno de contactos.
 * Mantiene solo dígitos y remueve prefijos/protocolo de WhatsApp cuando aplica.
 */
export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const compact = raw
    .replace(/^whatsapp:/i, "")
    .replace(/@(?:c\.us|s\.whatsapp\.net)$/i, "")
    .replace(/\s+/g, "")
    .trim();
  const digits = compact.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("00") && digits.length > 2) return digits.slice(2);
  return digits;
}

/**
 * Devuelve una forma canónica para persistencia local.
 * Para el contexto actual (EC), transforma:
 * - 0XXXXXXXXX -> 593XXXXXXXXX
 * - XXXXXXXXX  -> 593XXXXXXXXX
 */
export function canonicalPhone(raw: string | undefined | null): string | null {
  const normalized = normalizePhone(raw);
  if (!normalized) return null;
  if (normalized.startsWith("593")) return normalized;
  if (normalized.startsWith("0") && normalized.length === 10) return `593${normalized.slice(1)}`;
  if (normalized.length === 9) return `593${normalized}`;
  return normalized;
}

/**
 * Genera variantes comunes para evitar duplicados por formato local/internacional.
 * Ejemplo EC:
 * - 0995906687 <-> 593995906687
 */
export function phoneCandidates(raw: string | undefined | null): string[] {
  const normalized = normalizePhone(raw);
  if (!normalized) return [];

  const out = new Set<string>([normalized]);
  const canonical = canonicalPhone(normalized);
  if (canonical) out.add(canonical);

  // Si viene local 0XXXXXXXXX, agrega variante con código país 593.
  if (normalized.startsWith("0") && normalized.length === 10) {
    out.add(`593${normalized.slice(1)}`);
    out.add(normalized.slice(1));
  }

  // Si viene internacional 593XXXXXXXXX, agrega variante local 0XXXXXXXXX.
  if (normalized.startsWith("593") && normalized.length >= 12) {
    const local = normalized.slice(3);
    if (local) {
      out.add(local);
      out.add(`0${local}`);
    }
  }

  // Si viene sin prefijo local pero parece celular (9 dígitos), agrega formas frecuentes.
  if (normalized.length === 9) {
    out.add(`0${normalized}`);
    out.add(`593${normalized}`);
  }

  return [...out];
}
