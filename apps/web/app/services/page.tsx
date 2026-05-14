import Link from "next/link";
import { Clock3, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import {
  getPublicCategories,
  getPublicServiceEnhancements,
  getPublicServices,
  type PublicCategory,
  type PublicService,
} from "@/lib/api/public";
import { formatEgp } from "@/lib/format/currency";

type ServicesPageProps = {
  searchParams: Promise<{
    categoryId?: string;
  }>;
};

type EnhancementItem = {
  id: string;
  title: string;
  description: string;
  priceLabel: string;
  imageUrl: string | null;
};

function getErrorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  return "Unable to load this section right now.";
}

function toPriceLabel(service: PublicService): string {
  if (service.priceDisplayType === "CONTACT" || service.priceDisplayType === "HIDDEN") {
    return "By consultation";
  }

  if (typeof service.basePrice !== "number") {
    return "By consultation";
  }

  if (service.priceDisplayType === "RANGE" && typeof service.basePriceMax === "number") {
    return `${formatEgp(service.basePrice)} - ${formatEgp(service.basePriceMax)}`;
  }

  if (service.priceDisplayType === "STARTS_FROM") {
    return `From ${formatEgp(service.basePrice)}`;
  }

  return formatEgp(service.basePrice);
}

function toDurationLabel(durationMinutes: number | null): string | null {
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

function getEnhancements(
  enhancementsResult: PromiseSettledResult<
    Awaited<ReturnType<typeof getPublicServiceEnhancements>>
  >,
): {
  items: EnhancementItem[];
} {
  if (enhancementsResult.status === "fulfilled" && enhancementsResult.value.data.length > 0) {
    const activeOnly = enhancementsResult.value.data.filter((item) => item.isActive);
    if (activeOnly.length === 0) {
      return { items: [] };
    }
    return {
      items: activeOnly.slice(0, 4).map((item) => ({
        id: item.id,
        title: item.title,
        description:
          item.shortDescription?.trim() || "Elevate your treatment with this curated enhancement.",
        priceLabel:
          typeof item.price === "number"
            ? `From ${formatEgp(item.price)}`
            : "By consultation",
        imageUrl: item.imageUrl ?? null,
      })),
    };
  }

  return {
    items: [],
  };
}

export default async function ServicesPage({ searchParams }: ServicesPageProps) {
  const { categoryId } = await searchParams;

  const [categoriesResult, servicesResult, enhancementsResult] = await Promise.allSettled([
    getPublicCategories(),
    getPublicServices({ categoryId, pageSize: 24 }),
    getPublicServiceEnhancements(),
  ]);

  const categories =
    categoriesResult.status === "fulfilled" ? categoriesResult.value.data : [];

  const selectedCategoryName =
    categoryId && categories.length > 0
      ? (categories.find((category) => category.id === categoryId)?.name ?? null)
      : null;

  const enhancements = getEnhancements(enhancementsResult);
  const whatsappPhone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim();
  const whatsappMessage =
    process.env.NEXT_PUBLIC_WHATSAPP_DEFAULT_MESSAGE?.trim() ??
    "Hello, I need help choosing the best service at Alrouby Salon & Spa.";
  const whatsappHref = whatsappPhone
    ? `https://wa.me/${whatsappPhone.replace(/[^\d]/g, "")}?${new URLSearchParams({ text: whatsappMessage }).toString()}`
    : null;

  return (
    <div className="bg-[#fcf7ef]">
      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:gap-16 lg:px-10">
        <section className="relative overflow-hidden rounded-[2rem] border border-[#e6d8bf] bg-gradient-to-b from-[#f9f1e2] to-[#fdfaf3] px-6 py-12 text-center shadow-[0_20px_40px_rgba(26,40,28,0.12)] sm:px-10 sm:py-16">
          <div className="pointer-events-none absolute -right-20 top-0 h-52 w-52 rounded-full bg-[#d9be86]/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 bottom-0 h-52 w-52 rounded-full bg-[#2d5a3a]/10 blur-3xl" />
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#e2d0ab] bg-[#fff7e9] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a77b33]">
            <Sparkles className="h-3.5 w-3.5" />
            Our Services
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl font-heading text-4xl leading-[1.08] text-primary sm:text-5xl lg:text-6xl">
            Signature Treatments
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-[#5f6c61] sm:text-base">
            Discover luxury beauty and wellness rituals designed to restore calm, enhance glow, and
            elevate your everyday confidence.
          </p>
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <Link
              href="/services"
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-all sm:px-5 ${
                !categoryId
                  ? "border-[#17351f] bg-[#17351f] text-[#faf7f0] shadow-[0_8px_18px_rgba(23,53,31,0.2)]"
                  : "border-[#e1d3bb] bg-[#fff8ea] text-primary hover:border-[#d5bf92] hover:bg-[#f8efdd]"
              }`}
            >
              All Services
            </Link>
            {categories.map((category: PublicCategory) => {
              const active = categoryId === category.id;
              return (
                <Link
                  key={category.id}
                  href={`/services?categoryId=${category.id}`}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-all sm:px-5 ${
                    active
                      ? "border-[#17351f] bg-[#17351f] text-[#faf7f0] shadow-[0_8px_18px_rgba(23,53,31,0.2)]"
                      : "border-[#e1d3bb] bg-[#fff8ea] text-primary hover:border-[#d5bf92] hover:bg-[#f8efdd]"
                  }`}
                >
                  {category.name}
                </Link>
              );
            })}
          </div>
          {selectedCategoryName ? (
            <p className="mt-4 text-center text-sm text-[#6f6a5d]">
              Showing treatments in{" "}
              <span className="font-semibold text-primary">{selectedCategoryName}</span>
            </p>
          ) : null}
        </section>

        <section>
          {servicesResult.status === "rejected" ? (
            <ErrorState message={getErrorMessage(servicesResult.reason)} />
          ) : servicesResult.value.data.length === 0 ? (
            <EmptyState
              title="No services available"
              description="Services for this selection are not available yet."
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {servicesResult.value.data.map((service) => {
                const benefits = Array.isArray(service.benefits) ? service.benefits : [];
                const badgeText = service.badgeLabel?.trim() ?? "";
                return (
                  <article
                    key={service.id}
                    className={`group overflow-hidden rounded-[1.45rem] border border-[#e6d8bf] bg-[#fff9ee] shadow-[0_14px_30px_rgba(38,56,42,0.1)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_22px_40px_rgba(30,46,35,0.18)] ${
                      service.isFeatured ? "ring-2 ring-[#d7b87a]/50" : ""
                    }`}
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-[#f3e8d4] to-[#e8dcc4]">
                      {service.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={service.imageUrl}
                          alt={service.imageAlt || service.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
                          <span className="font-heading text-4xl font-semibold text-primary/35">
                            {service.name.trim().slice(0, 1).toUpperCase()}
                          </span>
                          <span className="text-xs font-medium uppercase tracking-[0.14em] text-[#8a6f3e]/90">
                            Al Rouby treatment
                          </span>
                        </div>
                      )}
                      {badgeText ? (
                        <span className="absolute left-3 top-3 max-w-[min(14rem,calc(100%-6rem))] truncate rounded-full border border-[#e2d0ab] bg-[#fff8eb]/95 px-3 py-1 text-xs font-semibold text-primary shadow-sm">
                          {badgeText}
                        </span>
                      ) : null}
                      <span className="absolute right-3 top-3 rounded-full border border-[#e2d0ab] bg-[#fff8eb]/95 px-3 py-1 text-xs font-semibold text-primary shadow-sm">
                        {toPriceLabel(service)}
                      </span>
                      {toDurationLabel(service.durationMinutes) ? (
                        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full border border-[#decead] bg-[#fff8eb]/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a6f3e]">
                          <Clock3 className="h-3.5 w-3.5" />
                          {toDurationLabel(service.durationMinutes)}
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-4 p-5">
                      <div>
                        <h2 className="font-heading text-[1.6rem] leading-tight text-primary">
                          {service.name}
                        </h2>
                        <p className="mt-2 min-h-12 text-sm leading-relaxed text-[#5f6c61]">
                          {service.shortDescription?.trim() ||
                            service.description?.trim() ||
                            "A premium treatment experience tailored to your beauty and wellness goals."}
                        </p>
                      </div>

                      {benefits.length > 0 ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#a77b33]">
                            Key Benefits
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {benefits.map((benefit) => (
                              <span
                                key={benefit.id}
                                className="rounded-full border border-[#e5d7be] bg-[#f8efdd] px-2.5 py-1 text-xs font-medium text-[#4d5b50]"
                              >
                                {benefit.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="flex gap-2 pt-1">
                        <Link
                          href={`/booking?serviceId=${service.id}`}
                          className="inline-flex flex-1 items-center justify-center rounded-full bg-[#17351f] px-4 py-2.5 text-sm font-semibold text-[#faf7f0] shadow-[0_8px_16px_rgba(23,53,31,0.25)] transition-all hover:bg-[#1f462a]"
                        >
                          Book Now
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {enhancements.items.length > 0 ? (
          <section className="rounded-[2rem] border border-[#e7d9bf] bg-[#f8efe1] px-5 py-10 sm:px-8">
            <div className="text-center">
              <h2 className="font-heading text-3xl text-primary sm:text-4xl">Enhance Your Experience</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[#5f6c61] sm:text-base">
                Add refined enhancements to personalize your visit and elevate every moment of care.
              </p>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {enhancements.items.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-[#e4d5bb] bg-[#fffaf1] shadow-[0_10px_20px_rgba(33,49,38,0.08)]"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.title} className="h-36 w-full object-cover" />
                  ) : null}
                  <div className="p-5">
                    <h3 className="font-heading text-2xl leading-tight text-primary">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#5f6c61]">{item.description}</p>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.1em] text-[#9c7b43]">
                      {item.priceLabel}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-[#e6d8bf] bg-[#fff8ec] px-6 py-12 text-center shadow-[0_16px_32px_rgba(29,44,34,0.1)] sm:px-10">
          <h2 className="font-heading text-3xl text-primary sm:text-4xl">Not Sure Which Service to Choose?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[#5f6c61] sm:text-base">
            Our experts can recommend the ideal ritual for your goals, schedule, and desired results.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/booking"
              className="inline-flex items-center justify-center rounded-full bg-[#17351f] px-6 py-3 text-sm font-semibold text-[#faf7f0] shadow-[0_10px_20px_rgba(23,53,31,0.25)] transition-opacity hover:opacity-90"
            >
              Schedule Consultation
            </Link>
            <a
              href={whatsappHref ?? "/contact"}
              target={whatsappHref ? "_blank" : undefined}
              rel={whatsappHref ? "noreferrer" : undefined}
              className="inline-flex items-center justify-center rounded-full border border-[#d7c39b] bg-[#fffaf1] px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-[#f2e8d5]"
            >
              WhatsApp
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
