export type WebChatForm = {
  agentHubBaseUrl: string;
  agentHubApiPrefix: string;
  agentHubApiKey: string;
};

export function defaultWebChatForm(): WebChatForm {
  return {
    agentHubBaseUrl: "",
    agentHubApiPrefix: "/api/v1",
    agentHubApiKey: "",
  };
}

export function parseWebChatForm(config: unknown): WebChatForm {
  const form = defaultWebChatForm();
  const c = (config ?? {}) as Record<string, unknown>;
  const ah = c.agenthub;
  if (ah && typeof ah === "object") {
    const rec = ah as Record<string, unknown>;
    form.agentHubBaseUrl = String(rec.baseUrl ?? "");
    form.agentHubApiPrefix = String(rec.apiPrefix ?? "/api/v1") || "/api/v1";
    form.agentHubApiKey = String(rec.apiKey ?? "");
  }
  return form;
}

/**
 * Preserva cualquier clave existente del config del canal y sobreescribe solo el
 * bloque `agenthub` (el widget de webchat vive en AgentHub).
 */
export function buildWebChatConfig(form: WebChatForm, previousConfig?: unknown): object {
  const base = (previousConfig && typeof previousConfig === "object" ? previousConfig : {}) as Record<string, unknown>;
  return {
    ...base,
    agenthub: {
      baseUrl: form.agentHubBaseUrl.trim(),
      apiPrefix: form.agentHubApiPrefix.trim() || "/api/v1",
      apiKey: form.agentHubApiKey.trim(),
    },
  };
}

export function validateWebChatForm(form: WebChatForm): string | null {
  if (!form.agentHubBaseUrl.trim()) return "Base URL de AgentHub es obligatoria";
  if (!/^https?:\/\//i.test(form.agentHubBaseUrl.trim())) return "Base URL de AgentHub debe ser una URL válida (http/https)";
  if (!form.agentHubApiKey.trim()) return "API Key de AgentHub es obligatoria";
  return null;
}
