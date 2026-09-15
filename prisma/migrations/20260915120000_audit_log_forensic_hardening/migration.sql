-- Migration: 20260915120000_audit_log_forensic_hardening
-- Purpose: Hardens audit logs with cryptographic hash chain (SHA-256), DB-level immutability triggers (block UPDATE/DELETE), and ON DELETE RESTRICT on Tenant relationship.

-- 1. Alter Table audit_logs: Add hash chain columns
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "previous_hash" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "record_hash" TEXT;

-- 2. Create Composite Index for efficient per-tenant sequential chain queries
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- 3. Modify Foreign Key from audit_logs to tenants to ON DELETE RESTRICT
DO $$
BEGIN
  -- Drop existing foreign key constraint if present
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'audit_logs_tenant_id_fkey' AND table_name = 'audit_logs'
  ) THEN
    ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_tenant_id_fkey";
  END IF;
  
  -- Re-add foreign key with ON DELETE RESTRICT
  ALTER TABLE "audit_logs" 
    ADD CONSTRAINT "audit_logs_tenant_id_fkey" 
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") 
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Constraint update skipped or already applied: %', SQLERRM;
END $$;

-- 4. Enable pgcrypto extension if available for retroactive hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 5. Backfill existing legacy audit logs with deterministic SHA-256 hash if empty
DO $$
BEGIN
  UPDATE "audit_logs"
  SET "record_hash" = encode(
    digest(
      COALESCE("id", '') || ':' ||
      COALESCE("tenant_id", 'GLOBAL') || ':' ||
      COALESCE("user_id", '') || ':' ||
      COALESCE("action", '') || ':' ||
      COALESCE("entity", '') || ':' ||
      COALESCE("entity_id", '') || ':' ||
      COALESCE("created_at"::text, ''),
      'sha256'
    ),
    'hex'
  )
  WHERE "record_hash" IS NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Retroactive hash backfill note: %', SQLERRM;
END $$;

-- 6. DB-Level Immutability: Function & Triggers blocking UPDATE and DELETE
CREATE OR REPLACE FUNCTION enforce_audit_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: Audit logs cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

-- Trigger for UPDATE
DROP TRIGGER IF EXISTS trg_audit_log_immutable_update ON "audit_logs";
CREATE TRIGGER trg_audit_log_immutable_update
BEFORE UPDATE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION enforce_audit_log_immutability();

-- Trigger for DELETE
DROP TRIGGER IF EXISTS trg_audit_log_immutable_delete ON "audit_logs";
CREATE TRIGGER trg_audit_log_immutable_delete
BEFORE DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION enforce_audit_log_immutability();
