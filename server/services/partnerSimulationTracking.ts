import type { PrismaClient } from '@prisma/client';

// Five working days, Monday-Friday, at the same local time (America/Bahia).
export function simulationDeadline(createdAt: Date): Date {
  const local = new Date(createdAt.getTime() - 3 * 60 * 60 * 1000);
  let days = 0;
  while (days < 5) {
    local.setUTCDate(local.getUTCDate() + 1);
    if (![0, 6].includes(local.getUTCDay())) days++;
  }
  return new Date(local.getTime() + 3 * 60 * 60 * 1000);
}

export class PartnerSimulationTracking {
  static async record(prisma: PrismaClient, context: { tenantId: string; partnerId: string; partnerCode: string; accessName: string }, attemptKey: string, input: any, offers: any[]) {
    const available = offers.filter(offer => Number.isFinite(offer.amount) && offer.amount > 0);
    if (!available.length) return null;
    const first = [...available].sort((a, b) => b.amount - a.amount)[0];
    const selectedCondition = { provider: first.provider, tableId: first.code || first.table || '', tableName: first.name || first.table || '', amount: first.amount, term: first.term || 0, installment: first.installment || null, rate: first.rate || null };
    const customerData = JSON.parse(JSON.stringify({ ...input, partnerCode: context.partnerCode, offers: available }));
    return prisma.simulationRequest.upsert({
      where: { portalAttemptKey: `${context.tenantId}:${context.partnerId}:${attemptKey}` },
      update: { selectedCondition, customerData },
      create: {
        tenantId: context.tenantId, partnerId: context.partnerId, partnerCodeSnapshot: context.partnerCode,
        portalAccessName: context.accessName, portalAttemptKey: `${context.tenantId}:${context.partnerId}:${attemptKey}`,
        cpf: input.cpf, status: 'SIMULAÇÃO ENVIADA', simulationType: 'PARTNER_AUTO', operationType: `${input.product}:${input.operation || 'NEW'}`,
        offerExpiresAt: simulationDeadline(new Date()),
        selectedCondition, customerData,
      },
    });
  }

  // Reconcile on list/report reads as well as cron, so expiry never depends on
  // a browser being open or a continuously running process on Vercel.
  static async reconcile(prisma: PrismaClient, tenantId: string, now = new Date()) {
    const simulations = await prisma.simulationRequest.findMany({
      where: { tenantId, simulationType: 'PARTNER_AUTO', deletedAt: null, matchedProposalId: null, status: { in: ['SIMULAÇÃO ENVIADA', 'PERDIDA (NÃO DIGITADA)'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!simulations.length) return;
    const proposals = await prisma.proposal.findMany({
      where: { tenantId, partnerId: { in: [...new Set(simulations.map(sim => sim.partnerId).filter((id): id is string => !!id))] }, createdAt: { gte: simulations[simulations.length - 1].createdAt }, deletedAt: null },
      include: { client: { select: { cpf: true } }, bank: { select: { name: true } }, product: { select: { name: true } }, createdBy: { select: { name: true } }, matchedSimulationRequests: { select: { id: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const used = new Set<string>();
    for (const proposal of proposals) {
      if (proposal.matchedSimulationRequests.length) continue;
      const candidates = simulations.filter(sim => !used.has(sim.id) && sim.partnerId === proposal.partnerId && sim.cpf === proposal.client.cpf.replace(/\D/g, '') && sim.createdAt <= proposal.createdAt).filter(sim => {
        const data = sim.customerData as any;
        const productName = String(proposal.product?.name || '').toUpperCase();
        const isClt = /CLT|PRIVADO|TRABALHADOR/.test(productName);
        const isFgts = /FGTS/.test(productName);
        if (data?.product === 'CLT' ? !isClt : data?.product === 'FGTS' ? !isFgts : isClt || isFgts) return false;
        const expected = ({ NEW: 'NOVO', PORT: 'PORTABILIDADE', PORT_REFIN: 'REFIN_PORTABILIDADE', REFIN: 'REFIN' } as Record<string, string>)[data?.operation || 'NEW'];
        if (proposal.type !== expected) return false;
        const bank = String(proposal.bank?.name || '').toUpperCase();
        return (data?.offers || []).some((offer: any) => {
          const institution = String(offer.institution || offer.provider || '').trim().toUpperCase();
          return bank && institution && (institution.includes(bank) || bank.includes(institution))
            && Number(offer.term) === proposal.installmentsCount
            && (data.product === 'FGTS' || (Number(offer.installment) > 0 && Math.abs(Number(offer.installment) - Number(proposal.installmentValue)) <= 0.05))
            && Math.abs(Number(offer.amount) - Number(proposal.releasedValue)) <= 1;
        });
      });
      // Latest eligible simulation is credited once; repeated attempts remain
      // visible instead of inflating conversion by marking all attempts digitized.
      const sim = candidates[0];
      if (!sim) continue;
      const late = !!sim.offerExpiresAt && proposal.createdAt > sim.offerExpiresAt;
      const updated = await prisma.simulationRequest.updateMany({
        where: { id: sim.id, tenantId, matchedProposalId: null, status: { in: ['SIMULAÇÃO ENVIADA', 'PERDIDA (NÃO DIGITADA)'] } },
        data: { status: 'DIGITADA PELA MESA', matchedProposalId: proposal.id, matchedProposalNumber: proposal.proposalNumber, matchedAt: proposal.createdAt, matchedDigitizerId: proposal.createdById, matchedDigitizerName: proposal.createdBy?.name || 'Mesa', matchedAfterDeadline: late, ...(late ? { offerLostAt: sim.offerExpiresAt } : {}) },
      }).catch((error: any) => { if (error.code === 'P2002') return { count: 0 }; throw error; });
      if (updated.count) used.add(sim.id);
    }
    await prisma.simulationRequest.updateMany({
      where: { tenantId, simulationType: 'PARTNER_AUTO', deletedAt: null, matchedProposalId: null, status: 'SIMULAÇÃO ENVIADA', offerExpiresAt: { lte: now } },
      data: { status: 'PERDIDA (NÃO DIGITADA)', offerLostAt: now },
    });
  }
}
