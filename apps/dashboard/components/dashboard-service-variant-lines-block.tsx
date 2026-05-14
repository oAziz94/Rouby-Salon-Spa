"use client";

import {
  getDashboardPackages,
  getDashboardServiceEnhancements,
  getDashboardServiceVariants,
  getDashboardServices,
  type DashboardBookingLineInput,
  type DashboardPackage,
  type DashboardService,
  type DashboardServiceEnhancement,
  type DashboardServiceVariant,
} from "@rouby/api-client";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

function serviceShowsStaffPricingFields(
  service: DashboardService | undefined,
  variantOptionCount: number,
): boolean {
  if (!service || variantOptionCount >= 1) {
    return false;
  }
  const t = service.priceDisplayType;
  if (t === "CONTACT" || t === "HIDDEN" || t === "RANGE") {
    return true;
  }
  if (service.basePrice == null && (t === "FIXED" || t === "STARTS_FROM")) {
    return true;
  }
  if (t === "STARTS_FROM" && service.basePrice != null) {
    return true;
  }
  return false;
}

function serviceRequiresStaffPrice(
  service: DashboardService | undefined,
  variantOptionCount: number,
): boolean {
  if (!service || variantOptionCount >= 1) {
    return false;
  }
  const t = service.priceDisplayType;
  if (t === "CONTACT" || t === "HIDDEN" || t === "RANGE") {
    return true;
  }
  if (service.basePrice == null && (t === "FIXED" || t === "STARTS_FROM")) {
    return true;
  }
  return false;
}

export type ServiceLineKind = "service" | "package" | "enhancement";

export type ServiceLineRow = {
  key: string;
  /** Defaults to "service" for back-compat with older callers. */
  kind?: ServiceLineKind;
  serviceId: string;
  variantId: string;
  packageId?: string;
  enhancementId?: string;
  /** Staff-entered EGP unit price when catalog has no fixed online price (see dashboard booking rules). */
  staffOverrideUnitPrice?: string;
  /** Optional duration override (minutes). */
  staffOverrideDurationMinutes?: string;
};

export type DashboardServiceVariantLinesBlockHandle = {
  buildBookingItems: () =>
    | { ok: true; items: DashboardBookingLineInput[] }
    | { ok: false; error: string };
};

type Props = {
  token: string;
  branchId: string;
  lines: ServiceLineRow[];
  setLines: Dispatch<SetStateAction<ServiceLineRow[]>>;
  disabled?: boolean;
};

function lineKindOf(line: ServiceLineRow): ServiceLineKind {
  return line.kind ?? "service";
}

export const DashboardServiceVariantLinesBlock = forwardRef<
  DashboardServiceVariantLinesBlockHandle,
  Props
