ALTER TABLE "support_conversations"
  ADD COLUMN "rating" INTEGER,
  ADD COLUMN "rating_comment" TEXT,
  ADD COLUMN "rated_at" TIMESTAMP(3),
  ADD COLUMN "rated_by_access_id" TEXT,
  ADD CONSTRAINT "support_conversations_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
CREATE TABLE "support_reply_templates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_reply_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "support_reply_templates_tenant_id_created_by_id_idx" ON "support_reply_templates"("tenant_id", "created_by_id");
