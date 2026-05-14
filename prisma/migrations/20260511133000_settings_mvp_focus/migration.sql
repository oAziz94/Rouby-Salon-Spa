-- Branch-level slot generation defaults
ALTER TABLE "branches"
ADD COLUMN "slot_generation_defaults" JSONB;

-- Focused dashboard settings fields
ALTER TABLE "system_settings"
ADD COLUMN "salon_name" TEXT NOT NULL DEFAULT 'Alrouby Salon & Spa',
ADD COLUMN "legal_name" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "whatsapp_number" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "address" TEXT,
ADD COLUMN "instagram_handle" TEXT,
ADD COLUMN "facebook_page" TEXT,
ADD COLUMN "default_branch_id" UUID,
ADD COLUMN "vat_rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 14,
ADD COLUMN "tax_label" TEXT NOT NULL DEFAULT 'VAT',
ADD COLUMN "receipt_title" TEXT NOT NULL DEFAULT 'Receipt',
ADD COLUMN "receipt_footer_message" TEXT,
ADD COLUMN "receipt_width" TEXT NOT NULL DEFAULT '80mm',
ADD COLUMN "show_salon_phone_on_receipt" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "show_branch_address_on_receipt" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "show_vat_breakdown" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "show_payment_breakdown" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "show_cashier_name" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "system_settings_default_branch_id_idx"
ON "system_settings"("default_branch_id");

ALTER TABLE "system_settings"
ADD CONSTRAINT "system_settings_default_branch_id_fkey"
FOREIGN KEY ("default_branch_id")
REFERENCES "branches"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
