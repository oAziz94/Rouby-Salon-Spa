import Link from "next/link";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import {
  getPublicBranches,
  getPublicBundles,
  getPublicGallery,
  getPublicOffers,
  getPublicPackages,
  getPublicServices,
  getPublicSiteContent,
  getPublicTestimonials,
  type PublicBranch,
  type PublicSiteContent,
} from "@/lib/api/public";
import { formatEgp } from "@/lib/format/currency";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function toWhatsAppLink(phone: string, text: string): string {
  const cleaned = phone.replace(/[^\d]/g, "");
  const params = new URLSearchParams({ text });
  return `https://wa.me/${cleaned}?${params.toString()}`;
}

function getErrorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  return "Unable to load this section right now.";
}

function getHeroData(siteContent: PublicSiteContent | null) {
  const hero = asRecord(siteContent?.homeHero);
  return {
    heading: readString(hero.heading) ?? "Premium Beauty & Wellness Experience",
    subheading:
      readString(hero.subheading) ??
      "Explore services, packages, and bundles, then submit your booking request with confidence.",
    ctaLabel: readString(hero.ctaLabel) ?? "Book Appointment",
    secondaryCtaLabel: readString(hero.secondaryCtaLabel) ?? "View Services",
  };
}

function getAboutData(siteContent: PublicSiteContent | null) {
  const about = asRecord(siteContent?.aboutSection);
  return {
    title: readString(about.title) ?? "Botanical Spa Experience",
    description:
      readString(about.description) ??
      "Discover a curated wellness journey tailored for your comfort and style.",
    highlights: readStringArray(about.highlights),
  };
}

