-- AlterTable
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "admin_target_tenant_id" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "admin_target_tenant_name" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "admin_switched_at" TIMESTAMP(3);
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "admin_context_expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sessions_admin_target_tenant_id_idx" ON "sessions"("admin_target_tenant_id");
