"use client";

import type {
  DashboardOverviewActivity,
  DashboardOverviewAppointment,
} from "@rouby/api-client";
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
  upcomingAppointments: DashboardOverviewAppointment[];
  setOverviewRecentActivity: (items: DashboardOverviewActivity[] | null) => void;
  setOverviewUpcomingAppointments: (items: DashboardOverviewAppointment[] | null) => void;
};

const DashboardShellFeedContext = createContext<DashboardShellFeedContextValue | null>(
  null,
);

export function DashboardShellFeedProvider({ children }: { children: ReactNode }) {
  const [recentActivity, setRecentActivity] = useState<DashboardOverviewActivity[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<DashboardOverviewAppointment[]>(
    [],
  );

  const setOverviewRecentActivity = useCallback((items: DashboardOverviewActivity[] | null) => {
    setRecentActivity(items ?? []);
  }, []);

  const setOverviewUpcomingAppointments = useCallback(
    (items: DashboardOverviewAppointment[] | null) => {
      setUpcomingAppointments(items ?? []);
    },
    [],
  );

  const value = useMemo(
    () => ({
      recentActivity,
      upcomingAppointments,
      setOverviewRecentActivity,
      setOverviewUpcomingAppointments,
    }),
    [
      recentActivity,
      upcomingAppointments,
      setOverviewRecentActivity,
      setOverviewUpcomingAppointments,
    ],
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
