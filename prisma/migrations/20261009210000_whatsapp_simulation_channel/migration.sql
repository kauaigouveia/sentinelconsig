ALTER TABLE "support_conversations"
  ADD COLUMN "department" TEXT NOT NULL DEFAULT 'SUPPORT',
  ADD COLUMN "whatsapp_phone" TEXT,
  ADD COLUMN "whatsapp_instance" TEXT,
  ADD COLUMN "simulation_stage" TEXT,
  ADD COLUMN "simulation_data" JSONB;
ALTER TABLE "support_messages"
  ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN "delivery_status" TEXT NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN "delivery_attempt_at" TIMESTAMP(3),
  ADD COLUMN "attachment_data" BYTEA,
  ADD COLUMN "attachment_name" TEXT,
  ADD COLUMN "attachment_mime" TEXT;
CREATE UNIQUE INDEX "support_messages_idempotency_key_key" ON "support_messages"("idempotency_key");
CREATE INDEX "support_conversations_tenant_id_department_status_idx" ON "support_conversations"("tenant_id", "department", "status");
