import { PrismaClient } from '@prisma/client';

export const DEFAULT_PROPOSAL_STATUSES = [
  { name: 'AGUARDAR FORMALIZAÇÃO', code: 'AGUARDAR_FORMALIZACAO', color: '#64748b', standardCategory: 'ESTEIRA' as const, slaHours: 24, order: 1, active: true, responsibleGroup: 'CLIENTE', finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true },
  { name: 'AGUARDA LIBERAÇÃO CORBAN', code: 'AGUARDA_LIBERACAO_CORBAN', color: '#eab308', standardCategory: 'ESTEIRA' as const, slaHours: 12, order: 2, active: true, responsibleGroup: 'NOSSA EQUIPE', finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true },
  { name: 'AGUARDAR RETORNO CIP', code: 'AGUARDAR_RETORNO_CIP', color: '#3b82f6', standardCategory: 'ANDAMENTO' as const, slaHours: 120, order: 3, active: true, responsibleGroup: 'BANCO', finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true },
  { name: 'AGUARDAR PORTABILIDADE', code: 'AGUARDAR_PORTABILIDADE', color: '#8b5cf6', standardCategory: 'ANDAMENTO' as const, slaHours: 120, order: 4, active: true, responsibleGroup: 'SISTEMA', finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true },
  { name: 'SALDO RETORNADO', code: 'SALDO_RETORNADO', color: '#10b981', standardCategory: 'ANDAMENTO' as const, slaHours: 24, order: 5, active: true, responsibleGroup: 'SISTEMA', finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true },
  { name: 'PENDENTE ENVIO DE DOCUMENTAÇÃO', code: 'PENDENTE_ENVIO_DOCUMENTACAO', color: '#ef4444', standardCategory: 'PENDENTE' as const, slaHours: 48, order: 6, active: true, responsibleGroup: 'PARCEIRO', finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true },
  { name: 'PENDENTE ANEXO DOCUMENTAÇÃO', code: 'PENDENTE_ANEXO_DOCUMENTACAO', color: '#f97316', standardCategory: 'PENDENTE' as const, slaHours: 24, order: 7, active: true, responsibleGroup: 'NOSSA EQUIPE', finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true },
  { name: 'INTEGRADO', code: 'INTEGRADO', color: '#06b6d4', standardCategory: 'ANDAMENTO' as const, slaHours: 12, order: 8, active: true, responsibleGroup: 'SISTEMA', finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true },
  { name: 'PAGO', code: 'PAGO', color: '#22c55e', standardCategory: 'PAGO' as const, slaHours: 0, order: 9, active: true, responsibleGroup: 'SISTEMA', finalStatus: true, manualChangeAllowed: true, automaticChangeAllowed: true },
  { name: 'CANCELADO', code: 'CANCELADO', color: '#94a3b8', standardCategory: 'CANCELADO' as const, slaHours: 0, order: 10, active: true, responsibleGroup: 'SISTEMA', finalStatus: true, manualChangeAllowed: true, automaticChangeAllowed: true },
  { name: 'REPROVADO', code: 'REPROVADO', color: '#dc2626', standardCategory: 'RECUSADO' as const, slaHours: 0, order: 11, active: true, responsibleGroup: 'SISTEMA', finalStatus: true, manualChangeAllowed: true, automaticChangeAllowed: true },
];

export async function ensureDefaultStatusesForTenant(prisma: PrismaClient, tenantId: string) {
  if (!tenantId) return;
  const existingCount = await prisma.proposalStatus.count({
    where: { tenantId },
  });
  if (existingCount > 0) return;

  const dataToInsert = DEFAULT_PROPOSAL_STATUSES.map(st => ({
    tenantId,
    ...st,
  }));

  await prisma.proposalStatus.createMany({
    data: dataToInsert,
    skipDuplicates: true,
  });
}

export async function ensureDefaultStatusesForAllTenants(prisma: PrismaClient) {
  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    for (const tenant of tenants) {
      await ensureDefaultStatusesForTenant(prisma, tenant.id);
    }
  } catch (err) {
    console.warn('[StatusService] Aviso ao assegurar status padrões para tenants:', err);
  }
}
