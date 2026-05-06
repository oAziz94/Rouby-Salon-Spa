import Link from "next/link";
import { Check } from "lucide-react";
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
            {packagesResult[0].value.data.map((pkg) => {
              const blurb = pkg.shortDescription?.trim() || pkg.description?.trim();
              const featureList = pkg.features ?? [];
              return (
              <article key={pkg.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="font-heading text-2xl text-primary">{pkg.name}</h2>
                  {pkg.badgeLabel ? (
                    <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
                      {pkg.badgeLabel}
                    </span>
                  ) : null}
                </div>
                {blurb ? (
                  <p className="mt-2 line-clamp-3 text-sm text-muted">{blurb}</p>
                ) : null}
                <div className="mt-3 text-sm text-foreground">
                  <p className="font-medium">{formatEgp(pkg.packagePrice)}</p>
                  {pkg.durationMinutes ? (
                    <p className="mt-1 text-muted">
                      Approx. {pkg.durationMinutes} minutes
                    </p>
                  ) : null}
                </div>
                {featureList.length > 0 ? (
                  <ul className="mt-4 space-y-2 text-sm text-foreground">
                    {featureList.map((f) => (
                      <li key={f.id} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                        <span>{f.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Link
                  href={`/booking?packageId=${pkg.id}`}
                  className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Book Appointment
                </Link>
              </article>
            );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
