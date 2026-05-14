"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import type {
  PublicBranch,
  PublicCategory,
  PublicPackage,
  PublicService,
  PublicServiceEnhancement,
  PublicServiceVariant,
} from "@/lib/api/public";
import { formatServicePriceLabel } from "@/lib/booking/format-service-price";
import { formatEgp } from "@/lib/format/currency";
import { formatWallClockRange12h } from "@rouby/wall-clock";
import {
  BOOKING_REGISTER_FULL_NAME_KEY,
  CLIENT_OTP_INTENT,
} from "@/lib/auth/client-otp";
import {
  clearClientSession,
  getClientPhone,
  getClientToken,
  setClientPhone as persistClientPhone,
  setClientToken as persistClientToken,
  subscribeClientSession,
} from "@/lib/auth/client-session";

type BookingFlowShellProps = {
  categories: PublicCategory[];
  services: PublicService[];
  packages: PublicPackage[];
  enhancements: PublicServiceEnhancement[];
  branches: PublicBranch[];
  /** Branch used for SSR catalog + estimate; must stay in sync with `selectedBranchId` on load. */
  initialBranchId?: string;
  preselection: {
    serviceId?: string;
    variantId?: string;
    packageId?: string;
    promoCode?: string;
  };
  initialErrors: {
    categories: string | null;
    services: string | null;
    packages: string | null;
    enhancements: string | null;
    branches: string | null;
  };
};

type BookingStepIndex = 0 | 1 | 2;

const STEP_LABELS = ["Choose Treatments", "Date & Time", "Confirm Booking"] as const;

type PublicSlot = {
  id: string;
  branchId: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  status: string;
  isOnlineBookable: boolean;
};

function publicSlotIsFull(slot: PublicSlot): boolean {
  return slot.bookedCount >= slot.capacity || slot.status === "FILLED";
}

function publicSlotClientStatusLabel(slot: PublicSlot): string {
  if (!slot.isOnlineBookable) {
    return "Unavailable";
  }
  if (publicSlotIsFull(slot)) {
    return "Filled";
  }
  return "Available";
}

type SlotListResponse = { data: PublicSlot[] };
type VariantListResponse = { data: PublicServiceVariant[] };

type BookingEstimateResponse = {
  subtotal: number;
  discountAmount: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  currency: "EGP";
  pricesIncludeVat: boolean;
  appliedPromoCode?: string | null;
  appliedOfferId?: string | null;
  promoError?: string | null;
};

type ApiErrorShape = {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  code?: string;
};

type BookingCreateResponse = {
  id: string;
  status: string;
  branchId: string;
  slotId: string;
  totalAmount: number;
  currency: "EGP";
  createdAt: string;
};

type OtpRequestResponse = { success: true; expiresIn: number; phone: string; devCode?: string };
type OtpVerifyResponse = {
  accessToken: string;
  expiresIn: number;
  client: { id: string; fullName: string; phone: string; email: string | null };
};

type BookingItemPayload = {
  itemType: "SERVICE" | "SERVICE_VARIANT" | "PACKAGE" | "SERVICE_ENHANCEMENT";
  serviceId?: string;
  serviceVariantId?: string;
  packageId?: string;
  serviceEnhancementId?: string;
  quantity?: number;
};

type BookingAuthPath = "signin" | "register";
type CatalogTab = "services" | "packages" | "enhancements";

function resolveApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${resolveApiBaseUrl()}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

