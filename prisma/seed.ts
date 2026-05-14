import * as argon2 from "argon2";
import {
  BookingSlotStatus,
  BundleType,
  OfferDiscountType,
  PriceDisplayType,
  Prisma,
  PrismaClient,
  ReviewStatus,
  StaffScheduleExceptionType,
} from "@prisma/client";
import { PERMISSION_SEED_ROWS, ROLE_SEEDS } from "./seed-data";
import {
  WEBSITE_CONTENT_SECTION_SEEDS,
  websiteContentSectionCreateFromSeed,
} from "../services/api/src/content/website-content-section-seeds";
import {
  LEGACY_WHATSAPP_TEMPLATE_KEYS_WITHOUT_SUFFIX,
  WHATSAPP_TEMPLATE_SEED_ROWS,
} from "./whatsapp-template-seed";

const prisma = new PrismaClient();

/** Singleton system_settings row (Sprint 2). Keep in sync with services/api `SYSTEM_SETTINGS_ID`. */
const SYSTEM_SETTINGS_ID = "00000000-0000-4000-8000-000000000002";

/** Sprint 3 catalog (deterministic UUIDs for dev / docs). */
const CAT_HAIR = "30000000-0000-4000-8000-000000000001";
const CAT_SPA = "30000000-0000-4000-8000-000000000002";
const CAT_NAILS = "30000000-0000-4000-8000-000000000003";
const SVC_CUT = "30000000-0000-4000-8000-000000000011";
const SVC_COLOR = "30000000-0000-4000-8000-000000000012";
const SVC_ORPHAN = "30000000-0000-4000-8000-000000000013";
const SVC_MANI = "30000000-0000-4000-8000-000000000014";
const SVC_PEDI = "30000000-0000-4000-8000-000000000015";
const VAR_COLOR_SHORT = "30000000-0000-4000-8000-000000000021";
const VAR_COLOR_LONG = "30000000-0000-4000-8000-000000000022";
const PKG_LUXURY = "30000000-0000-4000-8000-000000000031";
const PKG_ESCAPE = "30000000-0000-4000-8000-000000000032";
const PKG_ROYAL = "30000000-0000-4000-8000-000000000033";
const PKG_BRIDAL = "30000000-0000-4000-8000-000000000034";
const PKG_COLOR_SHINE = "30000000-0000-4000-8000-000000000035";
const PKG_GENTLEMENS = "30000000-0000-4000-8000-000000000036";
const BND_NAILS = "30000000-0000-4000-8000-000000000041";
const OFF_SUMMER = "30000000-0000-4000-8000-000000000051";
const ENH_AROMA = "30000000-0000-4000-8000-000000000061";
const ENH_SCALP = "30000000-0000-4000-8000-000000000062";
const ENH_GOLD_MASK = "30000000-0000-4000-8000-000000000063";
const ENH_NAIL_ART = "30000000-0000-4000-8000-000000000064";
const ENH_HAIR_BOOSTER = "30000000-0000-4000-8000-000000000065";
const SLOT_AVAILABLE_ONLINE_1 = "40000000-0000-4000-8000-000000000001";
const SLOT_AVAILABLE_OFFLINE = "40000000-0000-4000-8000-000000000002";
const SLOT_FILLED = "40000000-0000-4000-8000-000000000003";
const SLOT_BLOCKED = "40000000-0000-4000-8000-000000000004";
const SLOT_CLOSED = "40000000-0000-4000-8000-000000000005";
const SLOT_AVAILABLE_ONLINE_2 = "40000000-0000-4000-8000-000000000006";
const GALLERY_ITEM_1 = "80000000-0000-4000-8000-000000000001";
const GALLERY_ITEM_2 = "80000000-0000-4000-8000-000000000002";
const GALLERY_ITEM_3 = "80000000-0000-4000-8000-000000000003";
const REVIEW_APPROVED = "81000000-0000-4000-8000-000000000001";
const REVIEW_PENDING = "81000000-0000-4000-8000-000000000002";
const SITE_CONTENT_ID = "82000000-0000-4000-8000-000000000001";

