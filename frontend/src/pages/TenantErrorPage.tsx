import { useTenantStore } from "@/stores/tenantStore";

export default function TenantErrorPage() {
  const tenantError = useTenantStore((s) => s.tenantError);
  const isDomainError = tenantError === "DOMAIN_NOT_CONFIGURED";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-semibold">
          {isDomainError ? "Dominio no configurado" : "Error al cargar la organización"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isDomainError
            ? "Esta URL no está registrada en la plataforma. Verifica el enlace o contacta al administrador."
            : "No se pudo resolver la organización para esta sesión. Revisa la configuración e intenta de nuevo."}
        </p>
      </div>
    </div>
  );
}
