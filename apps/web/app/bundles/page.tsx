import Link from "next/link";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { getPublicBundles } from "@/lib/api/public";
import { formatEgp } from "@/lib/format/currency";

function getErrorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  return "Unable to load this section right now.";
}

export default async function BundlesPage() {
  const bundlesResult = await Promise.allSettled([getPublicBundles()]);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-14 sm:px-6 lg:px-10">
      <section className="rounded-2xl border border-border bg-card p-7">
        <h1 className="font-heading text-4xl text-primary">Signature Bundles</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Flexible bundle offers to mix and match your preferred treatments.
        </p>
      </section>

      <section className="mt-8">
        {bundlesResult[0].status === "rejected" ? (
          <ErrorState message={getErrorMessage(bundlesResult[0].reason)} />
        ) : bundlesResult[0].value.data.length === 0 ? (
          <EmptyState
            title="No bundles available"
            description="Bundles will appear here when published."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bundlesResult[0].value.data.map((bundle) => (
              <article
                key={bundle.id}
                className="rounded-xl border border-border bg-card p-5"
              >
                <h2 className="font-heading text-2xl text-primary">{bundle.name}</h2>
                {bundle.description ? (
                  <p className="mt-2 line-clamp-3 text-sm text-muted">
                    {bundle.description}
                  </p>
                ) : null}
                <div className="mt-3 text-sm text-foreground">
                  <p className="font-medium">{formatEgp(bundle.price)}</p>
                  <p className="mt-1 text-muted">
                    Type: {bundle.bundleType.replaceAll("_", " ")}
                  </p>
                  {bundle.selectableCount ? (
                    <p className="mt-1 text-muted">
                      Selectable services: {bundle.selectableCount}
                    </p>
                  ) : null}
                </div>
                <Link
                  href={`/booking?bundleId=${bundle.id}`}
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