async function seedCatalog(branchId: string): Promise<void> {
  await prisma.serviceCategory.upsert({
    where: { id: CAT_HAIR },
    create: {
      id: CAT_HAIR,
      name: "Hair",
      description: "Cuts, color, styling",
      sortOrder: 1,
      isActive: true,
    },
    update: { name: "Hair", isActive: true },
  });
  await prisma.serviceCategory.upsert({
    where: { id: CAT_SPA },
    create: {
      id: CAT_SPA,
      name: "Spa",
      description: "Relaxation and body care",
      sortOrder: 2,
      isActive: true,
    },
    update: { name: "Spa", isActive: true },
  });
  await prisma.serviceCategory.upsert({
    where: { id: CAT_NAILS },
    create: {
      id: CAT_NAILS,
      name: "Nails",
      description: "Manicure and pedicure",
      sortOrder: 3,
      isActive: true,
    },
    update: { name: "Nails", isActive: true },
  });

  await prisma.service.upsert({
    where: { id: SVC_CUT },
    create: {
      id: SVC_CUT,
      categoryId: CAT_HAIR,
      name: "Signature Haircut",
      description: "Wash, cut, blow-dry",
      shortDescription: "Precision cut with personalized styling for a polished finish.",
      displayOrder: 1,
      isFeatured: true,
      badgeLabel: "Signature",
      priceDisplayType: PriceDisplayType.FIXED,
      basePrice: new Prisma.Decimal("350"),
      basePriceMax: null,
      durationMinutes: 60,
      isTaxable: true,
      bookingAvailability: true,
      isActive: true,
    },
    update: {
      name: "Signature Haircut",
      shortDescription: "Precision cut with personalized styling for a polished finish.",
      displayOrder: 1,
      isFeatured: true,
      badgeLabel: "Signature",
      priceDisplayType: PriceDisplayType.FIXED,
      basePrice: new Prisma.Decimal("350"),
      basePriceMax: null,
      isActive: true,
    },
  });
  await prisma.serviceBranch.upsert({
    where: {
      serviceId_branchId: { serviceId: SVC_CUT, branchId },
    },
    create: { serviceId: SVC_CUT, branchId },
    update: {},
  });

  await prisma.service.upsert({
    where: { id: SVC_COLOR },
    create: {
      id: SVC_COLOR,
      categoryId: CAT_HAIR,
      name: "Hair Coloring",
      description: "Professional color",
      shortDescription: "Custom color service designed for rich tone and lasting shine.",
      displayOrder: 2,
      isFeatured: true,
      badgeLabel: "Popular",
      priceDisplayType: PriceDisplayType.RANGE,
      basePrice: new Prisma.Decimal("900"),
      basePriceMax: new Prisma.Decimal("1600"),
      durationMinutes: 120,
      isTaxable: true,
      bookingAvailability: true,
      isActive: true,
    },
    update: {
      shortDescription: "Custom color service designed for rich tone and lasting shine.",
      displayOrder: 2,
      isFeatured: true,
      badgeLabel: "Popular",
      priceDisplayType: PriceDisplayType.RANGE,
      basePrice: new Prisma.Decimal("900"),
      basePriceMax: new Prisma.Decimal("1600"),
      isActive: true,
    },
  });
  await prisma.serviceBranch.upsert({
    where: {
      serviceId_branchId: { serviceId: SVC_COLOR, branchId },
    },
    create: { serviceId: SVC_COLOR, branchId },
    update: {},
  });

  await prisma.service.upsert({
    where: { id: SVC_ORPHAN },
    create: {
      id: SVC_ORPHAN,
      categoryId: CAT_SPA,
      name: "Orphan Service (no branches)",
      description: "Not linked to any branch — hidden from public lists",
      shortDescription: "Internal-only seed row without branch linking.",
      displayOrder: 99,
      isFeatured: false,
      badgeLabel: null,
      priceDisplayType: PriceDisplayType.CONTACT,
      basePrice: null,
      basePriceMax: null,
      durationMinutes: null,
      isTaxable: false,
      bookingAvailability: false,
      isActive: true,
    },
    update: {
      shortDescription: "Internal-only seed row without branch linking.",
      displayOrder: 99,
      isFeatured: false,
      badgeLabel: null,
      isActive: true,
    },
  });
  await prisma.serviceBranch.deleteMany({ where: { serviceId: SVC_ORPHAN } });

  await prisma.service.upsert({
    where: { id: SVC_MANI },
    create: {
      id: SVC_MANI,
      categoryId: CAT_NAILS,
      name: "Classic Manicure",
      description: null,
      shortDescription: "Nail shaping and polish prep for elegant everyday hands.",
      displayOrder: 3,
      isFeatured: false,
      badgeLabel: null,
      priceDisplayType: PriceDisplayType.FIXED,
      basePrice: new Prisma.Decimal("300"),
      basePriceMax: null,
      durationMinutes: 45,
      isTaxable: true,
      bookingAvailability: true,
      isActive: true,
    },
    update: {
      shortDescription: "Nail shaping and polish prep for elegant everyday hands.",
      displayOrder: 3,
      isFeatured: false,
      badgeLabel: null,
      basePrice: new Prisma.Decimal("300"),
      isActive: true,
    },
  });
  await prisma.serviceBranch.upsert({
    where: {
      serviceId_branchId: { serviceId: SVC_MANI, branchId },
    },
    create: { serviceId: SVC_MANI, branchId },
    update: {},
  });

  await prisma.service.upsert({
    where: { id: SVC_PEDI },
    create: {
      id: SVC_PEDI,
      categoryId: CAT_NAILS,
      name: "Spa Pedicure",
      description: null,
      shortDescription: "Comfort-focused foot care ritual with a restorative finish.",
      displayOrder: 4,
      isFeatured: false,
      badgeLabel: null,
      priceDisplayType: PriceDisplayType.STARTS_FROM,
      basePrice: new Prisma.Decimal("400"),
      basePriceMax: null,
      durationMinutes: 60,
      isTaxable: true,
      bookingAvailability: true,
      isActive: true,
    },
    update: {
      shortDescription: "Comfort-focused foot care ritual with a restorative finish.",
      displayOrder: 4,
      isFeatured: false,
      badgeLabel: null,
      isActive: true,
    },
  });
  await prisma.serviceBranch.upsert({
    where: {
      serviceId_branchId: { serviceId: SVC_PEDI, branchId },
    },
    create: { serviceId: SVC_PEDI, branchId },
    update: {},
  });

  await prisma.serviceVariant.upsert({
    where: { id: VAR_COLOR_SHORT },
    create: {
      id: VAR_COLOR_SHORT,
      serviceId: SVC_COLOR,
      name: "Short hair",
      description: null,
      price: new Prisma.Decimal("900"),
      durationMinutes: 90,
      isActive: true,
    },
    update: { price: new Prisma.Decimal("900"), isActive: true },
  });

  await prisma.serviceBenefit.deleteMany({
    where: {
      serviceId: { in: [SVC_CUT, SVC_COLOR, SVC_MANI, SVC_PEDI] },
    },
  });
  await prisma.serviceBenefit.createMany({
    data: [
      { serviceId: SVC_CUT, label: "Stress Relief", displayOrder: 0, isActive: true },
      { serviceId: SVC_CUT, label: "Relaxation", displayOrder: 1, isActive: true },
      { serviceId: SVC_COLOR, label: "Deep Hydration", displayOrder: 0, isActive: true },
      { serviceId: SVC_COLOR, label: "Brightening", displayOrder: 1, isActive: true },
      { serviceId: SVC_COLOR, label: "Anti-Aging", displayOrder: 2, isActive: true },
      { serviceId: SVC_MANI, label: "Nail Strengthening", displayOrder: 0, isActive: true },
      { serviceId: SVC_MANI, label: "Cuticle Care", displayOrder: 1, isActive: true },
      { serviceId: SVC_PEDI, label: "Muscle Tension", displayOrder: 0, isActive: true },
      { serviceId: SVC_PEDI, label: "Circulation", displayOrder: 1, isActive: true },
      { serviceId: SVC_PEDI, label: "Relaxation", displayOrder: 2, isActive: true },
    ],
  });
  await prisma.serviceVariant.upsert({
    where: { id: VAR_COLOR_LONG },
    create: {
      id: VAR_COLOR_LONG,
      serviceId: SVC_COLOR,
      name: "Long hair",
      description: null,
      price: new Prisma.Decimal("1600"),
      durationMinutes: 150,
      isActive: true,
    },
    update: { price: new Prisma.Decimal("1600"), isActive: true },
  });

  for (const packageId of [
    PKG_LUXURY,
    PKG_ESCAPE,
    PKG_ROYAL,
    PKG_BRIDAL,
    PKG_COLOR_SHINE,
    PKG_GENTLEMENS,
  ] as const) {
    await prisma.packageFeature.deleteMany({ where: { packageId } });
    await prisma.packageService.deleteMany({ where: { packageId } });
    await prisma.packageBranch.deleteMany({ where: { packageId } });
  }

  await prisma.package.upsert({
    where: { id: PKG_LUXURY },
    create: {
      id: PKG_LUXURY,
      name: "Luxury Spa Package",
      description: "Hair + nails combo",
      shortDescription: "A restorative spa journey with aromatherapy and glow rituals.",
      originalPrice: new Prisma.Decimal("1050"),
      packagePrice: new Prisma.Decimal("899"),
      durationMinutes: 150,
      startDate: null,
      endDate: null,
      isTaxable: true,
      isActive: true,
      isFeatured: false,
      badgeLabel: null,
    },
    update: {
      description: "Hair + nails combo",
      shortDescription: "A restorative spa journey with aromatherapy and glow rituals.",
      packagePrice: new Prisma.Decimal("899"),
      isActive: true,
      isFeatured: false,
      badgeLabel: null,
    },
  });
  await prisma.packageService.createMany({
    data: [
      { packageId: PKG_LUXURY, serviceId: SVC_CUT, sortOrder: 0 },
      { packageId: PKG_LUXURY, serviceId: SVC_MANI, sortOrder: 1 },
    ],
  });
  await prisma.packageBranch.createMany({
    data: [{ packageId: PKG_LUXURY, branchId }],
  });
  await prisma.packageFeature.createMany({
    data: [
      { packageId: PKG_LUXURY, label: "Aromatherapy welcome", displayOrder: 0, isActive: true },
      { packageId: PKG_LUXURY, label: "Signature facial", displayOrder: 1, isActive: true },
      { packageId: PKG_LUXURY, label: "Neck & shoulder release", displayOrder: 2, isActive: true },
      { packageId: PKG_LUXURY, label: "Herbal tea ritual", displayOrder: 3, isActive: true },
    ],
  });

  await prisma.package.upsert({
    where: { id: PKG_ESCAPE },
    create: {
      id: PKG_ESCAPE,
      name: "Essential Escape",
      description: "Express renewal for busy schedules.",
      shortDescription: "A balancing express ritual for busy weeks.",
      originalPrice: new Prisma.Decimal("720"),
      packagePrice: new Prisma.Decimal("560"),
      durationMinutes: 90,
      startDate: null,
      endDate: null,
      isTaxable: true,
      isActive: true,
      isFeatured: false,
      badgeLabel: null,
    },
    update: {
      shortDescription: "A balancing express ritual for busy weeks.",
      packagePrice: new Prisma.Decimal("560"),
      isActive: true,
    },
  });
  await prisma.packageService.createMany({
    data: [
      { packageId: PKG_ESCAPE, serviceId: SVC_CUT, sortOrder: 0 },
      { packageId: PKG_ESCAPE, serviceId: SVC_MANI, sortOrder: 1 },
    ],
  });
  await prisma.packageBranch.createMany({
    data: [{ packageId: PKG_ESCAPE, branchId }],
  });
  await prisma.packageFeature.createMany({
    data: [
      { packageId: PKG_ESCAPE, label: "Express facial cleanse", displayOrder: 0, isActive: true },
      { packageId: PKG_ESCAPE, label: "Relaxing scalp massage", displayOrder: 1, isActive: true },
      { packageId: PKG_ESCAPE, label: "Herbal refreshment", displayOrder: 2, isActive: true },
    ],
  });

  await prisma.package.upsert({
    where: { id: PKG_ROYAL },
    create: {
      id: PKG_ROYAL,
      name: "Royal Retreat",
      description: "Full journey with massage, facial, and care rituals.",
      shortDescription: "Our most-loved full-body journey for deep renewal.",
      originalPrice: new Prisma.Decimal("1450"),
      packagePrice: new Prisma.Decimal("1200"),
      durationMinutes: 180,
      startDate: null,
      endDate: null,
      isTaxable: true,
      isActive: true,
      isFeatured: true,
      badgeLabel: "Most Popular",
    },
    update: {
      shortDescription: "Our most-loved full-body journey for deep renewal.",
      packagePrice: new Prisma.Decimal("1200"),
      isActive: true,
      isFeatured: true,
      badgeLabel: "Most Popular",
    },
  });
  await prisma.packageService.createMany({
    data: [
      { packageId: PKG_ROYAL, serviceId: SVC_MANI, sortOrder: 0 },
      { packageId: PKG_ROYAL, serviceId: SVC_PEDI, sortOrder: 1 },
      { packageId: PKG_ROYAL, serviceId: SVC_CUT, sortOrder: 2 },
    ],
  });
  await prisma.packageBranch.createMany({
    data: [{ packageId: PKG_ROYAL, branchId }],
  });
  await prisma.packageFeature.createMany({
    data: [
      { packageId: PKG_ROYAL, label: "Full body massage", displayOrder: 0, isActive: true },
      { packageId: PKG_ROYAL, label: "Luxury facial treatment", displayOrder: 1, isActive: true },
      { packageId: PKG_ROYAL, label: "Hand and foot care", displayOrder: 2, isActive: true },
      { packageId: PKG_ROYAL, label: "Private relaxation time", displayOrder: 3, isActive: true },
    ],
  });

  await prisma.package.upsert({
    where: { id: PKG_BRIDAL },
    create: {
      id: PKG_BRIDAL,
      name: "Bridal Beauty Suite",
      description: "Hair, color touch-up, and polished nails for the big day.",
      shortDescription: "Camera-ready hair and nails with a calm, unhurried pace.",
      imageUrl: "/brand/home-experience.jpeg",
      originalPrice: new Prisma.Decimal("2200"),
      packagePrice: new Prisma.Decimal("1899"),
      durationMinutes: 240,
      startDate: null,
      endDate: null,
      isTaxable: true,
      isActive: true,
      isFeatured: false,
      badgeLabel: "New",
    },
    update: {
      description: "Hair, color touch-up, and polished nails for the big day.",
      shortDescription: "Camera-ready hair and nails with a calm, unhurried pace.",
      imageUrl: "/brand/home-experience.jpeg",
      packagePrice: new Prisma.Decimal("1899"),
      isActive: true,
      badgeLabel: "New",
    },
  });
  await prisma.packageService.createMany({
    data: [
      { packageId: PKG_BRIDAL, serviceId: SVC_CUT, sortOrder: 0 },
      { packageId: PKG_BRIDAL, serviceId: SVC_COLOR, sortOrder: 1 },
      { packageId: PKG_BRIDAL, serviceId: SVC_MANI, sortOrder: 2 },
    ],
  });
  await prisma.packageBranch.createMany({
    data: [{ packageId: PKG_BRIDAL, branchId }],
  });
  await prisma.packageFeature.createMany({
    data: [
      { packageId: PKG_BRIDAL, label: "Consultation & trial styling notes", displayOrder: 0, isActive: true },
      { packageId: PKG_BRIDAL, label: "Wash, cut, and blow-dry", displayOrder: 1, isActive: true },
      { packageId: PKG_BRIDAL, label: "Gloss refresh or toner", displayOrder: 2, isActive: true },
      { packageId: PKG_BRIDAL, label: "Classic manicure finish", displayOrder: 3, isActive: true },
    ],
  });

  await prisma.package.upsert({
    where: { id: PKG_COLOR_SHINE },
    create: {
      id: PKG_COLOR_SHINE,
      name: "Color & Shine Duo",
      description: "Full color service plus a fresh cut and blow-dry.",
      shortDescription: "Vibrant color and a sharp silhouette in one visit.",
      imageUrl: "/brand/home-hero.jpeg",
      originalPrice: new Prisma.Decimal("1950"),
      packagePrice: new Prisma.Decimal("1699"),
      durationMinutes: 200,
      startDate: null,
      endDate: null,
      isTaxable: true,
      isActive: true,
      isFeatured: false,
      badgeLabel: null,
    },
    update: {
      description: "Full color service plus a fresh cut and blow-dry.",
      shortDescription: "Vibrant color and a sharp silhouette in one visit.",
      imageUrl: "/brand/home-hero.jpeg",
      packagePrice: new Prisma.Decimal("1699"),
      isActive: true,
    },
  });
  await prisma.packageService.createMany({
    data: [
      { packageId: PKG_COLOR_SHINE, serviceId: SVC_COLOR, sortOrder: 0 },
      { packageId: PKG_COLOR_SHINE, serviceId: SVC_CUT, sortOrder: 1 },
    ],
  });
  await prisma.packageBranch.createMany({
    data: [{ packageId: PKG_COLOR_SHINE, branchId }],
  });
  await prisma.packageFeature.createMany({
    data: [
      { packageId: PKG_COLOR_SHINE, label: "Color consultation", displayOrder: 0, isActive: true },
      { packageId: PKG_COLOR_SHINE, label: "Application & processing", displayOrder: 1, isActive: true },
      { packageId: PKG_COLOR_SHINE, label: "Cut and style finish", displayOrder: 2, isActive: true },
    ],
  });

  await prisma.package.upsert({
    where: { id: PKG_GENTLEMENS },
    create: {
      id: PKG_GENTLEMENS,
      name: "Gentleman's Classic",
      description: "Sharp haircut plus a relaxing pedicure.",
      shortDescription: "Crisp grooming from head to toe without the fuss.",
      originalPrice: new Prisma.Decimal("580"),
      packagePrice: new Prisma.Decimal("479"),
      durationMinutes: 120,
      startDate: null,
      endDate: null,
      isTaxable: true,
      isActive: true,
      isFeatured: false,
      badgeLabel: null,
    },
    update: {
      description: "Sharp haircut plus a relaxing pedicure.",
      shortDescription: "Crisp grooming from head to toe without the fuss.",
      packagePrice: new Prisma.Decimal("479"),
      isActive: true,
    },
  });
  await prisma.packageService.createMany({
    data: [
      { packageId: PKG_GENTLEMENS, serviceId: SVC_CUT, sortOrder: 0 },
      { packageId: PKG_GENTLEMENS, serviceId: SVC_PEDI, sortOrder: 1 },
    ],
  });
  await prisma.packageBranch.createMany({
    data: [{ packageId: PKG_GENTLEMENS, branchId }],
  });
  await prisma.packageFeature.createMany({
    data: [
      { packageId: PKG_GENTLEMENS, label: "Precision cut & style", displayOrder: 0, isActive: true },
      { packageId: PKG_GENTLEMENS, label: "Foot soak and tidy", displayOrder: 1, isActive: true },
      { packageId: PKG_GENTLEMENS, label: "Refreshments on arrival", displayOrder: 2, isActive: true },
    ],
  });

  await prisma.bundleService.deleteMany({ where: { bundleId: BND_NAILS } });
  await prisma.bundle.upsert({
    where: { id: BND_NAILS },
    create: {
      id: BND_NAILS,
      name: "Pick any 2 nail services",
      description: "Choose two from eligible nail menu",
      bundleType: BundleType.FLEXIBLE,
      price: new Prisma.Decimal("650"),
      rules: { note: "Client picks 2 distinct services at booking time (Sprint 5)" },
      selectableCount: 2,
      startDate: null,
      endDate: null,
      isActive: true,
    },
    update: {
      bundleType: BundleType.FLEXIBLE,
      price: new Prisma.Decimal("650"),
      selectableCount: 2,
      isActive: true,
    },
  });
  await prisma.bundleService.createMany({
    data: [
      { bundleId: BND_NAILS, serviceId: SVC_MANI, sortOrder: 0 },
      { bundleId: BND_NAILS, serviceId: SVC_PEDI, sortOrder: 1 },
      { bundleId: BND_NAILS, serviceId: SVC_CUT, sortOrder: 2 },
    ],
  });

  await prisma.offer.upsert({
    where: { id: OFF_SUMMER },
    create: {
      id: OFF_SUMMER,
      name: "Summer Welcome",
      offerCode: "SUMMER10",
      discountType: OfferDiscountType.PERCENTAGE,
      discountValue: new Prisma.Decimal("10"),
      startDate: new Date(Date.UTC(2020, 0, 1)),
      endDate: new Date(Date.UTC(2035, 11, 31)),
      usageLimit: null,
      perClientUsageLimit: 1,
      isActive: true,
      eligibilityRules: { appliesTo: "first_booking", note: "Example rules JSON" },
    },
    update: {
      discountValue: new Prisma.Decimal("10"),
      isActive: true,
    },
  });

  await prisma.serviceEnhancement.upsert({
    where: { id: ENH_AROMA },
    create: {
      id: ENH_AROMA,
      title: "Aromatherapy Upgrade",
      shortDescription: "Personalized botanical blend to deepen relaxation.",
      price: new Prisma.Decimal("150"),
      durationMinutes: 15,
      imageUrl: null,
      displayOrder: 0,
      isActive: true,
    },
    update: {
      title: "Aromatherapy Upgrade",
      shortDescription: "Personalized botanical blend to deepen relaxation.",
      price: new Prisma.Decimal("150"),
      durationMinutes: 15,
      imageUrl: null,
      displayOrder: 0,
      isActive: true,
    },
  });
  await prisma.serviceEnhancement.upsert({
    where: { id: ENH_SCALP },
    create: {
      id: ENH_SCALP,
      title: "Scalp Massage",
      shortDescription: "A tension-releasing scalp ritual to support circulation.",
      price: new Prisma.Decimal("220"),
      durationMinutes: 20,
      imageUrl: null,
      displayOrder: 1,
      isActive: true,
    },
    update: {
      title: "Scalp Massage",
      shortDescription: "A tension-releasing scalp ritual to support circulation.",
      price: new Prisma.Decimal("220"),
      durationMinutes: 20,
      imageUrl: null,
      displayOrder: 1,
      isActive: true,
    },
  });
  await prisma.serviceEnhancement.upsert({
    where: { id: ENH_GOLD_MASK },
    create: {
      id: ENH_GOLD_MASK,
      title: "Gold Leaf Facial Mask",
      shortDescription: "Instant glow boost and luminosity ritual for tired skin.",
      price: new Prisma.Decimal("280"),
      durationMinutes: 20,
      imageUrl: null,
      displayOrder: 2,
      isActive: true,
    },
    update: {
      title: "Gold Leaf Facial Mask",
      shortDescription: "Instant glow boost and luminosity ritual for tired skin.",
      price: new Prisma.Decimal("280"),
      durationMinutes: 20,
      imageUrl: null,
      displayOrder: 2,
      isActive: true,
    },
  });
  await prisma.serviceEnhancement.upsert({
    where: { id: ENH_NAIL_ART },
    create: {
      id: ENH_NAIL_ART,
      title: "Nail Art Add-on",
      shortDescription: "Custom nail detailing to elevate your final look.",
      price: new Prisma.Decimal("180"),
      durationMinutes: 25,
      imageUrl: null,
      displayOrder: 3,
      isActive: true,
    },
    update: {
      title: "Nail Art Add-on",
      shortDescription: "Custom nail detailing to elevate your final look.",
      price: new Prisma.Decimal("180"),
      durationMinutes: 25,
      imageUrl: null,
      displayOrder: 3,
      isActive: true,
    },
  });
  await prisma.serviceEnhancement.upsert({
    where: { id: ENH_HAIR_BOOSTER },
    create: {
      id: ENH_HAIR_BOOSTER,
      title: "Hair Treatment Booster",
      shortDescription: "Intensive nourishment boost for softness and shine.",
      price: new Prisma.Decimal("250"),
      durationMinutes: 20,
      imageUrl: null,
      displayOrder: 4,
      isActive: true,
    },
    update: {
      title: "Hair Treatment Booster",
      shortDescription: "Intensive nourishment boost for softness and shine.",
      price: new Prisma.Decimal("250"),
      durationMinutes: 20,
      imageUrl: null,
      displayOrder: 4,
      isActive: true,
    },
  });
}

