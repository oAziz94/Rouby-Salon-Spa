"use client";

import {
  patchDashboardCatalogSearchTerms,
  ApiClientError,
  getDashboardServiceVariants,
  patchDashboardService,
  patchDashboardServiceVariant,
  patchDashboardServiceVariantStatus,
  postDashboardService,
  postDashboardServiceVariant,
  type DashboardBranch,
  type DashboardService,
  type DashboardServiceCategory,
  type DashboardServiceVariant,
} from "@rouby/api-client";
import { ChevronDown, Layers } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  DashboardServiceImageUpload,
  type DashboardServiceImageValue,
} from "@/components/dashboard-service-image-upload";
import { GalleryImagePicker } from "@/components/gallery-image-picker";
import { invalidatePickerCatalogCache } from "@/components/dashboard-service-variant-lines-block";

type ServiceBenefitFormRow = { key: string; label: string; isActive: boolean };

type ServiceFormState = {
  name: string;
  categoryId: string;
  description: string;
  shortDescription: string;
  imageAlt: string;
  displayOrder: string;
  isFeatured: boolean;
  badgeLabel: string;
  priceDisplayType: string;
  basePrice: string;
  basePriceMax: string;
  durationMinutes: string;
  processingMinutes: string;
  processingStartsAfterMinutes: string;
  isActive: boolean;
  bookingAvailability: boolean;
};

const PRICE_TYPES: { value: string; label: string }[] = [
  { value: "FIXED", label: "Fixed price" },
  { value: "STARTS_FROM", label: "Starts from" },
  { value: "RANGE", label: "Price range" },
  { value: "CONTACT", label: "Contact for pricing" },
];

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.statusCode === 403) return "Forbidden (403). You do not have permission.";
    if (error.statusCode === 401) return "Unauthorized (401). Please sign in again.";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

type FieldErrors = Partial<Record<"name" | "categoryId" | "image" | "branches" | "price" | "duration", string>>;

export type ServiceFormModalProps = {
  open: boolean;
  onClose: () => void;
  accessToken: string;
  categories: DashboardServiceCategory[];
  branches: DashboardBranch[];
  editingService: DashboardService | null;
  canManage: boolean;
  canReadVariants: boolean;
  canManageVariants: boolean;
  /** When true, staff can open the Gallery picker (`gallery.read`). */
  canReadGallery?: boolean;
  onSaveErrorMessage?: (message: string) => void;
  onSaved: () => void | Promise<void>;
};

