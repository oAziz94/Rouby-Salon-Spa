import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  Check,
  Clock3,
  Crown,
  Sparkles,
  Tag,
} from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import {
  getPublicOffers,
  getPublicPackages,
  type PublicOffer,
  type PublicPackage,
} from "@/lib/api/public";
import { formatEgp } from "@/lib/format/currency";

function getErrorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  return "Unable to load this section right now.";
}

function formatDurationLabel(durationMinutes: number | null | undefined): string | null {
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

function formatPriceLabel(price: number | null | undefined): string {
  if (typeof price !== "number") {
    return "By consultation";
  }
  return formatEgp(price);
}

function getSavingsAmount(
  originalPrice: number | null | undefined,
  packagePrice: number | null | undefined,
): number | null {
  if (
    typeof originalPrice !== "number" ||
    typeof packagePrice !== "number" ||
    originalPrice <= packagePrice
  ) {
    return null;
  }
  return originalPrice - packagePrice;
}

function formatValidityRange(start: string, end: string): string {
  const fallback = `${start.slice(0, 10)} – ${end.slice(0, 10)}`;
  try {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return fallback;
    }
    const formatter = new Intl.DateTimeFormat("en-GB", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
  } catch {
    return fallback;
  }
}

function formatDiscountLabel(offer: PublicOffer): string {
  const value = offer.discountValue ?? 0;
  if (offer.discountType === "PERCENTAGE") {
    return `${value}% off`;
  }
  return `${formatEgp(value)} off`;
}

const PILL_BASE =
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]";
const HERO_PILL =
  "inline-flex items-center gap-2 rounded-full border border-[#e2d0ab] bg-[#fff7e9] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a77b33]";
const EYEBROW =
  "text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a4782f]";