/**
 * Copies service/package branch links from the seeded main branch onto any other active
 * branches that have no catalog links yet (e.g. branches created in the dashboard).
 * Ensures public booking lists and estimates work for every branch after `seedCatalog`.
 */
async function mirrorCatalogToBranchesWithoutLinks(sourceBranchId: string): Promise<void> {
  const serviceLinks = await prisma.serviceBranch.findMany({
    where: { branchId: sourceBranchId },
    select: { serviceId: true },
  });
  const packageLinks = await prisma.packageBranch.findMany({
    where: { branchId: sourceBranchId },
    select: { packageId: true },
  });
  if (serviceLinks.length === 0 && packageLinks.length === 0) {
    return;
  }
  const otherBranches = await prisma.branch.findMany({
    where: { isActive: true, id: { not: sourceBranchId } },
    select: { id: true },
  });
  for (const { id: targetId } of otherBranches) {
    const existingServices = await prisma.serviceBranch.count({
      where: { branchId: targetId },
    });
    if (existingServices > 0) {
      continue;
    }
    if (serviceLinks.length > 0) {
      await prisma.serviceBranch.createMany({
        data: serviceLinks.map((s) => ({
          serviceId: s.serviceId,
          branchId: targetId,
        })),
        skipDuplicates: true,
      });
    }
    if (packageLinks.length > 0) {
      await prisma.packageBranch.createMany({
        data: packageLinks.map((p) => ({
          packageId: p.packageId,
          branchId: targetId,
        })),
        skipDuplicates: true,
      });
    }
  }
}

