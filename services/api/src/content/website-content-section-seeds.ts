import { Prisma } from '@prisma/client';

export type WebsiteContentSectionSeed = {
  key: string;
  page: string;
  sectionType: string;
  displayOrder: number;
  isRequired: boolean;
  isVisible: boolean;
  eyebrow?: string | null;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  secondaryCtaLabel?: string | null;
  secondaryCtaHref?: string | null;
  content?: Prisma.InputJsonValue;
};

/** Default rows — idempotent `upsert` with empty `update` preserves staff edits on re-seed. */
export const WEBSITE_CONTENT_SECTION_SEEDS: WebsiteContentSectionSeed[] = [
  {
    key: 'homepage.hero',
    page: 'homepage',
    sectionType: 'hero',
    displayOrder: 0,
    isRequired: true,
    isVisible: true,
    eyebrow: 'Botanical Luxury House',
    title: 'Premium Beauty & Wellness Experience',
    subtitle:
      'Explore services, packages, and bundles, then submit your booking request with confidence.',
    ctaLabel: 'Book Appointment',
    ctaHref: '/booking',
    secondaryCtaLabel: 'View Services',
    secondaryCtaHref: '/services',
    content: {
      microBenefits: [
        { text: 'Personalized rituals', iconKey: 'Sparkles' },
        { text: 'Premium products', iconKey: 'Gem' },
        { text: 'Flexible bookings', iconKey: 'Clock3' },
      ],
    },
  },
  {
    key: 'homepage.whyChooseUs',
    page: 'homepage',
    sectionType: 'featureList',
    displayOrder: 10,
    isRequired: false,
    isVisible: true,
    title: 'Why Choose Alrouby',
    subtitle: 'Boutique standards with a warm, restorative atmosphere.',
    content: {
      items: [
        {
          title: 'Botanical Formulas',
          text: 'High-grade natural actives.',
          iconKey: 'Leaf',
        },
        {
          title: 'Master Therapists',
          text: 'Certified experts in luxury care.',
          iconKey: 'Crown',
        },
        {
          title: 'Private Sanctuaries',
          text: 'Quiet treatment suites and calm rituals.',
          iconKey: 'ShieldCheck',
        },
        {
          title: 'Consistent Excellence',
          text: 'Loved by returning premium guests.',
          iconKey: 'Award',
        },
      ],
    },
  },
  {
    key: 'homepage.experience',
    page: 'homepage',
    sectionType: 'textImage',
    displayOrder: 20,
    isRequired: false,
    isVisible: true,
    eyebrow: 'The Alrouby Experience',
    title: 'Signature Wellness Rituals Crafted Around You',
    subtitle:
      'From your first welcome tea to the final glow reveal, every moment is composed to slow time, restore energy, and elevate your confidence.',
    ctaLabel: 'Discover Signature Rituals',
    ctaHref: '/packages',
  },
  {
    key: 'homepage.wellnessCta',
    page: 'homepage',
    sectionType: 'cta',
    displayOrder: 30,
    isRequired: false,
    isVisible: true,
    title: 'Ready to Begin Your Wellness Journey?',
    subtitle:
      'Book your appointment today and experience elevated beauty, calm, and care at Alrouby.',
    ctaLabel: 'Book Appointment',
    ctaHref: '/booking',
    secondaryCtaLabel: 'Contact Us',
    secondaryCtaHref: '/contact',
  },
  {
    key: 'about.hero',
    page: 'about',
    sectionType: 'hero',
    displayOrder: 0,
    isRequired: false,
    isVisible: true,
    eyebrow: 'Our Story',
    title: 'About Alrouby',
    subtitle:
      'A sanctuary where botanical wellness meets luxury beauty, dedicated to your complete rejuvenation.',
  },
  {
    key: 'about.botanical',
    page: 'about',
    sectionType: 'textImage',
    displayOrder: 10,
    isRequired: false,
    isVisible: true,
    title: 'The Botanical Spa Experience',
    body: null,
    ctaLabel: 'Book Your Visit',
    ctaHref: '/booking',
    content: {
      storyParagraphs: [
        'Alrouby was envisioned as a quiet retreat from the city — a place where scent, touch, and light work together to restore balance. Every ritual is composed with botanical-forward formulations and careful attention to how you feel from arrival to departure.',
        'Our therapists combine technical mastery with intuitive care, tailoring pressure, pace, and product selection to your goals. Whether you are here for luminous skin, deep muscular release, or a full afternoon of stillness, the experience remains unhurried and deeply personal.',
        'We believe luxury is measured in restraint: curated aromas, immaculate suites, and thoughtful details that never compete for attention. Step inside, exhale, and let the outside world soften for a while.',
      ],
    },
  },
  {
    key: 'about.why',
    page: 'about',
    sectionType: 'featureList',
    displayOrder: 20,
    isRequired: false,
    isVisible: true,
    title: 'Why Choose Alrouby',
    subtitle:
      'Experience the difference of botanical luxury and personalized care.',
    content: {
      items: [
        {
          title: 'Organic Botanicals',
          description:
            'Carefully selected botanical actives and gentle formulations for luminous, resilient skin.',
          iconKey: 'Leaf',
        },
        {
          title: 'Expert Therapists',
          description:
            'Certified specialists who listen first, then tailor pressure, products, and pace to you.',
          iconKey: 'Users',
        },
        {
          title: 'Luxury Ambiance',
          description:
            'Calm suites, soft light, and refined details designed for deep unwinding.',
          iconKey: 'Sparkles',
        },
        {
          title: 'Award Winning',
          description:
            'Recognized standards of hospitality and treatment quality you can trust visit after visit.',
          iconKey: 'Award',
        },
      ],
    },
  },
  {
    key: 'about.philosophy',
    page: 'about',
    sectionType: 'textImage',
    displayOrder: 30,
    isRequired: false,
    isVisible: true,
    title: 'Our Philosophy',
    subtitle:
      'Principles that guide every treatment suite, ritual, and guest conversation.',
    content: {
      philosophyItems: [
        {
          title: 'Holistic Wellness',
          description:
            'Treatments that honor body, breath, and skin as one connected system.',
        },
        {
          title: 'Sustainable Luxury',
          description:
            'Thoughtful sourcing and mindful rituals without compromising on results.',
        },
        {
          title: 'Personalized Care',
          description:
            'Plans shaped around your goals, sensitivities, and preferred pace.',
        },
      ],
    },
  },
  {
    key: 'about.experts',
    page: 'about',
    sectionType: 'featureList',
    displayOrder: 40,
    isRequired: false,
    isVisible: true,
    eyebrow: 'The People Behind AlRouby',
    title: 'Meet the Experts Behind the Experience',
    subtitle:
      'AlRouby is shaped by experienced professionals who bring together beauty expertise, elegant design, and thoughtful client care.',
    content: {
      team: [
        {
          initial: 'G',
          name: 'Ghada AlRouby',
          title: 'Founder & Salon Expert',
          specialization:
            'Over 20 years of experience in salon management and hair services, leading AlRouby with expertise, care, and a refined beauty vision.',
        },
        {
          initial: 'S',
          name: 'Shorouk Ayman',
          title: 'Architect & Design Visionary',
          specialization:
            "The architect behind AlRouby's elegant atmosphere, shaping the space with warmth, comfort, and premium design details.",
        },
        {
          initial: 'P',
          name: 'Paulette Daw',
          title: 'Branch Manager & Skin Care Specialist',
          specialization:
            'Experienced in branch management, skin care, and facial treatments, bringing professional care and attention to every client visit.',
        },
      ],
    },
  },
  {
    key: 'contact.pageIntro',
    page: 'contact',
    sectionType: 'hero',
    displayOrder: 0,
    isRequired: false,
    isVisible: true,
    title: 'Get In Touch',
    subtitle:
      "We'd love to hear from you. Visit us, call us, or send us a message to begin your wellness journey.",
  },
  {
    key: 'contact.visitBlock',
    page: 'contact',
    sectionType: 'contactBlock',
    displayOrder: 10,
    isRequired: false,
    isVisible: true,
    title: 'Visit Us',
    content: {
      whatsappHelpText: 'Chat with us during business hours',
      whatsappButtonLabel: 'Chat on WhatsApp',
      defaultChatText:
        'Hello, I would like to get in touch with Alrouby Wellness & Spa.',
    },
  },
  {
    key: 'global.footer',
    page: 'global',
    sectionType: 'richText',
    displayOrder: 0,
    isRequired: false,
    isVisible: true,
    body: 'Premium botanical wellness with curated treatments in a calm, luxurious atmosphere.',
    content: {
      pricingNote: 'All prices are displayed in EGP.',
      homepageStrip:
        'Alrouby Salon & Spa - Luxury beauty and wellness in Egypt.',
    },
  },
];

export function websiteContentSectionCreateFromSeed(
  s: WebsiteContentSectionSeed,
  updatedByUserId: string | null,
): Prisma.WebsiteContentSectionCreateInput {
  return {
    key: s.key,
    page: s.page,
    sectionType: s.sectionType,
    displayOrder: s.displayOrder,
    isRequired: s.isRequired,
    isVisible: s.isVisible,
    eyebrow: s.eyebrow ?? null,
    title: s.title ?? null,
    subtitle: s.subtitle ?? null,
    body: s.body ?? null,
    ctaLabel: s.ctaLabel ?? null,
    ctaHref: s.ctaHref ?? null,
    secondaryCtaLabel: s.secondaryCtaLabel ?? null,
    secondaryCtaHref: s.secondaryCtaHref ?? null,
    content: s.content ?? Prisma.JsonNull,
    ...(updatedByUserId
      ? { updatedByUser: { connect: { id: updatedByUserId } } }
      : {}),
  };
}
