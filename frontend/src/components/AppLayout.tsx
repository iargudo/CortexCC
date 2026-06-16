import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { HeaderBar } from "@/components/HeaderBar";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";

import { SipPhoneProvider } from "@/providers/SipPhoneProvider";

export default function AppLayout() {
  useRealtimeNotifications(true);

  return (
    <SipPhoneProvider>
      <SidebarProvider defaultOpen={false}>
        <div className="h-screen flex w-full overflow-hidden">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <HeaderBar />
            <main className="flex-1 min-h-0 overflow-hidden">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </SipPhoneProvider>
  );
}
