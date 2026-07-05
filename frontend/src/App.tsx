import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore } from "@/stores/authStore";
import { useTenantStore } from "@/stores/tenantStore";
import { AuthBootstrap } from "@/components/AuthBootstrap";
import { TenantBootstrap } from "@/components/TenantBootstrap";
import { PlatformAuthBootstrap } from "@/components/PlatformAuthBootstrap";
import { PlatformProtectedRoute } from "@/components/PlatformProtectedRoute";
import AppLayout from "@/components/AppLayout";
import PlatformLayout from "@/components/PlatformLayout";
import LoginPage from "@/pages/LoginPage";
import PlatformLoginPage from "@/pages/platform/PlatformLoginPage";
import PlatformTenantsPage from "@/pages/platform/PlatformTenantsPage";
import PlatformAdminsPage from "@/pages/platform/PlatformAdminsPage";
import TenantErrorPage from "@/pages/TenantErrorPage";
import InboxPage from "@/pages/InboxPage";
import DashboardPage from "@/pages/DashboardPage";
import SupervisorPage from "@/pages/SupervisorPage";
import ContactsPage from "@/pages/ContactsPage";
import QualityPage from "@/pages/QualityPage";
import ProfilePage from "@/pages/ProfilePage";
import IntegrationsPage from "@/pages/IntegrationsPage";
import RolesPage from "@/pages/RolesPage";
import ReportsPage from "@/pages/ReportsPage";
import QueuesLivePage from "@/pages/QueuesLivePage";
import SettingsQueuesPage from "@/pages/settings/SettingsQueuesPage";
import SettingsChannelsPage from "@/pages/settings/SettingsChannelsPage";
import SettingsTeamsPage from "@/pages/settings/SettingsTeamsPage";
import SettingsSkillsPage from "@/pages/settings/SettingsSkillsPage";
import SettingsGeneralPage from "@/pages/settings/SettingsGeneralPage";
import SettingsTelephonyPage from "@/pages/settings/SettingsTelephonyPage";
import SettingsUsersPage from "@/pages/settings/SettingsUsersPage";
import DialerCampaignsPage from "@/pages/DialerCampaignsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function AppGate({ children }: { children: React.ReactNode }) {
  const tenantResolved = useTenantStore((s) => s.tenantResolved);
  const tenantError = useTenantStore((s) => s.tenantError);
  const hydrated = useAuthStore((s) => s.hydrated);

  if (!tenantResolved) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Cargando…
      </div>
    );
  }
  if (tenantError) {
    return <TenantErrorPage />;
  }
  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Cargando…
      </div>
    );
  }
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function TenantAppRoutes() {
  return (
    <>
      <TenantBootstrap />
      <AuthBootstrap />
      <AppGate>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/" element={<InboxPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/queues-live" element={<QueuesLivePage />} />
            <Route path="/supervisor" element={<SupervisorPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/quality" element={<QualityPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/dialer" element={<DialerCampaignsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings/queues" element={<SettingsQueuesPage />} />
            <Route path="/settings/channels" element={<SettingsChannelsPage />} />
            <Route path="/settings/teams" element={<SettingsTeamsPage />} />
            <Route path="/settings/skills" element={<SettingsSkillsPage />} />
            <Route path="/settings/roles" element={<RolesPage />} />
            <Route path="/settings/users" element={<SettingsUsersPage />} />
            <Route path="/settings/integrations" element={<IntegrationsPage />} />
            <Route path="/settings/telephony" element={<SettingsTelephonyPage />} />
            <Route path="/settings/general" element={<SettingsGeneralPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppGate>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route
            path="/platform/*"
            element={
              <>
                <PlatformAuthBootstrap />
                <Routes>
                  <Route path="login" element={<PlatformLoginPage />} />
                  <Route
                    element={
                      <PlatformProtectedRoute>
                        <PlatformLayout />
                      </PlatformProtectedRoute>
                    }
                  >
                    <Route index element={<Navigate to="tenants" replace />} />
                    <Route path="tenants" element={<PlatformTenantsPage />} />
                    <Route path="admins" element={<PlatformAdminsPage />} />
                  </Route>
                </Routes>
              </>
            }
          />
          <Route path="/*" element={<TenantAppRoutes />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
