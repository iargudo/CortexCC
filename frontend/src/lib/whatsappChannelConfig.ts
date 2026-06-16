export type WhatsAppProvider = "ultramsg" | "twilio" | "360dialog";

export type WhatsAppForm = {
  provider: WhatsAppProvider;
  ultraInstanceId: string;
  ultraToken: string;
  ultraBaseUrl: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFrom: string;
  twilioApiBaseUrl: string;
  dialogApiKey: string;
  dialogPhoneNumberId: string;
  dialogBaseUrl: string;
};

export const WHATSAPP_PROVIDER_OPTIONS: { value: WhatsAppProvider; label: string; description: string }[] = [
  {
    value: "ultramsg",
    label: "UltraMsg",
    description: "API simple con instance ID y token. Ideal para despliegues rápidos.",
  },
  {
    value: "twilio",
    label: "Twilio",
    description: "WhatsApp Business vía Twilio Messaging API (Account SID + número remitente).",
  },
  {
    value: "360dialog",
    label: "360Dialog",
    description: "BSP oficial de Meta. Usa API Key (D360-API-KEY) y webhook Cloud API.",
  },
];

export function defaultWhatsAppForm(): WhatsAppForm {
  return {
    provider: "ultramsg",
    ultraInstanceId: "",
    ultraToken: "",
    ultraBaseUrl: "https://api.ultramsg.com",
    twilioAccountSid: "",
    twilioAuthToken: "",
    twilioFrom: "",
    twilioApiBaseUrl: "https://api.twilio.com",
    dialogApiKey: "",
    dialogPhoneNumberId: "",
    dialogBaseUrl: "https://waba-v2.360dialog.io",
  };
}

export function parseWhatsAppForm(config: unknown): WhatsAppForm {
  const form = defaultWhatsAppForm();
  const c = (config ?? {}) as Record<string, unknown>;
  const provider = String(c.provider ?? "ultramsg") as WhatsAppProvider;
  form.provider = provider === "twilio" || provider === "360dialog" ? provider : "ultramsg";
  form.ultraInstanceId = String(c.instanceId ?? "");
  form.ultraToken = String(c.token ?? "");
  form.twilioAccountSid = String(c.accountSid ?? "");
  form.twilioAuthToken = String(c.authToken ?? "");
  form.twilioFrom = String(c.from ?? "");
  form.twilioApiBaseUrl = String(c.apiBaseUrl ?? form.twilioApiBaseUrl);
  form.dialogApiKey = String(c.apiKey ?? "");
  form.dialogPhoneNumberId = String(c.phoneNumberId ?? "");
  if (form.provider === "ultramsg") {
    form.ultraBaseUrl = String(c.baseUrl ?? form.ultraBaseUrl);
  } else if (form.provider === "360dialog") {
    form.dialogBaseUrl = String(c.baseUrl ?? form.dialogBaseUrl);
  }
  return form;
}

export function buildWhatsAppConfig(form: WhatsAppForm): object {
  if (form.provider === "ultramsg") {
    return {
      provider: "ultramsg",
      instanceId: form.ultraInstanceId.trim(),
      token: form.ultraToken.trim(),
      baseUrl: form.ultraBaseUrl.trim() || "https://api.ultramsg.com",
    };
  }
  if (form.provider === "twilio") {
    return {
      provider: "twilio",
      accountSid: form.twilioAccountSid.trim(),
      authToken: form.twilioAuthToken.trim(),
      from: form.twilioFrom.trim(),
      apiBaseUrl: form.twilioApiBaseUrl.trim() || "https://api.twilio.com",
    };
  }
  return {
    provider: "360dialog",
    apiKey: form.dialogApiKey.trim(),
    phoneNumberId: form.dialogPhoneNumberId.trim() || undefined,
    baseUrl: form.dialogBaseUrl.trim() || "https://waba-v2.360dialog.io",
  };
}

export function validateWhatsAppForm(form: WhatsAppForm): string | null {
  if (form.provider === "ultramsg") {
    if (!form.ultraInstanceId.trim()) return "Instance ID es obligatorio para UltraMsg";
    if (!form.ultraToken.trim()) return "Token es obligatorio para UltraMsg";
    return null;
  }
  if (form.provider === "twilio") {
    if (!form.twilioAccountSid.trim()) return "Account SID es obligatorio para Twilio";
    if (!form.twilioAuthToken.trim()) return "Auth Token es obligatorio para Twilio";
    if (!form.twilioFrom.trim()) return "Número remitente (From) es obligatorio para Twilio";
    return null;
  }
  if (!form.dialogApiKey.trim()) return "API Key es obligatoria para 360Dialog";
  return null;
}

export function whatsAppProviderLabel(provider: string | undefined): string {
  return WHATSAPP_PROVIDER_OPTIONS.find((p) => p.value === provider)?.label ?? "UltraMsg";
}
