-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "event_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_event_key_key" ON "notifications"("tenant_id", "event_key");
