"use client";

import { ComingSoonDashboardPage } from "@/components/coming-soon-dashboard-page";

export default function BranchesPage() {
  return (
    <ComingSoonDashboardPage
      title="Branches"
      description="Manage salon branches, branch details, and operational settings."
      permission="branches.read"
    />
  );
}
