/**
 * Idempotently adds notifications.read / notifications.retry and grants them
 * to seeded roles. Safe on production DBs — does not delete or reset other data.
 *
 * Usage: npm run db:grant-notification-permissions
 */
import { PrismaClient } from "@prisma/client";
import { PERMISSION_SEED_ROWS, ROLE_SEEDS } from "../seed-data";

const NOTIFICATION_PERMISSION_KEYS = [
  "notifications.read",
  "notifications.retry",
] as const;

const prisma = new PrismaClient();

async function main(): Promise<void> {

  const permissionRows = PERMISSION_SEED_ROWS.filter((row) =>
    (NOTIFICATION_PERMISSION_KEYS as readonly string[]).includes(row.key),
  );

  const permissionIdByKey = new Map<string, string>();

  for (const row of permissionRows) {
    const permission = await prisma.permission.upsert({
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
    permissionIdByKey.set(row.key, permission.id);
    console.log(`Permission ready: ${row.key}`);
  }

  let grantsAdded = 0;
  let grantsSkipped = 0;

  for (const roleSeed of ROLE_SEEDS) {
    const keysForRole = roleSeed.permissionKeys.filter((key) =>
      permissionIdByKey.has(key),
    );
    if (!keysForRole.length) {
      continue;
    }

    const role = await prisma.role.findUnique({
      where: { name: roleSeed.name },
    });
    if (!role) {
      console.warn(`Role not found (skipped): ${roleSeed.name}`);
      continue;
    }

    for (const key of keysForRole) {
      const permissionId = permissionIdByKey.get(key);
      if (!permissionId) {
        continue;
      }

      const existing = await prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
      });

      if (existing) {
        grantsSkipped += 1;
        continue;
      }

      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId },
      });
      grantsAdded += 1;
      console.log(`Granted ${key} → ${roleSeed.name}`);
    }
  }

  console.log(
    `Done. ${permissionRows.length} permission(s) upserted; ${grantsAdded} grant(s) added, ${grantsSkipped} already present.`,
  );
  console.log(
    "Users must sign out and back in (or refresh JWT) to pick up new permissions.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
