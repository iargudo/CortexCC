import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, RefreshCw, ExternalLink, Zap } from "lucide-react";
import { apiJson } from "@/lib/api";

export type IntegrationCard = {
  id: string;
  name: string;
  description: string;
  status: "connected" | "warning" | "disconnected";
  lastSync: string;
  stats: Record<string, string | number>;
  endpoint: string;
};

const statusConfig = {
  connected: { label: "Conectado", variant: "default" as const, icon: CheckCircle, color: "text-status-online" },
  warning: { label: "Advertencia", variant: "secondary" as const, icon: Zap, color: "text-status-away" },
  disconnected: { label: "Desconectado", variant: "destructive" as const, icon: XCircle, color: "text-destructive" },
};

export default function IntegrationsPage() {
  const summaryQuery = useQuery({
    queryKey: ["settings", "integrations-summary"],
    queryFn: () => apiJson<{ integrations: IntegrationCard[] }>("/settings/integrations-summary"),
  });

  const integrations = summaryQuery.data?.integrations ?? [];

  return (
    <div className="p-6 overflow-y-auto h-full scrollbar-thin space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Integraciones</h1>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={summaryQuery.isFetching}
          onClick={() => void summaryQuery.refetch()}
        >
          <RefreshCw size={14} className={summaryQuery.isFetching ? "animate-spin" : ""} /> Verificar todas
        </Button>
      </div>

      {summaryQuery.error && (
        <p className="text-sm text-destructive">{(summaryQuery.error as Error).message}</p>
      )}

      {summaryQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Cargando estado de integraciones…</p>
      )}

      {!summaryQuery.isLoading && integrations.length === 0 && !summaryQuery.error && (
        <p className="text-sm text-muted-foreground">No hay datos de integraciones.</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        {integrations.map((int) => {
          const sc = statusConfig[int.status];
          return (
            <Card key={int.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <sc.icon size={14} className={sc.color} />
                    {int.name}
                  </CardTitle>
                  <Badge variant={sc.variant} className="text-[10px]">{sc.label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{int.description}</p>
                <div className="text-xs space-y-1">
                  <p className="text-muted-foreground">Endpoint: <span className="font-mono text-[10px]">{int.endpoint}</span></p>
                  <p className="text-muted-foreground">Última sincronización: <span className="font-medium text-foreground">{int.lastSync}</span></p>
                </div>
                {Object.keys(int.stats).length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(int.stats).map(([k, v]) => (
                      <div key={k} className="bg-muted rounded px-2 py-1 text-xs">
                        <span className="text-muted-foreground">{k.replace(/_/g, " ")}: </span>
                        <span className="font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" type="button" disabled>
                    <RefreshCw size={10} /> Test
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" type="button" disabled>
                    <ExternalLink size={10} /> Config
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
