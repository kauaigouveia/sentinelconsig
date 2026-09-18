-- AlterTable
ALTER TABLE "proposal_statuses" ADD COLUMN IF NOT EXISTS "responsible_group" TEXT NOT NULL DEFAULT 'NOSSA EQUIPE';
ALTER TABLE "proposal_statuses" ADD COLUMN IF NOT EXISTS "final_status" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "proposal_statuses" ADD COLUMN IF NOT EXISTS "manual_change_allowed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "proposal_statuses" ADD COLUMN IF NOT EXISTS "automatic_change_allowed" BOOLEAN NOT NULL DEFAULT true;

-- Update defaults for existing statuses
UPDATE "proposal_statuses" SET "responsible_group" = 'CLIENTE' WHERE "code" = 'AGUARDAR_FORMALIZACAO';
UPDATE "proposal_statuses" SET "responsible_group" = 'NOSSA EQUIPE' WHERE "code" IN ('AGUARDA_LIBERACAO_CORBAN', 'PENDENTE_ANEXO_DOCUMENTACAO');
UPDATE "proposal_statuses" SET "responsible_group" = 'BANCO' WHERE "code" = 'AGUARDAR_RETORNO_CIP';
UPDATE "proposal_statuses" SET "responsible_group" = 'SISTEMA' WHERE "code" IN ('AGUARDAR_PORTABILIDADE', 'SALDO_RETORNADO', 'INTEGRADO', 'PAGO', 'CANCELADO', 'REPROVADO');
UPDATE "proposal_statuses" SET "responsible_group" = 'PARCEIRO' WHERE "code" = 'PENDENTE_ENVIO_DOCUMENTACAO';

UPDATE "proposal_statuses" SET "final_status" = true WHERE "code" IN ('PAGO', 'CANCELADO', 'REPROVADO');
