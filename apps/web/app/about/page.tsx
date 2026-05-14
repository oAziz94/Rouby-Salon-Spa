import Link from "next/link";
import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import { Award, Leaf, Sparkles, Users } from "lucide-react";
import { AboutFeatureCard } from "@/components/about/about-feature-card";
import { AboutPhilosophyCard } from "@/components/about/about-philosophy-card";
import { AboutTeamCard } from "@/components/about/about-team-card";
import { getAboutPageContent } from "@/lib/site-content-about";
import {
  mergeAboutBotanicalImageUrl,
  mergeAboutPageContent,
  mergeAboutPhilosophyImageUrl,
  mergeAboutTeamRows,
  mergeAboutWhyRows,
} from "@/lib/website-public-merge";
import { getPublicGallery, getPublicSiteContent, type PublicSiteContent } from "@/lib/api/public";

const ABOUT_BOTANICAL_FILENAMES = [
  "about-botanical.webp",
  "about-botanical.jpg",
  "about-botanical.jpeg",
  "about-botanical.png",
] as const;

const ABOUT_PHILOSOPHY_FILENAMES = [
  "about-philosophy.webp",
  "about-philosophy.jpg",
  "about-philosophy.jpeg",
  "about-philosophy.png",
] as const;

const DEDICATED_EXPERIENCE_FILENAMES = [
  "home-experience.webp",
  "home-experience.jpg",
  "home-experience.jpeg",
  "home-experience.png",
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

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

function galleryUrlsByFeaturedFirst(
  items: Array<{ imageUrl: string; isFeatured: boolean }>,
): string[] {
  return items
    .filter((item) => Boolean(item.imageUrl))
    .slice()
    .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured))
    .map((item) => item.imageUrl);
}

const MVP_TEAM = [
  {
    initial: "G",
    name: "Ghada AlRouby",
    title: "Founder & Salon Expert",
    specialization:
      "Over 20 years of experience in salon management and hair services, leading AlRouby with expertise, care, and a refined beauty vision.",
  },
  {
    initial: "S",
    name: "Shorouk Ayman",
    title: "Architect & Design Visionary",
    specialization:
      "The architect behind AlRouby's elegant atmosphere, shaping the space with warmth, comfort, and premium design details.",
  },
  {
    initial: "P",
    name: "Paulette Daw",
    title: "Branch Manager & Skin Care Specialist",
    specialization:
      "Experienced in branch management, skin care, and facial treatments, bringing professional care and attention to every client visit.",
  },
] as const;

const WHY_ITEMS = [
  {
    title: "Organic Botanicals",
    description: "Carefully selected botanical actives and gentle formulations for luminous, resilient skin.",
    icon: Leaf,
  },
  {
    title: "Expert Therapists",
    description: "Certified specialists who listen first, then tailor pressure, products, and pace to you.",
    icon: Users,
  },
  {
    title: "Luxury Ambiance",
    description: "Calm suites, soft light, and refined details designed for deep unwinding.",
    icon: Sparkles,
  },
  {
    title: "Award Winning",
    description: "Recognized standards of hospitality and treatment quality you can trust visit after visit.",
    icon: Award,
  },
] as const;

const ABOUT_ICONS: Record<string, typeof Leaf> = {
  Leaf,
  Users,
  Sparkles,
  Award,
};

export async function generateMetadata(): Promise<Metadata> {
  let title = "About | Alrouby Salon & Spa";
  let description =
    "Discover Alrouby — botanical luxury, holistic rituals, and a sanctuary devoted to your rejuvenation.";
  try {
    const site = await getPublicSiteContent();
    const seo = asRecord(site.seoDefaults);
    const baseTitle = readString(seo.title) ?? "Alrouby Salon & Spa";
    title = `About | ${baseTitle}`;
    const about = getAboutPageContent(site);
    description =
      readString(seo.description) ?? `${about.heroHeading}. ${about.heroSubheading}`.slice(0, 160);
  } catch {
    // static fallbacks
  }
  return { title, description };
}

