import Link from "next/link";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import {
  getPublicCategories,
  getPublicServices,
  type PublicCategory,
} from "@/lib/api/public";
import { formatEgp } from "@/lib/format/currency";

type ServicesPageProps = {
  searchParams: Promise<{
    categoryId?: string;
  }>;
};

function getErrorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  return "Unable to load this section right now.";
}

export default async function ServicesPage({ searchParams }: ServicesPageProps) {
  const { categoryId } = await searchParams;

  const [categoriesResult, servicesResult] = await Promise.allSettled([
    getPublicCategories(),
    getPublicServices({ categoryId, pageSize: 24 }),
  ]);

  const categories =
    categoriesResult.status === "fulfilled" ? categoriesResult.value.data : [];

  const selectedCategoryName =
    categoryId && categories.length > 0
      ? (categories.find((category) => category.id === categoryId)?.name ?? null)
      : null;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-14 sm:px-6 lg:px-10">
      <section className="rounded-2xl border border-border bg-card p-7">
        <h1 className="font-heading text-4xl text-primary">Services</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Browse our curated salon and spa services and prepare your booking
          request.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/services"
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
              !categoryId
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-primary hover:border-primary"
            }`}
          >
            All
          </Link>
          {categories.map((category: PublicCategory) => {
            const active = categoryId === category.id;
            return (
              <Link
                key={category.id}
                href={`/services?categoryId=${category.id}`}
                className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-primary hover:border-primary"
                }`}
              >
                {category.name}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        {selectedCategoryName ? (
          <p className="mb-4 text-sm text-muted">
            Showing category:{" "}
            <span className="font-medium text-foreground">{selectedCategoryName}</span>
          </p>
        ) : null}

        {servicesResult.status === "rejected" ? (
          <ErrorState message={getErrorMessage(servicesResult.reason)} />
        ) : servicesResult.value.data.length === 0 ? (
          <EmptyState
            title="No services available"
            description="Services for this selection are not available yet."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {servicesResult.value.data.map((service) => (
              <article key={service.id} className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-heading text-2xl text-primary">{service.name}</h2>
                {service.description ? (
                  <p className="mt-2 line-clamp-3 text-sm text-muted">
                    {service.description}
                  </p>
                ) : null}
                <div className="mt-3 text-sm text-foreground">
                  <p className="font-medium">{formatEgp(service.basePrice)}</p>
                  {service.durationMinutes ? (
                    <p className="mt-1 text-muted">
                      Approx. {service.durationMinutes} minutes
                    </p>
                  ) : null}
                </div>
                <div className="mt-5 flex gap-2">
                  <Link
                    href={`/services/${service.id}`}
                    className="rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    View Details
                  </Link>
                  <Link
                    href={`/booking?serviceId=${service.id}`}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Book Appointment
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
