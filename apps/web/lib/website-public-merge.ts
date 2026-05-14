import type { PublicSiteContent } from "@/lib/api/public";
import type { AboutPageContent } from "@/lib/site-content-about";

export type PublicWebsiteSection = NonNullable<
  PublicSiteContent["websiteSections"]
>[number];

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function getWebsiteSections(site: PublicSiteContent | null): PublicWebsiteSection[] {
  return site?.websiteSections ?? [];
}

export function websiteSectionByKey(
  site: PublicSiteContent | null,
  key: string,
): PublicWebsiteSection | undefined {
  return getWebsiteSections(site).find((s) => s.key === key);
}

export function isWebsiteContentLiveForPage(
  site: PublicSiteContent | null,
  page: string,
): boolean {
  return getWebsiteSections(site).some((s) => s.page === page);
}

export type HomeMicroBenefit = { text: string; iconKey: string };

export function mergeHomeHero(site: PublicSiteContent | null) {
  const hero = asRecord(site?.homeHero);
  const ws = websiteSectionByKey(site, "homepage.hero");
  const content = ws ? asRecord(ws.content) : {};
  const microRaw = content.microBenefits;
  const micro: HomeMicroBenefit[] | null = Array.isArray(microRaw)
    ? (microRaw
        .map((row) => {
          const r = asRecord(row);
          const text = readString(r.text);
          const iconKey = readString(r.iconKey) ?? "Sparkles";
          return text ? { text, iconKey } : null;
        })
        .filter(Boolean) as HomeMicroBenefit[])
    : null;

  return {
    eyebrow: readString(ws?.eyebrow) ?? "Botanical Luxury House",
    heading:
      readString(ws?.title) ??
      readString(hero.heading) ??
      "Premium Beauty & Wellness Experience",
    subheading:
      readString(ws?.subtitle) ??
      readString(hero.subheading) ??
      "Explore services, packages, and bundles, then submit your booking request with confidence.",
    ctaLabel: readString(ws?.ctaLabel) ?? readString(hero.ctaLabel) ?? "Book Appointment",
    ctaHref: readString(ws?.ctaHref) ?? "/booking",
    secondaryCtaLabel:
      readString(ws?.secondaryCtaLabel) ?? readString(hero.secondaryCtaLabel) ?? "View Services",
    secondaryCtaHref: readString(ws?.secondaryCtaHref) ?? "/services",
    heroImageUrl: readString(ws?.primaryImageUrl) ?? readString(hero.heroImageUrl),
    experienceImageUrl:
      readString(ws?.secondaryImageUrl) ?? readString(hero.experienceImageUrl),
    microBenefits:
      micro && micro.length > 0
        ? micro
        : [
            { text: "Personalized rituals", iconKey: "Sparkles" },
            { text: "Premium products", iconKey: "Gem" },
            { text: "Flexible bookings", iconKey: "Clock3" },
          ],
  };
}

export type HomeFeatureItem = { title: string; text: string; iconKey: string };

export function mergeHomeWhyChoose(site: PublicSiteContent | null): {
  visible: boolean;
  title: string;
  subtitle: string;
  items: HomeFeatureItem[];
} {
  const live = isWebsiteContentLiveForPage(site, "homepage");
  const ws = websiteSectionByKey(site, "homepage.whyChooseUs");
  const defaults = {
    visible: true as const,
    title: "Why Choose Alrouby",
    subtitle: "Boutique standards with a warm, restorative atmosphere.",
    items: [
      { title: "Botanical Formulas", text: "High-grade natural actives.", iconKey: "Leaf" },
      { title: "Master Therapists", text: "Certified experts in luxury care.", iconKey: "Crown" },
      {
        title: "Private Sanctuaries",
        text: "Quiet treatment suites and calm rituals.",
        iconKey: "ShieldCheck",
      },
      {
        title: "Consistent Excellence",
        text: "Loved by returning premium guests.",
        iconKey: "Award",
      },
    ],
  };
  if (live && !ws) {
    return { visible: false, title: "", subtitle: "", items: [] };
  }
  if (!ws) {
    return defaults;
  }
  const c = asRecord(ws.content);
  const rawItems = c.items;
  const items: HomeFeatureItem[] = Array.isArray(rawItems)
    ? (rawItems
        .map((row) => {
          const r = asRecord(row);
          const title = readString(r.title);
          const text = readString(r.text) ?? readString(r.description);
          const iconKey = readString(r.iconKey) ?? "Leaf";
          if (!title || !text) return null;
          return { title, text, iconKey };
        })
        .filter(Boolean) as HomeFeatureItem[])
    : [];
  return {
    visible: true,
    title: readString(ws.title) ?? defaults.title,
    subtitle: readString(ws.subtitle) ?? defaults.subtitle,
    items: items.length > 0 ? items : defaults.items,
  };
}

