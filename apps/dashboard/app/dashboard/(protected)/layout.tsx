import { AuthRequired } from "@/components/auth-required";
import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardShellFeedProvider } from "@/lib/dashboard-shell-feed-context";

export default function ProtectedDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthRequired>
      <DashboardShellFeedProvider>
        <DashboardShell>{children}</DashboardShell>
      </DashboardShellFeedProvider>
    </AuthRequired>
  );
}
