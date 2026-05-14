-- AlterTable
ALTER TABLE "whatsapp_templates" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'custom',
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'ar',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "sample_data" JSONB,
ADD COLUMN     "created_by_user_id" UUID,
ADD COLUMN     "updated_by_user_id" UUID,
ADD COLUMN     "meta_template_name" TEXT,
ADD COLUMN     "meta_template_status" TEXT,
ADD COLUMN     "requires_meta_approval" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "whatsapp_templates_category_idx" ON "whatsapp_templates"("category");

-- CreateIndex
CREATE INDEX "whatsapp_templates_language_is_active_idx" ON "whatsapp_templates"("language", "is_active");

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
