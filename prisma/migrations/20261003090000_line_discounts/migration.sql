-- Per-line discounts (additive).
ALTER TABLE "booking_items"
  ADD COLUMN "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discount_reason" TEXT;

ALTER TABLE "invoice_lines"
  ADD COLUMN "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
