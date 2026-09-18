-- CreateTable
CREATE TABLE IF NOT EXISTS "user_tenant_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "custom_permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "effective_tenant_id" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "effective_membership_id" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "active_role" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "active_permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_tenant_memberships_user_id_tenant_id_key" ON "user_tenant_memberships"("user_id", "tenant_id");
CREATE INDEX IF NOT EXISTS "user_tenant_memberships_user_id_idx" ON "user_tenant_memberships"("user_id");
CREATE INDEX IF NOT EXISTS "user_tenant_memberships_tenant_id_idx" ON "user_tenant_memberships"("tenant_id");
CREATE INDEX IF NOT EXISTS "user_tenant_memberships_active_idx" ON "user_tenant_memberships"("active");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "user_tenant_memberships" ADD CONSTRAINT "user_tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "user_tenant_memberships" ADD CONSTRAINT "user_tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
