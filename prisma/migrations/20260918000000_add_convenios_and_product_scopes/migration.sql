-- AlterTable Product
ALTER TABLE "products" ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "products" ALTER COLUMN "code" DROP NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "allows_multiple_ade" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "requires_portability_relation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "convenio_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
DROP INDEX IF EXISTS "products_tenant_id_code_key";
CREATE INDEX IF NOT EXISTS "products_scope_idx" ON "products"("scope");
CREATE INDEX IF NOT EXISTS "products_active_idx" ON "products"("active");

-- CreateTable convenios
CREATE TABLE IF NOT EXISTS "convenios" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convenios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "convenios_tenant_id_idx" ON "convenios"("tenant_id");
CREATE INDEX IF NOT EXISTS "convenios_scope_idx" ON "convenios"("scope");
CREATE INDEX IF NOT EXISTS "convenios_active_idx" ON "convenios"("active");

-- Foreign key for convenios
DO $$ BEGIN
    ALTER TABLE "convenios" ADD CONSTRAINT "convenios_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable proposals
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "convenio_id" TEXT;
CREATE INDEX IF NOT EXISTS "proposals_convenio_id_idx" ON "proposals"("convenio_id");

DO $$ BEGIN
    ALTER TABLE "proposals" ADD CONSTRAINT "proposals_convenio_id_fkey" FOREIGN KEY ("convenio_id") REFERENCES "convenios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable ades
ALTER TABLE "ades" ADD COLUMN IF NOT EXISTS "convenio_id" TEXT;
ALTER TABLE "ades" ADD COLUMN IF NOT EXISTS "product_id" TEXT;
CREATE INDEX IF NOT EXISTS "ades_convenio_id_idx" ON "ades"("convenio_id");
CREATE INDEX IF NOT EXISTS "ades_product_id_idx" ON "ades"("product_id");

DO $$ BEGIN
    ALTER TABLE "ades" ADD CONSTRAINT "ades_convenio_id_fkey" FOREIGN KEY ("convenio_id") REFERENCES "convenios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ades" ADD CONSTRAINT "ades_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable simulation_requests
ALTER TABLE "simulation_requests" ADD COLUMN IF NOT EXISTS "convenio_id" TEXT;
ALTER TABLE "simulation_requests" ADD COLUMN IF NOT EXISTS "product_id" TEXT;
CREATE INDEX IF NOT EXISTS "simulation_requests_convenio_id_idx" ON "simulation_requests"("convenio_id");
CREATE INDEX IF NOT EXISTS "simulation_requests_product_id_idx" ON "simulation_requests"("product_id");

DO $$ BEGIN
    ALTER TABLE "simulation_requests" ADD CONSTRAINT "simulation_requests_convenio_id_fkey" FOREIGN KEY ("convenio_id") REFERENCES "convenios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "simulation_requests" ADD CONSTRAINT "simulation_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable operational_rules
CREATE TABLE IF NOT EXISTS "operational_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "applies_to_all_products" BOOLEAN NOT NULL DEFAULT true,
    "product_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applies_to_all_convenios" BOOLEAN NOT NULL DEFAULT true,
    "convenio_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "min_installments" INTEGER,
    "max_installments" INTEGER,
    "min_contract_value" DECIMAL(12,2),
    "max_contract_value" DECIMAL(12,2),
    "requires_cip_balance" BOOLEAN NOT NULL DEFAULT false,
    "allows_multiple_ade" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "operational_rules_tenant_id_idx" ON "operational_rules"("tenant_id");
CREATE INDEX IF NOT EXISTS "operational_rules_scope_idx" ON "operational_rules"("scope");
CREATE INDEX IF NOT EXISTS "operational_rules_active_idx" ON "operational_rules"("active");

DO $$ BEGIN
    ALTER TABLE "operational_rules" ADD CONSTRAINT "operational_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
