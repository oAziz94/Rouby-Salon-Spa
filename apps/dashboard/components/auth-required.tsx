"use client";

import { useDashboardAuth } from "@/lib/dashboard-auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function AuthRequired({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, authError, retry, logout } = useDashboardAuth();

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

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-md rounded-2xl border border-[#E8E0D4] bg-white p-6 text-center shadow-sm">
          <p className="text-base font-semibold text-[#1F2420]">We couldn&apos;t reach the server</p>
          <p className="mt-2 text-sm text-[#7A6A58]">
            Your session is still saved. Check the connection and try again.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={retry}
              className="rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] hover:bg-[#0A3F35]"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-[#D8CBB8] bg-white px-4 py-2 text-sm font-semibold text-[#1F2420] hover:bg-[#FBF8F2]"
            >
              Sign out
            </button>
          </div>
        </div>
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