function isoDateDaysFromNow(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function parseTimeOnly(value: string): Date {
  return new Date(`1970-01-01T${value}.000Z`);
}

async function seedBookingSlots(branchId: string): Promise<void> {
  const targetDate = isoDateDaysFromNow(2);
  const futureDate = isoDateDaysFromNow(3);
  const staleDate = isoDateDaysFromNow(-1);

  const rows = [
    {
      id: SLOT_AVAILABLE_ONLINE_1,
      date: targetDate,
      startTime: "10:00:00",
      endTime: "11:00:00",
      capacity: 4,
      bookedCount: 1,
      status: BookingSlotStatus.AVAILABLE,
      isOnlineBookable: true,
      notes: "Seed: available online",
    },
    {
      id: SLOT_AVAILABLE_OFFLINE,
      date: targetDate,
      startTime: "12:00:00",
      endTime: "13:00:00",
      capacity: 3,
      bookedCount: 0,
      status: BookingSlotStatus.AVAILABLE,
      isOnlineBookable: false,
      notes: "Seed: available but offline",
    },
    {
      id: SLOT_FILLED,
      date: targetDate,
      startTime: "14:00:00",
      endTime: "15:00:00",
      capacity: 5,
      bookedCount: 2,
      status: BookingSlotStatus.FILLED,
      isOnlineBookable: true,
      notes: "Seed: manually filled",
    },
    {
      id: SLOT_BLOCKED,
      date: targetDate,
      startTime: "16:00:00",
      endTime: "17:00:00",
      capacity: 2,
      bookedCount: 0,
      status: BookingSlotStatus.BLOCKED,
      isOnlineBookable: true,
      notes: "Seed: blocked",
    },
    {
      id: SLOT_CLOSED,
      date: targetDate,
      startTime: "18:00:00",
      endTime: "19:00:00",
      capacity: 2,
      bookedCount: 0,
      status: BookingSlotStatus.CLOSED,
      isOnlineBookable: true,
      notes: "Seed: closed",
    },
    {
      id: SLOT_AVAILABLE_ONLINE_2,
      date: futureDate,
      startTime: "11:00:00",
      endTime: "12:00:00",
      capacity: 1,
      bookedCount: 0,
      status: BookingSlotStatus.AVAILABLE,
      isOnlineBookable: true,
      notes: "Seed: second available slot",
    },
  ] as const;

  for (const row of rows) {
    await prisma.bookingSlot.upsert({
      where: { id: row.id },
      create: {
        id: row.id,
        branchId,
        date: parseDateOnly(row.date),
        startTime: parseTimeOnly(row.startTime),
        endTime: parseTimeOnly(row.endTime),
        capacity: row.capacity,
        bookedCount: row.bookedCount,
        status: row.status,
        isOnlineBookable: row.isOnlineBookable,
        notes: row.notes,
        deletedAt: null,
      },
      update: {
        branchId,
        date: parseDateOnly(row.date),
        startTime: parseTimeOnly(row.startTime),
        endTime: parseTimeOnly(row.endTime),
        capacity: row.capacity,
        bookedCount: row.bookedCount,
        status: row.status,
        isOnlineBookable: row.isOnlineBookable,
        notes: row.notes,
        deletedAt: null,
      },
    });
  }

  await prisma.bookingSlot.upsert({
    where: { id: "40000000-0000-4000-8000-000000000007" },
    create: {
      id: "40000000-0000-4000-8000-000000000007",
      branchId,
      date: parseDateOnly(staleDate),
      startTime: parseTimeOnly("10:00:00"),
      endTime: parseTimeOnly("11:00:00"),
      capacity: 2,
      bookedCount: 0,
      status: BookingSlotStatus.AVAILABLE,
      isOnlineBookable: true,
      notes: "Seed: past slot (should be hidden from public)",
      deletedAt: null,
    },
    update: {
      branchId,
      date: parseDateOnly(staleDate),
      startTime: parseTimeOnly("10:00:00"),
      endTime: parseTimeOnly("11:00:00"),
      capacity: 2,
      bookedCount: 0,
      status: BookingSlotStatus.AVAILABLE,
      isOnlineBookable: true,
      notes: "Seed: past slot (should be hidden from public)",
      deletedAt: null,
    },
  });
}

async function seedContent(): Promise<void> {
  await prisma.galleryItem.upsert({
    where: { id: GALLERY_ITEM_1 },
    create: {
      id: GALLERY_ITEM_1,
      imageUrl: "/brand/home-hero.jpeg",
      title: "Hair Styling Session",
      category: "Hair",
      description: "Elegant evening hairstyle",
      isFeatured: true,
      displayOrder: 1,
      isActive: true,
    },
    update: {
      title: "Hair Styling Session",
      category: "Hair",
      description: "Elegant evening hairstyle",
      isFeatured: true,
      displayOrder: 1,
      isActive: true,
    },
  });
  await prisma.galleryItem.upsert({
    where: { id: GALLERY_ITEM_2 },
    create: {
      id: GALLERY_ITEM_2,
      imageUrl: "/brand/home-experience.jpeg",
      title: "Bridal Makeup",
      category: "Makeup",
      description: "Soft glam bridal look",
      isFeatured: false,
      displayOrder: 2,
      isActive: true,
    },
    update: {
      title: "Bridal Makeup",
      category: "Makeup",
      description: "Soft glam bridal look",
      isFeatured: false,
      displayOrder: 2,
      isActive: true,
    },
  });
  await prisma.galleryItem.upsert({
    where: { id: GALLERY_ITEM_3 },
    create: {
      id: GALLERY_ITEM_3,
      imageUrl: "/brand/alrouby-logo.png",
      title: "Spa Ritual",
      category: "Spa",
      description: "Relaxing spa and wellness moment",
      isFeatured: false,
      displayOrder: 3,
      isActive: false,
    },
    update: {
      title: "Spa Ritual",
      category: "Spa",
      description: "Relaxing spa and wellness moment",
      isFeatured: false,
      displayOrder: 3,
      isActive: false,
    },
  });

  const approvedClient = await prisma.client.findFirst({
    where: { email: "testimonial.approved@alrouby.local" },
    select: { id: true },
  });
  const approvedClientId = approvedClient
    ? approvedClient.id
    : (
        await prisma.client.create({
          data: {
            fullName: "Mona Adel",
            phone: "+201000000101",
            email: "testimonial.approved@alrouby.local",
          },
          select: { id: true },
        })
      ).id;

  const pendingClient = await prisma.client.findFirst({
    where: { email: "testimonial.pending@alrouby.local" },
    select: { id: true },
  });
  const pendingClientId = pendingClient
    ? pendingClient.id
    : (
        await prisma.client.create({
          data: {
            fullName: "Sara Nabil",
            phone: "+201000000102",
            email: "testimonial.pending@alrouby.local",
          },
          select: { id: true },
        })
      ).id;

  // Partial unique index allows only one row with show_on_homepage = true; clear before upsert.
  await prisma.review.updateMany({
    where: { showOnHomepage: true },
    data: { showOnHomepage: false },
  });

  await prisma.review.upsert({
    where: { id: REVIEW_APPROVED },
    create: {
      id: REVIEW_APPROVED,
      clientId: approvedClientId,
      rating: 5,
      comment: "Amazing service and very professional team. Highly recommended.",
      status: ReviewStatus.APPROVED,
      showOnHomepage: true,
      isActive: true,
    },
    update: {
      clientId: approvedClientId,
      rating: 5,
      comment: "Amazing service and very professional team. Highly recommended.",
      status: ReviewStatus.APPROVED,
      showOnHomepage: true,
      isActive: true,
    },
  });
  await prisma.review.upsert({
    where: { id: REVIEW_PENDING },
    create: {
      id: REVIEW_PENDING,
      clientId: pendingClientId,
      rating: 4,
      comment: "Good experience overall, waiting for final feedback publication.",
      status: ReviewStatus.PENDING,
      showOnHomepage: false,
      isActive: false,
    },
    update: {
      clientId: pendingClientId,
      rating: 4,
      comment: "Good experience overall, waiting for final feedback publication.",
      status: ReviewStatus.PENDING,
      showOnHomepage: false,
      isActive: false,
    },
  });

  await prisma.siteContent.upsert({
    where: { id: SITE_CONTENT_ID },
    create: {
      id: SITE_CONTENT_ID,
      homeHero: {
        heading: "Premium Beauty & Wellness Experience",
        subheading: "Book your next salon and spa appointment with confidence.",
        ctaLabel: "Book Appointment",
      },
      aboutSection: {
        title: "About Alrouby Salon & Spa",
        description:
          "A premium salon and spa destination delivering personalized beauty and wellness services.",
      },
      contactSection: {
        phone: "015 11100956",
        whatsapp: "+201511100956",
        address: "15 Radwan Ibn AlTabib Off Murad st., Giza",
        openingHours: "Daily 11:00 AM - 9:00 PM",
      },
      footerSection: {
        copyright: "Alrouby Salon & Spa",
        links: ["Privacy Policy", "Terms & Cancellation Policy"],
      },
      socialLinks: {
        instagram: "https://instagram.com/alroubysalon",
        facebook: "https://facebook.com/alroubysalon",
        tiktok: "https://tiktok.com/@alroubysalon",
      },
      seoDefaults: {
        title: "Alrouby Salon & Spa",
        description:
          "Premium salon and spa services in Giza. Explore services, book appointments, and connect on WhatsApp.",
      },
      updatedByUserId: null,
    },
    update: {
      homeHero: {
        heading: "Premium Beauty & Wellness Experience",
        subheading: "Book your next salon and spa appointment with confidence.",
        ctaLabel: "Book Appointment",
      },
      aboutSection: {
        title: "About Alrouby Salon & Spa",
        description:
          "A premium salon and spa destination delivering personalized beauty and wellness services.",
      },
      contactSection: {
        phone: "015 11100956",
        whatsapp: "+201511100956",
        address: "15 Radwan Ibn AlTabib Off Murad st., Giza",
        openingHours: "Daily 11:00 AM - 9:00 PM",
      },
      footerSection: {
        copyright: "Alrouby Salon & Spa",
        links: ["Privacy Policy", "Terms & Cancellation Policy"],
      },
      socialLinks: {
        instagram: "https://instagram.com/alroubysalon",
        facebook: "https://facebook.com/alroubysalon",
        tiktok: "https://tiktok.com/@alroubysalon",
      },
      seoDefaults: {
        title: "Alrouby Salon & Spa",
        description:
          "Premium salon and spa services in Giza. Explore services, book appointments, and connect on WhatsApp.",
      },
      updatedByUserId: null,
    },
  });

  for (const s of WEBSITE_CONTENT_SECTION_SEEDS) {
    await prisma.websiteContentSection.upsert({
      where: { key: s.key },
      create: websiteContentSectionCreateFromSeed(s, null),
      update: {},
    });
  }
}

async function main(): Promise<void> {
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  if (!ownerPassword || ownerPassword.length < 8) {
    throw new Error(
      "Set SEED_OWNER_PASSWORD in .env (min 8 characters) before running prisma db seed.",
    );
  }

  const defaultBranch = await prisma.branch.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Alrouby Main",
      address: "15 Radwan Ibn AlTabib Off Murad st., Giza",
      phone: "015 11100956",
      whatsapp: "+201511100956",
      mapUrl: "",
      workingHours: "Daily 11:00 AM - 9:00 PM",
      isActive: true,
    },
    update: {
      name: "Alrouby Main",
      isActive: true,
      address: "15 Radwan Ibn AlTabib Off Murad st., Giza",
      phone: "015 11100956",
      whatsapp: "+201511100956",
      workingHours: "Daily 11:00 AM - 9:00 PM",
    },
  });

  const defaultSlotGenerationDefaults = {
    schemaVersion: 1,
    workingDays: [1, 2, 3, 4, 5, 6],
    startTime: "10:00",
    endTime: "20:00",
    slotDurationMinutes: 60,
    defaultCapacity: 1,
    defaultOnlineBookable: true,
    breakPeriods: [] as { startTime: string; endTime: string }[],
  };

  await prisma.systemSettings.upsert({
    where: { id: SYSTEM_SETTINGS_ID },
    create: {
      id: SYSTEM_SETTINGS_ID,
      salonName: "Alrouby Salon & Spa",
      legalName: "Alrouby Salon & Spa",
      phone: "015 11100956",
      whatsappNumber: "+201511100956",
      email: "hello@alrouby.local",
      address: "15 Radwan Ibn AlTabib Off Murad st., Giza",
      instagramHandle: "@alroubysalon",
      facebookPage: "facebook.com/alroubysalon",
      defaultBranchId: defaultBranch.id,
      vatEnabled: false,
      vatRatePercent: new Prisma.Decimal("14"),
      taxLabel: "VAT",
      defaultVatRate: new Prisma.Decimal("0.14"),
      pricesIncludeVat: false,
      showVatOnInvoice: true,
      taxRegistrationNumber: null,
      receiptTitle: "Receipt",
      receiptFooterMessage: "Thank you for visiting Alrouby Salon & Spa",
      receiptWidth: "80mm",
      showSalonPhoneOnReceipt: true,
      showBranchAddressOnReceipt: true,
      showVatBreakdown: true,
      showPaymentBreakdown: true,
      showCashierName: true,
      paymentDepositPolicy: "PAY_AT_SALON",
      slotGenerationDefaults: defaultSlotGenerationDefaults,
      updatedByUserId: null,
    },
    update: {
      salonName: "Alrouby Salon & Spa",
      legalName: "Alrouby Salon & Spa",
      phone: "015 11100956",
      whatsappNumber: "+201511100956",
      email: "hello@alrouby.local",
      address: "15 Radwan Ibn AlTabib Off Murad st., Giza",
      instagramHandle: "@alroubysalon",
      facebookPage: "facebook.com/alroubysalon",
      defaultBranchId: defaultBranch.id,
      vatEnabled: false,
      vatRatePercent: new Prisma.Decimal("14"),
      taxLabel: "VAT",
      defaultVatRate: new Prisma.Decimal("0.14"),
      pricesIncludeVat: false,
      showVatOnInvoice: true,
      receiptTitle: "Receipt",
      receiptFooterMessage: "Thank you for visiting Alrouby Salon & Spa",
      receiptWidth: "80mm",
      showSalonPhoneOnReceipt: true,
      showBranchAddressOnReceipt: true,
      showVatBreakdown: true,
      showPaymentBreakdown: true,
      showCashierName: true,
      paymentDepositPolicy: "PAY_AT_SALON",
    },
  });

  await prisma.systemSettings.updateMany({
    where: {
      id: SYSTEM_SETTINGS_ID,
      slotGenerationDefaults: { equals: Prisma.DbNull },
    },
    data: { slotGenerationDefaults: defaultSlotGenerationDefaults },
  });

  /** Sprint 7 — keep in sync with `services/api/src/billing/billing.constants.ts`. */
  const INVOICE_NUMBER_SEQUENCE_ID = "00000000-0000-4000-8000-000000000003";
  await prisma.invoiceNumberSequence.upsert({
    where: { id: INVOICE_NUMBER_SEQUENCE_ID },
    create: { id: INVOICE_NUMBER_SEQUENCE_ID, nextValue: 0 },
    update: {},
  });

  const permissionByKey = new Map<string, { id: string }>();

  for (const row of PERMISSION_SEED_ROWS) {
    const p = await prisma.permission.upsert({
      where: { key: row.key },
      create: {
        key: row.key,
        module: row.module,
        description: row.description,
      },
      update: {
        module: row.module,
        description: row.description,
      },
    });
    permissionByKey.set(row.key, { id: p.id });
  }

  const roleByName = new Map<string, { id: string }>();

  for (const roleSeed of ROLE_SEEDS) {
    const role = await prisma.role.upsert({
      where: { name: roleSeed.name },
      create: {
        name: roleSeed.name,
        description: roleSeed.description,
        level: roleSeed.level,
      },
      update: {
        description: roleSeed.description,
        level: roleSeed.level,
      },
    });
    roleByName.set(roleSeed.name, { id: role.id });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    for (const key of roleSeed.permissionKeys) {
      const perm = permissionByKey.get(key);
      if (!perm) {
        throw new Error(`Unknown permission key in role seed: ${key}`);
      }
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  const ownerRole = roleByName.get("Owner");
  if (!ownerRole) {
    throw new Error("Owner role missing after seed");
  }

  const passwordHash = await argon2.hash(ownerPassword, { type: argon2.argon2id });

  await prisma.user.upsert({
    where: { email: "owner@alrouby.local" },
    create: {
      name: "Owner",
      email: "owner@alrouby.local",
      passwordHash,
      roleId: ownerRole.id,
      branchId: null,
      isActive: true,
    },
    update: {
      name: "Owner",
      passwordHash,
      roleId: ownerRole.id,
      branchId: null,
      isActive: true,
    },
  });

  const receptionistRole = roleByName.get("Receptionist");
  if (receptionistRole) {
    const recPassword = process.env.SEED_RECEPTIONIST_PASSWORD;
    if (recPassword && recPassword.length >= 8) {
      const recHash = await argon2.hash(recPassword, { type: argon2.argon2id });
      await prisma.user.upsert({
        where: { email: "reception@alrouby.local" },
        create: {
          name: "Reception",
          email: "reception@alrouby.local",
          passwordHash: recHash,
          roleId: receptionistRole.id,
          branchId: defaultBranch.id,
          isActive: true,
        },
        update: {
          passwordHash: recHash,
          roleId: receptionistRole.id,
          branchId: defaultBranch.id,
          isActive: true,
        },
      });
    }
  }

  await seedCatalog(defaultBranch.id);
  await mirrorCatalogToBranchesWithoutLinks(defaultBranch.id);
  await seedBookingSlots(defaultBranch.id);

  const staffRole = roleByName.get("Staff");
  const staffSeedPassword = process.env.SEED_STAFF_PASSWORD;
  if (
    staffRole &&
    staffSeedPassword &&
    staffSeedPassword.length >= 8 &&
    defaultBranch
  ) {
    const staffHash = await argon2.hash(staffSeedPassword, {
      type: argon2.argon2id,
    });
    const monaUser = await prisma.user.upsert({
      where: { email: "mona.staff@alrouby.local" },
      create: {
        name: "Mona (Staff)",
        email: "mona.staff@alrouby.local",
        passwordHash: staffHash,
        roleId: staffRole.id,
        branchId: defaultBranch.id,
        isActive: true,
      },
      update: {
        passwordHash: staffHash,
        roleId: staffRole.id,
        branchId: defaultBranch.id,
        isActive: true,
      },
    });
    const nourUser = await prisma.user.upsert({
      where: { email: "nour.staff@alrouby.local" },
      create: {
        name: "Nour (Staff)",
        email: "nour.staff@alrouby.local",
        passwordHash: staffHash,
        roleId: staffRole.id,
        branchId: defaultBranch.id,
        isActive: true,
      },
      update: {
        passwordHash: staffHash,
        roleId: staffRole.id,
        branchId: defaultBranch.id,
        isActive: true,
      },
    });

    const monaProfile = await prisma.staffProfile.upsert({
      where: {
        userId_branchId: {
          userId: monaUser.id,
          branchId: defaultBranch.id,
        },
      },
      create: {
        userId: monaUser.id,
        branchId: defaultBranch.id,
        displayName: "Mona",
        isBookable: true,
        isActive: true,
      },
      update: { displayName: "Mona", isBookable: true, isActive: true },
    });
    const nourProfile = await prisma.staffProfile.upsert({
      where: {
        userId_branchId: {
          userId: nourUser.id,
          branchId: defaultBranch.id,
        },
      },
      create: {
        userId: nourUser.id,
        branchId: defaultBranch.id,
        displayName: "Nour",
        isBookable: true,
        isActive: true,
      },
      update: { displayName: "Nour", isBookable: true, isActive: true },
    });

    await prisma.staffProfileService.deleteMany({
      where: { staffProfileId: { in: [monaProfile.id, nourProfile.id] } },
    });
    await prisma.staffProfileService.createMany({
      data: [
        { staffProfileId: monaProfile.id, serviceId: SVC_COLOR },
        { staffProfileId: monaProfile.id, serviceId: SVC_CUT },
        { staffProfileId: nourProfile.id, serviceId: SVC_MANI },
        { staffProfileId: nourProfile.id, serviceId: SVC_PEDI },
      ],
    });

    const workStart = new Date("1970-01-01T10:00:00.000Z");
    const workEnd = new Date("1970-01-01T19:00:00.000Z");
    const offStart = new Date("1970-01-01T00:00:00.000Z");
    const offEnd = new Date("1970-01-01T00:01:00.000Z");
    for (const profileId of [monaProfile.id, nourProfile.id]) {
      await prisma.staffSchedule.deleteMany({
        where: { staffProfileId: profileId, branchId: defaultBranch.id },
      });
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        const isWorking = dayOfWeek !== 5;
        await prisma.staffSchedule.create({
          data: {
            staffProfileId: profileId,
            branchId: defaultBranch.id,
            dayOfWeek,
            isWorking,
            startTime: isWorking ? workStart : offStart,
            endTime: isWorking ? workEnd : offEnd,
            breakStartTime: isWorking
              ? new Date("1970-01-01T14:00:00.000Z")
              : null,
            breakEndTime: isWorking
              ? new Date("1970-01-01T15:00:00.000Z")
              : null,
          },
        });
      }
    }

    const exceptionDate = new Date();
    exceptionDate.setUTCDate(exceptionDate.getUTCDate() + 14);
    exceptionDate.setUTCHours(0, 0, 0, 0);
    await prisma.staffScheduleException.deleteMany({
      where: {
        staffProfileId: monaProfile.id,
        branchId: defaultBranch.id,
        date: exceptionDate,
      },
    });
    await prisma.staffScheduleException.create({
      data: {
        staffProfileId: monaProfile.id,
        branchId: defaultBranch.id,
        date: exceptionDate,
        type: StaffScheduleExceptionType.DAY_OFF,
        reason: "Seeded day off (demo)",
      },
    });
  }

  await seedContent();

  await prisma.whatsAppTemplate.deleteMany({
    where: {
      templateKey: { in: [...LEGACY_WHATSAPP_TEMPLATE_KEYS_WITHOUT_SUFFIX] },
    },
  });

  for (const row of WHATSAPP_TEMPLATE_SEED_ROWS) {
    await prisma.whatsAppTemplate.upsert({
      where: { templateKey: row.templateKey },
      create: {
        id: row.id,
        name: row.name,
        templateKey: row.templateKey,
        content: row.content,
        variables: row.variables,
        category: row.category,
        language: row.language,
        description: row.description,
        isActive: true,
      },
      update: {
        name: row.name,
        content: row.content,
        variables: row.variables,
        category: row.category,
        language: row.language,
        description: row.description,
        isActive: true,
      },
    });
  }

  console.log(
    `Seeded: branch ${defaultBranch.name}, system_settings singleton, invoice_number_sequence singleton, ${PERMISSION_SEED_ROWS.length} permissions, ${ROLE_SEEDS.length} roles, owner user owner@alrouby.local, Sprint 3 catalog, Sprint 4 booking slots, Sprint 8 content (gallery/reviews/site content), ${WHATSAPP_TEMPLATE_SEED_ROWS.length} WhatsApp templates`,
  );
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