export default async function AboutPage() {
  const [siteContentResult, galleryResult] = await Promise.allSettled([
    getPublicSiteContent(),
    getPublicGallery(),
  ]);

  const siteContent: PublicSiteContent | null =
    siteContentResult.status === "fulfilled" ? siteContentResult.value : null;
  const content = mergeAboutPageContent(siteContent, getAboutPageContent(siteContent));
  const whyFromCms = mergeAboutWhyRows(siteContent);
  const whyItems =
    whyFromCms === null
      ? WHY_ITEMS.map((item) => ({
          title: item.title,
          description: item.description,
          Icon: item.icon,
        }))
      : whyFromCms.length === 0
        ? []
        : whyFromCms.map((item) => ({
            title: item.title,
            description: item.description,
            Icon: ABOUT_ICONS[item.iconKey] ?? Leaf,
          }));
  const teamFromCms = mergeAboutTeamRows(siteContent);
  const teamMembers =
    teamFromCms === null
      ? MVP_TEAM.map((m) => ({ ...m, imageUrl: null as string | null }))
      : teamFromCms.length === 0
        ? []
        : teamFromCms.map((m) => ({
            initial: m.initial,
            name: m.name,
            title: m.title,
            specialization: m.specialization,
            imageUrl: m.imageUrl ?? null,
          }));

  const galleryItems = galleryResult.status === "fulfilled" ? galleryResult.value.data : [];
  const pool = galleryUrlsByFeaturedFirst(galleryItems);

  const about = asRecord(siteContent?.aboutSection);
  const cmsStoryImage =
    readString(about.storyImageUrl) ?? readString(about.botanicalImageUrl);
  const cmsBotanicalFromWebsite = mergeAboutBotanicalImageUrl(siteContent);
  const cmsPhilosophyFromWebsite = mergeAboutPhilosophyImageUrl(siteContent);

  const botanicalImage =
    cmsBotanicalFromWebsite ??
    cmsStoryImage ??
    resolveBrandImageUrl(ABOUT_BOTANICAL_FILENAMES) ??
    resolveBrandImageUrl(DEDICATED_EXPERIENCE_FILENAMES) ??
    pool[0] ??
    null;
  const philosophyImage =
    cmsPhilosophyFromWebsite ??
    readString(about.philosophyImageUrl) ??
    resolveBrandImageUrl(ABOUT_PHILOSOPHY_FILENAMES) ??
    pool[1] ??
    pool[0] ??
    null;

  return (
    <div className="bg-[#faf7f0] text-[#1f2420]">
      <section className="border-b border-[#e4d8c4] bg-gradient-to-b from-[#fbf5ea] to-[#faf7f0]">
        <div className="mx-auto w-full max-w-[1280px] px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-10 lg:py-24">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#dcc9a5] bg-[#f8efdd] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a4782f]">
            <Leaf className="h-3.5 w-3.5 text-[#b9974a]" aria-hidden />
            {content.eyebrow}
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl font-heading text-4xl leading-[1.08] text-primary sm:text-5xl lg:text-6xl">
            {content.heroHeading}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#5f6c61] sm:text-lg">
            {content.heroSubheading}
          </p>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-4 py-14 sm:gap-20 sm:px-6 sm:py-16 lg:gap-24 lg:px-10 lg:py-20">
        <section aria-labelledby="about-botanical-heading">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="order-2 overflow-hidden rounded-2xl border border-[#e8dbc4] bg-[#f3ebdd] shadow-[0_22px_40px_rgba(26,40,28,0.14)] lg:order-1">
              {botanicalImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={botanicalImage}
                  alt="Botanical spa setting with oils, towels, and natural greenery"
                  className="aspect-[4/5] w-full object-cover sm:aspect-[5/6] lg:min-h-[420px]"
                />
              ) : (
                <div
                  className="aspect-[4/5] w-full bg-gradient-to-br from-[#e8dcc4] to-[#d4c4a8] sm:aspect-[5/6] lg:min-h-[420px]"
                  aria-hidden
                />
              )}
            </div>
            <div className="order-1 lg:order-2">
              <h2
                id="about-botanical-heading"
                className="font-heading text-3xl leading-tight text-primary sm:text-4xl"
              >
                {content.storyHeading}
              </h2>
              <div className="mt-6 max-w-xl space-y-4 text-sm leading-relaxed text-[#5f6c61] sm:text-base">
                {content.storyParagraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
              <Link
                href="/booking"
                className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-[#b9974a] px-7 py-3 text-sm font-semibold text-[#fffaf1] shadow-[0_12px_24px_rgba(161,122,45,0.3)] transition-opacity hover:opacity-90"
              >
                {content.storyCtaLabel}
              </Link>
            </div>
          </div>
        </section>

        <section className="scroll-mt-24" aria-labelledby="about-why-heading">
          <div className="text-center">
            <h2 id="about-why-heading" className="font-heading text-3xl text-primary sm:text-4xl">
              {content.whyHeading}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[#5f6c61] sm:text-base">
              {content.whySubheading}
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {whyItems.length === 0 ? null : (
            whyItems.map((item) => (
              <AboutFeatureCard
                key={item.title}
                icon={item.Icon}
                title={item.title}
                description={item.description}
              />
            ))
            )}
          </div>
        </section>

        <section aria-labelledby="about-philosophy-heading">
          <div className="grid items-stretch gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="flex flex-col gap-4">
              <h2 id="about-philosophy-heading" className="font-heading text-3xl text-primary sm:text-4xl">
                {content.philosophyHeading}
              </h2>
              <p className="text-sm text-[#5f6c61] sm:text-base">{content.philosophyIntro}</p>
              <div className="mt-2 flex flex-col gap-4">
                {content.philosophyItems.map((item) => (
                  <AboutPhilosophyCard key={item.title} title={item.title} description={item.description} />
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[#e8dbc4] shadow-[0_22px_40px_rgba(26,40,28,0.14)]">
              {philosophyImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={philosophyImage}
                  alt="Therapeutic massage emphasizing relaxation and skilled touch"
                  className="h-full min-h-[280px] w-full object-cover sm:min-h-[360px] lg:min-h-full"
                />
              ) : (
                <div
                  className="min-h-[280px] w-full bg-gradient-to-br from-[#e8dcc4] to-[#d4c4a8] sm:min-h-[360px] lg:min-h-full"
                  aria-hidden
                />
              )}
            </div>
          </div>
        </section>

        {teamMembers.length > 0 ? (
        <section aria-labelledby="about-experts-heading" className="scroll-mt-24">
          <div className="mx-auto w-full max-w-[1180px]">
            <div className="text-center">
              <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#dcc9a5] bg-[#f8efdd] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a4782f]">
                <Users className="h-3.5 w-3.5 text-[#b9974a]" aria-hidden />
                {content.expertsEyebrow}
              </p>
              <h2
                id="about-experts-heading"
                className="mx-auto mt-6 max-w-3xl font-heading text-3xl leading-tight text-primary sm:text-4xl"
              >
                {content.expertsHeading}
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[#5f6c61] sm:text-base">
                {content.expertsSubheading}
              </p>
            </div>
            <div className="mt-10 grid auto-rows-fr grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-x-10 lg:gap-y-8">
              {teamMembers.map((member) => (
                <AboutTeamCard
                  key={member.name}
                  initial={member.initial}
                  name={member.name}
                  title={member.title}
                  specialization={member.specialization}
                  imageUrl={member.imageUrl}
                />
              ))}
            </div>
          </div>
        </section>
        ) : null}
      </div>
    </div>
  );
}
