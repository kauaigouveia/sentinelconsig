-- AlterTable proposals
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "facta_proposal_number" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "facta_af_code" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "facta_contract_number" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "facta_raw_status" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "facta_crivo_status" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "facta_last_movement_at" TIMESTAMP(3);
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "facta_last_sync_at" TIMESTAMP(3);
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "facta_sync_status" TEXT DEFAULT 'PENDING';
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "facta_sync_error" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "facta_raw_data" JSONB;

-- CreateIndexes on proposals
CREATE INDEX IF NOT EXISTS "proposals_facta_proposal_number_idx" ON "proposals"("facta_proposal_number");
CREATE INDEX IF NOT EXISTS "proposals_facta_af_code_idx" ON "proposals"("facta_af_code");
CREATE INDEX IF NOT EXISTS "proposals_facta_contract_number_idx" ON "proposals"("facta_contract_number");

-- CreateTable facta_tenant_configs
CREATE TABLE IF NOT EXISTS "facta_tenant_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facta_tenant_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "facta_tenant_configs_tenant_id_key_key" ON "facta_tenant_configs"("tenant_id", "key");
CREATE INDEX IF NOT EXISTS "facta_tenant_configs_tenant_id_idx" ON "facta_tenant_configs"("tenant_id");

DO $$ BEGIN
    ALTER TABLE "facta_tenant_configs" ADD CONSTRAINT "facta_tenant_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable facta_sync_histories
CREATE TABLE IF NOT EXISTS "facta_sync_histories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "proposal_id" TEXT,
    "facta_proposal_number" TEXT,
    "facta_af_code" TEXT,
    "facta_contract_number" TEXT,
    "query_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "has_changed" BOOLEAN NOT NULL DEFAULT false,
    "status_mapped" BOOLEAN NOT NULL DEFAULT false,
    "previous_raw_status" TEXT,
    "current_raw_status" TEXT,
    "previous_crivo_status" TEXT,
    "current_crivo_status" TEXT,
    "previous_internal_status" TEXT,
    "current_internal_status" TEXT,
    "technical_error" TEXT,
    "unlinked_reason" TEXT,
    "raw_response" JSONB,
    "queried_by" TEXT NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "facta_sync_histories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "facta_sync_histories_tenant_id_idx" ON "facta_sync_histories"("tenant_id");
CREATE INDEX IF NOT EXISTS "facta_sync_histories_proposal_id_idx" ON "facta_sync_histories"("proposal_id");
CREATE INDEX IF NOT EXISTS "facta_sync_histories_query_date_idx" ON "facta_sync_histories"("query_date");

DO $$ BEGIN
    ALTER TABLE "facta_sync_histories" ADD CONSTRAINT "facta_sync_histories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "facta_sync_histories" ADD CONSTRAINT "facta_sync_histories_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
