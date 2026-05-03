-- CreateTable
CREATE TABLE "schema_version" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schema_version_pkey" PRIMARY KEY ("id")
);
