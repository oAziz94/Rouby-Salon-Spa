import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { getPublicGallery } from "@/lib/api/public";

function getErrorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  return "Unable to load this section right now.";
}

export default async function GalleryPage() {
  const galleryResult = await Promise.allSettled([getPublicGallery()]);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-14 sm:px-6 lg:px-10">
      <section className="rounded-2xl border border-border bg-card p-7">
        <h1 className="font-heading text-4xl text-primary">Gallery</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Explore moments from our botanical luxury salon and spa experiences.
        </p>
      </section>

      <section className="mt-8">
        {galleryResult[0].status === "rejected" ? (
          <ErrorState message={getErrorMessage(galleryResult[0].reason)} />
        ) : galleryResult[0].value.data.length === 0 ? (
          <EmptyState
            title="No gallery items available"
            description="Gallery images will appear here when published."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {galleryResult[0].value.data.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <div className="aspect-[4/3] bg-background">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.title ?? "Gallery image"}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="p-4">
                  <h2 className="font-heading text-xl text-primary">
                    {item.title ?? "Gallery item"}
                  </h2>
                  {item.category ? (
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted">
                      {item.category}
                    </p>
                  ) : null}
                  {item.description ? (
                    <p className="mt-3 text-sm text-muted">{item.description}</p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
