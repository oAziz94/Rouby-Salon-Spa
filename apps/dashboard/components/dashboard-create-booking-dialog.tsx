"use client";

import {
  ApiClientError,
  getDashboardClients,
  getDashboardPackages,
  getDashboardServiceCategories,
  getDashboardServices,
  getDashboardServiceEnhancements,
  getDashboardServiceVariants,
  getDashboardSlots,
  postDashboardCreateBooking,
  type DashboardBookingLineInput,
  type DashboardBookingDetail,
  type DashboardCreateBookingInput,
  type DashboardBranch,
  type DashboardClient,
  type DashboardPackage,
  type DashboardService,
  type DashboardServiceCategory,
  type DashboardServiceEnhancement,
  type DashboardServiceVariant,
  type DashboardSlot,
} from "@rouby/api-client";
import { formatWallClockRange12h } from "@rouby/wall-clock";
import { AlertCircle, Loader2, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardServicePicker } from "./dashboard-service-picker";

const BOOKING_SOURCES = [
  "PHONE",
  "WALK_IN",
  "DASHBOARD",
  "WHATSAPP",
  "INSTAGRAM",
  "FACEBOOK",
] as const;

type LineKind = "service" | "package" | "enhancement";

type LineRow = {
  key: string;
  kind: LineKind;
  serviceId: string;
  variantId: string;
  packageId: string;
  enhancementId: string;
  staffOverrideUnitPrice: string;
  staffOverrideDurationMinutes: string;
};

/** Show staff price/duration strip (queue + new booking) when there is no variant line. */
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

/** Staff unit price is mandatory when the strip is shown for these catalog types. */
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

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "SLOT_AT_CAPACITY") {
      return "Slot is at capacity.";
    }
    if (error.code === "SERVICE_VARIANT_REQUIRED") {
      return "That service needs a variant — pick the variant option below the service.";
    }
    if (error.code === "STAFF_PRICE_REQUIRED") {
      return "Enter a staff price (and duration if needed) for that service — it is not priced for online booking.";
    }
    if (error.code === "STAFF_OVERRIDE_PRICE_INVALID" || error.code === "STAFF_OVERRIDE_DURATION_INVALID") {
      return "Check the staff price and duration values (numbers only).";
    }
    if (error.code === "INVALID_BOOKING_SOURCE") {
      return "Invalid booking source for dashboard.";
    }
    if (error.code === "ENHANCEMENT_INACTIVE" || error.code === "ENHANCEMENT_NOT_PRICEABLE") {
      return "That add-on cannot be booked (inactive or missing price).";
    }
    if (error.statusCode === 403) {
      return "You do not have permission to create this booking.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error.";
}

type DashboardCreateBookingDialogProps = {
  open: boolean;
  onClose: () => void;
  token: string;
  branches: DashboardBranch[];
  initialBranchId: string;
  branchSelectDisabled: boolean;
  onCreated: (detail: DashboardBookingDetail) => void;
  /** When opening from a client row, pre-select that client in the form. */
  presetClient?: { id: string; fullName: string; phone?: string | null } | null;
};

