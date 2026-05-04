-- CreateEnum
CREATE TYPE "PaymentDepositPolicy" AS ENUM (
  'PAY_AT_SALON',
  'OPTIONAL_DEPOSIT',
  'REQUIRED_DEPOSIT',
  'FUTURE_ONLINE',
  'MANUAL_INSTAPAY'
);

-- CreateTable
CREATE TABLE "system_settings" (
  "id" UUID NOT NULL,
  "vat_enabled" BOOLEAN NOT NULL,
  "default_vat_rate" DECIMAL(6, 5) NOT NULL,
  "prices_include_vat" BOOLEAN NOT NULL,
  "show_vat_on_invoice" BOOLEAN NOT NULL,
  "tax_registration_number" TEXT,
  "payment_deposit_policy" "PaymentDepositPolicy" NOT NULL,
  "updated_by_user_id" UUID,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "system_settings"
ADD CONSTRAINT "system_settings_updated_by_user_id_fkey"
FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
