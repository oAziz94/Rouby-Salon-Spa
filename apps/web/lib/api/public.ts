import { getJson } from "@/lib/api/http";

export type ListMeta = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
};

export type ListResponse<T> = {
  data: T[];
  meta?: ListMeta;
};

export type PublicCategory = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
};

export type PublicService = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceDisplayType: "FIXED" | "STARTS_FROM" | "RANGE" | "CONTACT" | "HIDDEN";
  basePrice: number | null;
  basePriceMax: number | null;
  durationMinutes: number | null;
  currency: "EGP";
};

export type PublicServiceDetail = PublicService & {
  categoryName: string;
  preparationNotes: string | null;
  aftercareNotes: string | null;
  branches: Array<{
    branchId: string;
    name: string;
    address: string | null;
    phone: string | null;
  }>;
};

export type PublicServiceVariant = {
  id: string;
  serviceId: string;
  name: string;
  description: string | null;
  price: number | null;
  durationMinutes: number | null;
  currency: "EGP";
};

export type PublicPackageFeature = {
  id: string;
  label: string;
  displayOrder: number;
};

export type PublicPackage = {
  id: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  imageUrl: string | null;
  originalPrice: number | null;
  packagePrice: number | null;
  durationMinutes: number | null;
  isFeatured: boolean;
  badgeLabel: string | null;
  currency: "EGP";
  features: PublicPackageFeature[];
};

export type PublicBundle = {
  id: string;
  name: string;
  description: string | null;
  bundleType: string;
  price: number | null;
  selectableCount: number | null;
  currency: "EGP";
};

export type PublicOffer = {
  id: string;
  name: string;
  offerCode: string | null;
  discountType: string;
  discountValue: number | null;
  currency: "EGP";
};

export type PublicGalleryItem = {
  id: string;
  imageUrl: string;
  title: string | null;
  category: string | null;
  description: string | null;
  isFeatured: boolean;
};

export type PublicTestimonial = {
  id: string;
  clientName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

export type PublicBranch = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  mapUrl: string | null;
  workingHours: unknown;
};

export type PublicSiteContent = {
  homeHero: Record<string, unknown>;
  aboutSection: Record<string, unknown>;
  contactSection: Record<string, unknown>;
  footerSection: Record<string, unknown>;
  socialLinks: Record<string, unknown>;
  seoDefaults: Record<string, unknown>;
};

export function getPublicSiteContent() {
  return getJson<PublicSiteContent>("/public/site-content");
}

export function getPublicCategories() {
  return getJson<ListResponse<PublicCategory>>("/public/categories");
}

export function getPublicServices(args?: { categoryId?: string; pageSize?: number }) {
  const params = new URLSearchParams({
    page: "1",
    pageSize: String(args?.pageSize ?? 24),
  });
  if (args?.categoryId) {
    params.set("categoryId", args.categoryId);
  }
  return getJson<ListResponse<PublicService>>(`/public/services?${params.toString()}`);
}

export function getPublicServiceById(serviceId: string) {
  return getJson<PublicServiceDetail>(`/public/services/${serviceId}`);
}

export function getPublicServiceVariants(serviceId: string) {
  return getJson<ListResponse<PublicServiceVariant>>(
    `/public/services/${serviceId}/variants`,
  );
}

export function getPublicPackages() {
  return getJson<ListResponse<PublicPackage>>("/public/packages?page=1&pageSize=24");
}

export type PublicPackageDetail = PublicPackage & {
  startDate: string | null;
  endDate: string | null;
  isTaxable: boolean;
  includedServices: Array<{
    serviceId: string;
    name: string;
    sortOrder: number;
  }>;
  branchIds: string[];
};

export function getPublicPackageById(packageId: string, branchId?: string) {
  const params = new URLSearchParams();
  if (branchId) {
    params.set("branchId", branchId);
  }
  const qs = params.toString();
  return getJson<PublicPackageDetail>(
    `/public/packages/${packageId}${qs ? `?${qs}` : ""}`,
  );
}

export function getPublicBundles() {
  return getJson<ListResponse<PublicBundle>>("/public/bundles?page=1&pageSize=24");
}

export function getPublicOffers() {
  return getJson<ListResponse<PublicOffer>>("/public/offers?page=1&pageSize=6");
}

export function getPublicGallery() {
  return getJson<ListResponse<PublicGalleryItem>>("/public/gallery");
}

export function getPublicTestimonials() {
  return getJson<ListResponse<PublicTestimonial>>("/public/testimonials");
}

export function getPublicBranches() {
  return getJson<PublicBranch[]>("/public/branches");
}
