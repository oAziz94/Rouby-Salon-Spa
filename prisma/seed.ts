import * as argon2 from "argon2";
import {
  BundleType,
  OfferDiscountType,
  PriceDisplayType,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { PERMISSION_SEED_ROWS, ROLE_SEEDS } from "./seed-data";

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

  console.log(
    `Seeded: branch ${defaultBranch.name}, system_settings singleton, ${PERMISSION_SEED_ROWS.length} permissions, ${ROLE_SEEDS.length} roles, owner user owner@alrouby.local, Sprint 3 catalog`,
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
