-- Front-desk service picker (spec v2 §3a): Arabic names + search aliases
ALTER TABLE "services" ADD COLUMN "name_ar" TEXT, ADD COLUMN "search_aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "service_variants" ADD COLUMN "name_ar" TEXT, ADD COLUMN "search_aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "packages" ADD COLUMN "name_ar" TEXT, ADD COLUMN "search_aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "service_enhancements" ADD COLUMN "name_ar" TEXT, ADD COLUMN "search_aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
