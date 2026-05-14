"use client";

import { ComingSoonDashboardPage } from "@/components/coming-soon-dashboard-page";

export default function LoyaltyPage() {
  return (
    <ComingSoonDashboardPage
      title="Loyalty"
      description="Manage loyalty points, memberships, and client rewards."
      permission="clients.read"
    />
  );
}
