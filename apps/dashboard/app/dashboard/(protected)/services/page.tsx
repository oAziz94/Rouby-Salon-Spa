"use client";

import {
  ApiClientError,
  getDashboardBranches,
  getDashboardServiceCategories,
  getDashboardServiceVariants,
  getDashboardServices,
  patchDashboardService,
  patchDashboardServiceCategory,
  patchDashboardServiceStatus,
  patchDashboardServiceVariant,
  patchDashboardServiceVariantStatus,
  postDashboardService,
  postDashboardServiceCategory,
  postDashboardServiceVariant,
  type DashboardBranch,
  type DashboardService,
  type DashboardServiceCategory,
  type DashboardServiceVariant,
} from "@rouby/api-client";
import { useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "empty" | "error";
type ServiceBenefitFormRow = { key: string; label: string; isActive: boolean };
type ServiceFormState = {
  name: string;
  categoryId: string;
  shortDescription: string;
  imageUrl: string;
  displayOrder: string;
  isFeatured: boolean;
  badgeLabel: string;
  priceDisplayType: string;
  basePrice: string;
  basePriceMax: string;
  durationMinutes: string;
  branchIdsCsv: string;
};

function formatEGP(amount: number | null): string {
  if (amount === null) return "-";
  return `EGP ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.statusCode === 403) return "Forbidden (403). You do not have permission.";
    if (error.statusCode === 401) return "Unauthorized (401). Please sign in again.";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

export default function DashboardServicesPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canRead = hasPermission("services.read");
  const canManage = hasPermission("services.manage");
  const canManageCategories = hasPermission("services.categories.manage");
  const canReadVariants = hasPermission("service_variants.read");
  const canManageVariants = hasPermission("service_variants.manage");

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardService[]>([]);
  const [categories, setCategories] = useState<DashboardServiceCategory[]>([]);
  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [isActiveFilter, setIsActiveFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<DashboardService | null>(null);
  const [serviceSaveError, setServiceSaveError] = useState("");
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceForm, setServiceForm] = useState<ServiceFormState>({
    name: "",
    categoryId: "",
    shortDescription: "",
    imageUrl: "",
    displayOrder: "0",
    isFeatured: false,
    badgeLabel: "",
    priceDisplayType: "FIXED",
    basePrice: "",
    basePriceMax: "",
    durationMinutes: "",
    branchIdsCsv: "",
  });
  const [serviceBenefits, setServiceBenefits] = useState<ServiceBenefitFormRow[]>([]);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<DashboardServiceCategory | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categorySortOrder, setCategorySortOrder] = useState("0");
  const [categoryError, setCategoryError] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);

  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsError, setVariantsError] = useState("");
  const [variants, setVariants] = useState<DashboardServiceVariant[]>([]);
  const [variantName, setVariantName] = useState("");
  const [variantPrice, setVariantPrice] = useState("");
  const [variantDuration, setVariantDuration] = useState("");
  const [variantSaving, setVariantSaving] = useState(false);

  const canOpenServiceModal = canManage;
  const filtersIsActive =
    isActiveFilter === "" ? undefined : isActiveFilter === "true" ? true : false;

  async function loadBaseData() {
    if (!token || !canRead) return;
    setState("loading");
    setError("");
    try {
      const [servicesResult, categoriesResult, branchesResult] = await Promise.all([
        getDashboardServices(token, {
          page,
          pageSize: 20,
          categoryId: categoryFilter || undefined,
          isActive: filtersIsActive,
        }),
        getDashboardServiceCategories(token),
        getDashboardBranches(token).catch(() => []),
      ]);
      setRows(servicesResult.data);
      setCategories(categoriesResult.data);
      setBranches(branchesResult);
      setState(servicesResult.data.length ? "loaded" : "empty");
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  useEffect(() => {
    void loadBaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canRead, page, categoryFilter, isActiveFilter]);

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  async function loadVariants(serviceId: string) {
    if (!token || !canReadVariants) return;
    setVariantsLoading(true);
    setVariantsError("");
    try {
      const result = await getDashboardServiceVariants(token, serviceId);
      setVariants(result.data);
    } catch (requestError) {
      setVariantsError(formatApiError(requestError));
    } finally {
      setVariantsLoading(false);
    }
  }

  function openCreateServiceModal() {
    setEditingService(null);
    setServiceForm({
      name: "",
      categoryId: categories[0]?.id ?? "",
      shortDescription: "",
      imageUrl: "",
      displayOrder: "0",
      isFeatured: false,
      badgeLabel: "",
      priceDisplayType: "FIXED",
      basePrice: "",
      basePriceMax: "",
      durationMinutes: "",
      branchIdsCsv: "",
    });
    setServiceBenefits([]);
    setVariants([]);
    setServiceSaveError("");
    setServiceModalOpen(true);
  }

  function openEditServiceModal(service: DashboardService) {
    setEditingService(service);
    setServiceForm({
      name: service.name,
      categoryId: service.categoryId,
      shortDescription: service.shortDescription ?? "",
      imageUrl: service.imageUrl ?? "",
      displayOrder: String(service.displayOrder),
      isFeatured: service.isFeatured,
      badgeLabel: service.badgeLabel ?? "",
      priceDisplayType: service.priceDisplayType,
      basePrice: service.basePrice?.toString() ?? "",
      basePriceMax: service.basePriceMax?.toString() ?? "",
      durationMinutes: service.durationMinutes?.toString() ?? "",
      branchIdsCsv: service.branchIds.join(", "),
    });
    setServiceBenefits(
      (service.benefits ?? []).map((benefit) => ({
        key: benefit.id,
        label: benefit.label,
        isActive: benefit.isActive,
      })),
    );
    setServiceSaveError("");
    setServiceModalOpen(true);
    void loadVariants(service.id);
  }

  async function onSaveService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setServiceSaving(true);
    setServiceSaveError("");
    try {
      const branchIds = serviceForm.branchIdsCsv
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      const payload = {
        name: serviceForm.name,
        categoryId: serviceForm.categoryId,
        shortDescription: serviceForm.shortDescription.trim() || null,
        imageUrl: serviceForm.imageUrl.trim() || null,
        displayOrder: Number(serviceForm.displayOrder || 0),
        isFeatured: serviceForm.isFeatured,
        badgeLabel: serviceForm.badgeLabel.trim() || null,
        priceDisplayType: serviceForm.priceDisplayType,
        basePrice: serviceForm.basePrice ? Number(serviceForm.basePrice) : null,
        basePriceMax: serviceForm.basePriceMax ? Number(serviceForm.basePriceMax) : null,
        durationMinutes: serviceForm.durationMinutes ? Number(serviceForm.durationMinutes) : null,
        branchIds,
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
        await patchDashboardService(token, editingService.id, payload);
      } else {
        await postDashboardService(token, payload);
      }
      setServiceModalOpen(false);
      await loadBaseData();
    } catch (requestError) {
      setServiceSaveError(formatApiError(requestError));
    } finally {
      setServiceSaving(false);
    }
  }

  async function onToggleServiceStatus(service: DashboardService) {
    if (!token) return;
    try {
      await patchDashboardServiceStatus(token, service.id, !service.isActive);
      await loadBaseData();
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  async function onSaveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setCategorySaving(true);
    setCategoryError("");
    try {
      const payload = { name: categoryName, sortOrder: Number(categorySortOrder || 0) };
      if (editingCategory) {
        await patchDashboardServiceCategory(token, editingCategory.id, payload);
      } else {
        await postDashboardServiceCategory(token, payload);
      }
      setCategoryModalOpen(false);
      await loadBaseData();
    } catch (requestError) {
      setCategoryError(formatApiError(requestError));
    } finally {
      setCategorySaving(false);
    }
  }

  async function onCreateVariant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !editingService) return;
    setVariantSaving(true);
    setVariantsError("");
    try {
      await postDashboardServiceVariant(token, editingService.id, {
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
    if (!token) return;
    try {
      await patchDashboardServiceVariantStatus(token, variant.id, !variant.isActive);
      if (editingService) await loadVariants(editingService.id);
    } catch (requestError) {
      setVariantsError(formatApiError(requestError));
    }
  }

  async function onEditVariant(variant: DashboardServiceVariant) {
    if (!token) return;
    const nameInput = window.prompt("Variant name", variant.name);
    if (!nameInput) return;
    const priceInput = window.prompt("Variant price (EGP)", String(variant.price));
    if (!priceInput) return;
    const durationInput = window.prompt("Variant duration (minutes)", String(variant.durationMinutes));
    if (!durationInput) return;
    try {
      await patchDashboardServiceVariant(token, variant.id, {
        name: nameInput,
        price: Number(priceInput),
        durationMinutes: Number(durationInput),
      });
      if (editingService) await loadVariants(editingService.id);
    } catch (requestError) {
      setVariantsError(formatApiError(requestError));
    }
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

  return (
    <PermissionGuard permission="services.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">Services</h1>
              <p className="mt-2 text-sm text-[#7A6A58]">
                Catalog services, service categories, and service variants management.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManageCategories ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCategory(null);
                    setCategoryName("");
                    setCategorySortOrder("0");
                    setCategoryModalOpen(true);
                  }}
                  className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium"
                >
                  New category
                </button>
              ) : null}
              {canOpenServiceModal ? (
                <button
                  type="button"
                  onClick={openCreateServiceModal}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  New service
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Category</span>
              <select
                value={categoryFilter}
                onChange={(event) => {
                  setPage(1);
                  setCategoryFilter(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Active state</span>
              <select
                value={isActiveFilter}
                onChange={(event) => {
                  setPage(1);
                  setIsActiveFilter(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                <option value="">All</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#1F2420]">Service categories</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((category) => (
              <div key={category.id} className="rounded border border-border bg-white px-3 py-2 text-xs text-[#1F2420]">
                <span>{category.name}</span>
                {canManageCategories ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategory(category);
                      setCategoryName(category.name);
                      setCategorySortOrder(String(category.sortOrder));
                      setCategoryModalOpen(true);
                    }}
                    className="ml-2 rounded border border-border px-2 py-0.5 text-xs"
                  >
                    Edit
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {state === "loading" ? <p className="text-sm text-[#7A6A58]">Loading services...</p> : null}
        {state === "error" ? (
          <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] p-4 text-sm text-danger">{error}</p>
        ) : null}
        {state === "empty" ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-[#7A6A58]">No services found.</p>
        ) : null}

        {state === "loaded" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Service</th>
                    <th className="py-2 pr-3 font-medium">Category</th>
                    <th className="py-2 pr-3 font-medium">Price</th>
                    <th className="py-2 pr-3 font-medium">Duration</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((service) => (
                    <tr key={service.id} className="border-b border-border/60 hover:bg-[#FFF9EE]">
                      <td className="py-3 pr-3 font-medium text-[#1F2420]">{service.name}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        {categoriesById.get(service.categoryId)?.name ?? service.categoryId}
                      </td>
                      <td className="py-3 pr-3 text-[#1F2420]">{formatEGP(service.basePrice)}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        {service.durationMinutes ? `${service.durationMinutes} min` : "-"}
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{service.isActive ? "Active" : "Inactive"}</td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap gap-2">
                          {canManage ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditServiceModal(service)}
                                className="rounded border border-border bg-white px-2 py-1 text-xs"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void onToggleServiceStatus(service)}
                                className="rounded border border-border bg-white px-2 py-1 text-xs"
                              >
                                {service.isActive ? "Deactivate" : "Activate"}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 md:hidden">
              {rows.map((service) => (
                <article key={service.id} className="rounded-lg border border-border bg-white p-4">
                  <p className="text-sm font-semibold text-[#1F2420]">{service.name}</p>
                  <p className="mt-1 text-xs text-[#7A6A58]">
                    {categoriesById.get(service.categoryId)?.name ?? service.categoryId}
                  </p>
                  <p className="mt-1 text-xs text-[#1F2420]">{formatEGP(service.basePrice)}</p>
                  {canManage ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditServiceModal(service)}
                        className="rounded border border-border bg-white px-2 py-1 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void onToggleServiceStatus(service)}
                        className="rounded border border-border bg-white px-2 py-1 text-xs"
                      >
                        {service.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded border border-border bg-white px-3 py-1 text-sm disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm text-[#7A6A58]">Page {page}</span>
              <button
                type="button"
                onClick={() => setPage((prev) => prev + 1)}
                className="rounded border border-border bg-white px-3 py-1 text-sm"
              >
                Next
              </button>
            </div>
          </section>
        ) : null}

        {serviceModalOpen ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2A1722]/40 p-4">
            <section className="mx-auto mt-8 w-full max-w-4xl rounded-xl border border-border bg-card p-6 shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#1F2420]">
                  {editingService ? "Edit service" : "Create service"}
                </h2>
                <button
                  type="button"
                  onClick={() => setServiceModalOpen(false)}
                  className="rounded border border-border bg-white px-3 py-1 text-sm"
                >
                  Close
                </button>
              </div>
              <form className="grid gap-3 md:grid-cols-2" onSubmit={onSaveService}>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Name</span>
                  <input
                    value={serviceForm.name}
                    onChange={(event) => setServiceForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Category</span>
                  <select
                    value={serviceForm.categoryId}
                    onChange={(event) => setServiceForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                    required
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  >
                    <option value="">Select category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block font-medium text-[#1F2420]">Short description</span>
                  <textarea
                    value={serviceForm.shortDescription}
                    onChange={(event) =>
                      setServiceForm((prev) => ({ ...prev, shortDescription: event.target.value }))
                    }
                    rows={2}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block font-medium text-[#1F2420]">Image URL</span>
                  <input
                    value={serviceForm.imageUrl}
                    onChange={(event) => setServiceForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Display order</span>
                  <input
                    type="number"
                    min={0}
                    value={serviceForm.displayOrder}
                    onChange={(event) =>
                      setServiceForm((prev) => ({ ...prev, displayOrder: event.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Badge label</span>
                  <input
                    value={serviceForm.badgeLabel}
                    onChange={(event) =>
                      setServiceForm((prev) => ({ ...prev, badgeLabel: event.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm md:col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={serviceForm.isFeatured}
                    onChange={(event) =>
                      setServiceForm((prev) => ({ ...prev, isFeatured: event.target.checked }))
                    }
                  />
                  <span className="font-medium text-[#1F2420]">Featured service</span>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Price display type</span>
                  <select
                    value={serviceForm.priceDisplayType}
                    onChange={(event) =>
                      setServiceForm((prev) => ({ ...prev, priceDisplayType: event.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  >
                    <option value="FIXED">FIXED</option>
                    <option value="STARTS_FROM">STARTS_FROM</option>
                    <option value="RANGE">RANGE</option>
                    <option value="CONTACT">CONTACT</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Base price (EGP)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={serviceForm.basePrice}
                    onChange={(event) => setServiceForm((prev) => ({ ...prev, basePrice: event.target.value }))}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Max price (EGP)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={serviceForm.basePriceMax}
                    onChange={(event) => setServiceForm((prev) => ({ ...prev, basePriceMax: event.target.value }))}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Duration (minutes)</span>
                  <input
                    type="number"
                    min={0}
                    value={serviceForm.durationMinutes}
                    onChange={(event) =>
                      setServiceForm((prev) => ({ ...prev, durationMinutes: event.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block font-medium text-[#1F2420]">
                    Branch IDs (comma-separated) or copy from list
                  </span>
                  <input
                    value={serviceForm.branchIdsCsv}
                    onChange={(event) => setServiceForm((prev) => ({ ...prev, branchIdsCsv: event.target.value }))}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                  <p className="mt-1 text-xs text-[#7A6A58]">
                    {branches.length > 0
                      ? `Available branches: ${branches.map((branch) => `${branch.name} (${branch.id})`).join(" • ")}`
                      : "Branch list unavailable for this user/session."}
                  </p>
                </label>
                <div className="md:col-span-2 space-y-2 rounded-md border border-border bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-[#1F2420]">Service benefits</span>
                    <button
                      type="button"
                      onClick={addBenefitRow}
                      className="rounded border border-border bg-[#FFF9EE] px-2 py-1 text-xs font-medium"
                    >
                      Add benefit
                    </button>
                  </div>
                  <p className="text-xs text-[#7A6A58]">
                    Order matches public chip display. Saving replaces all benefit rows for this service.
                  </p>
                  {serviceBenefits.length === 0 ? (
                    <p className="text-xs text-[#7A6A58]">No benefits yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {serviceBenefits.map((row, index) => (
                        <li
                          key={row.key}
                          className="flex flex-wrap items-center gap-2 rounded border border-border/80 bg-[#FFFCF6] p-2"
                        >
                          <input
                            value={row.label}
                            onChange={(event) =>
                              setServiceBenefits((prev) =>
                                prev.map((r) =>
                                  r.key === row.key ? { ...r, label: event.target.value } : r,
                                ),
                              )
                            }
                            placeholder="Benefit label"
                            className="min-w-[12rem] flex-1 rounded border border-border px-2 py-1 text-sm"
                          />
                          <label className="flex items-center gap-1 text-xs text-[#1F2420]">
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
                            Active
                          </label>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => moveBenefitRow(row.key, -1)}
                              className="rounded border border-border bg-white px-2 py-1 text-xs disabled:opacity-40"
                            >
                              Up
                            </button>
                            <button
                              type="button"
                              disabled={index === serviceBenefits.length - 1}
                              onClick={() => moveBenefitRow(row.key, 1)}
                              className="rounded border border-border bg-white px-2 py-1 text-xs disabled:opacity-40"
                            >
                              Down
                            </button>
                            <button
                              type="button"
                              onClick={() => removeBenefitRow(row.key)}
                              className="rounded border border-border bg-white px-2 py-1 text-xs text-danger"
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {serviceSaveError ? (
                  <p className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger md:col-span-2">
                    {serviceSaveError}
                  </p>
                ) : null}
                <div className="md:col-span-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setServiceModalOpen(false)}
                    className="rounded border border-border bg-white px-3 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={serviceSaving}
                    className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {serviceSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>

              {editingService && canReadVariants ? (
                <section className="mt-6 rounded-lg border border-border bg-white p-4">
                  <h3 className="text-sm font-semibold text-[#1F2420]">Service variants</h3>
                  {variantsLoading ? <p className="mt-2 text-sm text-[#7A6A58]">Loading variants...</p> : null}
                  {variantsError ? (
                    <p className="mt-2 rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                      {variantsError}
                    </p>
                  ) : null}
                  <div className="mt-3 space-y-2">
                    {variants.map((variant) => (
                      <div key={variant.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2">
                        <div>
                          <p className="text-sm font-medium text-[#1F2420]">{variant.name}</p>
                          <p className="text-xs text-[#7A6A58]">
                            {formatEGP(variant.price)} • {variant.durationMinutes} min •{" "}
                            {variant.isActive ? "Active" : "Inactive"}
                          </p>
                        </div>
                        {canManageVariants ? (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => void onEditVariant(variant)} className="rounded border border-border bg-white px-2 py-1 text-xs">Edit</button>
                            <button
                              type="button"
                              onClick={() => void onToggleVariantStatus(variant)}
                              className="rounded border border-border bg-white px-2 py-1 text-xs"
                            >
                              {variant.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {canManageVariants ? (
                    <form className="mt-4 grid gap-2 md:grid-cols-4" onSubmit={onCreateVariant}>
                      <input
                        placeholder="Variant name"
                        value={variantName}
                        onChange={(event) => setVariantName(event.target.value)}
                        required
                        className="rounded border border-border bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="Price"
                        value={variantPrice}
                        onChange={(event) => setVariantPrice(event.target.value)}
                        required
                        className="rounded border border-border bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Duration"
                        value={variantDuration}
                        onChange={(event) => setVariantDuration(event.target.value)}
                        required
                        className="rounded border border-border bg-white px-3 py-2 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={variantSaving}
                        className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                      >
                        {variantSaving ? "Saving..." : "Add variant"}
                      </button>
                    </form>
                  ) : null}
                </section>
              ) : null}
            </section>
          </div>
        ) : null}

        {categoryModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2A1722]/40 p-4">
            <section className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
              <h2 className="text-lg font-semibold text-[#1F2420]">
                {editingCategory ? "Edit category" : "Create category"}
              </h2>
              <form className="mt-4 space-y-3" onSubmit={onSaveCategory}>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Category name</span>
                  <input
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    required
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Sort order</span>
                  <input
                    type="number"
                    min={0}
                    value={categorySortOrder}
                    onChange={(event) => setCategorySortOrder(event.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                {categoryError ? (
                  <p className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                    {categoryError}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCategoryModalOpen(false)}
                    className="rounded border border-border bg-white px-3 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={categorySaving}
                    className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {categorySaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </section>
    </PermissionGuard>
  );
}
