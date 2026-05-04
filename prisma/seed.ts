import * as argon2 from "argon2";
import { Prisma, PrismaClient } from "@prisma/client";
import { PERMISSION_SEED_ROWS, ROLE_SEEDS } from "./seed-data";

const prisma = new PrismaClient();

/** Singleton system_settings row (Sprint 2). Keep in sync with services/api `SYSTEM_SETTINGS_ID`. */
const SYSTEM_SETTINGS_ID = "00000000-0000-4000-8000-000000000002";

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

  console.log(
    `Seeded: branch ${defaultBranch.name}, system_settings singleton, ${PERMISSION_SEED_ROWS.length} permissions, ${ROLE_SEEDS.length} roles, owner user owner@alrouby.local`,
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