async function fetchJsonWithBody<T>(
  path: string,
  method: "POST" | "PUT",
  body: unknown,
  token?: string,
): Promise<T> {
  const res = await fetch(`${resolveApiBaseUrl()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401 && token) {
      clearClientSession();
    }
    let parsed: ApiErrorShape | null = null;
    try {
      parsed = (await res.json()) as ApiErrorShape;
    } catch {
      parsed = null;
    }
    const message =
      parsed?.message && Array.isArray(parsed.message)
        ? parsed.message.join(", ")
        : typeof parsed?.message === "string"
          ? parsed.message
          : `Request failed (${res.status})`;
    const error = new Error(message) as Error & {
      status?: number;
      code?: string;
    };
    error.status = res.status;
    error.code = parsed?.code;
    throw error;
  }
  return (await res.json()) as T;
}

function todayDateOnly(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatEstimateError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unable to estimate totals.";
  }
  const code = (error as Error & { code?: string }).code;
  if (code === "SERVICE_NOT_AT_BRANCH") {
    return "One or more treatments are not offered at this branch. Choose another branch or update your selections.";
  }
  if (code === "PACKAGE_NOT_AT_BRANCH") {
    return "This package is not offered at this branch. Choose another branch or remove it from your visit.";
  }
  if (code === "ENHANCEMENT_INACTIVE" || code === "ENHANCEMENT_NOT_PRICEABLE") {
    return "One or more add-ons are no longer available. Update your selections and try again.";
  }
  return error.message || "Unable to estimate totals.";
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function serviceMatchesSearch(service: PublicService, q: string): boolean {
  if (!q.trim()) {
    return true;
  }
  const n = q.trim().toLowerCase();
  return (
    service.name.toLowerCase().includes(n) ||
    normalizeText(service.shortDescription).includes(n) ||
    normalizeText(service.description).includes(n)
  );
}

function packageMatchesSearch(pkg: PublicPackage, q: string): boolean {
  if (!q.trim()) {
    return true;
  }
  const n = q.trim().toLowerCase();
  return (
    pkg.name.toLowerCase().includes(n) ||
    normalizeText(pkg.shortDescription).includes(n) ||
    normalizeText(pkg.description).includes(n)
  );
}

function enhancementMatchesSearch(item: PublicServiceEnhancement, q: string): boolean {
  if (!q.trim()) {
    return true;
  }
  const n = q.trim().toLowerCase();
  return (
    item.title.toLowerCase().includes(n) ||
    normalizeText(item.shortDescription).includes(n)
  );
}

export function BookingFlowShell({
  categories,
  services: servicesFromServer,
  packages: packagesFromServer,
  enhancements: enhancementsFromServer,
  branches,
  initialBranchId,
  preselection,
  initialErrors,
}: BookingFlowShellProps) {
  const router = useRouter();
  const [currentStepIndex, setCurrentStepIndex] = useState<BookingStepIndex>(0);
  const [catalogTab, setCatalogTab] = useState<CatalogTab>("services");
  const [categoryFilterId, setCategoryFilterId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);

  const [services, setServices] = useState<PublicService[]>(servicesFromServer);
  const [packages, setPackages] = useState<PublicPackage[]>(packagesFromServer);
  const [enhancements, setEnhancements] =
    useState<PublicServiceEnhancement[]>(enhancementsFromServer);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [catalogRefreshError, setCatalogRefreshError] = useState<string | null>(null);
  const prevBranchForCatalogRef = useRef<string | undefined>(undefined);

  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([]);
  const [selectedEnhancementIds, setSelectedEnhancementIds] = useState<string[]>([]);
  const [selectedVariantByServiceId, setSelectedVariantByServiceId] = useState<
    Record<string, string>
  >({});
  const [variantOptionsByServiceId, setVariantOptionsByServiceId] = useState<
    Record<string, PublicServiceVariant[]>
  >({});
  const [variantLoadingByServiceId, setVariantLoadingByServiceId] = useState<
    Record<string, boolean>
  >({});
  const [variantErrorByServiceId, setVariantErrorByServiceId] = useState<
    Record<string, string | null>
  >({});

  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");

  const [isSignedIn, setIsSignedIn] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [clientToken, setClientTokenState] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [bookingAuthPath, setBookingAuthPath] = useState<BookingAuthPath | null>(null);
  const [registerFullName, setRegisterFullName] = useState("");

  const [estimate, setEstimate] = useState<BookingEstimateResponse | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [promoForEstimate, setPromoForEstimate] = useState("");
  const [promoInput, setPromoInput] = useState("");

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const urlPromoAppliedRef = useRef(false);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );

  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      if (categoryFilterId && s.categoryId !== categoryFilterId) {
        return false;
      }
      return serviceMatchesSearch(s, searchQuery);
    });
  }, [services, categoryFilterId, searchQuery]);

  const filteredPackages = useMemo(() => {
    return packages.filter((p) => packageMatchesSearch(p, searchQuery));
  }, [packages, searchQuery]);

  const filteredEnhancements = useMemo(() => {
    return enhancements
      .filter((e) => e.isActive)
      .filter((e) => enhancementMatchesSearch(e, searchQuery));
  }, [enhancements, searchQuery]);

  useEffect(() => {
    setServices(servicesFromServer);
    setPackages(packagesFromServer);
    setEnhancements(enhancementsFromServer);
  }, [servicesFromServer, packagesFromServer, enhancementsFromServer]);

  useEffect(() => {
    setSelectedDate(todayDateOnly());
  }, []);

  useEffect(() => {
    if (branches.length === 0 || selectedBranchId) {
      return;
    }
    const preferred =
      initialBranchId && branches.some((b) => b.id === initialBranchId)
        ? initialBranchId
        : branches[0].id;
    setSelectedBranchId(preferred);
  }, [branches, selectedBranchId, initialBranchId]);

  useEffect(() => {
    if (!selectedBranchId) {
      return;
    }
    const previous = prevBranchForCatalogRef.current;
    if (previous === undefined) {
      prevBranchForCatalogRef.current = selectedBranchId;
      return;
    }
    if (previous === selectedBranchId) {
      return;
    }
    prevBranchForCatalogRef.current = selectedBranchId;

    let cancelled = false;
    const base = resolveApiBaseUrl();
    const branchQuery = encodeURIComponent(selectedBranchId);

    async function refreshCatalogForBranch() {
      setCatalogRefreshing(true);
      setCatalogRefreshError(null);
      const fetchJsonOrThrow = async <T,>(path: string, label: string): Promise<T> => {
        const r = await fetch(`${base}${path}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!r.ok) {
          throw new Error(`${label} request failed (${r.status})`);
        }
        return (await r.json()) as T;
      };
      const [svcRes, pkgRes, enhRes] = await Promise.allSettled([
        fetchJsonOrThrow<{ data: PublicService[] }>(
          `/public/services?page=1&pageSize=100&branchId=${branchQuery}`,
          "Services",
        ),
        fetchJsonOrThrow<{ data: PublicPackage[] }>(
          `/public/packages?page=1&pageSize=100&branchId=${branchQuery}`,
          "Packages",
        ),
        fetchJsonOrThrow<{ data: PublicServiceEnhancement[] }>(
          `/public/service-enhancements`,
          "Add-ons",
        ),
      ]);
      if (cancelled) {
        return;
      }
      const nextServices = svcRes.status === "fulfilled" ? svcRes.value.data ?? [] : [];
      const nextPackages = pkgRes.status === "fulfilled" ? pkgRes.value.data ?? [] : [];
      const nextEnhancements = enhRes.status === "fulfilled" ? enhRes.value.data ?? [] : [];
      const failures: string[] = [];
      if (svcRes.status === "rejected") failures.push(svcRes.reason?.message ?? "services");
      if (pkgRes.status === "rejected") failures.push(pkgRes.reason?.message ?? "packages");
      if (enhRes.status === "rejected") failures.push(enhRes.reason?.message ?? "add-ons");
      setServices(nextServices);
      setPackages(nextPackages);
      setEnhancements(nextEnhancements);
      setSelectedServiceIds((ids) => ids.filter((id) => nextServices.some((s) => s.id === id)));
      setSelectedPackageIds((ids) => ids.filter((id) => nextPackages.some((p) => p.id === id)));
      setSelectedEnhancementIds((ids) =>
        ids.filter((id) => nextEnhancements.some((e) => e.id === id)),
      );
      setVariantOptionsByServiceId({});
      setSelectedVariantByServiceId((prev) => {
        const next: Record<string, string> = {};
        for (const [sid, vid] of Object.entries(prev)) {
          if (nextServices.some((s) => s.id === sid)) {
            next[sid] = vid;
          }
        }
        return next;
      });
      setSelectedSlotId("");
      if (failures.length > 0) {
        setCatalogRefreshError(failures.join(" · "));
      }
      setCatalogRefreshing(false);
    }

    void refreshCatalogForBranch();
    return () => {
      cancelled = true;
    };
  }, [selectedBranchId]);

  useEffect(() => {
    function syncAuthFromSession(): void {
      const stored = getClientToken();
      const storedPhone = getClientPhone();
      setClientTokenState(stored);
      setIsSignedIn(Boolean(stored));
      if (storedPhone) {
        setPhoneNumber(storedPhone);
        setOtpPhone(storedPhone);
      }
    }
    syncAuthFromSession();
    return subscribeClientSession(syncAuthFromSession);
  }, []);

  useEffect(() => {
    if (preselection.serviceId && services.some((item) => item.id === preselection.serviceId)) {
      setSelectedServiceIds((prev) =>
        prev.includes(preselection.serviceId as string)
          ? prev
          : [...prev, preselection.serviceId as string],
      );
    }
    if (preselection.packageId && packages.some((item) => item.id === preselection.packageId)) {
      setSelectedPackageIds((prev) =>
        prev.includes(preselection.packageId as string)
          ? prev
          : [...prev, preselection.packageId as string],
      );
    }
  }, [preselection, services, packages]);

  useEffect(() => {
    if (urlPromoAppliedRef.current) {
      return;
    }
    const code = preselection.promoCode?.trim();
    if (code) {
      const upper = code.toUpperCase();
      setPromoForEstimate(upper);
      setPromoInput(upper);
      urlPromoAppliedRef.current = true;
    }
  }, [preselection.promoCode]);

  useEffect(() => {
    if (!preselection.variantId || !preselection.serviceId) {
      return;
    }
    if (!selectedServiceIds.includes(preselection.serviceId)) {
      return;
    }
    void loadVariants(preselection.serviceId, preselection.variantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselection.variantId, preselection.serviceId, selectedServiceIds.join(",")]);

  useEffect(() => {
    if (!selectedBranchId || !selectedDate) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    async function loadSlots() {
      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const response = await fetchJson<SlotListResponse>(
          `/public/branches/${selectedBranchId}/slots?date=${selectedDate}`,
        );
        if (!cancelled) {
          setSlots(response.data);
        }
      } catch (error) {
        if (!cancelled) {
          setSlots([]);
          setSlotsError(error instanceof Error ? error.message : "Unable to load slots.");
        }
      } finally {
        if (!cancelled) {
          setSlotsLoading(false);
        }
      }
    }
    void loadSlots();
    return () => {
      cancelled = true;
    };
  }, [selectedBranchId, selectedDate]);

  const selectedServices = useMemo(
    () => services.filter((item) => selectedServiceIds.includes(item.id)),
    [services, selectedServiceIds],
  );
  const selectedPackages = useMemo(
    () => packages.filter((item) => selectedPackageIds.includes(item.id)),
    [packages, selectedPackageIds],
  );
  const selectedEnhancements = useMemo(
    () => enhancements.filter((item) => selectedEnhancementIds.includes(item.id)),
    [enhancements, selectedEnhancementIds],
  );
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? null;

  useEffect(() => {
    if (!selectedSlotId) {
      return;
    }
    const slot = slots.find((s) => s.id === selectedSlotId);
    if (slot && publicSlotIsFull(slot)) {
      setSelectedSlotId("");
    }
  }, [slots, selectedSlotId]);

  const estimatedTotalFallback = useMemo(() => {
    const servicesTotal = selectedServices.reduce((sum, item) => sum + (item.basePrice ?? 0), 0);
    const packagesTotal = selectedPackages.reduce((sum, item) => sum + (item.packagePrice ?? 0), 0);
    const variantsTotal = selectedServices.reduce((sum, item) => {
      const variantId = selectedVariantByServiceId[item.id];
      if (!variantId) {
        return sum;
      }
      const variant = variantOptionsByServiceId[item.id]?.find((opt) => opt.id === variantId);
      return sum + (variant?.price ?? 0);
    }, 0);
    const enhancementsTotal = selectedEnhancements.reduce(
      (sum, item) => sum + (item.price ?? 0),
      0,
    );
    return servicesTotal + packagesTotal + variantsTotal + enhancementsTotal;
  }, [
    selectedServices,
    selectedPackages,
    selectedEnhancements,
    selectedVariantByServiceId,
    variantOptionsByServiceId,
  ]);

  const bookingItemsPayload = useMemo<BookingItemPayload[]>(() => {
    const serviceItems = selectedServices.map((service) => {
      const selectedVariantId = selectedVariantByServiceId[service.id];
      if (selectedVariantId) {
        return {
          itemType: "SERVICE_VARIANT" as const,
          serviceId: service.id,
          serviceVariantId: selectedVariantId,
          quantity: 1,
        };
      }
      return {
        itemType: "SERVICE" as const,
        serviceId: service.id,
        quantity: 1,
      };
    });
    const packageItems = selectedPackages.map((pkg) => ({
      itemType: "PACKAGE" as const,
      packageId: pkg.id,
      quantity: 1,
    }));
    const enhancementItems = selectedEnhancements
      .filter((e) => e.price != null)
      .map((e) => ({
        itemType: "SERVICE_ENHANCEMENT" as const,
        serviceEnhancementId: e.id,
        quantity: 1,
      }));
    return [...serviceItems, ...packageItems, ...enhancementItems];
  }, [
    selectedPackages,
    selectedServices,
    selectedEnhancements,
    selectedVariantByServiceId,
  ]);

  useEffect(() => {
    async function loadEstimate() {
      if (!selectedBranchId || bookingItemsPayload.length === 0) {
        setEstimate(null);
        setEstimateError(null);
        return;
      }
      setEstimateLoading(true);
      setEstimateError(null);
      try {
        const response = await fetchJsonWithBody<BookingEstimateResponse>(
          "/public/bookings/estimate",
          "POST",
          {
            branchId: selectedBranchId,
            items: bookingItemsPayload,
            promoCode: promoForEstimate.trim() || undefined,
          },
        );
        setEstimate(response);
      } catch (error) {
        setEstimate(null);
        setEstimateError(formatEstimateError(error));
      } finally {
        setEstimateLoading(false);
      }
    }
    void loadEstimate();
  }, [selectedBranchId, bookingItemsPayload, promoForEstimate]);

  async function loadVariants(serviceId: string, preselectVariantId?: string) {
    if (variantOptionsByServiceId[serviceId] !== undefined) {
      return;
    }
    setVariantLoadingByServiceId((prev) => ({ ...prev, [serviceId]: true }));
    setVariantErrorByServiceId((prev) => ({ ...prev, [serviceId]: null }));
    try {
      const response = await fetchJson<VariantListResponse>(`/public/services/${serviceId}/variants`);
      setVariantOptionsByServiceId((prev) => ({
        ...prev,
        [serviceId]: response.data,
      }));
      if (preselectVariantId && response.data.some((item) => item.id === preselectVariantId)) {
        setSelectedVariantByServiceId((prev) => ({
          ...prev,
          [serviceId]: preselectVariantId,
        }));
      } else if (response.data.length === 1) {
        setSelectedVariantByServiceId((prev) => ({
          ...prev,
          [serviceId]: response.data[0].id,
        }));
      }
    } catch (error) {
      setVariantOptionsByServiceId((prev) => ({ ...prev, [serviceId]: [] }));
      setVariantErrorByServiceId((prev) => ({
        ...prev,
        [serviceId]: error instanceof Error ? error.message : "Unable to load variants.",
      }));
    } finally {
      setVariantLoadingByServiceId((prev) => ({ ...prev, [serviceId]: false }));
    }
  }

  useEffect(() => {
    for (const serviceId of selectedServiceIds) {
      if (
        variantOptionsByServiceId[serviceId] === undefined &&
        !variantLoadingByServiceId[serviceId]
      ) {
        void loadVariants(serviceId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadVariants reads latest variant maps
  }, [selectedServiceIds, variantOptionsByServiceId, variantLoadingByServiceId]);

  const variantsBlockingContinue = useMemo(() => {
    return selectedServices.some((service) => {
      const opts = variantOptionsByServiceId[service.id];
      const loading = variantLoadingByServiceId[service.id];
      if (loading) {
        return true;
      }
      if (opts && opts.length > 1 && !selectedVariantByServiceId[service.id]) {
        return true;
      }
      return false;
    });
  }, [selectedServices, variantOptionsByServiceId, variantLoadingByServiceId, selectedVariantByServiceId]);

  function toggleService(id: string) {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    if (selectedServiceIds.includes(id)) {
      setSelectedVariantByServiceId((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  function togglePackage(id: string) {
    setSelectedPackageIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleEnhancement(id: string) {
    setSelectedEnhancementIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function canContinueFrom(step: BookingStepIndex): boolean {
    if (step === 0) {
      const hasItems =
        selectedServiceIds.length > 0 || selectedPackageIds.length > 0;
      return hasItems && !variantsBlockingContinue;
    }
    if (step === 1) {
      const slot = slots.find((s) => s.id === selectedSlotId) ?? null;
      return Boolean(
        selectedBranchId &&
          selectedDate &&
          selectedSlotId &&
          slot &&
          !publicSlotIsFull(slot),
      );
    }
    return true;
  }

  function goNext() {
    if (!canContinueFrom(currentStepIndex)) {
      return;
    }
    setCurrentStepIndex((prev) => (prev < 2 ? ((prev + 1) as BookingStepIndex) : prev));
    setMobileSummaryOpen(false);
  }

  function goBack() {
    setCurrentStepIndex((prev) => (prev > 0 ? ((prev - 1) as BookingStepIndex) : prev));
    setMobileSummaryOpen(false);
  }

  function applyPromo() {
    setPromoForEstimate(promoInput.trim().toUpperCase());
  }

  function selectBookingAuthPath(path: BookingAuthPath) {
    setAuthError(null);
    if (path !== bookingAuthPath) {
      setOtpRequested(false);
      setOtpCode("");
      setDevCodeHint(null);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(BOOKING_REGISTER_FULL_NAME_KEY);
      }
    }
    setBookingAuthPath(path);
  }

  function mapAuthRequestError(error: unknown): string {
    const err = error as Error & { code?: string };
    if (err.code === "CLIENT_NOT_FOUND") {
      return "No account found with this number. Choose Create account if you are new to Alrouby.";
    }
    if (err.code === "CLIENT_ALREADY_EXISTS") {
      return "An account already exists for this number. Choose Sign in instead.";
    }
    return err instanceof Error ? err.message : "Unable to send verification code.";
  }

  function mapAuthVerifyError(error: unknown): string {
    const err = error as Error & { code?: string };
    if (err.code === "CLIENT_NOT_FOUND") {
      return "No account found with this number. Request a new code from Sign in, or use Create account.";
    }
    if (err.code === "CLIENT_ALREADY_EXISTS") {
      return "An account was created for this number while you were verifying. Sign in to continue.";
    }
    if (err.code === "CLIENT_FULL_NAME_REQUIRED") {
      return "Full name is required. Go back to Create account and enter your name.";
    }
    return err instanceof Error ? err.message : "Unable to verify code.";
  }

  async function handleRequestOtp() {
    setAuthLoading(true);
    setAuthError(null);
    if (!bookingAuthPath) {
      setAuthError("Choose Sign in or Create account before requesting a code.");
      setAuthLoading(false);
      return;
    }
    if (bookingAuthPath === "register" && registerFullName.trim().length < 2) {
      setAuthError("Please enter your full name (at least 2 characters).");
      setAuthLoading(false);
      return;
    }
    try {
      const response = await fetchJsonWithBody<OtpRequestResponse>(
        "/client/auth/otp/request",
        "POST",
        {
          phone: otpPhone.trim(),
          intent:
            bookingAuthPath === "signin"
              ? CLIENT_OTP_INTENT.SIGN_IN
              : CLIENT_OTP_INTENT.REGISTER,
        },
      );
      setOtpRequested(true);
      setOtpPhone(response.phone);
      setDevCodeHint(response.devCode ?? null);
      if (typeof window !== "undefined" && bookingAuthPath === "register") {
        window.sessionStorage.setItem(BOOKING_REGISTER_FULL_NAME_KEY, registerFullName.trim());
      }
    } catch (error) {
      setAuthError(mapAuthRequestError(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setAuthLoading(true);
    setAuthError(null);
    if (!bookingAuthPath) {
      setAuthError("Choose Sign in or Create account before verifying.");
      setAuthLoading(false);
      return;
    }
    const storedName =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem(BOOKING_REGISTER_FULL_NAME_KEY)?.trim() ?? ""
        : "";
    const fullNameForRegister = registerFullName.trim() || storedName;
    if (bookingAuthPath === "register" && fullNameForRegister.length < 2) {
      setAuthError("Full name is missing. Enter your name and request a new code.");
      setAuthLoading(false);
      return;
    }
    try {
      const verifyBody: { phone: string; code: string; fullName?: string } = {
        phone: otpPhone.trim(),
        code: otpCode.trim(),
      };
      if (bookingAuthPath === "register") {
        verifyBody.fullName = fullNameForRegister;
      }
      const response = await fetchJsonWithBody<OtpVerifyResponse>(
        "/client/auth/otp/verify",
        "POST",
        verifyBody,
      );
      persistClientToken(response.accessToken);
      persistClientPhone(response.client.phone);
      setClientTokenState(response.accessToken);
      setIsSignedIn(true);
      setPhoneNumber(response.client.phone);
      setOtpPhone(response.client.phone);
      setDevCodeHint(null);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(BOOKING_REGISTER_FULL_NAME_KEY);
      }
    } catch (error) {
      setAuthError(mapAuthVerifyError(error));
      setIsSignedIn(false);
      setClientTokenState("");
    } finally {
      setAuthLoading(false);
    }
  }

  function mapApiErrorToMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return "Unable to submit booking request.";
    }
    const code = (error as Error & { code?: string }).code;
    const status = (error as Error & { status?: number }).status;
    if (code === "CLIENT_PHONE_REQUIRED") {
      return "Phone number is required before booking submission.";
    }
    if (code === "SLOT_NOT_ONLINE") {
      return "This slot is no longer available online. Please select another slot.";
    }
    if (code === "BOOKING_SLOT_FULL" || code === "SLOT_FULL") {
      return "This slot is already full. Please select another slot.";
    }
    if (code === "CANCEL_WINDOW_EXPIRED") {
      return "The allowed booking window has expired for this slot.";
    }
    if (code === "SERVICE_NOT_AT_BRANCH") {
      return "One or more treatments are not offered at this branch. Choose another branch or update your selections.";
    }
    if (code === "PACKAGE_NOT_AT_BRANCH") {
      return "This package is not offered at this branch. Choose another branch or update your visit.";
    }
    if (code === "ENHANCEMENT_INACTIVE" || code === "ENHANCEMENT_NOT_PRICEABLE") {
      return "An add-on in your visit is not available. Return to treatments and update your selections.";
    }
    if (status === 401 || code === "UNAUTHORIZED") {
      return "Sign in is required before booking submission.";
    }
    if (status === 403 || code === "FORBIDDEN") {
      return "You do not have permission to submit this booking request.";
    }
    return error.message || "Unable to submit booking request.";
  }

  async function submitBookingRequest() {
    if (!clientToken) {
      setSubmitError("Sign in is required before booking submission.");
      return;
    }
    if (!selectedSlotId) {
      setSubmitError("Please select a slot before submitting.");
      return;
    }
    const slotForSubmit = slots.find((s) => s.id === selectedSlotId);
    if (!slotForSubmit || publicSlotIsFull(slotForSubmit)) {
      setSubmitError("That time is full. Please pick another slot.");
      return;
    }
    if (!phoneNumber.trim()) {
      setSubmitError("Phone number is required before booking submission.");
      return;
    }
    setSubmitLoading(true);
    setSubmitError(null);
    try {
      const response = await fetchJsonWithBody<BookingCreateResponse>(
        "/public/bookings",
        "POST",
        {
          branchId: selectedBranchId,
          slotId: selectedSlotId,
          items: bookingItemsPayload,
          promoCode: promoForEstimate.trim() || undefined,
        },
        clientToken,
      );
      router.push(`/booking/confirmation?bookingId=${response.id}`);
    } catch (error) {
      setSubmitError(mapApiErrorToMessage(error));
    } finally {
      setSubmitLoading(false);
    }
  }

  const selectionCount =
    selectedServiceIds.length +
    selectedPackageIds.length +
    selectedEnhancementIds.length;

  const summaryAside = (
    <div className="flex h-full flex-col rounded-2xl border border-[rgb(23_53_31_/12%)] bg-[#faf7f0]/95 p-5 shadow-[0_12px_40px_rgb(23_53_31_/6%)] backdrop-blur-sm sm:p-6">
      <div className="flex items-center justify-between gap-2 border-b border-[rgb(23_53_31_/10%)] pb-4">
        <h3 className="font-heading text-xl tracking-tight text-primary sm:text-2xl">Your visit</h3>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {selectionCount} {selectionCount === 1 ? "item" : "items"}
        </span>
      </div>

      {selectionCount === 0 ? (
        <div className="mt-6 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-accent/40 bg-card/40 px-4 py-12 text-center">
          <p className="font-heading text-lg text-primary">Begin with a treatment</p>
          <p className="mt-2 max-w-[14rem] text-sm leading-relaxed text-muted">
            Choose services or packages you love. We will tailor timing and pricing as you go.
          </p>
        </div>
      ) : (
        <ul className="mt-4 max-h-[40vh] space-y-2 overflow-y-auto pr-1 text-sm lg:max-h-[min(40vh,22rem)]">
          {selectedServices.map((item) => {
            const vid = selectedVariantByServiceId[item.id];
            const v = variantOptionsByServiceId[item.id]?.find((o) => o.id === vid);
            const priceLabel = formatServicePriceLabel(
              item,
              v?.price !== null && v?.price !== undefined ? v.price : null,
            );
            return (
              <li
                key={item.id}
                className="rounded-xl border border-[rgb(23_53_31_/10%)] bg-card/80 px-3 py-2.5"
              >
                <p className="font-medium text-foreground">{item.name}</p>
                {v ? <p className="text-xs text-muted">{v.name}</p> : null}
                <p className="mt-0.5 text-xs text-accent-foreground">{priceLabel}</p>
              </li>
            );
          })}
          {selectedPackages.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-[rgb(23_53_31_/10%)] bg-card/80 px-3 py-2.5"
            >
              <p className="font-medium text-foreground">{item.name}</p>
              <p className="mt-0.5 text-xs text-accent-foreground">
                {formatEgp(item.packagePrice)}
              </p>
            </li>
          ))}
          {selectedEnhancements.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-[rgb(23_53_31_/10%)] bg-card/80 px-3 py-2.5"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Add-on</p>
              <p className="font-medium text-foreground">{item.title}</p>
              <p className="mt-0.5 text-xs text-accent-foreground">
                {item.price != null ? formatEgp(item.price) : "—"}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-2 rounded-xl border border-[rgb(185_151_74_/35%)] bg-gradient-to-br from-[#faf7f0] to-card/90 p-4">
        {promoForEstimate ? (
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-accent">
            Promo{" "}
            <span className="normal-case tracking-normal text-foreground">{promoForEstimate}</span>
          </p>
        ) : null}
        {estimate?.appliedPromoCode ? (
          <p className="text-xs text-primary">Applied: {estimate.appliedPromoCode}</p>
        ) : null}
        {estimate?.promoError ? (
          <p className="text-xs text-destructive">{estimate.promoError}</p>
        ) : null}
        {estimateLoading ? (
          <LoadingState label="Updating estimate…" />
        ) : estimateError ? (
          <ErrorState message={estimateError} />
        ) : estimate ? (
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-2 text-muted">
              <dt>Subtotal</dt>
              <dd className="text-foreground">{formatEgp(estimate.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-2 text-muted">
              <dt>Discount</dt>
              <dd className="text-foreground">{formatEgp(estimate.discountAmount)}</dd>
            </div>
            <div className="flex justify-between gap-2 text-muted">
              <dt>VAT ({Math.round(estimate.vatRate * 100)}%)</dt>
              <dd className="text-foreground">{formatEgp(estimate.vatAmount)}</dd>
            </div>
            <div className="flex justify-between border-t border-[rgb(23_53_31_/10%)] pt-2 font-heading text-base text-primary">
              <dt>Total</dt>
              <dd>{formatEgp(estimate.totalAmount)}</dd>
            </div>
          </dl>
        ) : selectionCount > 0 ? (
          <p className="text-sm text-muted">Estimate appears once a branch is available.</p>
        ) : null}
      </div>

      {currentStepIndex < 2 ? (
        <button
          type="button"
          onClick={() => goNext()}
          disabled={!canContinueFrom(currentStepIndex)}
          className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {currentStepIndex === 0 ? "Continue to date & time" : "Continue to confirm"}
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-8 sm:px-6 sm:pb-10 lg:px-8 lg:pt-12">
      <header className="mb-8 text-center sm:mb-10 sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Reservations</p>
        <h1 className="mt-2 font-heading text-3xl text-primary sm:text-4xl lg:text-[2.5rem]">
          Book your experience
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:mx-0 sm:text-base">
          A calm, guided journey — choose treatments, pick a time that suits you, then confirm with
          your mobile. Our team will follow up on WhatsApp.
        </p>
      </header>

      <nav
        aria-label="Booking steps"
        className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <ol className="flex flex-1 items-center gap-1 sm:gap-2">
          {STEP_LABELS.map((label, index) => {
            const done = index < currentStepIndex;
            const current = index === currentStepIndex;
            return (
              <li key={label} className="flex min-w-0 flex-1 items-center">
                <div
                  className={`flex w-full items-center gap-2 rounded-xl border px-2 py-2 sm:px-3 sm:py-2.5 ${
                    current
                      ? "border-accent bg-card shadow-sm ring-1 ring-accent/30"
                      : done
                        ? "border-primary/20 bg-primary/5"
                        : "border-[rgb(23_53_31_/10%)] bg-card/60"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      current
                        ? "bg-accent text-accent-foreground"
                        : done
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/25 text-muted"
                    }`}
                  >
                    {done ? "✓" : index + 1}
                  </span>
                  <span
                    className={`truncate text-[10px] font-semibold uppercase leading-tight tracking-wide sm:text-xs ${
                      current ? "text-primary" : "text-muted"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {index < STEP_LABELS.length - 1 ? (
                  <span
                    className="mx-0.5 hidden h-px w-4 shrink-0 bg-accent/40 sm:block lg:w-6"
                    aria-hidden
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_min(22rem,100%)] lg:items-start lg:gap-8">
        <main className="min-w-0 space-y-6">
          {currentStepIndex === 0 ? (
            <section className="rounded-2xl border border-[rgb(23_53_31_/12%)] bg-card/90 p-5 shadow-[0_8px_32px_rgb(23_53_31_/4%)] sm:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-heading text-2xl text-primary">Choose treatments</h2>
                <div className="inline-flex rounded-full border border-primary/15 bg-background/80 p-1">
                  <button
                    type="button"
                    onClick={() => setCatalogTab("services")}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      catalogTab === "services"
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    Services
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogTab("packages")}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      catalogTab === "packages"
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    Packages
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogTab("enhancements")}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      catalogTab === "enhancements"
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    Add-ons
                  </button>
                </div>
              </div>

              {catalogRefreshError ? (
                <div className="mt-4">
                  <ErrorState title="Could not update list" message={catalogRefreshError} />
                </div>
              ) : null}
              {catalogRefreshing ? (
                <div className="mt-3">
                  <LoadingState label="Loading treatments for this branch…" />
                </div>
              ) : null}

              {catalogTab === "services" ? (
                <div className="mt-6 space-y-5">
                  {initialErrors.categories ? (
                    <ErrorState
                      title="Categories unavailable"
                      message={initialErrors.categories}
                    />
                  ) : null}
                  {initialErrors.services ? (
                    <ErrorState title="Services unavailable" message={initialErrors.services} />
                  ) : services.length === 0 ? (
                    <EmptyState
                      title="No services available"
                      description="Services will appear here when published."
                    />
                  ) : (
                    <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          <button
                            type="button"
                            onClick={() => setCategoryFilterId(null)}
                            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                              categoryFilterId === null
                                ? "border-accent bg-accent/15 text-primary"
                                : "border-border bg-background/80 text-muted hover:text-foreground"
                            }`}
                          >
                            All
                          </button>
                          {sortedCategories.map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => setCategoryFilterId(cat.id)}
                              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                                categoryFilterId === cat.id
                                  ? "border-accent bg-accent/15 text-primary"
                                  : "border-border bg-background/80 text-muted hover:text-foreground"
                              }`}
                            >
                              {cat.name}
                            </button>
                          ))}
                        </div>
                        <label className="block w-full shrink-0 sm:max-w-xs">
                          <span className="sr-only">Search services</span>
                          <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search services…"
                            className="w-full rounded-full border border-[rgb(23_53_31_/15%)] bg-background/90 px-4 py-2.5 text-sm text-foreground placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                          />
                        </label>
                      </div>

                      {filteredServices.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted">
                          No services match your filters. Try another category or search.
                        </p>
                      ) : (
                        <ul className="grid gap-4 sm:grid-cols-2">
                          {filteredServices.map((service) => {
                            const selected = selectedServiceIds.includes(service.id);
                            const opts = variantOptionsByServiceId[service.id];
                            const vLoading = variantLoadingByServiceId[service.id];
                            const vErr = variantErrorByServiceId[service.id];
                            const vid = selectedVariantByServiceId[service.id];
                            const v = opts?.find((o) => o.id === vid);
                            const priceLabel = formatServicePriceLabel(
                              service,
                              v?.price !== null && v?.price !== undefined ? v.price : null,
                            );
                            const desc = service.shortDescription ?? service.description;
                            const benefits = [...(service.benefits ?? [])].sort(
                              (a, b) => a.displayOrder - b.displayOrder,
                            );
                            return (
                              <li
                                key={service.id}
                                className={`flex flex-col overflow-hidden rounded-2xl border transition-shadow ${
                                  selected
                                    ? "border-accent/60 bg-gradient-to-b from-card to-[#faf7f0] shadow-md ring-1 ring-accent/25"
                                    : "border-[rgb(23_53_31_/10%)] bg-card/70 hover:border-accent/30 hover:shadow-sm"
                                }`}
                              >
                                <div className="relative aspect-[16/10] w-full bg-primary/5">
                                  {service.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={service.imageUrl}
                                      alt={service.imageAlt || service.name}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-full flex-col items-center justify-center gap-1 bg-gradient-to-b from-primary/10 to-primary/5 px-4 text-center">
                                      <span className="text-lg font-semibold uppercase tracking-wide text-primary/80">
                                        {(categories.find((c) => c.id === service.categoryId)?.name ??
                                          service.name).slice(0, 1)}
                                      </span>
                                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
                                        Al Rouby
                                      </span>
                                    </div>
                                  )}
                                  {service.badgeLabel ? (
                                    <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                                      {service.badgeLabel}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex flex-1 flex-col p-4">
                                  <div className="flex items-start justify-between gap-2">
                                    <h3 className="font-heading text-lg leading-snug text-primary">
                                      {service.name}
                                    </h3>
                                    <button
                                      type="button"
                                      onClick={() => toggleService(service.id)}
                                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                                        selected
                                          ? "bg-destructive/90 text-destructive-foreground hover:opacity-90"
                                          : "bg-primary text-primary-foreground hover:opacity-90"
                                      }`}
                                    >
                                      {selected ? "Remove" : "Add"}
                                    </button>
                                  </div>
                                  {desc ? (
                                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">
                                      {desc}
                                    </p>
                                  ) : null}
                                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                                    {service.durationMinutes != null ? (
                                      <span>{service.durationMinutes} min</span>
                                    ) : null}
                                    <span className="font-medium text-accent-foreground">
                                      {priceLabel}
                                    </span>
                                  </div>
                                  {benefits.length > 0 ? (
                                    <ul className="mt-3 flex flex-wrap gap-1.5">
                                      {benefits.slice(0, 5).map((b) => (
                                        <li
                                          key={b.id}
                                          className="rounded-full border border-accent/35 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                                        >
                                          {b.label}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : null}
                                  {selected ? (
                                    <div className="mt-4 border-t border-[rgb(23_53_31_/8%)] pt-3">
                                      {vLoading ? (
                                        <LoadingState label="Loading options…" />
                                      ) : vErr ? (
                                        <ErrorState message={vErr} />
                                      ) : opts && opts.length > 1 ? (
                                        <fieldset>
                                          <legend className="text-xs font-medium text-muted">
                                            Choose an option
                                          </legend>
                                          <div className="mt-2 flex flex-wrap gap-2">
                                            {opts.map((variant) => (
                                              <button
                                                key={variant.id}
                                                type="button"
                                                onClick={() =>
                                                  setSelectedVariantByServiceId((prev) => ({
                                                    ...prev,
                                                    [service.id]: variant.id,
                                                  }))
                                                }
                                                className={`rounded-lg border px-3 py-1.5 text-left text-xs transition-colors ${
                                                  vid === variant.id
                                                    ? "border-accent bg-accent/15 text-primary"
                                                    : "border-border bg-background text-foreground hover:border-accent/40"
                                                }`}
                                              >
                                                <span className="font-medium">{variant.name}</span>
                                                <span className="mt-0.5 block text-muted">
                                                  {formatEgp(variant.price)}
                                                </span>
                                              </button>
                                            ))}
                                          </div>
                                        </fieldset>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              ) : catalogTab === "packages" ? (
                <div className="mt-6 space-y-5">
                  {initialErrors.packages ? (
                    <ErrorState title="Packages unavailable" message={initialErrors.packages} />
                  ) : packages.length === 0 ? (
                    <EmptyState
                      title="No packages available"
                      description="Packages will appear here when published."
                    />
                  ) : (
                    <>
                      <label className="block max-w-md">
                        <span className="sr-only">Search packages</span>
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search packages…"
                          className="w-full rounded-full border border-[rgb(23_53_31_/15%)] bg-background/90 px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                        />
                      </label>
                      {filteredPackages.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted">
                          No packages match your search.
                        </p>
                      ) : (
                        <ul className="grid gap-4 sm:grid-cols-2">
                          {filteredPackages.map((pkg) => {
                            const selected = selectedPackageIds.includes(pkg.id);
                            const feats = [...(pkg.features ?? [])].sort(
                              (a, b) => a.displayOrder - b.displayOrder,
                            );
                            const desc = pkg.shortDescription ?? pkg.description;
                            return (
                              <li
                                key={pkg.id}
                                className={`flex flex-col overflow-hidden rounded-2xl border transition-shadow ${
                                  selected
                                    ? "border-accent/60 bg-gradient-to-b from-card to-[#faf7f0] shadow-md ring-1 ring-accent/25"
                                    : "border-[rgb(23_53_31_/10%)] bg-card/70 hover:border-accent/30"
                                }`}
                              >
                                <div className="relative aspect-[16/10] w-full bg-primary/5">
                                  {pkg.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={pkg.imageUrl}
                                      alt=""
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-xs text-muted">
                                      Package
                                    </div>
                                  )}
                                  {pkg.badgeLabel ? (
                                    <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                      {pkg.badgeLabel}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex flex-1 flex-col p-4">
                                  <div className="flex items-start justify-between gap-2">
                                    <h3 className="font-heading text-lg text-primary">{pkg.name}</h3>
                                    <button
                                      type="button"
                                      onClick={() => togglePackage(pkg.id)}
                                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
                                        selected
                                          ? "bg-destructive/90 text-destructive-foreground"
                                          : "bg-primary text-primary-foreground"
                                      }`}
                                    >
                                      {selected ? "Remove" : "Add"}
                                    </button>
                                  </div>
                                  {desc ? (
                                    <p className="mt-2 line-clamp-3 text-sm text-muted">{desc}</p>
                                  ) : null}
                                  <ul className="mt-3 space-y-1.5 text-sm text-foreground">
                                    {feats.map((f) => (
                                      <li key={f.id} className="flex gap-2">
                                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                                        <span>{f.label}</span>
                                      </li>
                                    ))}
                                  </ul>
                                  <div className="mt-auto flex flex-wrap items-end justify-between gap-2 border-t border-[rgb(23_53_31_/8%)] pt-3">
                                    <div className="text-xs text-muted">
                                      {pkg.durationMinutes != null ? (
                                        <span>{pkg.durationMinutes} min</span>
                                      ) : (
                                        <span>Duration on request</span>
                                      )}
                                    </div>
                                    <p className="font-heading text-base text-accent-foreground">
                                      {formatEgp(pkg.packagePrice)}
                                    </p>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-6 space-y-5">
                  {initialErrors.enhancements ? (
                    <ErrorState title="Add-ons unavailable" message={initialErrors.enhancements} />
                  ) : enhancements.length === 0 ? (
                    <EmptyState
                      title="No add-ons available"
                      description="Optional enhancements will appear when published in the catalog."
                    />
                  ) : (
                    <>
                      <p className="text-sm text-muted">
                        Optional add-ons complement your services or packages. Pick at least one treatment on the
                        Services or Packages tab before continuing — add-ons layer onto your visit.
                      </p>
                      <label className="block max-w-md">
                        <span className="sr-only">Search add-ons</span>
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search add-ons…"
                          className="w-full rounded-full border border-[rgb(23_53_31_/15%)] bg-background/90 px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                        />
                      </label>
                      {filteredEnhancements.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted">
                          No add-ons match your search.
                        </p>
                      ) : (
                        <ul className="grid gap-4 sm:grid-cols-2">
                          {filteredEnhancements.map((item) => {
                            const selected = selectedEnhancementIds.includes(item.id);
                            const desc = item.shortDescription;
                            return (
                              <li
                                key={item.id}
                                className={`flex flex-col overflow-hidden rounded-2xl border transition-shadow ${
                                  selected
                                    ? "border-accent/60 bg-gradient-to-b from-card to-[#faf7f0] shadow-md ring-1 ring-accent/25"
                                    : "border-[rgb(23_53_31_/10%)] bg-card/70 hover:border-accent/30 hover:shadow-sm"
                                }`}
                              >
                                <div className="relative aspect-[16/10] w-full bg-primary/5">
                                  {item.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={item.imageUrl}
                                      alt=""
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-xs text-muted">
                                      Add-on
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-1 flex-col p-4">
                                  <div className="flex items-start justify-between gap-2">
                                    <h3 className="font-heading text-lg leading-snug text-primary">{item.title}</h3>
                                    <button
                                      type="button"
                                      onClick={() => toggleEnhancement(item.id)}
                                      disabled={item.price == null}
                                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                        selected
                                          ? "bg-destructive/90 text-destructive-foreground hover:opacity-90"
                                          : "bg-primary text-primary-foreground hover:opacity-90"
                                      }`}
                                    >
                                      {selected ? "Remove" : item.price == null ? "N/A" : "Add"}
                                    </button>
                                  </div>
                                  {desc ? (
                                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{desc}</p>
                                  ) : null}
                                  <div className="mt-auto flex flex-wrap items-end justify-between gap-2 border-t border-[rgb(23_53_31_/8%)] pt-3">
                                    <div className="text-xs text-muted">
                                      {item.durationMinutes != null ? (
                                        <span>{item.durationMinutes} min</span>
                                      ) : (
                                        <span>Duration varies</span>
                                      )}
                                    </div>
                                    <p className="font-heading text-base text-accent-foreground">
                                      {item.price != null ? formatEgp(item.price) : "—"}
                                    </p>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          ) : null}

          {currentStepIndex === 1 ? (
            <section className="rounded-2xl border border-[rgb(23_53_31_/12%)] bg-card/90 p-5 shadow-[0_8px_32px_rgb(23_53_31_/4%)] sm:p-7">
              <h2 className="font-heading text-2xl text-primary">Date & time</h2>
              <p className="mt-2 text-sm text-muted">
                Select your preferred branch, then a date and available slot.
              </p>
              {initialErrors.branches ? (
                <div className="mt-6">
                  <ErrorState title="Branches unavailable" message={initialErrors.branches} />
                </div>
              ) : branches.length === 0 ? (
                <div className="mt-6">
                  <EmptyState
                    title="No branches available"
                    description="Branches will appear here when available for booking."
                  />
                </div>
              ) : (
                <div className="mt-6 space-y-6">
                  <label className="block max-w-md">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                      Branch
                    </span>
                    <select
                      value={selectedBranchId}
                      onChange={(e) => {
                        setSelectedBranchId(e.target.value);
                        setSelectedSlotId("");
                      }}
                      className="mt-2 w-full rounded-xl border border-[rgb(23_53_31_/15%)] bg-background px-4 py-3 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                    >
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block max-w-xs">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                      Date
                    </span>
                    <input
                      type="date"
                      value={selectedDate}
                      min={todayDateOnly()}
                      onChange={(e) => {
                        setSelectedDate(e.target.value);
                        setSelectedSlotId("");
                      }}
                      className="mt-2 w-full rounded-xl border border-[rgb(23_53_31_/15%)] bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                    />
                  </label>

                  <div>
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                      Time slots
                    </span>
                    {slotsLoading ? (
                      <div className="mt-3">
                        <LoadingState label="Loading available slots…" />
                      </div>
                    ) : slotsError ? (
                      <div className="mt-3">
                        <ErrorState message={slotsError} />
                      </div>
                    ) : slots.length === 0 ? (
                      <div className="mt-4 rounded-xl border border-dashed border-[rgb(23_53_31_/20%)] bg-background/50 p-8 text-center">
                        <p className="font-medium text-foreground">No openings this day</p>
                        <p className="mt-2 text-sm text-muted">
                          Try another date or branch — new slots appear as the schedule updates.
                        </p>
                      </div>
                    ) : (
                      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {slots.map((slot) => {
                          const selected = selectedSlotId === slot.id;
                          const full = publicSlotIsFull(slot);
                          return (
                            <li key={slot.id}>
                              <button
                                type="button"
                                disabled={full}
                                aria-disabled={full}
                                onClick={() => {
                                  if (full) {
                                    return;
                                  }
                                  setSelectedSlotId(slot.id);
                                }}
                                className={`flex w-full flex-col rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                                  full
                                    ? "cursor-not-allowed border-[rgb(23_53_31_/8%)] bg-muted/40 text-muted-foreground opacity-80"
                                    : selected
                                      ? "border-accent bg-primary text-primary-foreground shadow-md ring-2 ring-accent/50"
                                      : "border-[rgb(23_53_31_/12%)] bg-background/90 text-foreground hover:border-accent/40 hover:shadow-sm"
                                }`}
                              >
                                <span className="font-heading text-lg tracking-tight">
                                  {formatWallClockRange12h(slot.startTime, slot.endTime)}
                                </span>
                                <span
                                  className={`mt-1 text-xs font-semibold ${
                                    full
                                      ? "text-muted-foreground"
                                      : selected
                                        ? "text-primary-foreground/80"
                                        : "text-muted"
                                  }`}
                                >
                                  {publicSlotClientStatusLabel(slot)}
                                </span>
                                {selected && !full ? (
                                  <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                                    Selected
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {currentStepIndex === 2 ? (
            <section className="space-y-6">
              <div className="rounded-2xl border border-[rgb(23_53_31_/12%)] bg-card/90 p-5 sm:p-7">
                <h2 className="font-heading text-2xl text-primary">Confirm your booking</h2>
                <p className="mt-2 text-sm text-muted">
                  Review your selections, apply an offer code if you have one, then verify your phone
                  to submit.
                </p>

                <div className="mt-6 rounded-xl border border-[rgb(23_53_31_/10%)] bg-background/60 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                    Your selections
                  </h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {selectedServices.map((s) => {
                      const vid = selectedVariantByServiceId[s.id];
                      const vn = variantOptionsByServiceId[s.id]?.find((v) => v.id === vid)?.name;
                      return (
                        <li key={s.id} className="flex justify-between gap-2 border-b border-border/60 pb-2 last:border-0">
                          <span>
                            {s.name}
                            {vn ? <span className="text-muted"> — {vn}</span> : null}
                          </span>
                          <span className="shrink-0 text-muted">
                            {formatServicePriceLabel(
                              s,
                              variantOptionsByServiceId[s.id]?.find((v) => v.id === vid)?.price ??
                                null,
                            )}
                          </span>
                        </li>
                      );
                    })}
                    {selectedPackages.map((p) => (
                      <li
                        key={p.id}
                        className="flex justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
                      >
                        <span>{p.name}</span>
                        <span className="text-muted">{formatEgp(p.packagePrice)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 border-t border-[rgb(23_53_31_/10%)] pt-4 text-sm">
                    <p>
                      <span className="text-muted">When:</span>{" "}
                      <span className="font-medium text-foreground">
                        {selectedDate}{" "}
                        {selectedSlot
                          ? `· ${formatWallClockRange12h(selectedSlot.startTime, selectedSlot.endTime)}`
                          : ""}
                      </span>
                    </p>
                    <p className="mt-1">
                      <span className="text-muted">Where:</span>{" "}
                      <span className="font-medium text-foreground">
                        {branches.find((b) => b.id === selectedBranchId)?.name ?? "—"}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-[rgb(185_151_74_/35%)] bg-[#faf7f0]/80 p-4">
                  <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                    Promo code
                  </label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                      placeholder="Enter code"
                      className="min-w-0 flex-1 rounded-xl border border-[rgb(23_53_31_/15%)] bg-background px-4 py-2.5 text-sm uppercase focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                    />
                    <button
                      type="button"
                      onClick={() => applyPromo()}
                      className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground hover:opacity-95"
                    >
                      Apply
                    </button>
                  </div>
                  {estimate?.appliedPromoCode ? (
                    <p className="mt-2 text-sm text-primary">Applied: {estimate.appliedPromoCode}</p>
                  ) : null}
                  {estimate?.promoError ? (
                    <p className="mt-2 text-sm text-destructive">{estimate.promoError}</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-[rgb(23_53_31_/12%)] bg-card/90 p-5 sm:p-7">
                <h3 className="font-heading text-xl text-primary">Phone verification</h3>
                <p className="mt-2 text-sm text-muted">
                  We use a one-time code to your mobile — sign in if you have booked with us
                  before, or create a guest account.
                </p>
                {isSignedIn ? (
                  <div className="mt-5 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
                    <p className="font-medium text-foreground">You are signed in</p>
                    <p className="mt-1 text-muted">Phone: {phoneNumber}</p>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    <div className="inline-flex w-full max-w-md rounded-full border border-primary/15 bg-background/80 p-1">
                      <button
                        type="button"
                        onClick={() => selectBookingAuthPath("signin")}
                        className={`flex-1 rounded-full py-2.5 text-sm font-semibold ${
                          bookingAuthPath === "signin"
                            ? "bg-primary text-primary-foreground shadow"
                            : "text-muted"
                        }`}
                      >
                        Sign in
                      </button>
                      <button
                        type="button"
                        onClick={() => selectBookingAuthPath("register")}
                        className={`flex-1 rounded-full py-2.5 text-sm font-semibold ${
                          bookingAuthPath === "register"
                            ? "bg-primary text-primary-foreground shadow"
                            : "text-muted"
                        }`}
                      >
                        Create account
                      </button>
                    </div>
                    {bookingAuthPath === "register" ? (
                      <label className="block max-w-md text-sm text-muted">
                        Full name
                        <input
                          value={registerFullName}
                          onChange={(e) => setRegisterFullName(e.target.value)}
                          autoComplete="name"
                          className="mt-1 w-full rounded-xl border border-[rgb(23_53_31_/15%)] bg-background px-4 py-2.5 text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                        />
                      </label>
                    ) : null}
                    <label className="block max-w-md text-sm text-muted">
                      Mobile number
                      <input
                        type="tel"
                        autoComplete="tel"
                        value={otpPhone}
                        onChange={(e) => setOtpPhone(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[rgb(23_53_31_/15%)] bg-background px-4 py-2.5 text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                      />
                    </label>
                    {otpRequested ? (
                      <label className="block max-w-md text-sm text-muted">
                        Verification code
                        <input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-[rgb(23_53_31_/15%)] bg-background px-4 py-2.5 tracking-widest focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                        />
                      </label>
                    ) : null}
                    {devCodeHint ? (
                      <p className="text-xs text-muted">Development OTP: {devCodeHint}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRequestOtp()}
                        disabled={
                          authLoading ||
                          !bookingAuthPath ||
                          !otpPhone.trim() ||
                          (bookingAuthPath === "register" && registerFullName.trim().length < 2)
                        }
                        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                      >
                        {authLoading ? "Sending…" : "Send code"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleVerifyOtp()}
                        disabled={
                          authLoading ||
                          !bookingAuthPath ||
                          !otpRequested ||
                          !otpPhone.trim() ||
                          otpCode.trim().length < 4
                        }
                        className="rounded-xl border-2 border-accent bg-transparent px-4 py-2.5 text-sm font-medium text-primary hover:bg-accent/10 disabled:opacity-50"
                      >
                        {authLoading ? "Verifying…" : "Verify"}
                      </button>
                    </div>
                    {authError ? <ErrorState message={authError} /> : null}
                  </div>
                )}
              </div>

              {submitError ? (
                <div>
                  <ErrorState message={submitError} />
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => void submitBookingRequest()}
                disabled={
                  submitLoading ||
                  !clientToken ||
                  !selectedSlotId ||
                  !phoneNumber.trim() ||
                  !canContinueFrom(1)
                }
                className="w-full rounded-2xl bg-primary py-4 text-sm font-semibold uppercase tracking-[0.12em] text-primary-foreground shadow-lg transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitLoading ? "Submitting…" : "Submit booking request"}
              </button>
            </section>
          ) : null}

          <div className="flex flex-wrap gap-3 pb-4 lg:hidden">
            <button
              type="button"
              onClick={goBack}
              disabled={currentStepIndex === 0}
              className="rounded-xl border border-[rgb(23_53_31_/20%)] bg-background/90 px-5 py-2.5 text-sm font-medium text-foreground disabled:opacity-40"
            >
              Back
            </button>
          </div>
          <div className="hidden flex-wrap gap-3 pb-8 lg:flex">
            <button
              type="button"
              onClick={goBack}
              disabled={currentStepIndex === 0}
              className="rounded-xl border border-[rgb(23_53_31_/20%)] bg-background/90 px-5 py-2.5 text-sm font-medium disabled:opacity-40"
            >
              Back
            </button>
          </div>
        </main>

        <aside className="hidden lg:block lg:sticky lg:top-24 lg:self-start">{summaryAside}</aside>
      </div>

      <div className="lg:hidden">
        {!mobileSummaryOpen ? (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgb(23_53_31_/12%)] bg-[#faf7f0]/95 px-4 py-3 shadow-[0_-8px_32px_rgb(23_53_31_/8%)] backdrop-blur-md">
            <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Estimated total
                </p>
                <p className="font-heading text-xl text-primary">
                  {estimateLoading
                    ? "…"
                    : formatEgp(estimate?.totalAmount ?? estimatedTotalFallback)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMobileSummaryOpen(true)}
                  className="rounded-full border border-primary/20 px-4 py-2 text-xs font-semibold text-primary"
                >
                  Details
                </button>
                {currentStepIndex < 2 ? (
                  <button
                    type="button"
                    onClick={() => goNext()}
                    disabled={!canContinueFrom(currentStepIndex)}
                    className="rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                  >
                    Continue
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div
            className="fixed inset-0 z-50 flex flex-col justify-end bg-primary/40 p-0 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-label="Booking summary"
          >
            <button
              type="button"
              className="absolute inset-0 h-[30%] cursor-default border-0 bg-transparent"
              aria-label="Close summary"
              onClick={() => setMobileSummaryOpen(false)}
            />
            <div className="max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-accent/30 bg-[#faf7f0] p-4 shadow-2xl">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted/40" aria-hidden />
              {summaryAside}
              <button
                type="button"
                onClick={() => setMobileSummaryOpen(false)}
                className="mt-3 w-full rounded-xl border border-border py-2 text-sm text-muted"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
