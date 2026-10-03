"use client";

import type {
  DashboardAuditLogCategory,
  DashboardAuditLogItem,
} from "@rouby/api-client";
import { CalendarDays, Settings, ShieldAlert, Users, Wallet } from "lucide-react";
import type { ComponentType } from "react";
import { cairoTime, categoryLabel, summaryWithoutReason } from "./audit-helpers";

type IconType = ComponentType<{ className?: string }>;

const CATEGORY_ICON: Record<DashboardAuditLogCategory, IconType> = {
  money: Wallet,
  overrides: ShieldAlert,
  bookings: CalendarDays,
  staff_users: Users,
  settings: Settings,
};

const CATEGORY_TONE: Record<DashboardAuditLogCategory, string> = {
  money: "bg-[#E8F2EE] text-[#0E342B]",
  overrides: "bg-[#FFF4D6] text-[#6B4B00]",
  bookings: "bg-[#FBF6E8] text-[#5C4A18]",
  staff_users: "bg-[#F1ECF7] text-[#523176]",
  settings: "bg-[#F4F1EC] text-[#5E574C]",
};

export function CategoryIcon({
  category,
  className = "h-4 w-4",
}: {
  category: DashboardAuditLogCategory;
  className?: string;
}) {
  const Icon = CATEGORY_ICON[category] ?? Settings;
  return <Icon className={className} />;
}

export function categoryTone(category: DashboardAuditLogCategory): string {
  return CATEGORY_TONE[category] ?? CATEGORY_TONE.settings;
}

export function OverrideTag() {
  return (
    <span className="inline-flex items-center rounded-full border border-[#D4AF37]/50 bg-[#FFF4D6] px-2 py-0.5 text-[11px] font-medium text-[#6B4B00]">
      Override
    </span>
  );
}

function severityBorder(severity: DashboardAuditLogItem["severity"]): string {
  if (severity === "CRITICAL") return "border-l-red-500";
  if (severity === "WARNING") return "border-l-amber-400";
  return "border-l-transparent";
}

export function AuditEntry({
  item,
  onOpen,
}: {
  item: DashboardAuditLogItem;
  onOpen: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item.id)}
        className={`flex w-full gap-3 rounded-xl border border-border border-l-4 bg-white p-3 text-left transition hover:bg-[#FFF9EE] sm:p-4 ${severityBorder(item.severity)}`}
      >
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${categoryTone(item.category)}`}
          title={categoryLabel(item.category)}
        >
          <CategoryIcon category={item.category} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-[#1F2420]">{item.title}</span>
            {item.isOverride ? <OverrideTag /> : null}
            <span className="ml-auto text-xs text-[#7A6A58]">
              {cairoTime(item.createdAt)}
            </span>
          </span>
          <span className="mt-1 block text-sm text-[#3A3A34]">
            {summaryWithoutReason(item)}
          </span>
          {item.reason ? (
            <span className="mt-1 block text-sm text-[#6B4B00]">
              <span className="font-medium">Reason:</span> {item.reason}
            </span>
          ) : null}
          <span className="mt-1 block text-xs text-[#7A6A58]">
            By {item.actor.isSystem ? "the system" : item.actor.name}
          </span>
        </span>
      </button>
    </li>
  );
}
