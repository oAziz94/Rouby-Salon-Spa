import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log(
    "Seed placeholder (Sprint 0). Implement roles, permissions, branch, and templates in Sprint 1+ per docs/ARCHITECTURE.md and docs/SPRINT_PLAN.md.",
  );
  await prisma.schemaVersion.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