export function ServiceFormModal({
  open,
  onClose,
  accessToken,
  categories,
  branches,
  editingService,
  canManage,
  canReadVariants,
  canManageVariants,
  canReadGallery = false,
  onSaveErrorMessage,
  onSaved,
}: ServiceFormModalProps) {
  const [serviceForm, setServiceForm] = useState<ServiceFormState>({
    name: "",
    categoryId: "",
    description: "",
    shortDescription: "",
    imageAlt: "",
    displayOrder: "0",
    isFeatured: false,
    badgeLabel: "",
    priceDisplayType: "FIXED",
    basePrice: "",
    basePriceMax: "",
    durationMinutes: "",
    processingMinutes: "",
    processingStartsAfterMinutes: "",
    isActive: true,
    bookingAvailability: true,
  });
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(new Set());
  const [serviceImage, setServiceImage] = useState<DashboardServiceImageValue | null>(null);
  const [serviceImageDirty, setServiceImageDirty] = useState(false);
  const [serviceBenefits, setServiceBenefits] = useState<ServiceBenefitFormRow[]>([]);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceSaveError, setServiceSaveError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [imageUploading, setImageUploading] = useState(false);
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);

  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsError, setVariantsError] = useState("");
  const [variants, setVariants] = useState<DashboardServiceVariant[]>([]);
  const [variantName, setVariantName] = useState("");
  const [variantPrice, setVariantPrice] = useState("");
  const [variantDuration, setVariantDuration] = useState("");
  const [variantSaving, setVariantSaving] = useState(false);

  const [editingVariant, setEditingVariant] = useState<DashboardServiceVariant | null>(null);
  const [editVariantName, setEditVariantName] = useState("");
  const [editVariantPrice, setEditVariantPrice] = useState("");
  const [editVariantDuration, setEditVariantDuration] = useState("");
  const [editVariantSaving, setEditVariantSaving] = useState(false);
  const [editVariantError, setEditVariantError] = useState("");

  const initSessionRef = useRef<string | null>(null);

  const resetForm = useCallback(() => {
    setServiceForm({
      name: "",
      categoryId: categories[0]?.id ?? "",
      description: "",
      shortDescription: "",
      imageAlt: "",
      displayOrder: "0",
      isFeatured: false,
      badgeLabel: "",
      priceDisplayType: "FIXED",
      basePrice: "",
      basePriceMax: "",
      durationMinutes: "",
      processingMinutes: "",
      processingStartsAfterMinutes: "",
      isActive: true,
      bookingAvailability: true,
    });
    setSelectedBranchIds(new Set());
    setServiceImage(null);
    setServiceImageDirty(false);
    setServiceBenefits([]);
    setServiceSaveError("");
    setFieldErrors({});
    setVariants([]);
    setVariantsError("");
  }, [categories]);

  const populateFromService = useCallback(
    (service: DashboardService) => {
      setServiceForm({
        name: service.name,
        categoryId: service.categoryId,
        description: service.description ?? "",
        shortDescription: service.shortDescription ?? "",
        imageAlt: service.imageAlt ?? "",
        displayOrder: String(service.displayOrder),
        isFeatured: service.isFeatured,
        badgeLabel: service.badgeLabel ?? "",
        priceDisplayType: service.priceDisplayType,
        basePrice: service.basePrice?.toString() ?? "",
        basePriceMax: service.basePriceMax?.toString() ?? "",
        durationMinutes: service.durationMinutes?.toString() ?? "",
        processingMinutes: service.processingMinutes ? String(service.processingMinutes) : "",
        processingStartsAfterMinutes: service.processingStartsAfterMinutes
          ? String(service.processingStartsAfterMinutes)
          : "",
        isActive: service.isActive,
        bookingAvailability: service.bookingAvailability,
      });
      setSelectedBranchIds(new Set(service.branchIds));
      if (service.imageMediaId && service.imageMedia) {
        setServiceImage({
          imageUrl: service.imageMedia.url,
          imageKey: service.imageKey ?? "",
          imageMediaId: service.imageMediaId,
        });
      } else if (service.imageUrl && service.imageKey) {
        setServiceImage({ imageUrl: service.imageUrl, imageKey: service.imageKey });
      } else {
        setServiceImage(null);
      }
      setServiceImageDirty(false);
      setServiceBenefits(
        (service.benefits ?? []).map((benefit) => ({
          key: benefit.id,
          label: benefit.label,
          isActive: benefit.isActive,
        })),
      );
      setServiceSaveError("");
      setFieldErrors({});
    },
    [],
  );

  useEffect(() => {
    if (!open) {
      initSessionRef.current = null;
      return;
    }
    const sessionKey = editingService?.id ?? "create";
    if (initSessionRef.current === sessionKey) return;
    initSessionRef.current = sessionKey;
    if (!editingService) resetForm();
    else populateFromService(editingService);
  }, [open, editingService, resetForm, populateFromService]);

  useEffect(() => {
    if (!open || editingService || categories.length === 0) return;
    setServiceForm((prev) => (prev.categoryId ? prev : { ...prev, categoryId: categories[0]!.id }));
  }, [open, editingService, categories]);

  async function loadVariants(serviceId: string) {
    if (!canReadVariants) return;
    setVariantsLoading(true);
    setVariantsError("");
    try {
      const result = await getDashboardServiceVariants(accessToken, serviceId);
      setVariants(result.data);
    } catch (requestError) {
      setVariantsError(formatApiError(requestError));
    } finally {
      setVariantsLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !editingService || !canReadVariants) {
      setVariants([]);
      return;
    }
    void loadVariants(editingService.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingService?.id, canReadVariants, accessToken]);

  useEffect(() => {
    if (!open) {
      setEditingVariant(null);
      setEditVariantError("");
      setGalleryPickerOpen(false);
    }
  }, [open]);

  const editVariantTitleId = useId();

  function toggleBranch(id: string) {
    setSelectedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addBenefitRow() {
    const key =
      typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
        ? globalThis.crypto.randomUUID()
        : `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setServiceBenefits((prev) => [...prev, { key, label: "", isActive: true }]);
  }

  function removeBenefitRow(key: string) {
    setServiceBenefits((prev) => prev.filter((row) => row.key !== key));
  }

  function moveBenefitRow(key: string, direction: -1 | 1) {
    setServiceBenefits((prev) => {
      const i = prev.findIndex((row) => row.key === key);
      if (i < 0) return prev;
      const j = i + direction;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  const hasDisplayImage = useMemo(() => {
    return Boolean(
      serviceImage?.imageUrl ||
        serviceImage?.imageMediaId ||
        (!serviceImageDirty && (editingService?.imageUrl || editingService?.imageMedia?.url)),
    );
  }, [
    serviceImage?.imageUrl,
    serviceImage?.imageMediaId,
    editingService?.imageUrl,
    editingService?.imageMedia?.url,
    serviceImageDirty,
  ]);

  const branchIdsPayload = useMemo(() => Array.from(selectedBranchIds), [selectedBranchIds]);

  function validateForm(): boolean {
    const next: FieldErrors = {};
    if (!serviceForm.name.trim()) next.name = "Service name is required.";
    if (!serviceForm.categoryId) next.categoryId = "Choose a category.";

    if (serviceForm.bookingAvailability) {
      if (!hasDisplayImage) next.image = "Visible for online booking requires a service image.";
      if (branchIdsPayload.length === 0) next.branches = "Choose at least one branch for online booking.";
      const pt = serviceForm.priceDisplayType;
      if (pt === "FIXED" || pt === "STARTS_FROM") {
        if (!serviceForm.basePrice.trim()) next.price = "Set a base price for online booking.";
        else if (Number.isNaN(Number(serviceForm.basePrice)) || Number(serviceForm.basePrice) < 0) {
          next.price = "Enter a valid price.";
        } else if (serviceForm.basePriceMax.trim()) {
          next.price = "Clear max price unless you use range pricing.";
        }
      } else if (pt === "RANGE") {
        if (!serviceForm.basePrice.trim() || !serviceForm.basePriceMax.trim()) {
          next.price = "Set min and max prices for range pricing.";
        } else {
          const min = Number(serviceForm.basePrice);
          const max = Number(serviceForm.basePriceMax);
          if (Number.isNaN(min) || min < 0 || Number.isNaN(max) || max < 0) {
            next.price = "Enter valid prices.";
          } else if (min > max) {
            next.price = "Min price must be less than or equal to max.";
          }
        }
      } else if (pt === "CONTACT" || pt === "HIDDEN") {
        if (serviceForm.basePrice.trim() || serviceForm.basePriceMax.trim()) {
          next.price = "Clear price fields for contact or hidden pricing.";
        }
      }
      if (!serviceForm.durationMinutes.trim()) next.duration = "Set duration for online booking.";
      else if (Number.isNaN(Number(serviceForm.durationMinutes)) || Number(serviceForm.durationMinutes) <= 0) {
        next.duration = "Enter duration in minutes.";
      }
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSaveService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage) return;
    setServiceSaveError("");
    if (!validateForm()) {
      setServiceSaveError("Please fix the highlighted fields.");
      return;
    }

    setServiceSaving(true);
    try {
      if (
        serviceForm.bookingAvailability &&
        !editingService &&
        !serviceImage?.imageUrl &&
        !serviceImage?.imageMediaId
      ) {
        setFieldErrors((prev) => ({ ...prev, image: "Upload a service image before publishing as online bookable." }));
        setServiceSaveError("Please fix the highlighted fields.");
        setServiceSaving(false);
        return;
      }

      const payload: Record<string, unknown> = {
        name: serviceForm.name,
        categoryId: serviceForm.categoryId,
        description: serviceForm.description.trim() || null,
        shortDescription: serviceForm.shortDescription.trim() || null,
        displayOrder: Number(serviceForm.displayOrder || 0),
        isFeatured: serviceForm.isFeatured,
        badgeLabel: serviceForm.badgeLabel.trim() || null,
        priceDisplayType: serviceForm.priceDisplayType,
        basePrice: serviceForm.basePrice ? Number(serviceForm.basePrice) : null,
        basePriceMax: serviceForm.basePriceMax ? Number(serviceForm.basePriceMax) : null,
        durationMinutes: serviceForm.durationMinutes ? Number(serviceForm.durationMinutes) : null,
        processingMinutes: serviceForm.processingMinutes ? Number(serviceForm.processingMinutes) : 0,
        processingStartsAfterMinutes: serviceForm.processingStartsAfterMinutes
          ? Number(serviceForm.processingStartsAfterMinutes)
          : 0,
        branchIds: branchIdsPayload,
        isActive: serviceForm.isActive,
        bookingAvailability: serviceForm.bookingAvailability,
        benefits: serviceBenefits
          .map((benefit) => ({ label: benefit.label.trim(), isActive: benefit.isActive }))
          .filter((benefit) => benefit.label.length > 0)
          .map((benefit, index) => ({
            label: benefit.label,
            displayOrder: index,
            isActive: benefit.isActive,
          })),
      };

      if (editingService) {
        if (serviceImageDirty) {
          if (serviceImage === null) {
            payload.imageMediaId = null;
          } else if (serviceImage.imageMediaId) {
            payload.imageMediaId = serviceImage.imageMediaId;
          } else if (serviceImage.imageUrl) {
            payload.imageUrl = serviceImage.imageUrl;
            payload.imageKey = serviceImage.imageKey ?? null;
          }
        }
        payload.imageAlt = serviceForm.imageAlt.trim() || null;
        await patchDashboardService(accessToken, editingService.id, payload);
      } else {
        if (serviceImage?.imageMediaId) {
          payload.imageMediaId = serviceImage.imageMediaId;
        } else {
          payload.imageUrl = serviceImage?.imageUrl ?? null;
          payload.imageKey = serviceImage?.imageKey ?? null;
        }
        payload.imageAlt = serviceForm.imageAlt.trim() || null;
        await postDashboardService(accessToken, payload);
      }
      await onSaved();
      onClose();
    } catch (requestError) {
      const msg = formatApiError(requestError);
      setServiceSaveError(msg);
      onSaveErrorMessage?.(msg);
    } finally {
      setServiceSaving(false);
    }
  }

  async function onCreateVariant() {
    if (!accessToken || !editingService) return;
    if (!variantName.trim() || !variantPrice.trim() || !variantDuration.trim()) return;
    setVariantSaving(true);
    setVariantsError("");
    try {
      await postDashboardServiceVariant(accessToken, editingService.id, {
        name: variantName,
        price: Number(variantPrice),
        durationMinutes: Number(variantDuration),
      });
      setVariantName("");
      setVariantPrice("");
      setVariantDuration("");
      await loadVariants(editingService.id);
    } catch (requestError) {
      setVariantsError(formatApiError(requestError));
    } finally {
      setVariantSaving(false);
    }
  }

  async function onToggleVariantStatus(variant: DashboardServiceVariant) {
    if (!accessToken || !editingService) return;
    try {
      await patchDashboardServiceVariantStatus(accessToken, variant.id, !variant.isActive);
      await loadVariants(editingService.id);
    } catch (requestError) {
      setVariantsError(formatApiError(requestError));
    }
  }

  function openEditVariant(variant: DashboardServiceVariant) {
    setEditVariantError("");
    setEditingVariant(variant);
    setEditVariantName(variant.name);
    setEditVariantPrice(String(variant.price));
    setEditVariantDuration(String(variant.durationMinutes));
  }

  function closeEditVariant() {
    if (editVariantSaving) return;
    setEditingVariant(null);
    setEditVariantError("");
  }

  async function submitEditVariant() {
    if (!accessToken || !editingVariant || !editingService) return;
    const name = editVariantName.trim();
    if (!name) {
      setEditVariantError("Variant name is required.");
      return;
    }
    const price = Number(editVariantPrice);
    const duration = Number(editVariantDuration);
    if (!Number.isFinite(price) || price < 0) {
      setEditVariantError("Enter a valid price.");
      return;
    }
    if (!Number.isFinite(duration) || duration < 1 || !Number.isInteger(duration)) {
      setEditVariantError("Duration must be a whole number of minutes (at least 1).");
      return;
    }
    setEditVariantSaving(true);
    setEditVariantError("");
    try {
      await patchDashboardServiceVariant(accessToken, editingVariant.id, {
        name,
        price,
        durationMinutes: duration,
      });
      setEditingVariant(null);
      await loadVariants(editingService.id);
    } catch (requestError) {
      setEditVariantError(formatApiError(requestError));
    } finally {
      setEditVariantSaving(false);
    }
  }

  if (!open) return null;

  const saveBlocked = serviceSaving || imageUploading || Boolean(editingVariant);
  const activeNoBranches = serviceForm.isActive && branchIdsPayload.length === 0;
  const softImageWarning = !hasDisplayImage && serviceForm.bookingAvailability;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#2A1722]/45 p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0"
        role="presentation"
        aria-hidden
        onClick={() => !saveBlocked && onClose()}
      />
      <section
        className="relative flex max-h-[min(92dvh,880px)] w-full max-w-[960px] flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-border/80 bg-gradient-to-r from-card to-[#FFFCF6] px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[#1F2420] sm:text-xl">
                {editingService ? "Edit service" : "Create service"}
              </h2>
              <p className="mt-1 text-xs text-[#7A6A58] sm:text-sm">
                Organize details, media, pricing, and where this service is offered.
              </p>
            </div>
            <button
              type="button"
              disabled={saveBlocked}
              onClick={onClose}
              className="shrink-0 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-[#1F2420] transition hover:bg-[#FFF9EE] disabled:opacity-50"
            >
              Close
            </button>
          </div>
        </header>

        <form id="dashboard-service-form" className="flex min-h-0 flex-1 flex-col" onSubmit={onSaveService}>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            <div className="space-y-8">
              {/* Section 1 */}
              <section className="rounded-xl border border-border/80 bg-[#FFFCF6]/40 p-4 sm:p-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6A58]">
                  Basic information
                </h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm sm:col-span-2">
                    <span className="mb-1.5 block font-medium text-[#1F2420]">Service name</span>
                    <input
                      value={serviceForm.name}
                      onChange={(event) => {
                        setServiceForm((prev) => ({ ...prev, name: event.target.value }));
                        if (fieldErrors.name) setFieldErrors((e) => ({ ...e, name: undefined }));
                      }}
                      required
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 shadow-sm outline-none ring-accent/30 transition focus:ring-2"
                    />
                    {fieldErrors.name ? <p className="mt-1.5 text-xs text-danger">{fieldErrors.name}</p> : null}
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium text-[#1F2420]">Category</span>
                    <select
                      value={serviceForm.categoryId}
                      onChange={(event) => {
                        setServiceForm((prev) => ({ ...prev, categoryId: event.target.value }));
                        if (fieldErrors.categoryId) setFieldErrors((e) => ({ ...e, categoryId: undefined }));
                      }}
                      required
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 shadow-sm outline-none ring-accent/30 transition focus:ring-2"
                    >
                      <option value="">Select category</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.categoryId ? (
                      <p className="mt-1.5 text-xs text-danger">{fieldErrors.categoryId}</p>
                    ) : null}
                  </label>
                  <div className="hidden sm:block" aria-hidden />
                  <label className="block text-sm sm:col-span-2">
                    <span className="mb-1.5 block font-medium text-[#1F2420]">Short description</span>
                    <textarea
                      value={serviceForm.shortDescription}
                      onChange={(event) =>
                        setServiceForm((prev) => ({ ...prev, shortDescription: event.target.value }))
                      }
                      rows={2}
                      placeholder="One or two lines clients see in lists"
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 shadow-sm outline-none ring-accent/30 transition focus:ring-2"
                    />
                  </label>
                  {editingService ? (
                    <SearchTermsFields accessToken={accessToken} service={editingService} canManage={canManage} />
                  ) : null}
                  <label className="block text-sm sm:col-span-2">
                    <span className="mb-1.5 block font-medium text-[#1F2420]">Full description</span>
                    <textarea
                      value={serviceForm.description}
                      onChange={(event) =>
                        setServiceForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                      rows={4}
                      placeholder="Full details shown on the service page"
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 shadow-sm outline-none ring-accent/30 transition focus:ring-2"
                    />
                  </label>
                </div>
              </section>

              {/* Section 2 — single image block */}
              <section className="rounded-xl border border-border/80 bg-white p-4 sm:p-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6A58]">Image</h3>
                <p className="mt-1 text-xs text-[#7A6A58]">Use a clear photo that represents this service.</p>
                <div className="mt-4">
                  <DashboardServiceImageUpload
                    accessToken={accessToken}
                    disabled={!canManage || serviceSaving}
                    value={serviceImage}
                    fallbackImageUrl={
                      editingService?.imageUrl &&
                      !editingService.imageKey &&
                      !editingService.imageMediaId
                        ? editingService.imageUrl
                        : null
                    }
                    onChange={(next) => {
                      setServiceImage(next);
                      setServiceImageDirty(true);
                      if (fieldErrors.image) setFieldErrors((e) => ({ ...e, image: undefined }));
                    }}
                    onError={(message) => setServiceSaveError(message)}
                    onUploadingChange={setImageUploading}
                    hideOuterLabel
                    onPickFromGallery={canReadGallery ? () => setGalleryPickerOpen(true) : undefined}
                  />
                  {fieldErrors.image ? (
                    <p className="mt-2 text-xs font-medium text-danger">{fieldErrors.image}</p>
                  ) : null}
                </div>
                <label className="mt-5 block text-sm">
                  <span className="mb-1.5 block font-medium text-[#1F2420]">Image description (accessibility)</span>
                  <input
                    value={serviceForm.imageAlt}
                    onChange={(event) => setServiceForm((prev) => ({ ...prev, imageAlt: event.target.value }))}
                    maxLength={200}
                    placeholder="Briefly describe the photo for screen readers"
                    className="w-full rounded-lg border border-border bg-[#FFFCF6] px-3 py-2.5 text-sm shadow-inner outline-none ring-accent/30 transition focus:ring-2"
                  />
                </label>
              </section>

              {/* Section 3 */}
              <section className="rounded-xl border border-border/80 bg-[#FFFCF6]/40 p-4 sm:p-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6A58]">
                  Pricing & duration
                </h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium text-[#1F2420]">Price display type</span>
                    <select
                      value={serviceForm.priceDisplayType}
                      onChange={(event) =>
                        setServiceForm((prev) => ({ ...prev, priceDisplayType: event.target.value }))
                      }
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 shadow-sm outline-none ring-accent/30 transition focus:ring-2"
                    >
                      {PRICE_TYPES.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium text-[#1F2420]">Display order</span>
                    <input
                      type="number"
                      min={0}
                      value={serviceForm.displayOrder}
                      onChange={(event) =>
                        setServiceForm((prev) => ({ ...prev, displayOrder: event.target.value }))
                      }
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 shadow-sm outline-none ring-accent/30 transition focus:ring-2"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium text-[#1F2420]">Base price (EGP)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={serviceForm.basePrice}
                      onChange={(event) => {
                        setServiceForm((prev) => ({ ...prev, basePrice: event.target.value }));
                        if (fieldErrors.price) setFieldErrors((e) => ({ ...e, price: undefined }));
                      }}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 shadow-sm outline-none ring-accent/30 transition focus:ring-2"
                    />
                    {fieldErrors.price ? <p className="mt-1.5 text-xs text-danger">{fieldErrors.price}</p> : null}
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium text-[#1F2420]">Max price (EGP)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={serviceForm.basePriceMax}
                      onChange={(event) => setServiceForm((prev) => ({ ...prev, basePriceMax: event.target.value }))}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 shadow-sm outline-none ring-accent/30 transition focus:ring-2"
                    />
                    <p className="mt-1 text-xs text-[#7A6A58]">Used for range-style pricing when applicable.</p>
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="mb-1.5 block font-medium text-[#1F2420]">Duration (minutes)</span>
                    <input
                      type="number"
                      min={0}
                      value={serviceForm.durationMinutes}
                      onChange={(event) => {
                        setServiceForm((prev) => ({ ...prev, durationMinutes: event.target.value }));
                        if (fieldErrors.duration) setFieldErrors((e) => ({ ...e, duration: undefined }));
                      }}
                      className="w-full max-w-xs rounded-lg border border-border bg-white px-3 py-2.5 shadow-sm outline-none ring-accent/30 transition focus:ring-2"
                    />
                    {fieldErrors.duration ? (
                      <p className="mt-1.5 text-xs text-danger">{fieldErrors.duration}</p>
                    ) : null}
                  </label>
                  <div className="sm:col-span-2 rounded-lg border border-dashed border-border bg-[#FBF9F5] p-3">
                    <p className="text-sm font-medium text-[#1F2420]">Processing time (optional)</p>
                    <p className="mb-2 text-xs text-[#7A6A58]">
                      For colour, keratin or masks: the minutes the client sits while the product works. The
                      stylist counts as free during that window and can start another client.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="mb-1.5 block text-[#1F2420]">Processing (minutes)</span>
                        <input
                          type="number"
                          min={0}
                          max={600}
                          value={serviceForm.processingMinutes}
                          onChange={(event) =>
                            setServiceForm((prev) => ({ ...prev, processingMinutes: event.target.value }))
                          }
                          className="w-full rounded-lg border border-border bg-white px-3 py-2.5 shadow-sm outline-none ring-accent/30 transition focus:ring-2"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1.5 block text-[#1F2420]">Starts after (minutes of application)</span>
                        <input
                          type="number"
                          min={0}
                          max={600}
                          value={serviceForm.processingStartsAfterMinutes}
                          onChange={(event) =>
                            setServiceForm((prev) => ({
                              ...prev,
                              processingStartsAfterMinutes: event.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-border bg-white px-3 py-2.5 shadow-sm outline-none ring-accent/30 transition focus:ring-2"
                        />
                      </label>
                    </div>
                  </div>
                  <label className="block text-sm sm:col-span-2">
                    <span className="mb-1.5 block font-medium text-[#1F2420]">Badge label</span>
                    <input
                      value={serviceForm.badgeLabel}
                      onChange={(event) => setServiceForm((prev) => ({ ...prev, badgeLabel: event.target.value }))}
                      placeholder="Optional short label (e.g. Popular)"
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 shadow-sm outline-none ring-accent/30 transition focus:ring-2"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-white px-3 py-3 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={serviceForm.isFeatured}
                      onChange={(event) =>
                        setServiceForm((prev) => ({ ...prev, isFeatured: event.target.checked }))
                      }
                      className="h-4 w-4 rounded border-border text-accent"
                    />
                    <span className="text-sm font-medium text-[#1F2420]">Featured service</span>
                  </label>
                </div>
              </section>

              {/* Section 4 */}
              <section className="rounded-xl border border-border/80 bg-white p-4 sm:p-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6A58]">
                  Availability & visibility
                </h3>
                <div className="mt-4 space-y-4">
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-[#FFFCF6] px-3 py-3">
                    <input
                      type="checkbox"
                      checked={serviceForm.isActive}
                      onChange={(event) => setServiceForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                      className="h-4 w-4 rounded border-border text-accent"
                    />
                    <div>
                      <span className="text-sm font-medium text-[#1F2420]">Active</span>
                      <p className="text-xs text-[#7A6A58]">Inactive services stay out of the live catalog.</p>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-[#FFFCF6] px-3 py-3">
                    <input
                      type="checkbox"
                      checked={serviceForm.bookingAvailability}
                      onChange={(event) =>
                        setServiceForm((prev) => ({ ...prev, bookingAvailability: event.target.checked }))
                      }
                      className="h-4 w-4 rounded border-border text-accent"
                    />
                    <div>
                      <span className="text-sm font-medium text-[#1F2420]">Visible for online booking</span>
                      <p className="text-xs text-[#7A6A58]">Clients can book this service on the website when requirements are met.</p>
                    </div>
                  </label>

                  {softImageWarning ? (
                    <div className="rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2.5 text-xs text-amber-950">
                      Add a photo before turning on online booking, or disable online booking while you draft this
                      service.
                    </div>
                  ) : null}

                  {activeNoBranches ? (
                    <div className="rounded-lg border border-sky-200/80 bg-sky-50/90 px-3 py-2.5 text-xs text-sky-950">
                      This service is active but no branch is selected yet. Link at least one branch so staff know
                      where it is offered.
                    </div>
                  ) : null}

                  <div>
                    <span className="mb-2 block text-sm font-medium text-[#1F2420]">
                      Choose where this service is available
                    </span>
                    <p className="mb-3 text-xs text-[#7A6A58]">Select one or more branches. Names are shown here — no
                      technical IDs.</p>
                    {branches.length === 0 ? (
                      <p className="rounded-lg border border-border bg-[#FFFCF6] px-3 py-2 text-xs text-[#7A6A58]">
                        Branches could not be loaded. You can save the service and add branches later when the list is
                        available.
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {branches.map((branch) => {
                          const checked = selectedBranchIds.has(branch.id);
                          return (
                            <label
                              key={branch.id}
                              className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-3 shadow-sm transition hover:border-accent/40 ${
                                checked
                                  ? "border-accent/50 bg-[#FFF9EE] ring-1 ring-accent/25"
                                  : "border-border/80 bg-[#FFFCF6]/50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  toggleBranch(branch.id);
                                  if (fieldErrors.branches) setFieldErrors((e) => ({ ...e, branches: undefined }));
                                }}
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-accent"
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold text-[#1F2420]">{branch.name}</span>
                                {branch.address ? (
                                  <span className="mt-0.5 block text-xs leading-snug text-[#7A6A58]">
                                    {branch.address}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {fieldErrors.branches ? (
                      <p className="mt-2 text-xs font-medium text-danger">{fieldErrors.branches}</p>
                    ) : null}
                  </div>
                </div>
              </section>

              {/* Section 5 */}
              <section className="rounded-xl border border-border/80 bg-[#FFFCF6]/40 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6A58]">Service benefits</h3>
                  <button
                    type="button"
                    onClick={addBenefitRow}
                    className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-[#1F2420] shadow-sm transition hover:bg-[#FFF9EE]"
                  >
                    Add benefit
                  </button>
                </div>
                <p className="mt-1 text-xs text-[#7A6A58]">Short highlights shown to clients (order is preserved).</p>
                {serviceBenefits.length === 0 ? (
                  <p className="mt-3 text-sm text-[#7A6A58]">No benefits yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {serviceBenefits.map((row, index) => (
                      <li
                        key={row.key}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-white p-3 shadow-sm"
                      >
                        <span className="text-xs font-medium text-[#7A6A58]">#{index + 1}</span>
                        <input
                          value={row.label}
                          onChange={(event) =>
                            setServiceBenefits((prev) =>
                              prev.map((r) => (r.key === row.key ? { ...r, label: event.target.value } : r)),
                            )
                          }
                          placeholder="Benefit text"
                          className="min-w-[10rem] flex-1 rounded-md border border-border px-2 py-1.5 text-sm"
                        />
                        <label className="flex items-center gap-1.5 text-xs text-[#1F2420]">
                          <input
                            type="checkbox"
                            checked={row.isActive}
                            onChange={(event) =>
                              setServiceBenefits((prev) =>
                                prev.map((r) =>
                                  r.key === row.key ? { ...r, isActive: event.target.checked } : r,
                                ),
                              )
                            }
                          />
                          On
                        </label>
                        <div className="ml-auto flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveBenefitRow(row.key, -1)}
                            className="rounded border border-border bg-[#FFFCF6] px-2 py-1 text-xs disabled:opacity-40"
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            disabled={index === serviceBenefits.length - 1}
                            onClick={() => moveBenefitRow(row.key, 1)}
                            className="rounded border border-border bg-[#FFFCF6] px-2 py-1 text-xs disabled:opacity-40"
                          >
                            Down
                          </button>
                          <button
                            type="button"
                            onClick={() => removeBenefitRow(row.key)}
                            className="rounded border border-[#E7B9A4]/50 bg-white px-2 py-1 text-xs font-medium text-danger"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {editingService && canReadVariants ? (
                <details className="group rounded-xl border border-dashed border-border/90 bg-white p-4 sm:p-5">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[#1F2420]">
                    <Layers className="h-4 w-4 text-accent" aria-hidden />
                    Service variants
                    <ChevronDown className="ml-auto h-4 w-4 shrink-0 transition group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="mt-4 border-t border-border/60 pt-4">
                    {variantsLoading ? (
                      <p className="text-sm text-[#7A6A58]">Loading variants…</p>
                    ) : null}
                    {variantsError ? (
                      <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                        {variantsError}
                      </p>
                    ) : null}
                    <div className="mt-3 space-y-2">
                      {variants.map((variant) => (
                        <div
                          key={variant.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-[#FFFCF6]/50 p-3"
                        >
                          <div>
                            <p className="text-sm font-medium text-[#1F2420]">{variant.name}</p>
                            <p className="text-xs text-[#7A6A58]">
                              EGP {variant.price.toLocaleString()} · {variant.durationMinutes} min ·{" "}
                              {variant.isActive ? "Active" : "Inactive"}
                            </p>
                          </div>
                          {canManageVariants ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => openEditVariant(variant)}
                                className="rounded-md border border-border bg-white px-2 py-1 text-xs font-medium"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void onToggleVariantStatus(variant)}
                                className="rounded-md border border-border bg-white px-2 py-1 text-xs font-medium"
                              >
                                {variant.isActive ? "Deactivate" : "Activate"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    {canManageVariants ? (
                      <div className="mt-4 grid gap-2 md:grid-cols-4">
                        <input
                          placeholder="Variant name"
                          value={variantName}
                          onChange={(event) => setVariantName(event.target.value)}
                          className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="Price"
                          value={variantPrice}
                          onChange={(event) => setVariantPrice(event.target.value)}
                          className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                        />
                        <input
                          type="number"
                          min={0}
                          placeholder="Duration"
                          value={variantDuration}
                          onChange={(event) => setVariantDuration(event.target.value)}
                          className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          disabled={variantSaving}
                          onClick={() => void onCreateVariant()}
                          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                        >
                          {variantSaving ? "Saving…" : "Add variant"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}

              {serviceSaveError ? (
                <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                  {serviceSaveError}
                </p>
              ) : null}
            </div>
          </div>

          <footer className="shrink-0 border-t border-border bg-gradient-to-t from-[#FFFCF6] to-card px-5 py-4 sm:px-6">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                disabled={saveBlocked}
                onClick={onClose}
                className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-[#1F2420] shadow-sm transition hover:bg-[#FFF9EE] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveBlocked}
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:opacity-95 disabled:opacity-55"
              >
                {serviceSaving ? "Saving…" : imageUploading ? "Wait for upload…" : "Save service"}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>

    {editingVariant ? (
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#2A1722]/55 p-0 sm:items-center sm:p-4">
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Close variant editor"
          onClick={closeEditVariant}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={editVariantTitleId}
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-[#FFFCF6] shadow-2xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="border-b border-border/70 bg-white/70 px-5 py-4 sm:px-6">
            <h2 id={editVariantTitleId} className="text-lg font-semibold tracking-tight text-[#1F2420]">
              Edit variant
            </h2>
            <p className="mt-1 text-xs text-[#7A6A58]">Update name, price (EGP), and duration for this variant.</p>
          </header>
          <div className="space-y-3 px-5 py-4 sm:px-6">
            <label className="block text-xs font-medium text-[#1F2420]">
              Name
              <input
                value={editVariantName}
                onChange={(e) => setEditVariantName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                autoComplete="off"
              />
            </label>
            <label className="block text-xs font-medium text-[#1F2420]">
              Price (EGP)
              <input
                type="number"
                step="0.01"
                min={0}
                value={editVariantPrice}
                onChange={(e) => setEditVariantPrice(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-[#1F2420]">
              Duration (minutes)
              <input
                type="number"
                min={1}
                step={1}
                value={editVariantDuration}
                onChange={(e) => setEditVariantDuration(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
              />
            </label>
            {editVariantError ? (
              <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                {editVariantError}
              </p>
            ) : null}
          </div>
          <footer className="flex flex-col-reverse gap-2 border-t border-border/60 bg-[#FFFCF6]/80 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              disabled={editVariantSaving}
              onClick={closeEditVariant}
              className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-[#1F2420] shadow-sm transition hover:bg-[#FFF9EE] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={editVariantSaving}
              onClick={() => void submitEditVariant()}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:opacity-95 disabled:opacity-55"
            >
              {editVariantSaving ? "Saving…" : "Save changes"}
            </button>
          </footer>
        </div>
      </div>
    ) : null}
    {canReadGallery ? (
      <GalleryImagePicker
        accessToken={accessToken}
        open={galleryPickerOpen}
        onClose={() => setGalleryPickerOpen(false)}
        onSelect={(asset) => {
          setServiceImage({
            imageUrl: asset.url,
            imageKey: asset.storageKey ?? "",
            imageMediaId: asset.id,
          });
          setServiceImageDirty(true);
          if (fieldErrors.image) setFieldErrors((e) => ({ ...e, image: undefined }));
        }}
      />
    ) : null}
    </>
  );
}

/** Spec v2 §3a: Arabic name + search aliases used by the front-desk treatment picker. */
function SearchTermsFields({
  accessToken,
  service,
  canManage,
}: {
  accessToken: string;
  service: DashboardService;
  canManage: boolean;
}) {
  const [nameAr, setNameAr] = useState(service.nameAr ?? "");
  const [aliases, setAliases] = useState((service.searchAliases ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    setNameAr(service.nameAr ?? "");
    setAliases((service.searchAliases ?? []).join(", "));
    setNote(null);
  }, [service.id, service.nameAr, service.searchAliases]);
  const dirty =
    nameAr.trim() !== (service.nameAr ?? "").trim() ||
    aliases.split(",").map((a) => a.trim()).filter(Boolean).join("|") !== (service.searchAliases ?? []).join("|");
  async function save() {
    setSaving(true);
    setNote(null);
    try {
      await patchDashboardCatalogSearchTerms(accessToken, "service", service.id, {
        nameAr: nameAr.trim() || null,
        searchAliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
      });
      invalidatePickerCatalogCache();
      setNote("Saved. The front-desk picker now finds this service by these words.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not save search terms.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="rounded-xl border border-dashed border-[#D4C4B0] bg-[#FFFCF7] p-3 sm:col-span-2">
      <p className="text-sm font-medium text-[#1F2420]">Front-desk search</p>
      <p className="mt-0.5 text-xs text-[#7A6A58]">How reception finds this service when typing — Arabic name and short words like “mani”.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-[#5E574C]">Arabic name</span>
          <input dir="rtl" value={nameAr} disabled={!canManage} onChange={(e) => setNameAr(e.target.value)} placeholder="قص شعر" className="w-full rounded-lg border border-border bg-white px-3 py-2 shadow-sm outline-none ring-accent/30 focus:ring-2" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-[#5E574C]">Aliases (comma separated)</span>
          <input value={aliases} disabled={!canManage} onChange={(e) => setAliases(e.target.value)} placeholder="cut, trim, قصة" className="w-full rounded-lg border border-border bg-white px-3 py-2 shadow-sm outline-none ring-accent/30 focus:ring-2" />
        </label>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-[#7A6A58]">{note ?? ""}</span>
        <button type="button" disabled={!canManage || !dirty || saving} onClick={() => void save()} className="rounded-lg bg-[#062A2D] px-3 py-1.5 text-xs font-semibold text-[#F6F2EA] disabled:opacity-50">
          {saving ? "Saving…" : "Save search terms"}
        </button>
      </div>
    </div>
  );
}