function ContactPreview({
  branch,
  siteContent,
}: {
  branch: PublicBranch | null;
  siteContent: PublicSiteContent | null;
}) {
  const contact = asRecord(siteContent?.contactSection);
  const address = branch?.address ?? readString(contact.address);
  const phone = branch?.phone ?? readString(contact.phone);
  const whatsapp = branch?.whatsapp ?? readString(contact.whatsapp);
  const openingHours = readString(contact.openingHours);

  if (!address && !phone && !whatsapp && !openingHours) {
    return (
      <EmptyState
        title="Contact details unavailable"
        description="Visit us details will appear here when contact data is published."
      />
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-7">
      <h2 className="font-heading text-3xl text-primary">Visit Us</h2>
      <div className="mt-5 grid gap-3 text-sm text-muted">
        {address ? <p><span className="font-medium text-foreground">Address:</span> {address}</p> : null}
        {phone ? <p><span className="font-medium text-foreground">Phone:</span> {phone}</p> : null}
        {openingHours ? (
          <p>
            <span className="font-medium text-foreground">Opening hours:</span>{" "}
            {openingHours}
          </p>
        ) : null}
      </div>
      {whatsapp ? (
        <a
          href={toWhatsAppLink(
            whatsapp,
            "Hello, I would like to ask about visiting Alrouby Salon & Spa.",
          )}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          WhatsApp Us
        </a>
      ) : null}
    </section>
  );
}

export default async function HomePage() {
  const [
    siteContentResult,
    servicesResult,
    packagesResult,
    bundlesResult,
    offersResult,
    galleryResult,
    testimonialsResult,
    branchesResult,
  ] = await Promise.allSettled([
    getPublicSiteContent(),
    getPublicServices(),
    getPublicPackages(),
    getPublicBundles(),
    getPublicOffers(),
    getPublicGallery(),
    getPublicTestimonials(),
    getPublicBranches(),
  ]);

  const siteContent =
    siteContentResult.status === "fulfilled" ? siteContentResult.value : null;
  const hero = getHeroData(siteContent);
  const about = getAboutData(siteContent);
  const branches =
    branchesResult.status === "fulfilled" ? branchesResult.value : [];
  const primaryBranch = branches[0] ?? null;

  return (
    <div className="bg-background">
      <section className="border-b border-border bg-gradient-to-b from-card to-background">
        <div className="mx-auto w-full max-w-[1280px] px-4 py-24 sm:px-6 lg:px-10">
          <p className="text-xs uppercase tracking-[0.16em] text-accent">
            Premium Botanical Luxury
          </p>
          <h1 className="mt-5 max-w-4xl font-heading text-4xl leading-tight text-primary sm:text-5xl lg:text-6xl">
            {hero.heading}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            {hero.subheading}
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/booking"
              className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {hero.ctaLabel}
            </Link>
            <Link
              href="/services"
              className="rounded-lg border border-primary px-6 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              {hero.secondaryCtaLabel}
            </Link>
          </div>
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-4 py-14 sm:px-6 lg:px-10">
        <section>
          <h2 className="font-heading text-3xl text-primary">Featured Services</h2>
          {servicesResult.status === "rejected" ? (
            <div className="mt-5">
              <ErrorState message={getErrorMessage(servicesResult.reason)} />
            </div>
          ) : servicesResult.value.data.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="No services available"
                description="Featured services will appear here when published."
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {servicesResult.value.data.slice(0, 4).map((service) => (
                <article key={service.id} className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-heading text-xl text-primary">{service.name}</h3>
                  {service.description ? (
                    <p className="mt-2 line-clamp-3 text-sm text-muted">{service.description}</p>
                  ) : null}
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {formatEgp(service.basePrice)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-heading text-3xl text-primary">Wellness Packages</h2>
          {packagesResult.status === "rejected" ? (
            <div className="mt-5">
              <ErrorState message={getErrorMessage(packagesResult.reason)} />
            </div>
          ) : packagesResult.value.data.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="No packages available"
                description="Wellness packages will appear here when published."
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {packagesResult.value.data.slice(0, 3).map((pkg) => (
                <article key={pkg.id} className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-heading text-xl text-primary">{pkg.name}</h3>
                  {pkg.description ? (
                    <p className="mt-2 line-clamp-3 text-sm text-muted">{pkg.description}</p>
                  ) : null}
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {formatEgp(pkg.packagePrice)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-heading text-3xl text-primary">Signature Bundles</h2>
          {bundlesResult.status === "rejected" ? (
            <div className="mt-5">
              <ErrorState message={getErrorMessage(bundlesResult.reason)} />
            </div>
          ) : bundlesResult.value.data.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="No bundles available"
                description="Signature bundles will appear here when published."
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {bundlesResult.value.data.slice(0, 3).map((bundle) => (
                <article key={bundle.id} className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-heading text-xl text-primary">{bundle.name}</h3>
                  {bundle.description ? (
                    <p className="mt-2 line-clamp-3 text-sm text-muted">{bundle.description}</p>
                  ) : null}
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {formatEgp(bundle.price)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-heading text-3xl text-primary">Current Offers</h2>
          {offersResult.status === "rejected" ? (
            <div className="mt-5">
              <ErrorState message={getErrorMessage(offersResult.reason)} />
            </div>
          ) : offersResult.value.data.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="No current offers"
                description="Current offers will appear here when active offers are published."
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {offersResult.value.data.slice(0, 3).map((offer) => (
                <article key={offer.id} className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-heading text-xl text-primary">{offer.name}</h3>
                  <p className="mt-2 text-sm text-muted">
                    {offer.offerCode ? `Code: ${offer.offerCode}` : "Special offer"}
                  </p>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {typeof offer.discountValue === "number"
                      ? `${offer.discountValue} (${offer.discountType})`
                      : offer.discountType}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-7">
          <h2 className="font-heading text-3xl text-primary">Why Choose Alrouby</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">Published Services</p>
              <p className="mt-2 text-2xl font-semibold text-primary">
                {servicesResult.status === "fulfilled" ? servicesResult.value.meta?.totalItems ?? servicesResult.value.data.length : "—"}
              </p>
            </article>
            <article className="rounded-xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">Packages</p>
              <p className="mt-2 text-2xl font-semibold text-primary">
                {packagesResult.status === "fulfilled" ? packagesResult.value.meta?.totalItems ?? packagesResult.value.data.length : "—"}
              </p>
            </article>
            <article className="rounded-xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">Bundles</p>
              <p className="mt-2 text-2xl font-semibold text-primary">
                {bundlesResult.status === "fulfilled" ? bundlesResult.value.meta?.totalItems ?? bundlesResult.value.data.length : "—"}
              </p>
            </article>
            <article className="rounded-xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">Active Offers</p>
              <p className="mt-2 text-2xl font-semibold text-primary">
                {offersResult.status === "fulfilled" ? offersResult.value.meta?.totalItems ?? offersResult.value.data.length : "—"}
              </p>
            </article>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-7">
          <h2 className="font-heading text-3xl text-primary">{about.title}</h2>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
            {about.description}
          </p>
          {about.highlights.length > 0 ? (
            <ul className="mt-5 grid gap-2 text-sm text-foreground sm:grid-cols-2">
              {about.highlights.map((highlight) => (
                <li key={highlight} className="rounded-lg bg-background px-3 py-2">
                  {highlight}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section>
          <h2 className="font-heading text-3xl text-primary">Gallery Preview</h2>
          {galleryResult.status === "rejected" ? (
            <div className="mt-5">
              <ErrorState message={getErrorMessage(galleryResult.reason)} />
            </div>
          ) : galleryResult.value.data.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="No gallery items available"
                description="Gallery previews will appear here when images are published."
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {galleryResult.value.data.slice(0, 4).map((item) => (
                <article key={item.id} className="overflow-hidden rounded-xl border border-border bg-card">
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
                    <p className="font-medium text-primary">{item.title ?? "Gallery"}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-heading text-3xl text-primary">Testimonials Preview</h2>
          {testimonialsResult.status === "rejected" ? (
            <div className="mt-5">
              <ErrorState message={getErrorMessage(testimonialsResult.reason)} />
            </div>
          ) : testimonialsResult.value.data.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="No testimonials available"
                description="Testimonials will appear here when approved for website display."
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {testimonialsResult.value.data.slice(0, 3).map((review) => (
                <article key={review.id} className="rounded-xl border border-border bg-card p-5">
                  <p className="text-sm text-muted">{"★".repeat(Math.max(1, review.rating))}</p>
                  <p className="mt-3 text-sm leading-relaxed text-foreground">
                    {review.comment ?? "Client testimonial"}
                  </p>
                  <p className="mt-3 text-xs font-medium uppercase tracking-[0.1em] text-muted">
                    {review.clientName}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        {siteContentResult.status === "rejected" && branchesResult.status === "rejected" ? (
          <ErrorState message="Unable to load contact preview right now." />
        ) : (
          <ContactPreview branch={primaryBranch} siteContent={siteContent} />
        )}
      </main>
    </div>
  );
}
