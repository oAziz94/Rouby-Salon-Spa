-- AlterEnum
ALTER TYPE "BookingItemType" ADD VALUE 'SERVICE_ENHANCEMENT';

-- AlterTable
ALTER TABLE "booking_items" ADD COLUMN     "service_enhancement_id" UUID;

-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "service_enhancement_id" UUID;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_service_enhancement_id_fkey" FOREIGN KEY ("service_enhancement_id") REFERENCES "service_enhancements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_service_enhancement_id_fkey" FOREIGN KEY ("service_enhancement_id") REFERENCES "service_enhancements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
