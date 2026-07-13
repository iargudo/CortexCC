import type { SipConfig, SipRegistrationState } from "@/stores/sipStore";

export type SoftphoneConfigCheck = {
  canRegister: boolean;
  issue: string | null;
};

export function checkSoftphoneConfig(config: SipConfig): SoftphoneConfigCheck {
  if (!config.server?.trim()) {
    return {
      canRegister: false,
      issue:
        "No hay servidor de telefonía configurado. Pida al administrador que defina el host PBX en Configuración → Telefonía.",
    };
  }
  if (!config.realm?.trim()) {
    return {
      canRegister: false,
      issue:
        "Falta el dominio SIP (realm) de la central. Pida al administrador que revise Configuración → Telefonía.",
    };
  }
  if (!config.extension?.trim()) {
    return {
      canRegister: false,
      issue:
        "No tiene extensión SIP asignada. Pida al administrador que le provisione una extensión (Configuración → Usuarios).",
    };
  }
  if (!config.password?.trim()) {
    return {
      canRegister: false,
      issue:
        "Falta la contraseña SIP de su extensión. Cierre sesión y vuelva a entrar, o pida al administrador que regenere su extensión.",
    };
  }
  return { canRegister: true, issue: null };
}

export function getSecureContextIssue(): string | null {
  if (typeof window === "undefined") return null;
  if (window.isSecureContext) return null;
  return "El softphone requiere HTTPS. Acceda por https:// (mismo host y puerto 8087), no por http://.";
}

export function getSoftphoneStatusMessage(input: {
  config: SipConfig;
  registrationState: SipRegistrationState;
  registrationError: string | null;
}): string | null {
  if (input.registrationState === "error" && input.registrationError) {
    const configCheck = checkSoftphoneConfig(input.config);
    if (!configCheck.canRegister && input.registrationError !== configCheck.issue) {
      return input.registrationError;
    }
  }

  const configCheck = checkSoftphoneConfig(input.config);
  if (!configCheck.canRegister) return configCheck.issue;

  const secureIssue = getSecureContextIssue();
  if (secureIssue) return secureIssue;

  if (input.registrationState === "error" && input.registrationError) {
    return input.registrationError;
  }
  if (input.registrationState === "registering") {
    return "Conectando con la central telefónica…";
  }
  if (input.registrationState === "unregistered") {
    return "Pulse el indicador de conexión para registrarse en la central.";
  }
  return null;
}

export function getCallBlockReason(input: {
  config: SipConfig;
  registrationState: SipRegistrationState;
}): string | null {
  const configCheck = checkSoftphoneConfig(input.config);
  if (!configCheck.canRegister) return configCheck.issue;

  const secureIssue = getSecureContextIssue();
  if (secureIssue) return secureIssue;

  if (input.registrationState !== "registered") {
    const configOk = checkSoftphoneConfig(input.config);
    if (!configOk.canRegister) return configOk.issue;
    return "Conecte el softphone antes de llamar (indicador verde «Conectado»).";
  }
  return null;
}
