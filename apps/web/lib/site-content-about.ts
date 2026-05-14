import type { PublicSiteContent } from "@/lib/api/public";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const out = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  return out.length > 0 ? out : null;
}

function readPhilosophyItems(
  value: unknown,
): Array<{ title: string; description: string }> | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const out: Array<{ title: string; description: string }> = [];
  for (const item of value) {
    const row = asRecord(item);
    const title = readString(row.title);
    const description = readString(row.description);
    if (title && description) {
      out.push({ title, description });
    }
  }
  return out.length > 0 ? out : null;
}

const DEFAULT_HERO_SUB =
  "A sanctuary where botanical wellness meets luxury beauty, dedicated to your complete rejuvenation.";

const DEFAULT_STORY_PARAGRAPHS = [
  "Alrouby was envisioned as a quiet retreat from the city — a place where scent, touch, and light work together to restore balance. Every ritual is composed with botanical-forward formulations and careful attention to how you feel from arrival to departure.",
  "Our therapists combine technical mastery with intuitive care, tailoring pressure, pace, and product selection to your goals. Whether you are here for luminous skin, deep muscular release, or a full afternoon of stillness, the experience remains unhurried and deeply personal.",
  "We believe luxury is measured in restraint: curated aromas, immaculate suites, and thoughtful details that never compete for attention. Step inside, exhale, and let the outside world soften for a while.",
] as const;

const DEFAULT_WHY_SUB =
  "Experience the difference of botanical luxury and personalized care.";

const DEFAULT_PHILOSOPHY_ITEMS = [
  {
    title: "Holistic Wellness",
    description: "Treatments that honor body, breath, and skin as one connected system.",
  },
  {
    title: "Sustainable Luxury",
    description: "Thoughtful sourcing and mindful rituals without compromising on results.",
  },
  {
    title: "Personalized Care",
    description: "Plans shaped around your goals, sensitivities, and preferred pace.",
  },
] as const;

export type AboutPageContent = {
  eyebrow: string;
  heroHeading: string;
  heroSubheading: string;
  storyHeading: string;
  storyParagraphs: string[];
  storyCtaLabel: string;
  whyHeading: string;
  whySubheading: string;
  philosophyHeading: string;
  philosophyIntro: string;
  philosophyItems: Array<{ title: string; description: string }>;
  expertsEyebrow: string;
  expertsHeading: string;
  expertsSubheading: string;
};

export function getAboutPageContent(siteContent: PublicSiteContent | null): AboutPageContent {
  const a = asRecord(siteContent?.aboutSection);

  const cmsDescription = readString(a.description);
  const storyFromCms = readStringArray(a.storyParagraphs);
  const longBody = readString(a.longDescription);
  const splitLong =
    longBody?.split(/\n+/).map((p) => p.trim()).filter(Boolean) ?? null;

  const storyParagraphs =
    storyFromCms ??
    (splitLong && splitLong.length > 0 ? splitLong : null) ??
    (cmsDescription ? [cmsDescription, ...DEFAULT_STORY_PARAGRAPHS.slice(1)] : [...DEFAULT_STORY_PARAGRAPHS]);

  return {
    eyebrow: readString(a.eyebrow) ?? "Our Story",
    heroHeading: readString(a.heroHeading) ?? readString(a.title) ?? "About Alrouby",
    heroSubheading: readString(a.heroSubheading) ?? readString(a.subheading) ?? DEFAULT_HERO_SUB,
    storyHeading: readString(a.storyHeading) ?? "The Botanical Spa Experience",
    storyParagraphs,
    storyCtaLabel: readString(a.storyCtaLabel) ?? "Book Your Visit",
    whyHeading: readString(a.whyHeading) ?? "Why Choose Alrouby",
    whySubheading: readString(a.whySubheading) ?? DEFAULT_WHY_SUB,
    philosophyHeading: readString(a.philosophyHeading) ?? "Our Philosophy",
    philosophyIntro:
      readString(a.philosophyIntro) ??
      "Principles that guide every treatment suite, ritual, and guest conversation.",
    philosophyItems: readPhilosophyItems(a.philosophyItems) ?? [...DEFAULT_PHILOSOPHY_ITEMS],
    expertsEyebrow: readString(a.expertsEyebrow) ?? "The People Behind AlRouby",
    expertsHeading: readString(a.expertsHeading) ?? "Meet the Experts Behind the Experience",
    expertsSubheading:
      readString(a.expertsSubheading) ??
      "AlRouby is shaped by experienced professionals who bring together beauty expertise, elegant design, and thoughtful client care.",
  };
}