>(function DashboardServiceVariantLinesBlock(
  { token, branchId, lines, setLines, disabled = false },
  ref,
) {
  const [lineVariantOptions, setLineVariantOptions] = useState<
    Record<string, DashboardServiceVariant[]>
  >({});
  const [lineVariantLoading, setLineVariantLoading] = useState<Record<string, boolean>>({});
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [services, setServices] = useState<DashboardService[]>([]);
  const [packages, setPackages] = useState<DashboardPackage[]>([]);
  const [enhancements, setEnhancements] = useState<DashboardServiceEnhancement[]>([]);

  const servicesCatalogRef = useRef<DashboardService[]>([]);
  servicesCatalogRef.current = services;

  const linesRef = useRef(lines);
  const optsRef = useRef(lineVariantOptions);
  const loadingRef = useRef(lineVariantLoading);
  linesRef.current = lines;
  optsRef.current = lineVariantOptions;
  loadingRef.current = lineVariantLoading;

  const refreshVariantsForLine = useCallback(
    async (lineKey: string, serviceId: string) => {
      if (!serviceId) {
        setLineVariantOptions((prev) => ({ ...prev, [lineKey]: [] }));
        setLineVariantLoading((prev) => ({ ...prev, [lineKey]: false }));
        return;
      }
      setLineVariantLoading((prev) => ({ ...prev, [lineKey]: true }));
      try {
        const { data } = await getDashboardServiceVariants(token, serviceId);
        const active = data.filter((v) => v.isActive);
        setLineVariantOptions((prev) => ({ ...prev, [lineKey]: active }));
        setLines((prev) =>
          prev.map((row) => {
            if (row.key !== lineKey || row.serviceId !== serviceId || lineKindOf(row) !== "service") {
              return row;
            }
            if (active.length === 1) {
              return { ...row, variantId: active[0].id };
            }
            return { ...row, variantId: "" };
          }),
        );
      } catch {
        setLineVariantOptions((prev) => ({ ...prev, [lineKey]: [] }));
      } finally {
        setLineVariantLoading((prev) => ({ ...prev, [lineKey]: false }));
      }
    },
    [setLines, token],
  );

  useImperativeHandle(ref, () => ({
    buildBookingItems: () => {
      const curLines = linesRef.current;
      const opts = optsRef.current;
      const loading = loadingRef.current;
      for (const line of curLines) {
        const kind = lineKindOf(line);
        if (kind === "service") {
          const sid = line.serviceId.trim();
          if (!sid) {
            continue;
          }
          if (loading[line.key]) {
            return { ok: false, error: "Wait for variant options to finish loading." };
          }
          const vo = opts[line.key] ?? [];
          if (vo.length > 1 && !line.variantId.trim()) {
            return {
              ok: false,
              error: "Select a variant for each service that lists multiple options.",
            };
          }
          const catalog = servicesCatalogRef.current;
          const svc = catalog.find((s) => s.id === sid);
          const showStaff = serviceShowsStaffPricingFields(svc, vo.length);
          const requireStaffPrice = serviceRequiresStaffPrice(svc, vo.length);
          if (requireStaffPrice) {
            const rawPrice = (line.staffOverrideUnitPrice ?? "").trim().replace(/,/g, "");
            const p = parseFloat(rawPrice);
            if (!Number.isFinite(p) || p < 0.01) {
              return {
                ok: false,
                error:
                  "Enter a valid staff price (EGP) for each service with contact/hidden/range pricing or no catalog price.",
              };
            }
            const hasCatalogDuration =
              svc != null && svc.durationMinutes != null && svc.durationMinutes >= 1;
            if (!hasCatalogDuration) {
              const dm = (line.staffOverrideDurationMinutes ?? "").trim();
              const d = parseInt(dm, 10);
              if (!Number.isInteger(d) || d < 1) {
                return {
                  ok: false,
                  error: "Enter duration in minutes for services with no default duration on the catalog.",
                };
              }
            }
          } else if (showStaff) {
            const rawPrice = (line.staffOverrideUnitPrice ?? "").trim().replace(/,/g, "");
            if (rawPrice !== "") {
              const p = parseFloat(rawPrice);
              if (!Number.isFinite(p) || p < 0.01) {
                return {
                  ok: false,
                  error:
                    "Enter a valid staff price (EGP) or leave it blank to use the catalog “starts from” price.",
                };
              }
            }
            const dmRaw = (line.staffOverrideDurationMinutes ?? "").trim();
            if (dmRaw !== "") {
              const d = parseInt(dmRaw, 10);
              if (!Number.isInteger(d) || d < 1) {
                return {
                  ok: false,
                  error: "Duration override must be a whole number of minutes (1–1440).",
                };
              }
            }
          }
        }
      }
      const items: DashboardBookingLineInput[] = [];
      for (const line of curLines) {
        const kind = lineKindOf(line);
        if (kind === "package") {
          const packageId = (line.packageId ?? "").trim();
          if (!packageId) {
            continue;
          }
          items.push({ itemType: "PACKAGE", packageId, quantity: 1 });
          continue;
        }
        if (kind === "enhancement") {
          const enhancementId = (line.enhancementId ?? "").trim();
          if (!enhancementId) {
            continue;
          }
          items.push({
            itemType: "SERVICE_ENHANCEMENT",
            serviceEnhancementId: enhancementId,
            quantity: 1,
          });
          continue;
        }
        const serviceId = line.serviceId.trim();
        if (!serviceId) {
          continue;
        }
        const vo = opts[line.key] ?? [];
        if (vo.length >= 1) {
          const variantId =
            line.variantId.trim() || (vo.length === 1 ? vo[0].id : "");
          if (!variantId) {
            return { ok: false, error: "Select a variant for each priced option." };
          }
          items.push({
            itemType: "SERVICE_VARIANT",
            serviceId,
            serviceVariantId: variantId,
            quantity: 1,
          });
        } else {
          const catalog = servicesCatalogRef.current;
          const svc = catalog.find((s) => s.id === serviceId);
          const showStaff = serviceShowsStaffPricingFields(svc, vo.length);
          const requireStaffPrice = serviceRequiresStaffPrice(svc, vo.length);
          if (!showStaff) {
            items.push({
              itemType: "SERVICE",
              serviceId,
              quantity: 1,
            });
          } else if (requireStaffPrice) {
            const rawPrice = (line.staffOverrideUnitPrice ?? "").trim().replace(/,/g, "");
            const p = parseFloat(rawPrice);
            const rounded = Math.round(p * 100) / 100;
            const item: DashboardBookingLineInput = {
              itemType: "SERVICE",
              serviceId,
              quantity: 1,
              staffOverrideUnitPrice: rounded,
            };
            const dmRaw = (line.staffOverrideDurationMinutes ?? "").trim();
            if (dmRaw) {
              const d = parseInt(dmRaw, 10);
              if (!Number.isInteger(d) || d < 1) {
                return {
                  ok: false,
                  error: "Duration override must be a whole number of minutes (1–1440).",
                };
              }
              item.staffOverrideDurationMinutes = d;
            }
            items.push(item);
          } else {
            const rawPrice = (line.staffOverrideUnitPrice ?? "").trim().replace(/,/g, "");
            if (rawPrice === "") {
              items.push({
                itemType: "SERVICE",
                serviceId,
                quantity: 1,
              });
            } else {
              const p = parseFloat(rawPrice);
              const rounded = Math.round(p * 100) / 100;
              const item: DashboardBookingLineInput = {
                itemType: "SERVICE",
                serviceId,
                quantity: 1,
                staffOverrideUnitPrice: rounded,
              };
              const dmRaw = (line.staffOverrideDurationMinutes ?? "").trim();
              if (dmRaw) {
                const d = parseInt(dmRaw, 10);
                if (!Number.isInteger(d) || d < 1) {
                  return {
                    ok: false,
                    error: "Duration override must be a whole number of minutes (1–1440).",
                  };
                }
                item.staffOverrideDurationMinutes = d;
              }
              items.push(item);
            }
          }
        }
      }
      if (items.length === 0) {
        return { ok: false, error: "Add at least one treatment line (service, package, or add-on)." };
      }
      return { ok: true, items };
    },
  }));

  useEffect(() => {
    if (!branchId) {
      return;
    }
    let cancelled = false;
    setCatalogLoading(true);
    const fetchAllServices = async () => {
      const collected: DashboardService[] = [];
      let page = 1;
      for (;;) {
        const res = await getDashboardServices(token, {
          page,
          pageSize: 100,
          isActive: true,
        });
        collected.push(...res.data);
        if (!res.meta.hasNextPage || page >= 15) {
          break;
        }
        page += 1;
      }
      return collected;
    };
    const fetchAllPackages = async () => {
      const collected: DashboardPackage[] = [];
      let page = 1;
      for (;;) {
        const res = await getDashboardPackages(token, {
          page,
          pageSize: 100,
          isActive: true,
        });
        collected.push(...res.data);
        if (!res.meta.hasNextPage || page >= 15) {
          break;
        }
        page += 1;
      }
      return collected;
    };
    const fetchAllEnhancements = async () => {
      const collected: DashboardServiceEnhancement[] = [];
      let page = 1;
      for (;;) {
        const res = await getDashboardServiceEnhancements(token, {
          page,
          pageSize: 100,
          isActive: true,
        });
        collected.push(...res.data);
        if (!res.meta.hasNextPage || page >= 15) {
          break;
        }
        page += 1;
      }
      return collected;
    };
    void (async () => {
      const [servicesRes, packagesRes, enhancementsRes] = await Promise.allSettled([
        fetchAllServices(),
        fetchAllPackages(),
        fetchAllEnhancements(),
      ]);
      if (cancelled) {
        return;
      }
      setServices(servicesRes.status === "fulfilled" ? servicesRes.value : []);
      setPackages(packagesRes.status === "fulfilled" ? packagesRes.value : []);
      setEnhancements(enhancementsRes.status === "fulfilled" ? enhancementsRes.value : []);
      setCatalogLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, branchId]);

  const servicesAtBranch = branchId
    ? services.filter((s) => s.branchIds.includes(branchId))
    : services;
  const packagesAtBranch = branchId
    ? packages.filter((p) => p.branchIds.includes(branchId))
    : packages;
  const enhancementsBookable = enhancements.filter((e) => e.isActive && e.price != null);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Treatments</span>
        {catalogLoading ? (
          <span className="text-xs text-[#7A6A58]">Loading catalog…</span>
        ) : null}
      </div>
      <div className="space-y-3">
        {lines.map((line, index) => {
          const kind = lineKindOf(line);
          const variantOpts = lineVariantOptions[line.key] ?? [];
          const variantBusy =
            kind === "service" && Boolean(line.serviceId && lineVariantLoading[line.key]);
          const selectedService =
            kind === "service" && line.serviceId
              ? servicesAtBranch.find((s) => s.id === line.serviceId)
              : undefined;
          const showStaffPricingFields =
            kind === "service" &&
            Boolean(line.serviceId) &&
            !variantBusy &&
            serviceShowsStaffPricingFields(selectedService, variantOpts.length);
          const staffPriceRequired =
            showStaffPricingFields &&
            serviceRequiresStaffPrice(selectedService, variantOpts.length);
          const staffDurationOptional =
            selectedService != null &&
            selectedService.durationMinutes != null &&
            selectedService.durationMinutes >= 1;
          return (
            <div key={line.key} className="space-y-2 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={kind}
                  disabled={disabled}
                  onChange={(e) => {
                    const nextKind = e.target.value as ServiceLineKind;
                    setLineVariantOptions((prev) => {
                      const next = { ...prev };
                      delete next[line.key];
                      return next;
                    });
                    setLineVariantLoading((prev) => {
                      const next = { ...prev };
                      delete next[line.key];
                      return next;
                    });
                    setLines((prev) =>
                      prev.map((row, i) =>
                        i === index
                          ? {
                              ...row,
                              kind: nextKind,
                              serviceId: "",
                              variantId: "",
                              packageId: "",
                              enhancementId: "",
                              staffOverrideUnitPrice: "",
                              staffOverrideDurationMinutes: "",
                            }
                          : row,
                      ),
                    );
                  }}
                  className="w-full shrink-0 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50 disabled:opacity-60 sm:max-w-[11rem]"
                >
                  <option value="service">Service</option>
                  <option value="package">Package</option>
                  <option value="enhancement">Add-on</option>
                </select>

                {kind === "service" ? (
                  <select
                    value={line.serviceId}
                    disabled={disabled}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                serviceId: v,
                                variantId: "",
                                staffOverrideUnitPrice: "",
                                staffOverrideDurationMinutes: "",
                              }
                            : row,
                        ),
                      );
                      void refreshVariantsForLine(line.key, v);
                    }}
                    className="min-w-0 flex-1 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50 disabled:opacity-60"
                  >
                    <option value="">Select service</option>
                    {servicesAtBranch.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : null}

                {kind === "package" ? (
                  <select
                    value={line.packageId ?? ""}
                    disabled={disabled}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, packageId: v } : row,
                        ),
                      );
                    }}
                    className="min-w-0 flex-1 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50 disabled:opacity-60"
                  >
                    <option value="">Select package</option>
                    {packagesAtBranch.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                ) : null}

                {kind === "enhancement" ? (
                  <select
                    value={line.enhancementId ?? ""}
                    disabled={disabled}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, enhancementId: v } : row,
                        ),
                      );
                    }}
                    className="min-w-0 flex-1 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50 disabled:opacity-60"
                  >
                    <option value="">Select add-on</option>
                    {enhancementsBookable.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                        {e.price != null
                          ? ` — EGP ${e.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                          : ""}
                      </option>
                    ))}
                  </select>
                ) : null}

                <button
                  type="button"
                  disabled={disabled || lines.length <= 1}
                  onClick={() => {
                    setLineVariantOptions((prev) => {
                      const next = { ...prev };
                      delete next[line.key];
                      return next;
                    });
                    setLineVariantLoading((prev) => {
                      const next = { ...prev };
                      delete next[line.key];
                      return next;
                    });
                    setLines((prev) => prev.filter((_, i) => i !== index));
                  }}
                  className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[#E8E0D4] bg-white p-2 text-[#8B4428] shadow-sm hover:bg-[#FFF1EC] disabled:opacity-40"
                  aria-label="Remove line"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {kind === "service" && line.serviceId && variantBusy ? (
                <p className="flex items-center gap-2 text-xs text-[#7A6A58]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Loading options…
                </p>
              ) : null}
              {kind === "service" && variantOpts.length > 1 ? (
                <label className="block text-xs font-medium text-[#7A6A58]">
                  Variant
                  <select
                    value={line.variantId}
                    disabled={disabled}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLines((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, variantId: v } : row)),
                      );
                    }}
                    className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-[#B9974A]/50 disabled:opacity-60"
                  >
                    <option value="">Select variant</option>
                    {variantOpts.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {showStaffPricingFields ? (
                <div className="mt-2 grid gap-2 rounded-xl border border-dashed border-[#D4C4B0] bg-white/70 p-3 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-[#5E574C]">
                    Staff price (EGP){" "}
                    {staffPriceRequired ? (
                      <span className="text-[#B85C38]">*</span>
                    ) : (
                      <span className="font-normal text-[#9A9084]">(optional)</span>
                    )}
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0.01}
                      step={0.01}
                      disabled={disabled}
                      value={line.staffOverrideUnitPrice ?? ""}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((row, i) =>
                            i === index ? { ...row, staffOverrideUnitPrice: e.target.value } : row,
                          ),
                        )
                      }
                      className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50 disabled:opacity-60"
                    />
                  </label>
                  <label className="block text-xs font-medium text-[#5E574C]">
                    Duration (minutes)
                    {staffPriceRequired ? (
                      staffDurationOptional ? (
                        <span className="font-normal text-[#9A9084]"> optional</span>
                      ) : (
                        <span className="text-[#B85C38]"> *</span>
                      )
                    ) : (
                      <span className="font-normal text-[#9A9084]"> optional</span>
                    )}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={1440}
                      step={1}
                      disabled={disabled}
                      value={line.staffOverrideDurationMinutes ?? ""}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((row, i) =>
                            i === index ? { ...row, staffOverrideDurationMinutes: e.target.value } : row,
                          ),
                        )
                      }
                      placeholder={
                        staffDurationOptional || !staffPriceRequired
                          ? "Uses catalog duration if empty"
                          : ""
                      }
                      className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50 disabled:opacity-60"
                    />
                  </label>
                  <p className="sm:col-span-2 text-[11px] leading-relaxed text-[#7A6A58]">
                    {staffPriceRequired ? (
                      <>
                        Enter what to charge for this service. Add duration when the catalog does not define one.
                      </>
                    ) : (
                      <>
                        Optional: override the catalog “starts from” price for this visit. Leave blank to use the
                        catalog price; duration overrides are optional when the service has a default duration.
                      </>
                    )}
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              setLines((prev) => [
                ...prev,
                {
                  key: `${Date.now()}-${Math.random()}`,
                  kind: "service",
                  serviceId: "",
                  variantId: "",
                  packageId: "",
                  enhancementId: "",
                  staffOverrideUnitPrice: "",
                  staffOverrideDurationMinutes: "",
                },
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-xs font-semibold text-[#062A2D] shadow-sm transition hover:border-[#B9974A]/45 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Service
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              setLines((prev) => [
                ...prev,
                {
                  key: `${Date.now()}-${Math.random()}`,
                  kind: "package",
                  serviceId: "",
                  variantId: "",
                  packageId: "",
                  enhancementId: "",
                  staffOverrideUnitPrice: "",
                  staffOverrideDurationMinutes: "",
                },
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-xs font-semibold text-[#062A2D] shadow-sm transition hover:border-[#B9974A]/45 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Package
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              setLines((prev) => [
                ...prev,
                {
                  key: `${Date.now()}-${Math.random()}`,
                  kind: "enhancement",
                  serviceId: "",
                  variantId: "",
                  packageId: "",
                  enhancementId: "",
                  staffOverrideUnitPrice: "",
                  staffOverrideDurationMinutes: "",
                },
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-xs font-semibold text-[#062A2D] shadow-sm transition hover:border-[#B9974A]/45 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add-on
          </button>
        </div>
      </div>
    </div>
  );
});
