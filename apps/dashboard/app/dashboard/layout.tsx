import { DashboardAuthProvider } from "@/lib/dashboard-auth";

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardAuthProvider>{children}</DashboardAuthProvider>;
}
