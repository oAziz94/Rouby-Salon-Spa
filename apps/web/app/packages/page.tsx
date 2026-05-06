import Link from "next/link";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { getPublicPackages } from "@/lib/api/public";
import { formatEgp } from "@/lib/format/currency";

function getErrorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  return "Unable to load this section right now.";
}

export default async function PackagesPage() {
  const packagesResult = await Promise.allSettled([getPublicPackages()]);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-14 sm:px-6 lg:px-10">
      <section className="rounded-2xl border border-border bg-card p-7">
        <h1 className="font-heading text-4xl text-primary">Wellness Packages</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Discover curated package experiences crafted for complete rejuvenation.
        </p>
      </section>

      <section className="mt-8">
        {packagesResult[0].status === "rejected" ? (
          <ErrorState message={getErrorMessage(packagesResult[0].reason)} />
        ) : packagesResult[0].value.data.length === 0 ? (
          <EmptyState
            title="No packages available"
            description="Packages will appear here when published."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {packagesResult[0].value.data.map((pkg) => (
              <article key={pkg.id} className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-heading text-2xl text-primary">{pkg.name}</h2>
                {pkg.description ? (
                  <p className="mt-2 line-clamp-3 text-sm text-muted">{pkg.description}</p>
                ) : null}
                <div className="mt-3 text-sm text-foreground">
                  <p className="font-medium">{formatEgp(pkg.packagePrice)}</p>
                  {pkg.durationMinutes ? (
                    <p className="mt-1 text-muted">
                      Approx. {pkg.durationMinutes} minutes
                    </p>
                  ) : null}
                </div>
                <Link
                  href={`/booking?packageId=${pkg.id}`}
                  className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Book Appointment
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
