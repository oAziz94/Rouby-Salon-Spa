import { AuthRequired } from "@/components/auth-required";
import { DashboardShell } from "@/components/dashboard-shell";

export default function ProtectedDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthRequired>
      <DashboardShell>{children}</DashboardShell>
    </AuthRequired>
  );
}
