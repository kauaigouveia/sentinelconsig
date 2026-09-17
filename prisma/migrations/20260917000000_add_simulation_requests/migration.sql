-- CreateTable
CREATE TABLE "simulation_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SIMULAÇÃO ENVIADA',
    "rejection_reason" TEXT,
    "matched_proposal_id" TEXT,
    "matched_proposal_number" TEXT,
    "matched_digitizer_id" TEXT,
    "matched_digitizer_name" TEXT,
    "matched_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simulation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "simulation_requests_tenant_id_idx" ON "simulation_requests"("tenant_id");

-- CreateIndex
CREATE INDEX "simulation_requests_tenant_id_status_idx" ON "simulation_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "simulation_requests_tenant_id_cpf_idx" ON "simulation_requests"("tenant_id", "cpf");

-- CreateIndex
CREATE INDEX "simulation_requests_tenant_id_partner_id_idx" ON "simulation_requests"("tenant_id", "partner_id");

-- CreateIndex
CREATE INDEX "simulation_requests_tenant_id_created_by_id_idx" ON "simulation_requests"("tenant_id", "created_by_id");

-- CreateIndex
CREATE INDEX "simulation_requests_created_at_idx" ON "simulation_requests"("created_at");

-- AddForeignKey
ALTER TABLE "simulation_requests" ADD CONSTRAINT "simulation_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_requests" ADD CONSTRAINT "simulation_requests_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_requests" ADD CONSTRAINT "simulation_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_requests" ADD CONSTRAINT "simulation_requests_matched_proposal_id_fkey" FOREIGN KEY ("matched_proposal_id") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_requests" ADD CONSTRAINT "simulation_requests_matched_digitizer_id_fkey" FOREIGN KEY ("matched_digitizer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
