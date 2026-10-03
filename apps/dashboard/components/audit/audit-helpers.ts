import type {
  DashboardAuditLogCategory,
  DashboardAuditLogItem,
} from "@rouby/api-client";
import { cairoTodayYmd, formatDayLabel } from "@rouby/wall-clock";

export type CategoryFilter = "all" | DashboardAuditLogCategory;
export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "custom" | "all";

export const CATEGORY_CHIPS: Array<{ key: CategoryFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "money", label: "Money" },
  { key: "overrides", label: "Overrides" },
  { key: "bookings", label: "Bookings" },
  { key: "staff_users", label: "Staff & users" },
  { key: "settings", label: "Settings" },
];

export const RANGE_CHIPS: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "custom", label: "Custom" },
];

export function categoryLabel(category: DashboardAuditLogCategory): string {
  return CATEGORY_CHIPS.find((c) => c.key === category)?.label ?? "Other";
}

export function isCategoryFilter(value: string | null): value is CategoryFilter {
  return CATEGORY_CHIPS.some((c) => c.key === value);
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Cairo calendar days for a preset; `all` has no bounds. */
export function rangeToDates(
  range: RangeKey,
  customFrom: string,
  customTo: string,
): { dateFrom?: string; dateTo?: string } {
  const today = cairoTodayYmd();
  if (range === "today") return { dateFrom: today, dateTo: today };
  if (range === "yesterday") {
    const y = addDaysYmd(today, -1);
    return { dateFrom: y, dateTo: y };
  }
  if (range === "7d") return { dateFrom: addDaysYmd(today, -6), dateTo: today };
  if (range === "30d") return { dateFrom: addDaysYmd(today, -29), dateTo: today };
  if (range === "custom") {
    return {
      dateFrom: customFrom || undefined,
      dateTo: customTo || undefined,
    };
  }
  return {};
}

const CAIRO = "Africa/Cairo";

/** `YYYY-MM-DD` of an instant on the Cairo calendar. */
export function cairoYmd(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CAIRO }).format(new Date(iso));
}

export function cairoTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CAIRO,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function cairoDateTime(iso: string): string {
  return `${formatDayLabel(cairoYmd(iso))}, ${cairoTime(iso)}`;
}

export function dayHeading(ymd: string): string {
  const today = cairoTodayYmd();
  if (ymd === today) return "Today";
  if (ymd === addDaysYmd(today, -1)) return "Yesterday";
  return new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export type DayGroup = { ymd: string; heading: string; items: DashboardAuditLogItem[] };

/** Rows arrive newest first; consecutive rows of the same Cairo day share a heading. */
export function groupByDay(rows: DashboardAuditLogItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const row of rows) {
    const ymd = cairoYmd(row.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.ymd === ymd) {
      last.items.push(row);
    } else {
      groups.push({ ymd, heading: dayHeading(ymd), items: [row] });
    }
  }
  return groups;
}

/** Same short reference the API and the bookings page use (`RB-` + last 8 hex). */
export function bookingReference(bookingId: string): string {
  return `RB-${bookingId.replace(/-/g, "").slice(-8).toUpperCase()}`;
}

/** The summary ends with "Reason: ..." when there is a reason; the page shows that on its own line. */
export function summaryWithoutReason(item: DashboardAuditLogItem): string {
  if (!item.reason) return item.summary;
  const at = item.summary.lastIndexOf(" Reason: ");
  return at > 0 ? item.summary.slice(0, at) : item.summary;
}
