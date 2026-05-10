"use client";

import type { DashboardOverviewActivity } from "@rouby/api-client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type DashboardShellFeedContextValue = {
  recentActivity: DashboardOverviewActivity[];
  setOverviewRecentActivity: (items: DashboardOverviewActivity[] | null) => void;
};

const DashboardShellFeedContext = createContext<DashboardShellFeedContextValue | null>(
  null,
);

export function DashboardShellFeedProvider({ children }: { children: ReactNode }) {
  const [recentActivity, setRecentActivity] = useState<DashboardOverviewActivity[]>([]);

  const setOverviewRecentActivity = useCallback((items: DashboardOverviewActivity[] | null) => {
    setRecentActivity(items ?? []);
  }, []);

  const value = useMemo(
    () => ({ recentActivity, setOverviewRecentActivity }),
    [recentActivity, setOverviewRecentActivity],
  );

  return (
    <DashboardShellFeedContext.Provider value={value}>
      {children}
    </DashboardShellFeedContext.Provider>
  );
}

export function useDashboardShellFeed(): DashboardShellFeedContextValue {
  const ctx = useContext(DashboardShellFeedContext);
  if (!ctx) {
    throw new Error("useDashboardShellFeed must be used within DashboardShellFeedProvider");
  }
  return ctx;
}
