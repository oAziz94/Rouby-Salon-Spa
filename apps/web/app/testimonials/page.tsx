import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { getPublicTestimonials } from "@/lib/api/public";

function getErrorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  return "Unable to load this section right now.";
}

function renderStars(rating: number): string {
  const normalized = Math.min(5, Math.max(1, Math.floor(rating)));
  return "★".repeat(normalized);
}

export default async function TestimonialsPage() {
  const testimonialsResult = await Promise.allSettled([getPublicTestimonials()]);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-14 sm:px-6 lg:px-10">
      <section className="rounded-2xl border border-border bg-card p-7">
        <h1 className="font-heading text-4xl text-primary">Testimonials</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Hear from clients who trusted Alrouby Salon & Spa for their wellness
          and beauty journey.
        </p>
      </section>

      <section className="mt-8">
        {testimonialsResult[0].status === "rejected" ? (
          <ErrorState message={getErrorMessage(testimonialsResult[0].reason)} />
        ) : testimonialsResult[0].value.data.length === 0 ? (
          <EmptyState
            title="No testimonials available"
            description="Curated testimonials appear here when a homepage testimonial is selected in the dashboard."
          />
        ) : (
          <div className="mx-auto max-w-xl space-y-6">
            {testimonialsResult[0].value.data.map((review, index) => (
              <article
                key={`testimonial-${index}`}
                className="rounded-xl border border-border bg-card p-5"
              >
                <p className="text-sm text-accent">{renderStars(review.rating)}</p>
                <p className="mt-3 text-sm leading-relaxed text-foreground">
                  {review.quote || "Client testimonial"}
                </p>
                <p className="mt-4 text-xs uppercase tracking-[0.12em] text-muted">
                  {review.clientName}
                  {review.clientTitle ? ` · ${review.clientTitle}` : ""}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