export function mergeHomeExperience(site: PublicSiteContent | null) {
  const live = isWebsiteContentLiveForPage(site, "homepage");
  const ws = websiteSectionByKey(site, "homepage.experience");
  const defaults = {
    visible: true as const,
    eyebrow: "The Alrouby Experience",
    title: "Signature Wellness Rituals Crafted Around You",
    subtitle:
      "From your first welcome tea to the final glow reveal, every moment is composed to slow time, restore energy, and elevate your confidence.",
    ctaLabel: "Discover Signature Rituals",
    ctaHref: "/packages",
    imageUrl: null as string | null,
  };
  if (live && !ws) {
    return {
      visible: false,
      eyebrow: "",
      title: "",
      subtitle: "",
      ctaLabel: "",
      ctaHref: "",
      imageUrl: null as string | null,
    };
  }
  if (!ws) {
    return defaults;
  }
  return {
    visible: true as const,
    eyebrow: readString(ws.eyebrow) ?? defaults.eyebrow,
    title: readString(ws.title) ?? defaults.title,
    subtitle: readString(ws.subtitle) ?? defaults.subtitle,
    ctaLabel: readString(ws.ctaLabel) ?? defaults.ctaLabel,
    ctaHref: readString(ws.ctaHref) ?? defaults.ctaHref,
    imageUrl: readString(ws.primaryImageUrl),
  };
}

export function mergeHomeWellnessCta(site: PublicSiteContent | null) {
  const live = isWebsiteContentLiveForPage(site, "homepage");
  const ws = websiteSectionByKey(site, "homepage.wellnessCta");
  const defaults = {
    visible: true as const,
    title: "Ready to Begin Your Wellness Journey?",
    subtitle:
      "Book your appointment today and experience elevated beauty, calm, and care at Alrouby.",
    ctaLabel: "Book Appointment",
    ctaHref: "/booking",
    secondaryCtaLabel: "Contact Us",
    secondaryCtaHref: "/contact",
  };
  if (live && !ws) {
    return {
      visible: false,
      title: "",
      subtitle: "",
      ctaLabel: "",
      ctaHref: "",
      secondaryCtaLabel: "",
      secondaryCtaHref: "",
    };
  }
  if (!ws) {
    return defaults;
  }
  return {
    visible: true as const,
    title: readString(ws.title) ?? defaults.title,
    subtitle: readString(ws.subtitle) ?? defaults.subtitle,
    ctaLabel: readString(ws.ctaLabel) ?? defaults.ctaLabel,
    ctaHref: readString(ws.ctaHref) ?? defaults.ctaHref,
    secondaryCtaLabel: readString(ws.secondaryCtaLabel) ?? defaults.secondaryCtaLabel,
    secondaryCtaHref: readString(ws.secondaryCtaHref) ?? defaults.secondaryCtaHref,
  };
}

export function mergeHomeFooterStrip(site: PublicSiteContent | null) {
  const ws = websiteSectionByKey(site, "global.footer");
  const c = ws ? asRecord(ws.content) : {};
  return {
    line:
      readString(c.homepageStrip) ??
      "Alrouby Salon & Spa - Luxury beauty and wellness in Egypt.",
  };
}

function readStringArrayFromContent(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  return out.length > 0 ? out : null;
}

function readPhilosophyFromContent(value: unknown): Array<{ title: string; description: string }> | null {
  if (!Array.isArray(value)) return null;
  const out: Array<{ title: string; description: string }> = [];
  for (const item of value) {
    const row = asRecord(item);
    const title = readString(row.title);
    const description = readString(row.description);
    if (title && description) out.push({ title, description });
  }
  return out.length > 0 ? out : null;
}

export function mergeAboutPageContent(
  site: PublicSiteContent | null,
  base: AboutPageContent,
): AboutPageContent {
  if (!isWebsiteContentLiveForPage(site, "about")) return base;
  const heroS = websiteSectionByKey(site, "about.hero");
  const bot = websiteSectionByKey(site, "about.botanical");
  const why = websiteSectionByKey(site, "about.why");
  const phil = websiteSectionByKey(site, "about.philosophy");
  const exp = websiteSectionByKey(site, "about.experts");
  const botContent = bot ? asRecord(bot.content) : {};
  const storyParagraphs =
    readStringArrayFromContent(botContent.storyParagraphs) ?? base.storyParagraphs;
  const philContent = phil ? asRecord(phil.content) : {};
  const philosophyItems =
    readPhilosophyFromContent(philContent.philosophyItems) ?? base.philosophyItems;
  return {
    ...base,
    eyebrow: readString(heroS?.eyebrow) ?? base.eyebrow,
    heroHeading: readString(heroS?.title) ?? base.heroHeading,
    heroSubheading: readString(heroS?.subtitle) ?? base.heroSubheading,
    storyHeading: readString(bot?.title) ?? base.storyHeading,
    storyParagraphs,
    storyCtaLabel: readString(bot?.ctaLabel) ?? base.storyCtaLabel,
    whyHeading: readString(why?.title) ?? base.whyHeading,
    whySubheading: readString(why?.subtitle) ?? base.whySubheading,
    philosophyHeading: readString(phil?.title) ?? base.philosophyHeading,
    philosophyIntro: readString(phil?.subtitle) ?? base.philosophyIntro,
    philosophyItems,
    expertsEyebrow: readString(exp?.eyebrow) ?? base.expertsEyebrow,
    expertsHeading: readString(exp?.title) ?? base.expertsHeading,
    expertsSubheading: readString(exp?.subtitle) ?? base.expertsSubheading,
  };
}