export function DashboardCreateBookingDialog({
  open,
  onClose,
  token,
  branches,
  initialBranchId,
  branchSelectDisabled,
  onCreated,
  presetClient = null,
}: DashboardCreateBookingDialogProps) {
  const [branchId, setBranchId] = useState(initialBranchId);
  const [clientSearch, setClientSearch] = useState("");
  const [clientSearchDebounced, setClientSearchDebounced] = useState("");
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clients, setClients] = useState<DashboardClient[]>([]);
  const [clientId, setClientId] = useState("");
  const [slotDate, setSlotDate] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slots, setSlots] = useState<DashboardSlot[]>([]);
  const [slotId, setSlotId] = useState("");
  const [source, setSource] = useState<string>("PHONE");
  const [initialStatus, setInitialStatus] = useState<string>("PENDING");
  const [adminNotes, setAdminNotes] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>([
    {
      key: "a",
      kind: "service",
      serviceId: "",
      variantId: "",
      packageId: "",
      enhancementId: "",
      staffOverrideUnitPrice: "",
      staffOverrideDurationMinutes: "",
    },
  ]);
  const [lineVariantOptions, setLineVariantOptions] = useState<Record<string, DashboardServiceVariant[]>>({});
  const [lineVariantLoading, setLineVariantLoading] = useState<Record<string, boolean>>({});
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [services, setServices] = useState<DashboardService[]>([]);
  const [categories, setCategories] = useState<DashboardServiceCategory[]>([]);
  const [packages, setPackages] = useState<DashboardPackage[]>([]);
  const [enhancements, setEnhancements] = useState<DashboardServiceEnhancement[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const refreshVariantsForLine = useCallback(async (lineKey: string, serviceId: string) => {
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
          if (row.key !== lineKey || row.serviceId !== serviceId || row.kind !== "service") {
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
  }, [token]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setBranchId(initialBranchId || branches[0]?.id || "");
  }, [open, initialBranchId, branches]);

  useEffect(() => {
    if (!open || !presetClient?.id) {
      return;
    }
    setClientId(presetClient.id);
    const label = [presetClient.fullName, presetClient.phone].filter(Boolean).join(" · ");
    setClientSearch(label);
    setClients([]);
  }, [open, presetClient?.id, presetClient?.fullName, presetClient?.phone]);

  useEffect(() => {
    const t = setTimeout(() => setClientSearchDebounced(clientSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [clientSearch]);

  useEffect(() => {
    if (!open || !branchId || !/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) {
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    void getDashboardSlots(token, branchId, {
      dateFrom: slotDate,
      dateTo: slotDate,
      page: 1,
      pageSize: 100,
    })
      .then((res) => {
        if (!cancelled) {
          setSlots(res.data);
          setSlotId((prev) => {
            if (prev && res.data.some((s) => s.id === prev)) {
              return prev;
            }
            return res.data[0]?.id ?? "";
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSlots([]);
          setSlotId("");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSlotsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, branchId, slotDate]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const today = new Date();
    const pad = (n: number) => `${n}`.padStart(2, "0");
    setSlotDate(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  }, [open]);

  useEffect(() => {
    if (!open || !clientSearchDebounced) {
      setClients([]);
      return;
    }
    let cancelled = false;
    setClientsLoading(true);
    void getDashboardClients(token, { search: clientSearchDebounced, page: 1, pageSize: 25 })
      .then((res) => {
        if (!cancelled) {
          setClients(res.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClients([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setClientsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, clientSearchDebounced]);

  const servicesAtBranch = useMemo(
    () => (branchId ? services.filter((s) => s.branchIds.includes(branchId)) : services),
    [services, branchId],
  );

  const packagesAtBranch = useMemo(
    () => (branchId ? packages.filter((p) => p.branchIds.includes(branchId)) : packages),
    [packages, branchId],
  );

  const enhancementsBookable = useMemo(
    () => enhancements.filter((e) => e.isActive && e.price != null),
    [enhancements],
  );

  const loadCatalog = useCallback(async () => {
    if (!open) {
      return;
    }
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
    const [servicesRes, categoriesRes, packagesRes, enhancementsRes] = await Promise.allSettled([
      fetchAllServices(),
      getDashboardServiceCategories(token, { isActive: true }),
      fetchAllPackages(),
      fetchAllEnhancements(),
    ]);
    setServices(servicesRes.status === "fulfilled" ? servicesRes.value : []);
    setCategories(categoriesRes.status === "fulfilled" ? categoriesRes.value.data : []);
    setPackages(packagesRes.status === "fulfilled" ? packagesRes.value : []);
    setEnhancements(enhancementsRes.status === "fulfilled" ? enhancementsRes.value : []);
    setCatalogLoading(false);
  }, [open, token]);

  useEffect(() => {
    if (open) {
      void loadCatalog();
    }
  }, [open, loadCatalog]);

  function resetForm() {
    setClientSearch("");
    setClientSearchDebounced("");
    setClients([]);
    setClientId("");
    setSlotId("");
    setAdminNotes("");
    setClientNotes("");
    setSource("PHONE");
    setInitialStatus("PENDING");
    setLines([
      {
        key: `${Date.now()}`,
        kind: "service",
        serviceId: "",
        variantId: "",
        packageId: "",
        enhancementId: "",
        staffOverrideUnitPrice: "",
        staffOverrideDurationMinutes: "",
      },
    ]);
    setLineVariantOptions({});
    setLineVariantLoading({});
    setError("");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!clientId) {
      setError("Select a client.");
      return;
    }
    if (!branchId) {
      setError("Select a branch.");
      return;
    }
    if (!slotId) {
      setError("Select an appointment slot.");
      return;
    }
    for (const line of lines) {
      const nonEmpty =
        (line.kind === "service" && line.serviceId.trim()) ||
        (line.kind === "package" && line.packageId.trim()) ||
        (line.kind === "enhancement" && line.enhancementId.trim());
      if (!nonEmpty) {
        continue;
      }
      if (line.kind === "service") {
        if (lineVariantLoading[line.key]) {
          setError("Wait for variant options to finish loading.");
          return;
        }
        const opts = lineVariantOptions[line.key] ?? [];
        if (opts.length > 1 && !line.variantId.trim()) {
          setError("Select a variant for each service that lists multiple options.");
          return;
        }
        const svc = servicesAtBranch.find((s) => s.id === line.serviceId.trim());
        const showStaff = serviceShowsStaffPricingFields(svc, opts.length);
        const requireStaffPrice = serviceRequiresStaffPrice(svc, opts.length);
        if (requireStaffPrice) {
          const rawPrice = line.staffOverrideUnitPrice.trim().replace(/,/g, "");
          const p = parseFloat(rawPrice);
          if (!Number.isFinite(p) || p < 0.01) {
            setError(
              "Enter a valid staff price (EGP) for each service with contact/hidden/range pricing or no catalog price.",
            );
            return;
          }
          const hasCatalogDuration =
            svc != null && svc.durationMinutes != null && svc.durationMinutes >= 1;
          if (!hasCatalogDuration) {
            const dm = line.staffOverrideDurationMinutes.trim();
            const d = parseInt(dm, 10);
            if (!Number.isInteger(d) || d < 1) {
              setError("Enter duration in minutes for services with no default duration on the catalog.");
              return;
            }
          }
        } else if (showStaff) {
          const rawPrice = line.staffOverrideUnitPrice.trim().replace(/,/g, "");
          if (rawPrice !== "") {
            const p = parseFloat(rawPrice);
            if (!Number.isFinite(p) || p < 0.01) {
              setError(
                "Enter a valid staff price (EGP) or leave it blank to use the catalog “starts from” price.",
              );
              return;
            }
          }
          const dmRaw = line.staffOverrideDurationMinutes.trim();
          if (dmRaw !== "") {
            const d = parseInt(dmRaw, 10);
            if (!Number.isInteger(d) || d < 1) {
              setError("Duration override must be a whole number of minutes (1–1440).");
              return;
            }
          }
        }
      }
    }
    const items: DashboardBookingLineInput[] = [];
    for (const line of lines) {
      if (line.kind === "package") {
        const packageId = line.packageId.trim();
        if (!packageId) {
          continue;
        }
        items.push({
          itemType: "PACKAGE",
          packageId,
          quantity: 1,
        });
        continue;
      }
      if (line.kind === "enhancement") {
        const enhancementId = line.enhancementId.trim();
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
      const opts = lineVariantOptions[line.key] ?? [];
      if (opts.length >= 1) {
        const variantId =
          line.variantId.trim() || (opts.length === 1 ? opts[0].id : "");
        if (!variantId) {
          setError("Select a variant for each priced option.");
          return;
        }
        items.push({
          itemType: "SERVICE_VARIANT",
          serviceId,
          serviceVariantId: variantId,
          quantity: 1,
        });
      } else {
        const svc = servicesAtBranch.find((s) => s.id === serviceId);
        const showStaff = serviceShowsStaffPricingFields(svc, opts.length);
        const requireStaffPrice = serviceRequiresStaffPrice(svc, opts.length);
        if (!showStaff) {
          items.push({
            itemType: "SERVICE",
            serviceId,
            quantity: 1,
          });
        } else if (requireStaffPrice) {
          const rawPrice = line.staffOverrideUnitPrice.trim().replace(/,/g, "");
          const p = parseFloat(rawPrice);
          const rounded = Math.round(p * 100) / 100;
          const item: DashboardBookingLineInput = {
            itemType: "SERVICE",
            serviceId,
            quantity: 1,
            staffOverrideUnitPrice: rounded,
          };
          const dmRaw = line.staffOverrideDurationMinutes.trim();
          if (dmRaw) {
            const d = parseInt(dmRaw, 10);
            if (!Number.isInteger(d) || d < 1) {
              setError("Duration override must be a whole number of minutes (1–1440).");
              return;
            }
            item.staffOverrideDurationMinutes = d;
          }
          items.push(item);
        } else {
          const rawPrice = line.staffOverrideUnitPrice.trim().replace(/,/g, "");
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
            const dmRaw = line.staffOverrideDurationMinutes.trim();
            if (dmRaw) {
              const d = parseInt(dmRaw, 10);
              if (!Number.isInteger(d) || d < 1) {
                setError("Duration override must be a whole number of minutes (1–1440).");
                return;
              }
              item.staffOverrideDurationMinutes = d;
            }
            items.push(item);
          }
        }
      }
    }
    if (items.length === 0) {
      setError("Add at least one treatment line (service, package, or add-on).");
      return;
    }
    setSubmitting(true);
    try {
      const detail = await postDashboardCreateBooking(token, {
        clientId,
        branchId,
        slotId,
        source: source as DashboardCreateBookingInput["source"],
        initialStatus: initialStatus || undefined,
        adminNotes: adminNotes.trim() || undefined,
        clientNotes: clientNotes.trim() || undefined,
        items,
      });
      onCreated(detail);
      handleClose();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#062A2D]/45 p-4">
      <div className="mx-auto flex min-h-full max-w-lg items-center justify-center py-8">
        <button
          type="button"
          className="fixed inset-0 cursor-default"
          aria-label="Close"
          onClick={handleClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-booking-title"
          className="relative z-10 w-full max-w-lg rounded-2xl border border-[#E8E0D4]/90 bg-[#FFFCF7] p-6 shadow-[0_20px_60px_rgba(6,42,45,0.2)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="create-booking-title" className="text-lg font-semibold text-[#1F2420]">
                New booking
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[#7A6A58]">
                Create a manual appointment for a client. The booking appears in the list and in change requests if
                you add a follow-up request.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-[#E8E0D4] bg-white p-2 text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Branch</span>
              <select
                value={branchId}
                disabled={branchSelectDisabled}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setSlotId("");
                }}
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50 disabled:cursor-not-allowed disabled:bg-[#F5F1EA]"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Client</span>
              <input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Search by name or phone"
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none placeholder:text-[#B5A896] focus:border-[#B9974A]/50"
              />
              {clientsLoading ? (
                <p className="mt-2 flex items-center gap-2 text-xs text-[#7A6A58]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Searching…
                </p>
              ) : null}
              {clientSearchDebounced && clients.length > 0 ? (
                <ul className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-[#F0EBE3] bg-white text-sm shadow-sm">
                  {clients.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setClientId(c.id);
                          setClientSearch(`${c.fullName} · ${c.phone ?? ""}`.trim());
                          setClients([]);
                        }}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition hover:bg-[#FFFCF7]"
                      >
                        <span className="font-medium text-[#1F2420]">{c.fullName}</span>
                        <span className="text-xs text-[#7A6A58] tabular-nums">{c.phone ?? "—"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {clientId ? (
                <p className="mt-2 text-xs font-medium text-[#0E342B]">Selected client ID is set — adjust search to change.</p>
              ) : null}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                Appointment date
              </span>
              <input
                type="date"
                value={slotDate}
                onChange={(e) => setSlotDate(e.target.value)}
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Slot</span>
              <select
                value={slotId}
                onChange={(e) => setSlotId(e.target.value)}
                disabled={slotsLoading || slots.length === 0}
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">{slotsLoading ? "Loading slots…" : slots.length === 0 ? "No slots this day" : "Select slot"}</option>
                {slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.date} · {formatWallClockRange12h(s.startTime, s.endTime)} ({s.status})
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Source</span>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
                >
                  {BOOKING_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                  Initial status
                </span>
                <select
                  value={initialStatus}
                  onChange={(e) => setInitialStatus(e.target.value)}
                  className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
                >
                  <option value="PENDING">Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                </select>
              </label>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Treatments</span>
                {catalogLoading ? (
                  <span className="text-xs text-[#7A6A58]">Loading catalog…</span>
                ) : null}
              </div>
              <div className="space-y-3">
                {lines.map((line, index) => {
                  const variantOpts = lineVariantOptions[line.key] ?? [];
                  const variantBusy =
                    line.kind === "service" &&
                    Boolean(line.serviceId && lineVariantLoading[line.key]);
                  const selectedService =
                    line.kind === "service" && line.serviceId
                      ? servicesAtBranch.find((s) => s.id === line.serviceId)
                      : undefined;
                  const showStaffPricingFields =
                    line.kind === "service" &&
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
                          value={line.kind}
                          onChange={(e) => {
                            const kind = e.target.value as LineKind;
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
                                      kind,
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
                          className="w-full shrink-0 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50 sm:max-w-[11rem]"
                        >
                          <option value="service">Service</option>
                          <option value="package">Package</option>
                          <option value="enhancement">Add-on</option>
                        </select>

                        {line.kind === "service" ? (
                          <DashboardServicePicker
                            services={servicesAtBranch}
                            categories={categories}
                            value={line.serviceId}
                            onChange={(v) => {
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
                          />
                        ) : null}

                        {line.kind === "package" ? (
                          <select
                            value={line.packageId}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLines((prev) =>
                                prev.map((row, i) =>
                                  i === index ? { ...row, packageId: v } : row,
                                ),
                              );
                            }}
                            className="min-w-0 flex-1 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
                          >
                            <option value="">Select package</option>
                            {packagesAtBranch.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        ) : null}

                        {line.kind === "enhancement" ? (
                          <select
                            value={line.enhancementId}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLines((prev) =>
                                prev.map((row, i) =>
                                  i === index ? { ...row, enhancementId: v } : row,
                                ),
                              );
                            }}
                            className="min-w-0 flex-1 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
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
                          disabled={lines.length <= 1}
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
                          className="shrink-0 rounded-xl border border-[#E8E0D4] bg-white p-2 text-[#8B4428] shadow-sm transition hover:bg-[#FFF1EC] disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {line.kind === "service" && line.serviceId ? (
                        <div className="pl-0.5">
                          {variantBusy ? (
                            <p className="flex items-center gap-2 text-xs text-[#7A6A58]">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              Loading options…
                            </p>
                          ) : variantOpts.length > 1 ? (
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-[#7A6A58]">Variant</span>
                              <select
                                value={line.variantId}
                                onChange={(e) => {
                                  const vid = e.target.value;
                                  setLines((prev) =>
                                    prev.map((row, i) => (i === index ? { ...row, variantId: vid } : row)),
                                  );
                                }}
                                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
                              >
                                <option value="">Select variant</option>
                                {variantOpts.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name} — EGP {v.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : variantOpts.length === 1 ? (
                            <p className="text-xs text-[#5E574C]">
                              <span className="font-medium text-[#7A6A58]">Option:</span> {variantOpts[0].name} · EGP{" "}
                              {variantOpts[0].price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </p>
                          ) : null}
                          {showStaffPricingFields ? (
                            <div className="mt-3 grid gap-2 rounded-xl border border-dashed border-[#D4C4B0] bg-white/70 p-3 sm:grid-cols-2">
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
                                  value={line.staffOverrideUnitPrice}
                                  onChange={(e) =>
                                    setLines((prev) =>
                                      prev.map((row, i) =>
                                        i === index ? { ...row, staffOverrideUnitPrice: e.target.value } : row,
                                      ),
                                    )
                                  }
                                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
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
                                  value={line.staffOverrideDurationMinutes}
                                  onChange={(e) =>
                                    setLines((prev) =>
                                      prev.map((row, i) =>
                                        i === index
                                          ? { ...row, staffOverrideDurationMinutes: e.target.value }
                                          : row,
                                      ),
                                    )
                                  }
                                  placeholder={
                                    staffDurationOptional || !staffPriceRequired
                                      ? "Uses catalog duration if empty"
                                      : ""
                                  }
                                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
                                />
                              </label>
                              <p className="sm:col-span-2 text-[11px] leading-relaxed text-[#7A6A58]">
                                {staffPriceRequired ? (
                                  <>
                                    This line is not priced like a standard online service. Enter the amount to charge;
                                    add duration when the catalog does not define one.
                                  </>
                                ) : (
                                  <>
                                    Optional: override the catalog “starts from” price for this visit. Leave blank to
                                    use the catalog price; duration overrides are optional when the service has a
                                    default duration.
                                  </>
                                )}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) => [
                        ...prev,
                        {
                          key: `${Date.now()}-${prev.length}`,
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
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-xs font-semibold text-[#062A2D] shadow-sm transition hover:border-[#B9974A]/45"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Service
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) => [
                        ...prev,
                        {
                          key: `${Date.now()}-${prev.length}`,
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
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-xs font-semibold text-[#062A2D] shadow-sm transition hover:border-[#B9974A]/45"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Package
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) => [
                        ...prev,
                        {
                          key: `${Date.now()}-${prev.length}`,
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
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-xs font-semibold text-[#062A2D] shadow-sm transition hover:border-[#B9974A]/45"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Add-on
                  </button>
                </div>
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                Client notes (optional)
              </span>
              <textarea
                value={clientNotes}
                onChange={(e) => setClientNotes(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                Internal notes (optional)
              </span>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
              />
            </label>

            {error ? (
              <div className="flex gap-2 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-3 py-2 text-sm text-[#8B4428]">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F0EBE3] pt-4">
              <Link
                href="/dashboard/clients"
                className="text-xs font-semibold text-[#062A2D] underline-offset-2 hover:underline"
                onClick={handleClose}
              >
                Add or edit clients
              </Link>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm font-semibold text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    lines.some(
                      (l) => l.kind === "service" && Boolean(l.serviceId && lineVariantLoading[l.key]),
                    )
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] shadow-sm transition hover:bg-[#0A3F35] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Create booking
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
