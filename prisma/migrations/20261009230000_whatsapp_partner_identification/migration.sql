CREATE TABLE "whatsapp_identifications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "conversation_id" TEXT,
    "verified_message_id" TEXT,
    "seen_message_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "reply_text" TEXT,
    "reply_message_id" TEXT,
    "reply_status" TEXT NOT NULL DEFAULT 'PENDING',
    "delivery_attempt_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_identifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_identifications_tenant_id_instance_sender_key" ON "whatsapp_identifications"("tenant_id", "instance", "sender");
CREATE INDEX "whatsapp_identifications_expires_at_idx" ON "whatsapp_identifications"("expires_at");
ALTER TABLE "whatsapp_identifications" ADD CONSTRAINT "whatsapp_identifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_identifications" ADD CONSTRAINT "whatsapp_identifications_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
