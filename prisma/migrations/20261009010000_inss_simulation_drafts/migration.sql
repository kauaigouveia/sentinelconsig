ALTER TABLE "simulation_requests" ADD COLUMN IF NOT EXISTS "selected_condition" JSONB;
ALTER TABLE "simulation_requests" ADD COLUMN IF NOT EXISTS "customer_data" JSONB;
