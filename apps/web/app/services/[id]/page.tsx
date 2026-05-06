import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import {
  getPublicServiceById,
  getPublicServiceVariants,
} from "@/lib/api/public";
import { ApiRequestError } from "@/lib/api/http";
import { formatEgp } from "@/lib/format/currency";

type ServiceDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function getErrorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  return "Unable to load this section right now.";
}

export default async function ServiceDetailPage({
  params,
}: ServiceDetailPageProps) {
  const { id } = await params;

  let service;
  try {
    service = await getPublicServiceById(id);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const variantsResult = await Promise.allSettled([getPublicServiceVariants(id)]);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-14 sm:px-6 lg:px-10">
      <section className="rounded-2xl border border-border bg-card p-7">
        <p className="text-xs uppercase tracking-[0.14em] text-accent">
          {service.categoryName}
        </p>
        <h1 className="mt-3 font-heading text-4xl text-primary">{service.name}</h1>
        {service.description ? (
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
            {service.description}
          </p>
        ) : null}
        <div className="mt-5 grid gap-2 text-sm text-foreground">
          <p>
            <span className="font-medium">Price:</span> {formatEgp(service.basePrice)}
          </p>
          {service.durationMinutes ? (
            <p>
              <span className="font-medium">Duration:</span> Approx.{" "}
              {service.durationMinutes} minutes
            </p>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={`/booking?serviceId=${service.id}`}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Book Appointment
          </Link>
          <Link
            href="/services"
            className="rounded-lg border border-primary px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            Back to Services
          </Link>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-border bg-card p-7">
        <h2 className="font-heading text-3xl text-primary">Service Variants</h2>
        {variantsResult[0].status === "rejected" ? (
          <div className="mt-5">
            <ErrorState message={getErrorMessage(variantsResult[0].reason)} />
          </div>
        ) : variantsResult[0].value.data.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title="No variants available"
              description="This service currently has no published variants."
            />
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {variantsResult[0].value.data.map((variant) => (
              <article
                key={variant.id}
                className="rounded-xl border border-border bg-background p-5"
              >
                <h3 className="font-heading text-2xl text-primary">{variant.name}</h3>
                {variant.description ? (
                  <p className="mt-2 text-sm text-muted">{variant.description}</p>
                ) : null}
                <div className="mt-3 text-sm text-foreground">
                  <p className="font-medium">{formatEgp(variant.price)}</p>
                  {variant.durationMinutes ? (
                    <p className="mt-1 text-muted">
                      Approx. {variant.durationMinutes} minutes
                    </p>
                  ) : null}
                </div>
                <Link
                  href={`/booking?serviceId=${service.id}&variantId=${variant.id}`}
                  className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Select for Booking
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