export default async function PackagesPage() {
  const [packagesResult, offersResult] = await Promise.allSettled([
    getPublicPackages(),
    getPublicOffers(),
  ]);
  const packagesData =
    packagesResult.status === "fulfilled" ? packagesResult.value.data : [];
  const offersData =
    offersResult.status === "fulfilled" ? offersResult.value.data : [];
  const featuredPackage = packagesData.find((pkg) => pkg.isFeatured) ?? null;

  return (
    <div className="bg-[#fcf7ef]">
      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-14 px-4 py-12 sm:px-6 sm:py-16 lg:gap-[4.5rem] lg:px-10">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-[2rem] border border-[#e6d8bf] bg-gradient-to-b from-[#f9f1e2] to-[#fdfaf3] px-6 py-12 text-center shadow-[0_20px_40px_rgba(26,40,28,0.12)] sm:px-10 sm:py-16">
          <div className="pointer-events-none absolute -right-20 top-0 h-52 w-52 rounded-full bg-[#d9be86]/25 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 bottom-0 h-52 w-52 rounded-full bg-[#2d5a3a]/10 blur-3xl" />
          <p className={`mx-auto ${HERO_PILL}`}>
            <Sparkles className="h-3.5 w-3.5" />
            Curated Wellness Journeys
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl font-heading text-4xl leading-[1.08] text-primary sm:text-5xl lg:text-6xl">
            Signature Packages
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-[#5f6c61] sm:text-base">
            Every Alrouby package is composed as an unhurried ritual — botanical care,
            expert hands, and preferred pricing — designed to leave you visibly restored.
          </p>
        </section>

        {/* Featured spotlight */}
        {featuredPackage ? (
          <FeaturedPackageSpotlight pkg={featuredPackage} />
        ) : null}

        {/* All packages grid */}
        <section>
          <div className="text-center">
            <h2 className="font-heading text-3xl text-primary sm:text-4xl">
              All Wellness Packages
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[#5f6c61] sm:text-base">
              Pricing rituals composed for every kind of renewal — from quick refreshes
              to full-day escapes.
            </p>
          </div>
          <div className="mt-10">
            {packagesResult.status === "rejected" ? (
              <ErrorState message={getErrorMessage(packagesResult.reason)} />
            ) : packagesData.length === 0 ? (
              <EmptyState
                title="No packages available"
                description="Packages will appear here when published."
              />
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {packagesData.map((pkg) => (
                  <PackageCard key={pkg.id} pkg={pkg} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Current Offers */}
        <section>
          <div className="text-center">
            <p className={`mx-auto ${HERO_PILL}`}>
              <BadgePercent className="h-3.5 w-3.5" />
              Limited-Time Offers
            </p>
            <h2 className="mt-5 font-heading text-3xl text-primary sm:text-4xl">
              Current Offers
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[#5f6c61] sm:text-base">
              Apply an active promo code during booking to unlock seasonal rewards on
              your next ritual.
            </p>
          </div>

          <div className="mt-10">
            {offersResult.status === "rejected" ? (
              <ErrorState message={getErrorMessage(offersResult.reason)} />
            ) : offersData.length === 0 ? (
              <EmptyState
                title="No offers currently active"
                description="New promo offers will be listed here when available."
              />
            ) : offersData.length === 1 ? (
              <div className="mx-auto max-w-2xl px-2 sm:px-0">
                <OfferCard offer={offersData[0]} variant="spotlight" />
              </div>
            ) : offersData.length === 2 ? (
              <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
                {offersData.map((offer) => (
                  <OfferCard key={offer.id} offer={offer} />
                ))}
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {offersData.map((offer) => (
                  <OfferCard key={offer.id} offer={offer} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-[#13311d] via-[#1a3f24] to-[#1e4728] px-6 py-14 text-center text-[#f9f2e5] shadow-[0_24px_44px_rgba(14,31,20,0.32)] sm:px-12 sm:py-16">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#e6cc95] to-transparent" />
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#b9974a]/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-[#b9974a]/10 blur-3xl" />
          <p className="relative mx-auto inline-flex items-center gap-2 rounded-full border border-[#e6cc95]/40 bg-[#0e2417]/40 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f1d595]">
            <Crown className="h-3.5 w-3.5" />
            Reserve Your Ritual
          </p>
          <h2 className="relative mx-auto mt-5 max-w-3xl font-heading text-3xl leading-tight text-[#f9f2e5] sm:text-4xl">
            Begin Your Curated Wellness Journey
          </h2>
          <p className="relative mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-[#d5dbc8] sm:text-base">
            Choose a package, secure your time, and apply any active promo code in the
            booking summary step.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/booking"
              className="inline-flex items-center gap-2 rounded-full bg-[#b9974a] px-7 py-3 text-sm font-semibold text-[#fffaf1] shadow-[0_10px_22px_rgba(161,122,45,0.4)] transition-transform hover:-translate-y-0.5"
            >
              Start Booking
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/services"
              className="inline-flex items-center gap-2 rounded-full border border-[#e6cc95]/50 px-7 py-3 text-sm font-semibold text-[#f9f2e5] transition-colors hover:bg-[#0e2417]/40"
            >
              Browse Services
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function FeaturedPackageSpotlight({ pkg }: { pkg: PublicPackage }) {
  const blurb = pkg.shortDescription?.trim() || pkg.description?.trim();
  const featureList = pkg.features ?? [];
  const durationLabel = formatDurationLabel(pkg.durationMinutes);
  const savings = getSavingsAmount(pkg.originalPrice, pkg.packagePrice);
  const showOriginalPrice = savings !== null;

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-[#d7b87a] bg-gradient-to-br from-[#fff8e9] via-[#fffaf0] to-[#fbf2dd] shadow-[0_28px_48px_rgba(34,52,30,0.18)]">
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#b9974a] via-[#e6cc95] to-[#b9974a]" />
      <div className="pointer-events-none absolute -right-24 -top-20 h-72 w-72 rounded-full bg-[#d9be86]/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-[#17351f]/10 blur-3xl" />
      <div className="relative grid gap-8 px-6 py-10 sm:px-10 sm:py-12 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
        <div className="flex flex-col">
          <p className={`${PILL_BASE} w-fit border border-[#d7b87a] bg-[#fff4dc] tracking-[0.16em] text-[#a4782f]`}>
            <Crown className="h-3.5 w-3.5" />
            Featured Package
          </p>
          <h2 className="mt-6 font-heading text-3xl leading-[1.1] text-primary sm:text-4xl lg:text-[2.6rem]">
            {pkg.name}
          </h2>
          <p className="mt-5 max-w-xl text-base leading-[1.7] text-[#5f6c61]">
            {blurb ?? "Our most-loved ritual — hand-picked by the Alrouby team for an elevated escape."}
          </p>
          {featureList.length > 0 ? (
            <ul className="mt-7 grid gap-3 text-sm leading-[1.55] text-[#3f5145] sm:grid-cols-2">
              {featureList.slice(0, 6).map((feature) => (
                <li key={feature.id} className="flex items-start gap-2.5">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#b9974a]/15 text-[#b9974a]">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span>{feature.label}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <aside className="relative flex flex-col gap-6 rounded-[1.6rem] border border-[#e7d8bf] bg-[#fffdf7] p-6 shadow-[0_18px_36px_rgba(38,56,42,0.14)] sm:p-7">
          <div className="flex flex-col gap-5">
            {pkg.badgeLabel ? (
              <span className={`${PILL_BASE} w-fit bg-[#17351f] text-[#fff8e9]`}>
                <Sparkles className="h-3 w-3 text-[#e6cc95]" />
                {pkg.badgeLabel}
              </span>
            ) : null}
            <div>
              <p className={EYEBROW}>Featured Price</p>
              <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {showOriginalPrice ? (
                  <span className="text-base text-[#9a8e7d] line-through">
                    {formatEgp(pkg.originalPrice ?? 0)}
                  </span>
                ) : null}
                <span className="font-heading text-4xl font-semibold leading-none text-primary sm:text-[2.6rem]">
                  {formatPriceLabel(pkg.packagePrice)}
                </span>
              </div>
              {savings !== null ? (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#b9974a]/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a4782f]">
                  You save {formatEgp(savings)}
                </p>
              ) : null}
            </div>
            {durationLabel ? (
              <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#e2d0ab] bg-[#fff7e9] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a6f3e]">
                <Clock3 className="h-3.5 w-3.5" />
                {durationLabel}
              </p>
            ) : null}
          </div>
          <div className="mt-auto flex flex-col gap-5">
            <div className="h-px bg-gradient-to-r from-transparent via-[#e7d8bf] to-transparent" />
            <Link
              href={`/booking?packageId=${pkg.id}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#17351f] px-5 py-3 text-sm font-semibold text-[#faf7f0] shadow-[0_12px_24px_rgba(23,53,31,0.28)] transition-transform hover:-translate-y-0.5"
            >
              Book Featured Package
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}

function PackageCard({ pkg }: { pkg: PublicPackage }) {
  const blurb = pkg.shortDescription?.trim() || pkg.description?.trim();
  const featureList = pkg.features ?? [];
  const durationLabel = formatDurationLabel(pkg.durationMinutes);
  const isFeatured = pkg.isFeatured;
  const ribbonLabel = pkg.badgeLabel ?? (isFeatured ? "Featured" : null);
  const savings = getSavingsAmount(pkg.originalPrice, pkg.packagePrice);
  const showOriginalPrice = savings !== null;

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border p-6 shadow-[0_14px_28px_rgba(38,56,42,0.1)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_22px_40px_rgba(30,46,35,0.18)] ${
        isFeatured
          ? "border-[#d7b87a] bg-[#fff9ee]"
          : "border-[#e6d8bf] bg-[#fffdf8]"
      }`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-1 ${
          isFeatured
            ? "bg-gradient-to-r from-[#b9974a] via-[#e6cc95] to-[#b9974a]"
            : "bg-gradient-to-r from-transparent via-[#e2d0ab]/70 to-transparent"
        }`}
      />
      {ribbonLabel ? (
        <span
          className={`absolute right-4 top-4 z-10 inline-flex max-w-[60%] items-center gap-1 truncate rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] shadow-sm ${
            isFeatured
              ? "bg-[#b9974a] text-[#fffaf1]"
              : "border border-[#e2d0ab] bg-[#fff7e9] text-[#a4782f]"
          }`}
        >
          {isFeatured ? <Sparkles className="h-3 w-3 shrink-0" aria-hidden /> : null}
          <span className="truncate">{ribbonLabel}</span>
        </span>
      ) : null}

      <div className={ribbonLabel ? "pr-24" : undefined}>
        <h3 className="font-heading text-[1.7rem] leading-[1.15] text-primary">
          {pkg.name}
        </h3>
        {blurb ? (
          <p className="mt-3 line-clamp-3 text-sm leading-[1.6] text-[#5f6c61]">{blurb}</p>
        ) : null}
      </div>

      <div className="mt-6 rounded-2xl border border-[#ecd9b5] bg-[#fffaf0] p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {showOriginalPrice ? (
            <span className="text-sm text-[#9a8e7d] line-through">
              {formatEgp(pkg.originalPrice ?? 0)}
            </span>
          ) : null}
          <span className="font-heading text-3xl font-semibold leading-none text-primary">
            {formatPriceLabel(pkg.packagePrice)}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {durationLabel ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a6f3e]">
              <Clock3 className="h-3.5 w-3.5" />
              {durationLabel}
            </span>
          ) : null}
          {savings !== null ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#b9974a]/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#a4782f]">
              Save {formatEgp(savings)}
            </span>
          ) : null}
        </div>
      </div>

      {featureList.length > 0 ? (
        <ul className="mt-6 space-y-3 text-sm leading-[1.55] text-[#3f5145]">
          {featureList.map((feature) => (
            <li key={feature.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#b9974a]/15 text-[#b9974a]">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span>{feature.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto pt-7">
        <Link
          href={`/booking?packageId=${pkg.id}`}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
            isFeatured
              ? "bg-[#17351f] text-[#faf7f0] shadow-[0_10px_20px_rgba(23,53,31,0.25)] hover:-translate-y-0.5 hover:opacity-95"
              : "border border-[#d7c39c] bg-[#fff8eb] text-primary hover:bg-[#f8efdd]"
          }`}
        >
          Book This Package
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

function OfferCard({
  offer,
  variant = "default",
}: {
  offer: PublicOffer;
  variant?: "default" | "spotlight";
}) {
  const isSpotlight = variant === "spotlight";
  const discountLabel = formatDiscountLabel(offer);
  const validity = formatValidityRange(offer.startDate, offer.endDate);
  const promoHref = `/booking${
    offer.offerCode ? `?promoCode=${encodeURIComponent(offer.offerCode)}` : ""
  }`;

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border shadow-[0_16px_30px_rgba(34,52,30,0.14)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_24px_44px_rgba(30,46,35,0.22)] ${
        isSpotlight
          ? "border-[#d7b87a] bg-gradient-to-br from-[#13311d] via-[#1a3f24] to-[#21512f] text-[#f9f2e5]"
          : "border-[#e2d0ab] bg-gradient-to-br from-[#fff8e9] to-[#fbf2dd]"
      }`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-1.5 ${
          isSpotlight
            ? "bg-gradient-to-r from-[#b9974a] via-[#e6cc95] to-[#b9974a]"
            : "bg-gradient-to-r from-[#b9974a]/70 via-[#e6cc95] to-[#b9974a]/70"
        }`}
      />
      <div className="pointer-events-none absolute -right-12 -top-10 h-44 w-44 rounded-full bg-[#b9974a]/20 blur-3xl" />
      <div
        className={`relative flex h-full flex-col ${
          isSpotlight ? "p-7 sm:p-9" : "p-6 sm:p-7"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <span
              className={`${PILL_BASE} w-fit ${
                isSpotlight
                  ? "border border-[#e6cc95]/40 bg-[#0e2417]/50 text-[#f1d595]"
                  : "border border-[#d7b87a] bg-[#fff4dc] text-[#a4782f]"
              }`}
            >
              <BadgePercent className="h-3 w-3" />
              Limited Offer
            </span>
            <h3
              className={`font-heading text-[1.7rem] leading-[1.15] ${
                isSpotlight ? "text-[#f9f2e5] sm:text-[1.85rem]" : "text-primary"
              }`}
            >
              {offer.name}
            </h3>
          </div>
          <span
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold ${
              isSpotlight
                ? "bg-[#b9974a] text-[#1a2818]"
                : "bg-[#17351f] text-[#fff8e9]"
            }`}
          >
            {discountLabel}
          </span>
        </div>

        {offer.description ? (
          <p
            className={`mt-4 text-sm leading-[1.65] ${
              isSpotlight ? "text-[#d5dbc8]" : "text-[#5f6c61]"
            }`}
          >
            {offer.description}
          </p>
        ) : null}

        {offer.offerCode ? (
          <div
            className={`mt-6 flex items-center gap-3 rounded-2xl border border-dashed px-4 py-3.5 ${
              isSpotlight
                ? "border-[#e6cc95]/50 bg-[#0e2417]/50"
                : "border-[#c8a76b] bg-[#fffaf0]"
            }`}
          >
            <Tag
              className={`h-4 w-4 shrink-0 ${
                isSpotlight ? "text-[#f1d595]" : "text-[#a4782f]"
              }`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p
                className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                  isSpotlight ? "text-[#d5dbc8]" : "text-[#8a6f3e]"
                }`}
              >
                Promo code
              </p>
              <p
                className={`mt-0.5 font-heading text-lg uppercase tracking-[0.18em] ${
                  isSpotlight ? "text-[#f1d595]" : "text-primary"
                }`}
              >
                {offer.offerCode}
              </p>
            </div>
          </div>
        ) : null}

        <p
          className={`mt-5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${
            isSpotlight ? "text-[#d5dbc8]" : "text-[#8a6f3e]"
          }`}
        >
          <Clock3 className="h-3.5 w-3.5" />
          Valid {validity}
        </p>

        <div className="mt-auto pt-7">
          <Link
            href={promoHref}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
              isSpotlight
                ? "bg-[#b9974a] text-[#1a2818] shadow-[0_10px_22px_rgba(161,122,45,0.4)] hover:-translate-y-0.5"
                : "bg-[#17351f] text-[#faf7f0] shadow-[0_10px_20px_rgba(23,53,31,0.25)] hover:-translate-y-0.5 hover:opacity-95"
            }`}
          >
            Use This Offer
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
