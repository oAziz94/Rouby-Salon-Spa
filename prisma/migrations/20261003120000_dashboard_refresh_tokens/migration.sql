-- Dashboard sessions: opaque refresh tokens (hashed, rotated on use)
CREATE TABLE "dashboard_refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,
    "user_agent" TEXT,
    "ip_address" TEXT,

    CONSTRAINT "dashboard_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dashboard_refresh_tokens_token_hash_key" ON "dashboard_refresh_tokens"("token_hash");
CREATE INDEX "dashboard_refresh_tokens_user_id_idx" ON "dashboard_refresh_tokens"("user_id");
CREATE INDEX "dashboard_refresh_tokens_family_id_idx" ON "dashboard_refresh_tokens"("family_id");
CREATE INDEX "dashboard_refresh_tokens_expires_at_idx" ON "dashboard_refresh_tokens"("expires_at");

ALTER TABLE "dashboard_refresh_tokens" ADD CONSTRAINT "dashboard_refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
