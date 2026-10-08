ALTER TABLE "simulation_requests" ADD COLUMN IF NOT EXISTS "finanto_simulation_id" TEXT;
ALTER TABLE "simulation_requests" ADD COLUMN IF NOT EXISTS "finanto_journey_status" TEXT;
ALTER TABLE "simulation_requests" ADD COLUMN IF NOT EXISTS "finanto_raw_data" JSONB;
ALTER TABLE "simulation_requests" ADD COLUMN IF NOT EXISTS "finanto_selected_condition" JSONB;

CREATE INDEX IF NOT EXISTS "simulation_requests_tenant_id_finanto_simulation_id_idx"
ON "simulation_requests"("tenant_id", "finanto_simulation_id");
