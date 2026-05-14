import {
  getPublicBranches,
  getPublicCategories,
  getPublicPackages,
  getPublicServiceEnhancements,
  getPublicServices,
} from "@/lib/api/public";
import { formatPublicCatalogError } from "@/lib/api/catalog-fetch-errors";
import { BookingFlowShell } from "@/components/booking/booking-flow-shell";

type BookingPageProps = {
  searchParams: Promise<{
    serviceId?: string;
    variantId?: string;
    packageId?: string;
    bundleId?: string;
    promoCode?: string;
  }>;
};

/** Matches `prisma/seed.ts` default branch id — catalog links are seeded there first. */
const SEED_MAIN_BRANCH_ID = "00000000-0000-4000-8000-000000000001";

function pickDefaultCatalogBranchId(branches: readonly { id: string }[]): string | undefined {
  if (branches.length === 0) {
    return undefined;
  }
  const preferred = branches.find((b) => b.id === SEED_MAIN_BRANCH_ID);
  if (preferred) {
    return preferred.id;
  }
  return [...branches].sort((a, b) => a.id.localeCompare(b.id))[0]?.id;
}

export default async function BookingPage({ searchParams }: BookingPageProps) {
  const preselection = await searchParams;

  const [branchesResult, categoriesResult] = await Promise.allSettled([
    getPublicBranches(),
    getPublicCategories(),
  ]);

  const branches = branchesResult.status === "fulfilled" ? branchesResult.value : [];
  const categories =
    categoriesResult.status === "fulfilled" ? categoriesResult.value.data : [];
  const defaultBranchId = pickDefaultCatalogBranchId(branches);

  const [servicesResult, packagesResult, enhancementsResult] = await Promise.allSettled([
    getPublicServices({
      pageSize: 100,
      ...(defaultBranchId ? { branchId: defaultBranchId } : {}),
    }),
    getPublicPackages({
      pageSize: 100,
      ...(defaultBranchId ? { branchId: defaultBranchId } : {}),
    }),
    getPublicServiceEnhancements(),
  ]);

  const services = servicesResult.status === "fulfilled" ? servicesResult.value.data : [];
  const packages = packagesResult.status === "fulfilled" ? packagesResult.value.data : [];
  const enhancements =
    enhancementsResult.status === "fulfilled"
      ? enhancementsResult.value.data.filter((e) => e.isActive)
      : [];

  return (
    <BookingFlowShell
      categories={categories}
      services={services}
      packages={packages}
      enhancements={enhancements}
      branches={branches}
      initialBranchId={defaultBranchId}
      preselection={{
        serviceId: preselection.serviceId,
        variantId: preselection.variantId,
        packageId: preselection.packageId,
        promoCode: preselection.promoCode,
      }}
      initialErrors={{
        categories: formatPublicCatalogError(
          categoriesResult.status === "rejected" ? categoriesResult.reason : null,
        ),
        services: formatPublicCatalogError(
          servicesResult.status === "rejected" ? servicesResult.reason : null,
        ),
        packages: formatPublicCatalogError(
          packagesResult.status === "rejected" ? packagesResult.reason : null,
        ),
        enhancements: formatPublicCatalogError(
          enhancementsResult.status === "rejected" ? enhancementsResult.reason : null,
        ),
        branches: formatPublicCatalogError(
          branchesResult.status === "rejected" ? branchesResult.reason : null,
        ),
      }}
    />
  );
}
