CREATE TABLE IF NOT EXISTS "client_communications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "proposal_id" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "template_name" TEXT,
    "event_type" TEXT,
    "recipient" TEXT NOT NULL,
    "message_content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "sent_by_user_id" TEXT NOT NULL,
    "sent_by_user_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_communications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "client_communications_tenant_id_client_id_created_at_idx"
ON "client_communications"("tenant_id", "client_id", "created_at");

DO $$ BEGIN
    ALTER TABLE "client_communications" ADD CONSTRAINT "client_communications_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "client_communications" ADD CONSTRAINT "client_communications_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "client_communications" ADD CONSTRAINT "client_communications_proposal_id_fkey"
    FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
