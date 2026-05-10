import { formatWallClockRange12h } from "@rouby/wall-clock";

const TERMINAL_STATUSES = new Set([
  "CANCELLED",
  "REJECTED",
  "COMPLETED",
  "NO_SHOW",
]);

export function bookingReferenceLabel(bookingId: string): string {
  const compact = bookingId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `REF-${compact}`;
}

export function isTerminalBookingStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function statusBadgeTone(status: string): "neutral" | "positive" | "warning" | "negative" | "accent" {
  switch (status) {
    case "CONFIRMED":
    case "ARRIVED":
    case "IN_PROGRESS":
    case "COMPLETED":
      return "positive";
    case "PENDING":
      return "warning";
    case "RESCHEDULED":
      return "accent";
    case "CANCELLED":
    case "REJECTED":
    case "NO_SHOW":
      return "negative";
    default:
      return "neutral";
  }
}

export function formatSlotRangeLabel(slot: {
  date: string;
  startTime: string;
  endTime: string;
}): string {
  const range = formatWallClockRange12h(slot.startTime, slot.endTime);
  const datePart = formatBookingDateHeading(slot.date);
  return `${datePart} · ${range}`;
}

function formatBookingDateHeading(isoDate: string): string {
  const [y, mo, da] = isoDate.split("-").map((x) => Number(x));
  if (!y || !mo || !da) {
    return isoDate;
  }
  const d = new Date(Date.UTC(y, mo - 1, da));
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function summarizeItemNames(names: string[], max = 2): string {
  const shown = names.slice(0, max);
  const more = names.length > max ? ` +${names.length - max}` : "";
  return shown.join(" · ") + more;
}

export function statusBadgeClassName(status: string): string {
  const tone = statusBadgeTone(status);
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em]";
  switch (tone) {
    case "positive":
      return `${base} border-[#17351f]/25 bg-[#17351f]/10 text-[#17351f]`;
    case "warning":
      return `${base} border-[#b9974a]/45 bg-[#b9974a]/15 text-[#4a3d18]`;
    case "negative":
      return `${base} border-[#8b4428]/35 bg-[#8b4428]/12 text-[#5c2d1b]`;
    case "accent":
      return `${base} border-[#b9974a]/50 bg-[#fdfaf4] text-[#5c4a18]`;
    default:
      return `${base} border-[#7a6a58]/30 bg-[#f3ebdd]/80 text-[#5a5248]`;
  }
}