export type AboutWhyRow = { title: string; description: string; iconKey: string };

export function mergeAboutWhyRows(site: PublicSiteContent | null): AboutWhyRow[] | null {
  if (!isWebsiteContentLiveForPage(site, "about")) return null;
  const why = websiteSectionByKey(site, "about.why");
  if (!why) return [];
  const c = asRecord(why.content);
  const raw = c.items;
  if (!Array.isArray(raw)) return [];
  const out: AboutWhyRow[] = [];
  for (const row of raw) {
    const r = asRecord(row);
    const title = readString(r.title);
    const description = readString(r.description);
    const iconKey = readString(r.iconKey) ?? "Leaf";
    if (title && description) out.push({ title, description, iconKey });
  }
  return out;
}

export type AboutTeamRow = {
  initial: string;
  name: string;
  title: string;
  specialization: string;
  imageUrl?: string | null;
};

export function mergeAboutTeamRows(site: PublicSiteContent | null): AboutTeamRow[] | null {
  if (!isWebsiteContentLiveForPage(site, "about")) return null;
  const exp = websiteSectionByKey(site, "about.experts");
  if (!exp) return [];
  const c = asRecord(exp.content);
  const raw = c.team;
  if (!Array.isArray(raw)) return [];
  const out: AboutTeamRow[] = [];
  for (const row of raw) {
    const r = asRecord(row);
    const initial = readString(r.initial);
    const name = readString(r.name);
    const title = readString(r.title);
    const specialization = readString(r.specialization);
    const imageUrl = readString(r.imageUrl) ?? readString(r.portraitUrl);
    if (initial && name && title && specialization) {
      out.push({ initial, name, title, specialization, imageUrl });
    }
  }
  return out;
}

export function mergeAboutBotanicalImageUrl(site: PublicSiteContent | null): string | null {
  const ws = websiteSectionByKey(site, "about.botanical");
  return readString(ws?.primaryImageUrl);
}

export function mergeAboutPhilosophyImageUrl(site: PublicSiteContent | null): string | null {
  const ws = websiteSectionByKey(site, "about.philosophy");
  return readString(ws?.primaryImageUrl);
}

export function mergeContactIntro(site: PublicSiteContent | null) {
  const live = isWebsiteContentLiveForPage(site, "contact");
  const ws = websiteSectionByKey(site, "contact.pageIntro");
  const defaults = {
    title: "Get In Touch",
    subtitle:
      "We'd love to hear from you. Visit us, call us, or send us a message to begin your wellness journey.",
  };
  if (live && !ws) {
    return { visible: false, title: "", subtitle: "" };
  }
  if (!ws) return { visible: true, ...defaults };
  return {
    visible: true,
    title: readString(ws.title) ?? defaults.title,
    subtitle: readString(ws.subtitle) ?? defaults.subtitle,
  };
}

export function mergeContactVisitBlock(site: PublicSiteContent | null) {
  const ws = websiteSectionByKey(site, "contact.visitBlock");
  const defaults = {
    visitHeading: "Visit Us",
    whatsappHelpText: "Chat with us during business hours",
    whatsappButtonLabel: "Chat on WhatsApp",
    defaultChatText: "Hello, I would like to get in touch with Alrouby Wellness & Spa.",
  };
  if (!ws) return defaults;
  const c = asRecord(ws.content);
  return {
    visitHeading: readString(ws.title) ?? defaults.visitHeading,
    whatsappHelpText: readString(c.whatsappHelpText) ?? defaults.whatsappHelpText,
    whatsappButtonLabel: readString(c.whatsappButtonLabel) ?? defaults.whatsappButtonLabel,
    defaultChatText: readString(c.defaultChatText) ?? defaults.defaultChatText,
  };
}

export function mergeGlobalFooter(site: PublicSiteContent | null) {
  const ws = websiteSectionByKey(site, "global.footer");
  const c = ws ? asRecord(ws.content) : {};
  return {
    tagline:
      readString(ws?.body) ??
      "Premium botanical wellness with curated treatments in a calm, luxurious atmosphere.",
    pricingNote: readString(c.pricingNote) ?? "All prices are displayed in EGP.",
  };
}
