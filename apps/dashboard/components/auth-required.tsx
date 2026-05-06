"use client";

import { useDashboardAuth } from "@/lib/dashboard-auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function AuthRequired({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, authError } = useDashboardAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/dashboard/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (authError?.statusCode === 401) {
      router.replace("/dashboard/login?reason=unauthorized");
    }
  }, [authError?.statusCode, pathname, router, status]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-[#7A6A58]" role="status" aria-live="polite">
          Loading dashboard session...
        </p>
      </div>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  return <>{children}</>;
}

export function PermissionGuard({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { hasPermission, status } = useDashboardAuth();
  const allowed = hasPermission(permission);

  useEffect(() => {
    if (status === "authenticated" && !allowed) {
      router.replace("/dashboard/forbidden");
    }
  }, [allowed, router, status]);

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
