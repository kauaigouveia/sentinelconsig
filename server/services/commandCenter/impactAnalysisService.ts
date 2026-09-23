import { PrismaClient } from '@prisma/client';
import { ImpactAnalysisResult } from './commandCenterTypes';

export class ImpactAnalysisService {
  /**
   * Calculate real operational and potential financial impact for an incident
   */
  static async calculateImpact(
    prisma: PrismaClient,
    tenantId: string,
    options: {
      incidentId?: string;
      bankId?: string;
      productId?: string;
      convenioId?: string;
      partnerId?: string;
      integrationSlug?: string;
      windowStart?: Date;
      windowEnd?: Date;
    }
  ): Promise<ImpactAnalysisResult> {
    const windowStart = options.windowStart || new Date(Date.now() - 24 * 60 * 60 * 1000); // default last 24h
    const windowEnd = options.windowEnd || new Date();

    // 1. Fetch Proposals in window matching dimensions
    const proposalWhere: any = {
      tenantId,
      createdAt: {
        gte: windowStart,
        lte: windowEnd,
      },
    };

    if (options.bankId) proposalWhere.bankId = options.bankId;
    if (options.productId) proposalWhere.productId = options.productId;
    if (options.convenioId) proposalWhere.convenioId = options.convenioId;
    if (options.partnerId) proposalWhere.partnerId = options.partnerId;

    if (options.integrationSlug) {
      const slug = options.integrationSlug.toLowerCase();
      if (slug === 'c6') proposalWhere.c6ProposalNumber = { not: null };
      else if (slug === 'facta') proposalWhere.factaProposalNumber = { not: null };
      else if (slug === 'happy') proposalWhere.happyContractId = { not: null };
    }

    const proposals = await prisma.proposal.findMany({
      where: proposalWhere,
      select: {
        id: true,
        contractValue: true,
        releasedValue: true,
        partnerId: true,
        productId: true,
        convenioId: true,
      },
    });

    const proposalsAffectedCount = proposals.length;
    const proposalsPotentialVolume = proposals.reduce(
      (sum, p) => sum + Number(p.contractValue || p.releasedValue || 0),
      0
    );

    // Unique partner count
    const partnerIdsInProposals = new Set(proposals.map((p) => p.partnerId).filter(Boolean));
    if (options.partnerId) partnerIdsInProposals.add(options.partnerId);

    // 2. Fetch Simulations in window matching dimensions
    const simWhere: any = {
      tenantId,
      createdAt: {
        gte: windowStart,
        lte: windowEnd,
      },
    };
    if (options.bankId) simWhere.bankId = options.bankId;
    if (options.productId) simWhere.productId = options.productId;
    if (options.convenioId) simWhere.convenioId = options.convenioId;

    const simulationsAffectedCount = await prisma.simulationRequest.count({
      where: simWhere,
    });

    // 3. Fetch Pendencies linked or generated in window
    const pendencyWhere: any = {
      tenantId,
      createdAt: {
        gte: windowStart,
        lte: windowEnd,
      },
    };
    if (options.bankId) pendencyWhere.bankId = options.bankId;
    if (options.partnerId) pendencyWhere.partnerId = options.partnerId;

    let pendenciesCount = await prisma.pendency.count({
      where: pendencyWhere,
    });

    // If incidentId exists, include directly linked pendencies
    if (options.incidentId) {
      const linkedPendencies = await prisma.incidentPendency.count({
        where: { incidentId: options.incidentId },
      });
      pendenciesCount = Math.max(pendenciesCount, linkedPendencies);
    }

    // 4. Products & Convenios Impacted
    const productIds = Array.from(new Set(proposals.map((p) => p.productId).filter(Boolean))) as string[];
    const convenioIds = Array.from(new Set(proposals.map((p) => p.convenioId).filter(Boolean))) as string[];

    let productNames: string[] = [];
    if (productIds.length > 0) {
      const prods = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { name: true },
      });
      productNames = prods.map((p) => p.name);
    }

    let convenioNames: string[] = [];
    if (convenioIds.length > 0) {
      const convs = await prisma.convenio.findMany({
        where: { id: { in: convenioIds } },
        select: { name: true },
      });
      convenioNames = convs.map((c) => c.name);
    }

    // Precise terminology summary
    const formattedVolume = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      proposalsPotentialVolume
    );
    const summaryText = `${proposalsAffectedCount} propostas (${formattedVolume}) e ${simulationsAffectedCount} simulações ocorreram durante a janela de indisponibilidade/anomalia e foram potencialmente afetadas. ${partnerIdsInProposals.size} parceiro(s) e ${pendenciesCount} pendência(s) relacionadas.`;

    return {
      proposalsAffectedCount,
      proposalsPotentialVolume,
      simulationsAffectedCount,
      partnersImpactedCount: partnerIdsInProposals.size,
      pendenciesCount,
      productsImpacted: productNames,
      conveniosImpacted: convenioNames,
      integrationSlug: options.integrationSlug,
      windowStart,
      windowEnd,
      summaryText,
    };
  }
}
