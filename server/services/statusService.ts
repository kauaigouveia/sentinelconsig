import { PrismaClient } from '@prisma/client';

export const DEFAULT_PROPOSAL_STATUSES = [
  { name: 'AGUARDAR FORMALIZAÇÃO', code: 'AGUARDAR_FORMALIZACAO', color: '#64748b', standardCategory: 'ESTEIRA' as const, slaHours: 24, order: 1, active: true },
  { name: 'AGUARDA LIBERAÇÃO CORBAN', code: 'AGUARDA_LIBERACAO_CORBAN', color: '#eab308', standardCategory: 'ESTEIRA' as const, slaHours: 12, order: 2, active: true },
  { name: 'AGUARDAR RETORNO CIP', code: 'AGUARDAR_RETORNO_CIP', color: '#3b82f6', standardCategory: 'ANDAMENTO' as const, slaHours: 120, order: 3, active: true },
  { name: 'AGUARDAR PORTABILIDADE', code: 'AGUARDAR_PORTABILIDADE', color: '#8b5cf6', standardCategory: 'ANDAMENTO' as const, slaHours: 120, order: 4, active: true },
  { name: 'SALDO RETORNADO', code: 'SALDO_RETORNADO', color: '#10b981', standardCategory: 'ANDAMENTO' as const, slaHours: 24, order: 5, active: true },
  { name: 'PENDENTE ENVIO DE DOCUMENTAÇÃO', code: 'PENDENTE_ENVIO_DOCUMENTACAO', color: '#ef4444', standardCategory: 'PENDENTE' as const, slaHours: 48, order: 6, active: true },
  { name: 'PENDENTE ANEXO DOCUMENTAÇÃO', code: 'PENDENTE_ANEXO_DOCUMENTACAO', color: '#f97316', standardCategory: 'PENDENTE' as const, slaHours: 24, order: 7, active: true },
  { name: 'INTEGRADO', code: 'INTEGRADO', color: '#06b6d4', standardCategory: 'ANDAMENTO' as const, slaHours: 12, order: 8, active: true },
  { name: 'PAGO', code: 'PAGO', color: '#22c55e', standardCategory: 'PAGO' as const, slaHours: 0, order: 9, active: true },
  { name: 'CANCELADO', code: 'CANCELADO', color: '#94a3b8', standardCategory: 'CANCELADO' as const, slaHours: 0, order: 10, active: true },
  { name: 'REPROVADO', code: 'REPROVADO', color: '#dc2626', standardCategory: 'RECUSADO' as const, slaHours: 0, order: 11, active: true },
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
    if (tenants.length === 0) return;

    const dataToInsert = tenants.flatMap(tenant =>
      DEFAULT_PROPOSAL_STATUSES.map(st => ({
        tenantId: tenant.id,
        ...st,
      }))
    );

    await prisma.proposalStatus.createMany({
      data: dataToInsert,
      skipDuplicates: true,
    });
  } catch (err) {
    console.warn('[StatusService] Aviso ao assegurar status padrões para tenants:', err);
  }
}
