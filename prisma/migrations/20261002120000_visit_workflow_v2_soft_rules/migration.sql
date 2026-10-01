-- Visit workflow v2 (spec §3-§4): close-with-balance reason, reception discount cap
ALTER TABLE "queue_entries" ADD COLUMN "closed_with_balance_reason" TEXT;
ALTER TABLE "system_settings" ADD COLUMN "discount_limit_percent_without_approval" DECIMAL(5,2) NOT NULL DEFAULT 15;
