import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { FaFacebookF, FaInstagram } from "react-icons/fa6";
import {
  ArrowRight,
  Award,
  Check,
  ChevronRight,
  Clock3,
  Crown,
  Gem,
  Leaf,
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import fs from "node:fs";
import path from "node:path";
import {
  getPublicGallery,
  getPublicPackages,
  getPublicServices,
  getPublicSiteContent,
  getPublicTestimonials,
  type PublicService,
  type PublicSiteContent,
} from "@/lib/api/public";
import {
  mergeHomeExperience,
  mergeHomeFooterStrip,
  mergeHomeHero,
  mergeHomeWellnessCta,
  mergeHomeWhyChoose,
} from "@/lib/website-public-merge";
import { formatEgp } from "@/lib/format/currency";

/** First filename match wins. Files live under apps/web/public/brand/. */
const DEDICATED_HERO_FILENAMES = ["home-hero.webp", "home-hero.jpg", "home-hero.jpeg", "home-hero.png"] as const;

/** “Signature Wellness Rituals…” / The Alrouby Experience section (right-hand image). */
const DEDICATED_EXPERIENCE_FILENAMES = [
  "home-experience.webp",
  "home-experience.jpg",
  "home-experience.jpeg",
  "home-experience.png",
] as const;

function resolveBrandImageUrl(filenames: readonly string[]): string | null {
  const brandDir = path.join(process.cwd(), "public", "brand");
  for (const name of filenames) {
    try {
      if (fs.existsSync(path.join(brandDir, name))) {
        return `/brand/${name}`;
      }
    } catch {
      // ignore FS errors
    }
  }
  return null;
}

function getDedicatedHeroImageUrl(): string | null {
  return resolveBrandImageUrl(DEDICATED_HERO_FILENAMES);
}

function getDedicatedExperienceImageUrl(): string | null {
  return resolveBrandImageUrl(DEDICATED_EXPERIENCE_FILENAMES);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getErrorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  return "Unable to load this section right now.";
}

const HOME_ICONS: Record<string, LucideIcon> = {
  Leaf,
  Crown,
  ShieldCheck,
  Award,
  Sparkles,
  Gem,
  Clock3,
  Users,
};

function getImagePool(galleryUrls: string[], serviceUrls: string[], packageUrls: string[]) {
  return [...galleryUrls, ...serviceUrls, ...packageUrls].filter(Boolean);
}

function formatServicePriceLabel(basePrice: number | null) {
  if (typeof basePrice !== "number") {
    return "By consultation";
  }
  return formatEgp(basePrice);
}

function formatPackagePriceLabel(packagePrice: number | null) {
  if (typeof packagePrice !== "number") {
    return "Custom package";
  }
  return formatEgp(packagePrice);
}

function formatDurationLabel(durationMinutes: number | null) {
  if (typeof durationMinutes !== "number" || durationMinutes <= 0) {
    return null;
  }
  if (durationMinutes < 60) {
    return `${durationMinutes} min`;
  }
  const hours = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

function getSocialLinks(siteContent: PublicSiteContent | null) {
  const social = asRecord(siteContent?.socialLinks);
  return {
    instagram: readString(social.instagram),
    facebook: readString(social.facebook),
  };
}

export default async function HomePage() {
  const [
    siteContentResult,
    servicesResult,
    featuredServicesResult,
    packagesResult,
    galleryResult,
    testimonialsResult,
  ] = await Promise.allSettled([
    getPublicSiteContent(),
    getPublicServices({ pageSize: 100 }),
    getPublicServices({ pageSize: 24, isFeatured: true }),
    getPublicPackages(),
    getPublicGallery(),
    getPublicTestimonials(),
  ]);

  const siteContent =
    siteContentResult.status === "fulfilled" ? siteContentResult.value : null;
  const hero = mergeHomeHero(siteContent);
  const whyChoose = mergeHomeWhyChoose(siteContent);
  const experienceBlock = mergeHomeExperience(siteContent);
  const wellnessCta = mergeHomeWellnessCta(siteContent);
  const homeFooterLine = mergeHomeFooterStrip(siteContent).line;
  const social = getSocialLinks(siteContent);
  const services = servicesResult.status === "fulfilled" ? servicesResult.value.data : [];
  const featuredServicesPool =
    featuredServicesResult.status === "fulfilled" ? featuredServicesResult.value.data : [];
  const packages = packagesResult.status === "fulfilled" ? packagesResult.value.data : [];
  const gallery = galleryResult.status === "fulfilled" ? galleryResult.value.data : [];
  const testimonials =
    testimonialsResult.status === "fulfilled" ? testimonialsResult.value.data : [];

  function sortServicesForDisplay(a: PublicService, b: PublicService): number {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.name.localeCompare(b.name);
  }

  const visibleServices =
    featuredServicesPool.length > 0
      ? [...featuredServicesPool].sort(sortServicesForDisplay).slice(0, 4)
      : services.slice(0, 4);

  const imagePool = getImagePool(
    gallery.map((item) => item.imageUrl).filter(Boolean),
    services.map((item) => item.imageUrl).filter((url): url is string => Boolean(url)),
    packages.map((item) => item.imageUrl).filter((url): url is string => Boolean(url)),
  );

  /** CMS / gallery-attached hero wins over static brand files so dashboard “attach to hero” updates the site. */
  const heroImageSrc =
    hero.heroImageUrl ?? getDedicatedHeroImageUrl() ?? imagePool[0] ?? null;
  const experienceSectionImageSrc =
    (experienceBlock.visible ? experienceBlock.imageUrl : null) ??
    hero.experienceImageUrl ??
    getDedicatedExperienceImageUrl() ??
    imagePool[1] ??
    heroImageSrc ??
    null;
  const visiblePackages = packages.slice(0, 3);
  const heroReview = testimonials[0] ?? null;

  const serviceLuxurySubtitles = [
    "Tailored glow therapy",
    "Deep relaxation ritual",
    "Refined hand artistry",
    "Renewing body release",
  ];

  return (
    <div className="bg-[#fdf8f1] text-[#1b3d29]">
      <section className="border-b border-[#e4d8c4] bg-gradient-to-b from-[#fbf5ea] to-[#fdf8f1]">
        <div className="mx-auto grid w-full max-w-[1280px] gap-10 px-4 py-16 sm:px-6 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:px-10 lg:py-24">
          <div className="flex flex-col justify-center">
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-[#dcc9a5] bg-[#f8efdd] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a4782f]">
              <Sparkles className="h-3.5 w-3.5 text-[#b9974a]" aria-hidden />
              {hero.eyebrow}
            </p>
            <h1 className="mt-6 max-w-xl font-heading text-4xl leading-[1.08] text-primary sm:text-5xl lg:text-6xl">
              {hero.heading}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[#5f6c61] sm:text-lg">
              {hero.subheading}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={hero.ctaHref}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[0_12px_24px_rgba(23,53,31,0.24)] transition-transform hover:-translate-y-0.5"
              >
                {hero.ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={hero.secondaryCtaHref}
                className="inline-flex items-center gap-2 rounded-full border border-[#dcc9a5] bg-[#fffaf0] px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-[#f8efdd]"
              >
                {hero.secondaryCtaLabel}
                <ChevronRight className="h-4 w-4 text-[#b9974a]" />
              </Link>
            </div>
            <div className="mt-8 grid max-w-xl grid-cols-1 gap-3 text-sm text-[#4f5c52] sm:grid-cols-3">
              {hero.microBenefits.map((benefit) => {
                const MicIcon = HOME_ICONS[benefit.iconKey] ?? Sparkles;
                return (
                  <p
                    key={benefit.text}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#e8dbc4] bg-[#fff9ef] px-3 py-2"
                  >
                    <MicIcon className="h-4 w-4 text-[#b9974a]" />
                    <span>{benefit.text}</span>
                  </p>
                );
              })}
            </div>
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-[2rem] border border-[#e8dbc4] bg-[#f3ebdd] shadow-[0_24px_40px_rgba(26,40,28,0.17)]">
              {heroImageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroImageSrc}
                  alt="Spa treatment room ambiance"
                  className="h-full min-h-[380px] w-full object-cover lg:min-h-[520px]"
                />
              ) : (
                <div
                  className="flex min-h-[380px] w-full items-center justify-center bg-gradient-to-br from-[#e8dcc4] to-[#d4c4a8] lg:min-h-[520px]"
                  aria-hidden
                />
              )}
            </div>
            {heroReview ? (
              <article className="absolute -bottom-6 left-4 right-4 rounded-2xl border border-[#e7d8bf] bg-[#fffaf1]/95 p-5 shadow-[0_16px_30px_rgba(18,34,22,0.2)] backdrop-blur sm:left-8 sm:right-8">
                <div className="flex items-center justify-between">
                  <p className="inline-flex items-center gap-1.5 text-sm text-[#a4782f]">
                    {Array.from({
                      length: Math.max(1, Math.min(5, heroReview.rating)),
                    }).map((_, idx) => (
                      <Star
                        key={`hero-star-${idx}`}
                        className="h-4 w-4 fill-[#c79d4a] text-[#c79d4a]"
                      />
                    ))}
                  </p>
                  <Quote className="h-5 w-5 text-[#b9974a]" />
                </div>
                <p className="mt-2 text-sm font-medium text-[#314439]">
                  {heroReview.quote || "A truly serene luxury experience with beautiful service quality."}
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.11em] text-[#5f6c61]">
                  {heroReview.clientName}
                  {heroReview.clientTitle ? ` · ${heroReview.clientTitle}` : ""}
                </p>
              </article>
            ) : null}
          </div>
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-[4.5rem] px-4 py-14 sm:px-6 lg:gap-[5.5rem] lg:px-10 lg:py-[4.5rem]">
        <section>
          <div className="text-center">
            <h2 className="font-heading text-3xl text-primary sm:text-4xl">Featured Services</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[#5f6c61] sm:text-base">
              Signature treatments designed as elegant rituals with visible results.
            </p>
          </div>
          <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {visibleServices.length === 0 ? (
              <p className="col-span-full rounded-2xl border border-[#e7d8bf] bg-[#fffdf8] px-6 py-10 text-center text-sm text-[#5f6c61]">
                Featured services will appear here once they are published in the catalog.
              </p>
            ) : (
              visibleServices.map((service, index) => {
                const badgeText = service.badgeLabel?.trim() ?? "";
                return (
              <article
                key={service.id}
                className={`group overflow-hidden rounded-[1.4rem] border border-[#e7d8bf] bg-[#fff9ef] shadow-[0_14px_30px_rgba(42,62,46,0.12)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_22px_40px_rgba(42,62,46,0.2)] ${
                  service.isFeatured ? "ring-2 ring-[#d7b87a]/55" : ""
                }`}
              >
                <div className="relative aspect-[5/4] overflow-hidden bg-gradient-to-br from-[#f3e8d4] to-[#e8dcc4]">
                  {service.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={service.imageUrl}
                      alt={
                        "imageAlt" in service && service.imageAlt
                          ? service.imageAlt
                          : service.name
                      }
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-4 text-center">
                      <span className="font-heading text-3xl font-semibold text-primary/35">
                        {service.name.trim().slice(0, 1).toUpperCase()}
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#8a6f3e]/90">
                        Al Rouby
                      </span>
                    </div>
                  )}
                  {badgeText ? (
                    <span className="absolute left-3 top-3 max-w-[calc(100%-5rem)] truncate rounded-full border border-[#e2cea9] bg-[#fff8eb]/95 px-3 py-1 text-xs font-semibold text-primary shadow-sm">
                      {badgeText}
                    </span>
                  ) : null}
                  <span className="absolute right-3 top-3 rounded-full border border-[#e2cea9] bg-[#fff8eb]/95 px-3 py-1 text-xs font-semibold text-primary shadow-sm">
                    {formatServicePriceLabel(service.basePrice)}
                  </span>
                </div>
                <div className="space-y-2 p-5">
                  <h3 className="font-heading text-xl text-primary">{service.name}</h3>
                  <p className="text-sm text-[#5f6c61]">
                    {service.description?.slice(0, 68) ??
                      serviceLuxurySubtitles[index % serviceLuxurySubtitles.length]}
                  </p>
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.09em] text-[#a4782f]">
                    <span>
                      {badgeText
                        ? "Luxury Ritual"
                        : service.isFeatured
                          ? "Featured"
                          : "Luxury Ritual"}
                    </span>
                    {formatDurationLabel(service.durationMinutes) ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatDurationLabel(service.durationMinutes)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </article>
              );
              })
            )}
          </div>
          <div className="mt-7 flex justify-center">
            <Link
              href="/services"
              className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              View All Services
            </Link>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[#e8dbc4] bg-[#faf2e5] px-4 py-10 sm:px-8">
          <div className="text-center">
            <h2 className="font-heading text-3xl text-primary sm:text-4xl">Wellness Packages</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[#5f6c61] sm:text-base">
              Curated wellness journeys designed for indulgence, restoration, and glow.
            </p>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {visiblePackages.length === 0 ? (
              <p className="col-span-full rounded-2xl border border-[#e7d8bf] bg-[#fffdf8] px-6 py-10 text-center text-sm text-[#5f6c61]">
                Packages will appear here when they are published in the catalog.
              </p>
            ) : (
              visiblePackages.map((pkg) => {
              const isFeaturedCard = pkg.isFeatured;
              const ribbonLabel = pkg.badgeLabel ?? (isFeaturedCard ? "Featured" : null);
              const trimmedDesc = pkg.description?.trim();
              const blurb =
                pkg.shortDescription?.trim() ||
                (trimmedDesc && trimmedDesc.length > 0 ? trimmedDesc.slice(0, 120) : null);
              const durationLabel = formatDurationLabel(pkg.durationMinutes);
              const featureList = pkg.features ?? [];
              return (
                <article
                  key={pkg.id}
                  className={`relative rounded-[1.6rem] border p-6 shadow-[0_16px_30px_rgba(42,62,46,0.13)] ${
                    isFeaturedCard
                      ? "border-[#d7b87a] bg-[#fff9ee] md:-translate-y-2"
                      : "border-[#e7d8bf] bg-[#fffdf8]"
                  }`}
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#b9974a] via-[#e6cc95] to-[#b9974a]" />
                  {ribbonLabel ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#b9974a] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#fffaf1]">
                      {ribbonLabel}
                    </span>
                  ) : null}
                  <h3 className="font-heading text-2xl text-primary">{pkg.name}</h3>
                  {blurb ? (
                    <p className="mt-2 text-sm text-[#5f6c61]">{blurb}</p>
                  ) : null}
                  <p className="mt-5 text-4xl font-semibold text-primary">
                    {formatPackagePriceLabel(pkg.packagePrice)}
                  </p>
                  {durationLabel ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#a4782f]">
                      <Clock3 className="h-3.5 w-3.5" />
                      {durationLabel}
                    </p>
                  ) : null}
                  {featureList.length > 0 ? (
                    <ul className="mt-5 space-y-2 text-left text-sm text-[#3f5145]">
                      {featureList.map((item) => (
                        <li key={`${pkg.id}-${item.id}`} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#b9974a]" />
                          <span>{item.label}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <Link
                    href={`/booking?packageId=${pkg.id}`}
                    className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                      isFeaturedCard
                        ? "bg-primary text-primary-foreground hover:opacity-90"
                        : "border border-[#d7c39c] bg-[#fff8eb] text-primary hover:bg-[#f8efdd]"
                    }`}
                  >
                    Book Your Escape
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </article>
              );
              })
            )}
          </div>
          <div className="mt-7 flex justify-center">
            <Link
              href="/packages"
              className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Explore All Packages
            </Link>
          </div>
        </section>

        {whyChoose.visible ? (
        <section>
          <div className="text-center">
            <h2 className="font-heading text-3xl text-primary sm:text-4xl">{whyChoose.title}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[#5f6c61] sm:text-base">
              {whyChoose.subtitle}
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {whyChoose.items.map((benefit) => {
              const BIcon = HOME_ICONS[benefit.iconKey] ?? Leaf;
              return (
              <article
                key={benefit.title}
                className="rounded-2xl border border-[#e7d8bf] bg-[#fff9ef] p-5 shadow-[0_12px_24px_rgba(42,62,46,0.1)]"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#b9974a] text-[#fffaf1] shadow-[0_8px_14px_rgba(161,122,45,0.28)]">
                  <BIcon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-heading text-xl text-primary">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#5f6c61]">{benefit.text}</p>
              </article>
              );
            })}
          </div>
        </section>
        ) : null}

        {experienceBlock.visible ? (
        <section className="grid gap-6 rounded-[2rem] border border-[#e6d6ba] bg-[#fff8ec] p-5 shadow-[0_20px_34px_rgba(40,59,44,0.09)] sm:p-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="order-2 space-y-4 lg:order-1">
            <p className="inline-flex w-fit rounded-full border border-[#dcc9a5] bg-[#f8efdd] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a4782f]">
              {experienceBlock.eyebrow}
            </p>
            <h2 className="font-heading text-3xl leading-tight text-primary sm:text-4xl">
              {experienceBlock.title}
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-[#5f6c61] sm:text-base">
              {experienceBlock.subtitle}
            </p>
            <Link
              href={experienceBlock.ctaHref}
              className="inline-flex items-center gap-2 rounded-full border border-[#d7c39c] bg-[#fffaf0] px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-[#f4ead6]"
            >
              {experienceBlock.ctaLabel}
              <ArrowRight className="h-4 w-4 text-[#b9974a]" />
            </Link>
          </div>
          <div className="order-1 overflow-hidden rounded-[1.6rem] border border-[#e8dbc4] shadow-[0_18px_30px_rgba(26,40,28,0.16)] lg:order-2">
            {experienceSectionImageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={experienceSectionImageSrc}
                alt="The Alrouby signature wellness ritual"
                className="h-[280px] w-full object-cover sm:h-[340px] lg:h-[400px]"
              />
            ) : (
              <div
                className="h-[280px] w-full bg-gradient-to-br from-[#e8dcc4] to-[#d4c4a8] sm:h-[340px] lg:h-[400px]"
                aria-hidden
              />
            )}
          </div>
        </section>
        ) : null}

        {wellnessCta.visible ? (
        <section className="rounded-[2rem] bg-gradient-to-r from-[#13311d] to-[#1e4728] px-5 py-12 text-center text-[#f9f2e5] shadow-[0_24px_38px_rgba(14,31,20,0.3)] sm:px-10">
          <h2 className="font-heading text-3xl sm:text-4xl">{wellnessCta.title}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-[#d5dbc8] sm:text-base">
            {wellnessCta.subtitle}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={wellnessCta.ctaHref}
              className="inline-flex items-center gap-2 rounded-full bg-[#b9974a] px-6 py-3 text-sm font-semibold text-[#fffaf1] transition-opacity hover:opacity-90"
            >
              {wellnessCta.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={wellnessCta.secondaryCtaHref}
              className="rounded-full border border-[#d8c79f] px-6 py-3 text-sm font-semibold text-[#f9f2e5] transition-colors hover:bg-[#f9f2e5] hover:text-[#17351f]"
            >
              {wellnessCta.secondaryCtaLabel}
            </Link>
          </div>
          {(social.instagram ?? social.facebook) ? (
            <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs uppercase tracking-[0.12em]">
              {social.instagram ? (
                <a href={social.instagram} target="_blank" rel="noreferrer" className="hover:text-[#f2d38f]">
                  Instagram
                </a>
              ) : null}
              {social.facebook ? (
                <a href={social.facebook} target="_blank" rel="noreferrer" className="hover:text-[#f2d38f]">
                  Facebook
                </a>
              ) : null}
            </div>
          ) : null}
        </section>
        ) : null}
        <footer className="rounded-[1.6rem] border border-[#e6d6ba] bg-[#fffaf1] px-5 py-6 text-sm text-[#5f6c61] sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-medium text-[#3f5145]">{homeFooterLine}</p>
            <div className="flex items-center gap-3">
              {social.instagram ? (
                <a
                  href={social.instagram}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dcc9a5] bg-[#fff4df] text-[#b9974a] transition-colors hover:bg-[#f8ebd3]"
                >
                  <FaInstagram className="h-4 w-4" aria-hidden />
                </a>
              ) : null}
              {social.facebook ? (
                <a
                  href={social.facebook}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dcc9a5] bg-[#fff4df] text-[#b9974a] transition-colors hover:bg-[#f8ebd3]"
                >
                  <FaFacebookF className="h-4 w-4" aria-hidden />
                </a>
              ) : null}
            </div>
          </div>
        </footer>
        {servicesResult.status === "rejected" || packagesResult.status === "rejected" ? (
          <p className="text-center text-sm text-[#8a6f50]">
            Some homepage sections are showing graceful fallback content due to temporary API issues:{" "}
            {[servicesResult, packagesResult]
              .filter((result) => result.status === "rejected")
              .map((result) => getErrorMessage(result.reason))
              .join(" ")}
          </p>
        ) : null}
      </main>
    </div>
  );
}
