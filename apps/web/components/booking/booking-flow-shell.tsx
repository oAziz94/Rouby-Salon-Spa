"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import type {
  PublicBranch,
  PublicBundle,
  PublicPackage,
  PublicService,
  PublicServiceVariant,
} from "@/lib/api/public";
import { formatEgp } from "@/lib/format/currency";

type BookingStepId =
  | "select"
  | "summary"
  | "datetime"
  | "auth"
  | "review"
  | "pending";

type BookingFlowShellProps = {
  services: PublicService[];
  packages: PublicPackage[];
  bundles: PublicBundle[];
  branches: PublicBranch[];
  preselection: {
    serviceId?: string;
    variantId?: string;
    packageId?: string;
    bundleId?: string;
  };
  initialErrors: {
    services: string | null;
    packages: string | null;
    bundles: string | null;
    branches: string | null;
  };
};

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

type SlotListResponse = {
  data: PublicSlot[];
};

type VariantListResponse = {
  data: PublicServiceVariant[];
};

type BookingEstimateResponse = {
  subtotal: number;
  discountAmount: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  currency: "EGP";
  pricesIncludeVat: boolean;
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
  itemType: "SERVICE" | "SERVICE_VARIANT" | "PACKAGE" | "BUNDLE";
  serviceId?: string;
  serviceVariantId?: string;
  packageId?: string;
  bundleId?: string;
  quantity?: number;
};

const STEP_ORDER: { id: BookingStepId; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "summary", label: "Summary" },
  { id: "datetime", label: "Date & Slot" },
  { id: "auth", label: "OTP Login" },
  { id: "review", label: "Review" },
  { id: "pending", label: "Pending" },
];

function resolveApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1").replace(
    /\/$/,
    "",
  );
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

