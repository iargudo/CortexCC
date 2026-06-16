import { getApiBase } from "./api";
import { getStoredTenantKey } from "./tenantStorage";

export function buildWhatsAppWebhookUrl(channelId: string): string | null {
  const tenantKey = getStoredTenantKey();
  if (!tenantKey || !channelId) return null;
  return `${getApiBase()}/webhooks/${tenantKey}/whatsapp/${channelId}`;
}
