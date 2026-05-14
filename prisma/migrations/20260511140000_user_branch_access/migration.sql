-- CreateTable
CREATE TABLE "user_branch_access" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_branch_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_branch_access_user_id_branch_id_key" ON "user_branch_access"("user_id", "branch_id");

-- CreateIndex
CREATE INDEX "user_branch_access_branch_id_idx" ON "user_branch_access"("branch_id");

-- AddForeignKey
ALTER TABLE "user_branch_access" ADD CONSTRAINT "user_branch_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branch_access" ADD CONSTRAINT "user_branch_access_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: users with a single assigned branch
INSERT INTO "user_branch_access" ("id", "user_id", "branch_id")
SELECT gen_random_uuid(), u."id", u."branch_id"
FROM "users" u
WHERE u."branch_id" IS NOT NULL
ON CONFLICT ("user_id", "branch_id") DO NOTHING;

-- Backfill: Owner / Admin — explicit rows for every active branch
INSERT INTO "user_branch_access" ("id", "user_id", "branch_id")
SELECT gen_random_uuid(), u."id", b."id"
FROM "users" u
INNER JOIN "roles" r ON r."id" = u."role_id"
CROSS JOIN "branches" b
WHERE r."name" IN ('Owner', 'Admin')
  AND b."is_active" = true
ON CONFLICT ("user_id", "branch_id") DO NOTHING;

-- Ensure default branch is set for privileged users who had null branch_id
UPDATE "users" u
SET "branch_id" = (
  SELECT ss."default_branch_id"
  FROM "system_settings" ss
  WHERE ss."default_branch_id" IS NOT NULL
  LIMIT 1
)
WHERE u."branch_id" IS NULL
  AND EXISTS (
    SELECT 1 FROM "roles" r
    WHERE r."id" = u."role_id" AND r."name" IN ('Owner', 'Admin')
  )
  AND EXISTS (SELECT 1 FROM "system_settings" ss WHERE ss."default_branch_id" IS NOT NULL);

-- Fallback default: first branch alphabetically for Owner/Admin still missing branch_id
UPDATE "users" u
SET "branch_id" = (
  SELECT b."id" FROM "branches" b
  WHERE b."is_active" = true
  ORDER BY b."name" ASC
  LIMIT 1
)
WHERE u."branch_id" IS NULL
  AND EXISTS (
    SELECT 1 FROM "roles" r
    WHERE r."id" = u."role_id" AND r."name" IN ('Owner', 'Admin')
  );
