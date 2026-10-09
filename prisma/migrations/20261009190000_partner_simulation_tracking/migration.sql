ALTER TABLE "simulation_requests" ALTER COLUMN "created_by_id" DROP NOT NULL;
ALTER TABLE "simulation_requests" DROP CONSTRAINT "simulation_requests_created_by_id_fkey";
ALTER TABLE "simulation_requests" ADD CONSTRAINT "simulation_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulation_requests"
  ADD COLUMN "portal_attempt_key" TEXT,
  ADD COLUMN "partner_code_snapshot" TEXT,
  ADD COLUMN "portal_access_name" TEXT,
  ADD COLUMN "offer_expires_at" TIMESTAMP(3),
  ADD COLUMN "offer_lost_at" TIMESTAMP(3),
  ADD COLUMN "matched_after_deadline" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "simulation_requests_portal_attempt_key_key" ON "simulation_requests"("portal_attempt_key");
CREATE INDEX "simulation_requests_offer_expires_at_idx" ON "simulation_requests"("offer_expires_at");
CREATE UNIQUE INDEX "simulation_requests_portal_proposal_key" ON "simulation_requests"("matched_proposal_id") WHERE "simulation_type" = 'PARTNER_AUTO' AND "matched_proposal_id" IS NOT NULL;
