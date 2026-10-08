ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "finanto_simulation_id" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "finanto_status" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "finanto_last_sync_at" TIMESTAMP(3);
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "finanto_sync_error" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "finanto_raw_data" JSONB;

ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "nossa_fintech_debt_key" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "nossa_fintech_product" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "nossa_fintech_status" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "nossa_fintech_status_description" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "nossa_fintech_last_sync_at" TIMESTAMP(3);
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "nossa_fintech_sync_error" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "nossa_fintech_raw_data" JSONB;

CREATE INDEX IF NOT EXISTS "proposals_tenant_id_finanto_simulation_id_idx"
ON "proposals"("tenant_id", "finanto_simulation_id");
CREATE INDEX IF NOT EXISTS "proposals_tenant_id_nossa_fintech_debt_key_idx"
ON "proposals"("tenant_id", "nossa_fintech_debt_key");
