-- AlterTable
ALTER TABLE "branches" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "permissions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "roles" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;
