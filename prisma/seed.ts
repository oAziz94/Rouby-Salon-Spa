import * as argon2 from "argon2";
import {
  BookingSlotStatus,
  BundleType,
  OfferDiscountType,
  PriceDisplayType,
  Prisma,
  PrismaClient,
  ReviewStatus,
} from "@prisma/client";
import { PERMISSION_SEED_ROWS, ROLE_SEEDS } from "./seed-data";
import { WHATSAPP_TEMPLATE_SEED_ROWS } from "./whatsapp-template-seed";

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
const BND_NAILS = "30000000-0000-4000-8000-000000000041";
const OFF_SUMMER = "30000000-0000-4000-8000-000000000051";
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
      priceDisplayType: PriceDisplayType.RANGE,
      basePrice: new Prisma.Decimal("900"),
      basePriceMax: new Prisma.Decimal("1600"),
      durationMinutes: 120,
      isTaxable: true,
      bookingAvailability: true,
      isActive: true,
    },
    update: {
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
      priceDisplayType: PriceDisplayType.CONTACT,
      basePrice: null,
      basePriceMax: null,
      durationMinutes: null,
      isTaxable: false,
      bookingAvailability: false,
      isActive: true,
    },
    update: { isActive: true },
  });
  await prisma.serviceBranch.deleteMany({ where: { serviceId: SVC_ORPHAN } });

  await prisma.service.upsert({
    where: { id: SVC_MANI },
    create: {
      id: SVC_MANI,
      categoryId: CAT_NAILS,
      name: "Classic Manicure",
      description: null,
      priceDisplayType: PriceDisplayType.FIXED,
      basePrice: new Prisma.Decimal("300"),
      basePriceMax: null,
      durationMinutes: 45,
      isTaxable: true,
      bookingAvailability: true,
      isActive: true,
    },
    update: { basePrice: new Prisma.Decimal("300"), isActive: true },
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
      priceDisplayType: PriceDisplayType.STARTS_FROM,
      basePrice: new Prisma.Decimal("400"),
      basePriceMax: null,
      durationMinutes: 60,
      isTaxable: true,
      bookingAvailability: true,
      isActive: true,
    },
    update: { isActive: true },
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

  await prisma.packageService.deleteMany({ where: { packageId: PKG_LUXURY } });
  await prisma.packageBranch.deleteMany({ where: { packageId: PKG_LUXURY } });
  await prisma.package.upsert({
    where: { id: PKG_LUXURY },
    create: {
      id: PKG_LUXURY,
      name: "Luxury Spa Package",
      description: "Hair + nails combo",
      originalPrice: new Prisma.Decimal("1050"),
      packagePrice: new Prisma.Decimal("899"),
      durationMinutes: 150,
      startDate: null,
      endDate: null,
      isTaxable: true,
      isActive: true,
    },
    update: {
      packagePrice: new Prisma.Decimal("899"),
      isActive: true,
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
      imageUrl: "https://images.unsplash.com/photo-1560066984-138dadb4c035",
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
      imageUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9",
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
      imageUrl: "https://images.unsplash.com/photo-1604654894610-df63bc536371",
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

  await prisma.review.upsert({
    where: { id: REVIEW_APPROVED },
    create: {
      id: REVIEW_APPROVED,
      clientId: approvedClientId,
      rating: 5,
      comment: "Amazing service and very professional team. Highly recommended.",
      status: ReviewStatus.APPROVED,
      displayOnWebsite: true,
    },
    update: {
      clientId: approvedClientId,
      rating: 5,
      comment: "Amazing service and very professional team. Highly recommended.",
      status: ReviewStatus.APPROVED,
      displayOnWebsite: true,
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
      displayOnWebsite: false,
    },
    update: {
      clientId: pendingClientId,
      rating: 4,
      comment: "Good experience overall, waiting for final feedback publication.",
      status: ReviewStatus.PENDING,
      displayOnWebsite: false,
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
        phone: "+201234567890",
        whatsapp: "+201234567890",
        address: "Cairo, Egypt",
        openingHours: "Daily 10:00 AM - 10:00 PM",
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
          "Premium salon and spa services in Cairo. Explore services, book appointments, and connect on WhatsApp.",
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
        phone: "+201234567890",
        whatsapp: "+201234567890",
        address: "Cairo, Egypt",
        openingHours: "Daily 10:00 AM - 10:00 PM",
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
          "Premium salon and spa services in Cairo. Explore services, book appointments, and connect on WhatsApp.",
      },
      updatedByUserId: null,
    },
  });
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
      address: "",
      phone: "",
      whatsapp: "",
      mapUrl: "",
      isActive: true,
    },
    update: {
      name: "Alrouby Main",
      isActive: true,
    },
  });

  await prisma.systemSettings.upsert({
    where: { id: SYSTEM_SETTINGS_ID },
    create: {
      id: SYSTEM_SETTINGS_ID,
      vatEnabled: false,
      defaultVatRate: new Prisma.Decimal("0.14"),
      pricesIncludeVat: false,
      showVatOnInvoice: true,
      taxRegistrationNumber: null,
      paymentDepositPolicy: "PAY_AT_SALON",
      updatedByUserId: null,
    },
    update: {
      vatEnabled: false,
      defaultVatRate: new Prisma.Decimal("0.14"),
      pricesIncludeVat: false,
      showVatOnInvoice: true,
      paymentDepositPolicy: "PAY_AT_SALON",
    },
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
  await seedBookingSlots(defaultBranch.id);
  await seedContent();

  for (const row of WHATSAPP_TEMPLATE_SEED_ROWS) {
    await prisma.whatsAppTemplate.upsert({
      where: { templateKey: row.templateKey },
      create: {
        id: row.id,
        name: row.name,
        templateKey: row.templateKey,
        content: row.content,
        variables: row.variables,
        isActive: true,
      },
      update: {
        name: row.name,
        content: row.content,
        variables: row.variables,
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
