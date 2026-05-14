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
  shortDescription: string | null;
  imageUrl: string | null;
  /** Present when API returns alt text for the hero image. */
  imageAlt?: string | null;
  displayOrder: number;
  isFeatured: boolean;
  badgeLabel: string | null;
  priceDisplayType: "FIXED" | "STARTS_FROM" | "RANGE" | "CONTACT" | "HIDDEN";
  basePrice: number | null;
  basePriceMax: number | null;
  durationMinutes: number | null;
  currency: "EGP";
  benefits: PublicServiceBenefit[];
};

export type PublicServiceBenefit = {
  id: string;
  label: string;
  displayOrder: number;
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
  description: string | null;
  offerCode: string | null;
  discountType: string;
  discountValue: number | null;
  startDate: string;
  endDate: string;
  minimumSpend: number | null;
  appliesTo: "ALL" | "SERVICES" | "PACKAGES";
  currency: "EGP";
  eligibilityRules?: Record<string, unknown> | null;
};

export type PublicServiceEnhancement = {
  id: string;
  title: string;
  shortDescription: string | null;
  price: number | null;
  durationMinutes: number | null;
  imageUrl: string | null;
  displayOrder: number;
  isActive: boolean;
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
  clientName: string;
  clientTitle: string | null;
  rating: number;
  quote: string;
  serviceName: string | null;
  displayOrder: number;
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

export type PublicWebsiteContentSection = {
  key: string;
  page: string;
  sectionType: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  eyebrow: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  secondaryCtaLabel: string | null;
  secondaryCtaHref: string | null;
  primaryImageUrl: string | null;
  secondaryImageUrl: string | null;
  content: Record<string, unknown> | null;
  displayOrder: number;
};

export type PublicSiteContent = {
  homeHero: Record<string, unknown>;
  aboutSection: Record<string, unknown>;
  contactSection: Record<string, unknown>;
  footerSection: Record<string, unknown>;
  socialLinks: Record<string, unknown>;
  seoDefaults: Record<string, unknown>;
  websiteSections?: PublicWebsiteContentSection[];
};

export function getPublicSiteContent() {
  return getJson<PublicSiteContent>("/public/site-content");
}

export function getPublicCategories() {
  return getJson<ListResponse<PublicCategory>>("/public/categories");
}

export function getPublicServices(args?: {
  categoryId?: string;
  pageSize?: number;
  branchId?: string;
  /** When true, only catalog services flagged as featured are returned. */
  isFeatured?: boolean;
}) {
  const params = new URLSearchParams({
    page: "1",
    pageSize: String(args?.pageSize ?? 24),
  });
  if (args?.categoryId) {
    params.set("categoryId", args.categoryId);
  }
  if (args?.branchId) {
    params.set("branchId", args.branchId);
  }
  if (args?.isFeatured === true) {
    params.set("isFeatured", "true");
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

export function getPublicPackages(args?: { branchId?: string; pageSize?: number }) {
  const params = new URLSearchParams({
    page: "1",
    pageSize: String(args?.pageSize ?? 24),
  });
  if (args?.branchId) {
    params.set("branchId", args.branchId);
  }
  return getJson<ListResponse<PublicPackage>>(`/public/packages?${params.toString()}`);
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

export function getPublicServiceEnhancements() {
  return getJson<ListResponse<PublicServiceEnhancement>>("/public/service-enhancements", {
    noStore: true,
  });
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
