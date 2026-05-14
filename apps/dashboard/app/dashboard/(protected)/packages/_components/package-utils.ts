import type {
  DashboardBranch,
  DashboardPackage,
  DashboardService,
} from "@rouby/api-client";

export function formatEGP(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return `EGP ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function packageInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase() || "?";
}

export function savingsAmount(pkg: DashboardPackage): number {
  return Math.max(0, pkg.originalPrice - pkg.packagePrice);
}

export function savingsPercent(pkg: DashboardPackage): number | null {
  if (pkg.originalPrice <= 0) return null;
  const pct = ((pkg.originalPrice - pkg.packagePrice) / pkg.originalPrice) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.round(pct * 10) / 10;
}

export function formatDurationMinutes(min: number | null | undefined): string {
  if (min == null || min < 1) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function missingServices(pkg: DashboardPackage): boolean {
  return pkg.serviceIds.length === 0;
}

export function missingBranches(pkg: DashboardPackage): boolean {
  return pkg.branchIds.length === 0;
}

export function missingPrice(pkg: DashboardPackage): boolean {
  return pkg.packagePrice == null || pkg.packagePrice <= 0;
}

export function missingDuration(pkg: DashboardPackage): boolean {
  return pkg.durationMinutes == null || pkg.durationMinutes < 1;
}

export function missingSetupCount(pkg: DashboardPackage): number {
  let n = 0;
  if (missingServices(pkg)) n += 1;
  if (missingBranches(pkg)) n += 1;
  if (missingPrice(pkg)) n += 1;
  if (missingDuration(pkg)) n += 1;
  return n;
}

export function hasPackageSetupIssue(pkg: DashboardPackage): boolean {
  return missingSetupCount(pkg) > 0;
}

export type QualityKey = "all" | "missing-services" | "missing-branches" | "missing-price" | "missing-duration";

export function matchesQuality(pkg: DashboardPackage, q: QualityKey): boolean {
  if (q === "all") return true;
  if (q === "missing-services") return missingServices(pkg);
  if (q === "missing-branches") return missingBranches(pkg);
  if (q === "missing-price") return missingPrice(pkg);
  if (q === "missing-duration") return missingDuration(pkg);
  return true;
}

export type OnlineFilter = "all" | "online" | "hidden";

export function readinessChecklist(pkg: DashboardPackage): {
  key: string;
  label: string;
  ok: boolean;
}[] {
  return [
    { key: "active", label: "Active", ok: pkg.isActive },
    { key: "services", label: "Has included services", ok: !missingServices(pkg) },
    { key: "price", label: "Has package price", ok: !missingPrice(pkg) },
    { key: "duration", label: "Has duration", ok: !missingDuration(pkg) },
    { key: "branches", label: "Branch availability", ok: !missingBranches(pkg) },
    {
      key: "online",
      label: "Visible on public catalog",
      ok: Boolean(pkg.isPublicListingReady),
    },
  ];
}

export function activationBlockers(pkg: DashboardPackage): string[] {
  const out: string[] = [];
  if (missingServices(pkg)) out.push("No included services");
  if (missingBranches(pkg)) out.push("No branch availability");
  if (missingPrice(pkg)) out.push("No package price");
  if (missingDuration(pkg)) out.push("Missing duration");
  return out;
}

export function serviceByIdMap(services: DashboardService[]): Map<string, DashboardService> {
  return new Map(services.map((s) => [s.id, s]));
}

export function branchByIdMap(branches: DashboardBranch[]): Map<string, DashboardBranch> {
  return new Map(branches.map((b) => [b.id, b]));
}

export function resolveBranchNames(pkg: DashboardPackage, branches: DashboardBranch[]): string[] {
  const map = branchByIdMap(branches);
  return pkg.branchIds.map((id) => map.get(id)?.name ?? "Branch");
}

export function resolveServiceSummaries(
  pkg: DashboardPackage,
  services: DashboardService[],
  categoryById?: Map<string, string>,
): { id: string; name: string; categoryName: string | null; duration: number | null; price: number | null }[] {
  const map = serviceByIdMap(services);
  return pkg.serviceIds.map((id) => {
    const s = map.get(id);
    const cat =
      s?.categoryId && categoryById ? categoryById.get(s.categoryId) ?? null : null;
    return {
      id,
      name: s?.name ?? "Service",
      categoryName: cat,
      duration: s?.durationMinutes ?? null,
      price: s?.basePrice ?? null,
    };
  });
}
