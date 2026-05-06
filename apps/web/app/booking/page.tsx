import {
  getPublicBranches,
  getPublicBundles,
  getPublicPackages,
  getPublicServices,
} from "@/lib/api/public";
import { BookingFlowShell } from "@/components/booking/booking-flow-shell";

type BookingPageProps = {
  searchParams: Promise<{
    serviceId?: string;
    variantId?: string;
    packageId?: string;
    bundleId?: string;
  }>;
};

function getErrorMessage(reason: unknown): string | null {
  if (reason instanceof Error) {
    return reason.message;
  }
  return null;
}

export default async function BookingPage({ searchParams }: BookingPageProps) {
  const preselection = await searchParams;

  const [servicesResult, packagesResult, bundlesResult, branchesResult] =
    await Promise.allSettled([
      getPublicServices({ pageSize: 24 }),
      getPublicPackages(),
      getPublicBundles(),
      getPublicBranches(),
    ]);

  const services = servicesResult.status === "fulfilled" ? servicesResult.value.data : [];
  const packages = packagesResult.status === "fulfilled" ? packagesResult.value.data : [];
  const bundles = bundlesResult.status === "fulfilled" ? bundlesResult.value.data : [];
  const branches = branchesResult.status === "fulfilled" ? branchesResult.value : [];

  return (
    <BookingFlowShell
      services={services}
      packages={packages}
      bundles={bundles}
      branches={branches}
      preselection={{
        serviceId: preselection.serviceId,
        variantId: preselection.variantId,
        packageId: preselection.packageId,
        bundleId: preselection.bundleId,
      }}
      initialErrors={{
        services: getErrorMessage(servicesResult.status === "rejected" ? servicesResult.reason : null),
        packages: getErrorMessage(packagesResult.status === "rejected" ? packagesResult.reason : null),
        bundles: getErrorMessage(bundlesResult.status === "rejected" ? bundlesResult.reason : null),
        branches: getErrorMessage(branchesResult.status === "rejected" ? branchesResult.reason : null),
      }}
    />
  );
}
