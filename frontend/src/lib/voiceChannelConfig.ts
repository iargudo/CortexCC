export type VoiceForm = {
  ariBaseUrl: string;
  ariApp: string;
  ariUsername: string;
  ariPassword: string;
  extensionField: string;
  callerIdField: string;
  dialedNumberField: string;
  pollFallbackSec: string;
  outboundTrunkEndpoint: string;
  outboundContext: string;
  defaultCallerId: string;
  agentEndpointTemplate: string;
  ringTimeoutSec: string;
  mohClass: string;
  recordingEnabled: boolean;
};

export type AriTestResult = { ok: boolean; detail?: string; warnings?: string[] };

export function defaultVoiceForm(): VoiceForm {
  return {
    ariBaseUrl: "http://localhost:8074",
    ariApp: "cortexcc",
    ariUsername: "cortexcc",
    ariPassword: "",
    extensionField: "endpoint",
    callerIdField: "channel.caller.number",
    dialedNumberField: "channel.dialplan.exten",
    pollFallbackSec: "15",
    outboundTrunkEndpoint: "PJSIP/carrier-trunk",
    outboundContext: "outbound-trunk",
    defaultCallerId: "",
    agentEndpointTemplate: "PJSIP/{extension}",
    ringTimeoutSec: "30",
    mohClass: "default",
    recordingEnabled: false,
  };
}

export function parseVoiceForm(config: unknown): VoiceForm {
  const form = defaultVoiceForm();
  const c = (config ?? {}) as Record<string, unknown>;
  form.ariBaseUrl = String(c.ariBaseUrl ?? form.ariBaseUrl);
  form.ariApp = String(c.ariApp ?? form.ariApp);
  form.ariUsername = String(c.ariUsername ?? form.ariUsername);
  form.ariPassword = String(c.ariPassword ?? "");
  form.extensionField = String(c.extensionField ?? form.extensionField);
  form.callerIdField = String(c.callerIdField ?? form.callerIdField);
  form.dialedNumberField = String(c.dialedNumberField ?? form.dialedNumberField);
  form.pollFallbackSec = String(c.pollFallbackSec ?? form.pollFallbackSec);
  form.outboundTrunkEndpoint = String(c.outboundTrunkEndpoint ?? form.outboundTrunkEndpoint);
  form.outboundContext = String(c.outboundContext ?? form.outboundContext);
  form.defaultCallerId = String(c.defaultCallerId ?? "");
  form.agentEndpointTemplate = String(c.agentEndpointTemplate ?? form.agentEndpointTemplate);
  form.ringTimeoutSec = String(c.ringTimeoutSec ?? form.ringTimeoutSec);
  form.mohClass = String(c.mohClass ?? form.mohClass);
  form.recordingEnabled = c.recordingEnabled === true;
  return form;
}

export function buildVoiceConfig(form: VoiceForm): object {
  const defaultCallerId = form.defaultCallerId.trim();
  return {
    provider: "asterisk_ari",
    ariBaseUrl: form.ariBaseUrl.trim(),
    ariApp: form.ariApp.trim(),
    ariUsername: form.ariUsername.trim(),
    ariPassword: form.ariPassword,
    extensionField: form.extensionField.trim() || "endpoint",
    callerIdField: form.callerIdField.trim() || "channel.caller.number",
    dialedNumberField: form.dialedNumberField.trim() || "channel.dialplan.exten",
    pollFallbackSec: Number(form.pollFallbackSec || "15"),
    outboundTrunkEndpoint: form.outboundTrunkEndpoint.trim() || "PJSIP/carrier-trunk",
    outboundContext: form.outboundContext.trim() || "outbound-trunk",
    defaultCallerId: defaultCallerId || undefined,
    agentEndpointTemplate: form.agentEndpointTemplate.trim() || "PJSIP/{extension}",
    ringTimeoutSec: Number(form.ringTimeoutSec || "30"),
    mohClass: form.mohClass.trim() || "default",
    recordingEnabled: form.recordingEnabled,
  };
}
