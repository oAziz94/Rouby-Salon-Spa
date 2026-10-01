/**
 * Additively syncs seeded role permissions into an existing database:
 * upserts every seed permission row and grants any missing (role, permission)
 * pairs from ROLE_SEEDS. Never removes grants, roles, users, or other data,
 * so it is safe to run against production after a permissions change.
 *
 * Usage: npm run db:sync-role-permissions
 */
import { PrismaClient } from "@prisma/client";
import { PERMISSION_SEED_ROWS, ROLE_SEEDS } from "../seed-data";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const permissionIdByKey = new Map<string, string>();
  for (const row of PERMISSION_SEED_ROWS) {
    const permission = await prisma.permission.upsert({
      where: { key: row.key },
      create: { key: row.key, module: row.module, description: row.description },
      update: { module: row.module, description: row.description },
    });
    permissionIdByKey.set(row.key, permission.id);
  }
  console.log(`${PERMISSION_SEED_ROWS.length} permission(s) upserted.`);

  let grantsAdded = 0;
  for (const roleSeed of ROLE_SEEDS) {
    const role = await prisma.role.findUnique({ where: { name: roleSeed.name } });
    if (!role) {
      console.warn(`Role not found (skipped): ${roleSeed.name}`);
      continue;
    }
    const existing = new Set(
      (
        await prisma.rolePermission.findMany({
          where: { roleId: role.id },
          select: { permissionId: true },
        })
      ).map((rp) => rp.permissionId),
    );
    for (const key of roleSeed.permissionKeys) {
      const permissionId = permissionIdByKey.get(key);
      if (!permissionId || existing.has(permissionId)) {
        continue;
      }
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId } });
      grantsAdded += 1;
      console.log(`Granted ${key} → ${roleSeed.name}`);
    }
  }
  console.log(`Done. ${grantsAdded} grant(s) added.`);
  console.log("Users pick up new permissions on their next request (permissions are read from the database per request).");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
