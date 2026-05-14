"use client";

import { ComingSoonDashboardPage } from "@/components/coming-soon-dashboard-page";

export default function ClientGroupsPage() {
  return (
    <ComingSoonDashboardPage
      title="Client Groups"
      description="Segment clients into groups such as VIP, new clients, and frequent visitors."
      permission="clients.read"
    />
  );
}
