import { AuthRequired } from "@/components/auth-required";
import { DashboardShell } from "@/components/dashboard-shell";
import { SystemDialogProvider } from "@/components/system-dialog-provider";
import { DashboardShellFeedProvider } from "@/lib/dashboard-shell-feed-context";

export default function ProtectedDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthRequired>
      <DashboardShellFeedProvider>
        <SystemDialogProvider>
          <DashboardShell>{children}</DashboardShell>
        </SystemDialogProvider>
      </DashboardShellFeedProvider>
    </AuthRequired>
  );
}
