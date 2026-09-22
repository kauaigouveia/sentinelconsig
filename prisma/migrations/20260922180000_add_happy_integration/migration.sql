-- AlterTable proposals with Happy / BYX Capital fields
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "happy_contract_id" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "happy_status" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "happy_status_code" INTEGER;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "happy_status_name" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "happy_status_description" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "happy_product_type" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "happy_portability_status" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "happy_digitizer" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "happy_proposal_key" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "happy_customer_id" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "happy_last_sync_at" TIMESTAMP(3);
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "happy_sync_status" TEXT DEFAULT 'PENDING';
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "happy_sync_error" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "happy_raw_data" JSONB;

-- CreateIndexes on proposals
CREATE INDEX IF NOT EXISTS "proposals_tenant_id_happy_contract_id_idx" ON "proposals"("tenant_id", "happy_contract_id");
CREATE INDEX IF NOT EXISTS "proposals_tenant_id_happy_proposal_key_idx" ON "proposals"("tenant_id", "happy_proposal_key");
CREATE INDEX IF NOT EXISTS "proposals_happy_sync_status_idx" ON "proposals"("happy_sync_status");

-- CreateTable happy_webhook_events
CREATE TABLE IF NOT EXISTS "happy_webhook_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "request_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "customer_id" TEXT,
    "contract_id" TEXT,
    "digitador" TEXT,
    "status_code" INTEGER,
    "status_name" TEXT,
    "status_description" TEXT,
    "proposal_key" TEXT,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "processing_status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "processing_error" TEXT,
    "matched_proposal_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "happy_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "happy_webhook_events_request_id_key" ON "happy_webhook_events"("request_id");
CREATE INDEX IF NOT EXISTS "happy_webhook_events_tenant_id_idx" ON "happy_webhook_events"("tenant_id");
CREATE INDEX IF NOT EXISTS "happy_webhook_events_contract_id_idx" ON "happy_webhook_events"("contract_id");
CREATE INDEX IF NOT EXISTS "happy_webhook_events_proposal_key_idx" ON "happy_webhook_events"("proposal_key");
CREATE INDEX IF NOT EXISTS "happy_webhook_events_processing_status_idx" ON "happy_webhook_events"("processing_status");
CREATE INDEX IF NOT EXISTS "happy_webhook_events_received_at_idx" ON "happy_webhook_events"("received_at");

DO $$ BEGIN
    ALTER TABLE "happy_webhook_events" ADD CONSTRAINT "happy_webhook_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable happy_sync_histories
CREATE TABLE IF NOT EXISTS "happy_sync_histories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "proposal_id" TEXT,
    "happy_contract_id" TEXT,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "previous_status" TEXT,
    "new_status" TEXT,
    "request_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "error" TEXT,
    "raw_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "happy_sync_histories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "happy_sync_histories_tenant_id_idx" ON "happy_sync_histories"("tenant_id");
CREATE INDEX IF NOT EXISTS "happy_sync_histories_proposal_id_idx" ON "happy_sync_histories"("proposal_id");
CREATE INDEX IF NOT EXISTS "happy_sync_histories_happy_contract_id_idx" ON "happy_sync_histories"("happy_contract_id");
CREATE INDEX IF NOT EXISTS "happy_sync_histories_started_at_idx" ON "happy_sync_histories"("started_at");

DO $$ BEGIN
    ALTER TABLE "happy_sync_histories" ADD CONSTRAINT "happy_sync_histories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "happy_sync_histories" ADD CONSTRAINT "happy_sync_histories_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