export function BookingFlowShell({
  services,
  packages,
  bundles,
  branches,
  preselection,
  initialErrors,
}: BookingFlowShellProps) {
  const router = useRouter();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([]);
  const [selectedBundleIds, setSelectedBundleIds] = useState<string[]>([]);
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
  const [clientToken, setClientToken] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [estimate, setEstimate] = useState<BookingEstimateResponse | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedDate(todayDateOnly());
  }, []);

  useEffect(() => {
    if (branches.length > 0 && !selectedBranchId) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, selectedBranchId]);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("clientAccessToken");
    const storedPhone = window.sessionStorage.getItem("clientPhone");
    if (stored) {
      setClientToken(stored);
      setIsSignedIn(true);
    }
    if (storedPhone) {
      setPhoneNumber(storedPhone);
      setOtpPhone(storedPhone);
    }
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
    if (preselection.bundleId && bundles.some((item) => item.id === preselection.bundleId)) {
      setSelectedBundleIds((prev) =>
        prev.includes(preselection.bundleId as string)
          ? prev
          : [...prev, preselection.bundleId as string],
      );
    }
  }, [preselection, services, packages, bundles]);

  useEffect(() => {
    async function loadSlots() {
      if (!selectedBranchId || !selectedDate) {
        setSlots([]);
        return;
      }
      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const response = await fetchJson<SlotListResponse>(
          `/public/branches/${selectedBranchId}/slots?date=${selectedDate}`,
        );
        setSlots(response.data);
      } catch (error) {
        setSlots([]);
        setSlotsError(error instanceof Error ? error.message : "Unable to load slots.");
      } finally {
        setSlotsLoading(false);
      }
    }
    void loadSlots();
  }, [selectedBranchId, selectedDate]);

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

  const selectedServices = useMemo(
    () => services.filter((item) => selectedServiceIds.includes(item.id)),
    [services, selectedServiceIds],
  );
  const selectedPackages = useMemo(
    () => packages.filter((item) => selectedPackageIds.includes(item.id)),
    [packages, selectedPackageIds],
  );
  const selectedBundles = useMemo(
    () => bundles.filter((item) => selectedBundleIds.includes(item.id)),
    [bundles, selectedBundleIds],
  );
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? null;
  const currentStep = STEP_ORDER[currentStepIndex];

  const estimatedTotal = useMemo(() => {
    const servicesTotal = selectedServices.reduce(
      (sum, item) => sum + (item.basePrice ?? 0),
      0,
    );
    const packagesTotal = selectedPackages.reduce(
      (sum, item) => sum + (item.packagePrice ?? 0),
      0,
    );
    const bundlesTotal = selectedBundles.reduce((sum, item) => sum + (item.price ?? 0), 0);
    const variantsTotal = selectedServices.reduce((sum, item) => {
      const variantId = selectedVariantByServiceId[item.id];
      if (!variantId) {
        return sum;
      }
      const variant = variantOptionsByServiceId[item.id]?.find((opt) => opt.id === variantId);
      return sum + (variant?.price ?? 0);
    }, 0);
    return servicesTotal + packagesTotal + bundlesTotal + variantsTotal;
  }, [
    selectedServices,
    selectedPackages,
    selectedBundles,
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

    const bundleItems = selectedBundles.map((bundle) => ({
      itemType: "BUNDLE" as const,
      bundleId: bundle.id,
      quantity: 1,
    }));

    return [...serviceItems, ...packageItems, ...bundleItems];
  }, [
    selectedBundles,
    selectedPackages,
    selectedServices,
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
          },
        );
        setEstimate(response);
      } catch (error) {
        setEstimate(null);
        setEstimateError(error instanceof Error ? error.message : "Unable to estimate totals.");
      } finally {
        setEstimateLoading(false);
      }
    }

    void loadEstimate();
  }, [selectedBranchId, bookingItemsPayload]);

  async function loadVariants(serviceId: string, preselectVariantId?: string) {
    if (variantOptionsByServiceId[serviceId]?.length) {
      return;
    }
    setVariantLoadingByServiceId((prev) => ({ ...prev, [serviceId]: true }));
    setVariantErrorByServiceId((prev) => ({ ...prev, [serviceId]: null }));
    try {
      const response = await fetchJson<VariantListResponse>(
        `/public/services/${serviceId}/variants`,
      );
      setVariantOptionsByServiceId((prev) => ({
        ...prev,
        [serviceId]: response.data,
      }));
      if (preselectVariantId && response.data.some((item) => item.id === preselectVariantId)) {
        setSelectedVariantByServiceId((prev) => ({
          ...prev,
          [serviceId]: preselectVariantId,
        }));
      }
    } catch (error) {
      setVariantErrorByServiceId((prev) => ({
        ...prev,
        [serviceId]: error instanceof Error ? error.message : "Unable to load variants.",
      }));
    } finally {
      setVariantLoadingByServiceId((prev) => ({ ...prev, [serviceId]: false }));
    }
  }

  function toggleSelection(id: string, selected: string[], onChange: (ids: string[]) => void) {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  function canProceedFromCurrentStep(): boolean {
    if (currentStep.id === "select") {
      return (
        selectedServiceIds.length > 0 ||
        selectedPackageIds.length > 0 ||
        selectedBundleIds.length > 0
      );
    }
    if (currentStep.id === "datetime") {
      return Boolean(selectedBranchId && selectedDate && selectedSlotId);
    }
    if (currentStep.id === "auth") {
      return isSignedIn;
    }
    if (currentStep.id === "review") {
      return Boolean(clientToken && phoneNumber.trim() && selectedSlotId);
    }
    return true;
  }

  function goNext() {
    if (!canProceedFromCurrentStep()) {
      return;
    }
    setCurrentStepIndex((prev) => Math.min(prev + 1, STEP_ORDER.length - 1));
  }

  function goBack() {
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  }

  async function handleRequestOtp() {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await fetchJsonWithBody<OtpRequestResponse>(
        "/client/auth/otp/request",
        "POST",
        {
          phone: otpPhone,
        },
      );
      setOtpRequested(true);
      setOtpPhone(response.phone);
      setDevCodeHint(response.devCode ?? null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await fetchJsonWithBody<OtpVerifyResponse>(
        "/client/auth/otp/verify",
        "POST",
        {
          phone: otpPhone,
          code: otpCode,
        },
      );
      setClientToken(response.accessToken);
      setIsSignedIn(true);
      setPhoneNumber(response.client.phone);
      setOtpPhone(response.client.phone);
      setDevCodeHint(null);
      window.sessionStorage.setItem("clientAccessToken", response.accessToken);
      window.sessionStorage.setItem("clientPhone", response.client.phone);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to verify OTP.");
      setIsSignedIn(false);
      setClientToken("");
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
    if (code === "BOOKING_SLOT_FULL") {
      return "This slot is already full. Please select another slot.";
    }
    if (code === "CANCEL_WINDOW_EXPIRED") {
      return "The allowed booking window has expired for this slot.";
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

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6 lg:px-10">
      <section className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-heading text-3xl text-primary sm:text-4xl">Book Appointment</h1>
        <p className="mt-2 text-sm text-muted sm:text-base">
          Complete the booking request flow. The salon team will confirm via WhatsApp.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-6">
        <ol className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-6 sm:overflow-visible sm:pb-0">
          {STEP_ORDER.map((step, index) => {
            const isDone = index < currentStepIndex;
            const isCurrent = index === currentStepIndex;
            return (
              <li
                key={step.id}
                className={`min-w-24 rounded-lg border px-2 py-2 text-center text-xs sm:min-w-0 sm:text-sm ${
                  isCurrent
                    ? "border-primary bg-primary text-primary-foreground"
                    : isDone
                      ? "border-accent bg-accent/20 text-foreground"
                      : "border-border bg-background text-muted"
                }`}
              >
                {step.label}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          {currentStep.id === "select" ? (
            <div className="space-y-8">
              <h2 className="font-heading text-2xl text-primary">1. Select Services and Offers</h2>

              {initialErrors.services ? (
                <ErrorState message={`Services: ${initialErrors.services}`} />
              ) : services.length === 0 ? (
                <EmptyState
                  title="No services available"
                  description="Services will appear here when published."
                />
              ) : (
                <div>
                  <h3 className="mb-3 text-sm uppercase tracking-[0.12em] text-muted">
                    Services
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {services.slice(0, 12).map((service) => {
                      const selected = selectedServiceIds.includes(service.id);
                      return (
                        <article
                          key={service.id}
                          className={`rounded-xl border p-4 ${
                            selected
                              ? "border-primary bg-primary/10"
                              : "border-border bg-background"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="font-medium text-foreground">{service.name}</h4>
                              <p className="mt-1 text-sm text-muted">
                                {formatEgp(service.basePrice)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                toggleSelection(
                                  service.id,
                                  selectedServiceIds,
                                  setSelectedServiceIds,
                                )
                              }
                              className="rounded-md border border-primary px-3 py-1 text-xs text-primary"
                            >
                              {selected ? "Remove" : "Add"}
                            </button>
                          </div>

                          {selected ? (
                            <div className="mt-3 border-t border-border pt-3">
                              <button
                                type="button"
                                onClick={() => void loadVariants(service.id)}
                                className="text-xs text-primary underline-offset-2 hover:underline"
                              >
                                Load variants
                              </button>

                              {variantLoadingByServiceId[service.id] ? (
                                <div className="mt-2">
                                  <LoadingState label="Loading variants..." />
                                </div>
                              ) : null}
                              {variantErrorByServiceId[service.id] ? (
                                <div className="mt-2">
                                  <ErrorState
                                    message={variantErrorByServiceId[service.id] ?? ""}
                                  />
                                </div>
                              ) : null}
                              {variantOptionsByServiceId[service.id]?.length ? (
                                <label className="mt-2 block text-xs text-muted">
                                  Variant
                                  <select
                                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
                                    value={selectedVariantByServiceId[service.id] ?? ""}
                                    onChange={(event) =>
                                      setSelectedVariantByServiceId((prev) => ({
                                        ...prev,
                                        [service.id]: event.target.value,
                                      }))
                                    }
                                  >
                                    <option value="">Choose variant</option>
                                    {variantOptionsByServiceId[service.id].map((variant) => (
                                      <option key={variant.id} value={variant.id}>
                                        {variant.name} - {formatEgp(variant.price)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}

              {initialErrors.packages ? (
                <ErrorState message={`Packages: ${initialErrors.packages}`} />
              ) : (
                <div>
                  <h3 className="mb-3 text-sm uppercase tracking-[0.12em] text-muted">
                    Packages
                  </h3>
                  {packages.length === 0 ? (
                    <EmptyState
                      title="No packages available"
                      description="Packages will appear here when published."
                    />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {packages.slice(0, 8).map((item) => {
                        const selected = selectedPackageIds.includes(item.id);
                        return (
                          <article
                            key={item.id}
                            className={`rounded-xl border p-4 ${
                              selected
                                ? "border-primary bg-primary/10"
                                : "border-border bg-background"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h4 className="font-medium text-foreground">{item.name}</h4>
                                <p className="mt-1 text-sm text-muted">
                                  {formatEgp(item.packagePrice)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  toggleSelection(
                                    item.id,
                                    selectedPackageIds,
                                    setSelectedPackageIds,
                                  )
                                }
                                className="rounded-md border border-primary px-3 py-1 text-xs text-primary"
                              >
                                {selected ? "Remove" : "Add"}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {initialErrors.bundles ? (
                <ErrorState message={`Bundles: ${initialErrors.bundles}`} />
              ) : (
                <div>
                  <h3 className="mb-3 text-sm uppercase tracking-[0.12em] text-muted">
                    Bundles
                  </h3>
                  {bundles.length === 0 ? (
                    <EmptyState
                      title="No bundles available"
                      description="Bundles will appear here when published."
                    />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {bundles.slice(0, 8).map((item) => {
                        const selected = selectedBundleIds.includes(item.id);
                        return (
                          <article
                            key={item.id}
                            className={`rounded-xl border p-4 ${
                              selected
                                ? "border-primary bg-primary/10"
                                : "border-border bg-background"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h4 className="font-medium text-foreground">{item.name}</h4>
                                <p className="mt-1 text-sm text-muted">{formatEgp(item.price)}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  toggleSelection(
                                    item.id,
                                    selectedBundleIds,
                                    setSelectedBundleIds,
                                  )
                                }
                                className="rounded-md border border-primary px-3 py-1 text-xs text-primary"
                              >
                                {selected ? "Remove" : "Add"}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {currentStep.id === "summary" ? (
            <div>
              <h2 className="font-heading text-2xl text-primary">2. Selected Items Summary</h2>
              {selectedServices.length + selectedPackages.length + selectedBundles.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    title="No items selected"
                    description="Go back and select at least one service, package, or bundle."
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {selectedServices.map((item) => (
                    <article key={item.id} className="rounded-lg border border-border bg-background p-4">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-sm text-muted">{formatEgp(item.basePrice)}</p>
                    </article>
                  ))}
                  {selectedPackages.map((item) => (
                    <article key={item.id} className="rounded-lg border border-border bg-background p-4">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-sm text-muted">{formatEgp(item.packagePrice)}</p>
                    </article>
                  ))}
                  {selectedBundles.map((item) => (
                    <article key={item.id} className="rounded-lg border border-border bg-background p-4">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-sm text-muted">{formatEgp(item.price)}</p>
                    </article>
                  ))}
                </div>
              )}
              {estimateLoading ? (
                <div className="mt-4">
                  <LoadingState label="Calculating estimate..." />
                </div>
              ) : estimateError ? (
                <div className="mt-4">
                  <ErrorState message={estimateError} />
                </div>
              ) : estimate ? (
                <div className="mt-4 rounded-lg border border-border bg-background p-4 text-sm">
                  <p>
                    <span className="font-medium text-foreground">Subtotal:</span>{" "}
                    {formatEgp(estimate.subtotal)}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium text-foreground">Discount:</span>{" "}
                    {formatEgp(estimate.discountAmount)}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium text-foreground">VAT:</span>{" "}
                    {formatEgp(estimate.vatAmount)} ({Math.round(estimate.vatRate * 100)}%)
                  </p>
                  <p className="mt-1">
                    <span className="font-medium text-foreground">Total:</span>{" "}
                    {formatEgp(estimate.totalAmount)}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {currentStep.id === "datetime" ? (
            <div>
              <h2 className="font-heading text-2xl text-primary">3. Date and Slot Selection</h2>
              {initialErrors.branches ? (
                <div className="mt-4">
                  <ErrorState message={initialErrors.branches} />
                </div>
              ) : branches.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    title="No branches available"
                    description="Branches will appear here when available for booking."
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <label className="block text-sm text-muted">
                    Branch
                    <select
                      value={selectedBranchId}
                      onChange={(event) => {
                        setSelectedBranchId(event.target.value);
                        setSelectedSlotId("");
                      }}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    >
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm text-muted">
                    Date
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(event) => {
                        setSelectedDate(event.target.value);
                        setSelectedSlotId("");
                      }}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>

                  {slotsLoading ? (
                    <LoadingState label="Loading available slots..." />
                  ) : slotsError ? (
                    <ErrorState message={slotsError} />
                  ) : slots.length === 0 ? (
                    <EmptyState
                      title="No slots available"
                      description="Try selecting another date or branch."
                    />
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {slots.map((slot) => {
                        const selected = selectedSlotId === slot.id;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => setSelectedSlotId(slot.id)}
                            className={`rounded-lg border px-3 py-3 text-left text-sm ${
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-foreground"
                            }`}
                          >
                            <p className="font-medium">
                              {slot.startTime.slice(0, 5)} - {slot.endTime.slice(0, 5)}
                            </p>
                            <p className={`${selected ? "text-primary-foreground/85" : "text-muted"}`}>
                              Remaining: {Math.max(0, slot.capacity - slot.bookedCount)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {currentStep.id === "auth" ? (
            <div>
              <h2 className="font-heading text-2xl text-primary">4. Phone OTP Login</h2>
              <p className="mt-3 text-sm text-muted">
                Booking submission requires client authentication using your phone and
                one-time code.
              </p>
              <div className="mt-4 rounded-lg border border-border bg-background p-4">
                <div className="grid gap-3">
                  <label className="text-sm text-muted">
                    Phone
                    <input
                      value={otpPhone}
                      onChange={(event) => setOtpPhone(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  {otpRequested ? (
                    <label className="text-sm text-muted">
                      Verification Code
                      <input
                        value={otpCode}
                        onChange={(event) => setOtpCode(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                      />
                    </label>
                  ) : null}
                  {devCodeHint ? (
                    <p className="text-sm text-muted">Development OTP: {devCodeHint}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRequestOtp()}
                      disabled={authLoading || !otpPhone.trim()}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {authLoading ? "Sending..." : "Send OTP"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleVerifyOtp()}
                      disabled={authLoading || !otpPhone.trim() || otpCode.trim().length < 4}
                      className="rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {authLoading ? "Verifying..." : "Verify OTP"}
                    </button>
                    {isSignedIn ? (
                      <span className="rounded-lg border border-accent bg-accent/15 px-3 py-2 text-sm text-foreground">
                        Signed in
                      </span>
                    ) : (
                      <span className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted">
                        Not signed in
                      </span>
                    )}
                  </div>
                  {authError ? <ErrorState message={authError} /> : null}
                </div>
              </div>
            </div>
          ) : null}

          {currentStep.id === "review" ? (
            <div>
              <h2 className="font-heading text-2xl text-primary">5. Review Booking Request</h2>
              <div className="mt-4 space-y-3 rounded-lg border border-border bg-background p-4 text-sm">
                <p>
                  <span className="font-medium text-foreground">Items:</span>{" "}
                  {selectedServices.length + selectedPackages.length + selectedBundles.length}
                </p>
                <p>
                  <span className="font-medium text-foreground">Branch:</span>{" "}
                  {branches.find((branch) => branch.id === selectedBranchId)?.name ?? "Not selected"}
                </p>
                <p>
                  <span className="font-medium text-foreground">Date:</span> {selectedDate}
                </p>
                <p>
                  <span className="font-medium text-foreground">Slot:</span>{" "}
                  {selectedSlot
                    ? `${selectedSlot.startTime.slice(0, 5)} - ${selectedSlot.endTime.slice(0, 5)}`
                    : "Not selected"}
                </p>
                <p>
                  <span className="font-medium text-foreground">Phone:</span>{" "}
                  {phoneNumber || "Not provided"}
                </p>
                <p>
                  <span className="font-medium text-foreground">Estimated Total:</span>{" "}
                  {formatEgp(estimate?.totalAmount ?? estimatedTotal)}
                </p>
              </div>
              {submitError ? <div className="mt-4"><ErrorState message={submitError} /></div> : null}
              <button
                type="button"
                onClick={() => void submitBookingRequest()}
                disabled={submitLoading || !canProceedFromCurrentStep()}
                className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitLoading ? "Submitting..." : "Submit Booking Request"}
              </button>
            </div>
          ) : null}

          {currentStep.id === "pending" ? (
            <div>
              <h2 className="font-heading text-2xl text-primary">6. Pending Confirmation</h2>
              <div className="mt-4 rounded-lg border border-accent bg-accent/10 p-5">
                <p className="text-sm text-foreground">
                  Booking request received. Our salon team will review and confirm your
                  appointment via WhatsApp.
                </p>
                <p className="mt-3 text-sm text-muted">
                  Keep your phone available in case our team needs clarification.
                </p>
                <Link
                  href="/booking/confirmation"
                  className="mt-4 inline-flex rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary"
                >
                  View Confirmation
                </Link>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={goBack}
              disabled={currentStepIndex === 0}
              className="rounded-lg border border-border px-4 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={
                currentStep.id === "pending" ||
                currentStep.id === "review" ||
                !canProceedFromCurrentStep()
              }
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>

        <aside className="order-first rounded-2xl border border-border bg-card p-5 sm:p-6 lg:order-none lg:sticky lg:top-28 lg:h-fit">
          <h3 className="font-heading text-2xl text-primary">Selection Summary</h3>
          {selectedServices.length + selectedPackages.length + selectedBundles.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No items selected"
                description="Selected items will appear here."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3 text-sm">
              {selectedServices.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-background p-3">
                  <p className="font-medium text-foreground">{item.name}</p>
                  <p className="text-muted">{formatEgp(item.basePrice)}</p>
                </div>
              ))}
              {selectedPackages.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-background p-3">
                  <p className="font-medium text-foreground">{item.name}</p>
                  <p className="text-muted">{formatEgp(item.packagePrice)}</p>
                </div>
              ))}
              {selectedBundles.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-background p-3">
                  <p className="font-medium text-foreground">{item.name}</p>
                  <p className="text-muted">{formatEgp(item.price)}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 rounded-lg border border-border bg-background p-3">
            <p className="text-sm text-muted">Estimated total</p>
            {estimateLoading ? (
              <p className="mt-1 text-sm text-muted">Calculating...</p>
            ) : (
              <p className="mt-1 text-lg font-semibold text-primary">
                {formatEgp(estimate?.totalAmount ?? estimatedTotal)}
              </p>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
