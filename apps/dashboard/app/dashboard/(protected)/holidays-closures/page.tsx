"use client";

import { ComingSoonDashboardPage } from "@/components/coming-soon-dashboard-page";

export default function HolidaysClosuresPage() {
  return (
    <ComingSoonDashboardPage
      title="Holidays & Closures"
      description="Configure branch closures, holidays, and special working days."
      permission="slots.read"
    />
  );
}
