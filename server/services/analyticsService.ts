import { PrismaClient, Prisma } from '@prisma/client';
import {
  BottlenecksResponse,
  DwellTimeResponse,
  DwellTimeStatusStats,
  AgingResponse,
  AgingBucket,
  ProductionResponse,
  SlaResponse,
} from '../../src/types/analytics.js';
import { buildActiveProposalWhere, isStatusFinal } from './statusService.js';

export interface AnalyticsFilterOptions {
  startDate?: Date;
  endDate?: Date;
  bankId?: string;
  partnerId?: string;
  statusId?: string;
  productId?: string;
}

export class AnalyticsService {
  /**
   * 1. GET /api/analytics/bottlenecks
   * Computes SLA bottlenecks, retention volume, dwell time and top retained entities.
   */
  public static async getBottlenecks(
    prisma: PrismaClient,
    tenantId: string,
    filters: AnalyticsFilterOptions = {}
  ): Promise<BottlenecksResponse> {
    const now = new Date();

    // Base WHERE condition strictly with tenantId and deletedAt null, excluding final statuses
    const whereCondition: Prisma.ProposalWhereInput = buildActiveProposalWhere(tenantId);

    if (filters.startDate || filters.endDate) {
      whereCondition.createdAt = {};
      if (filters.startDate) whereCondition.createdAt.gte = filters.startDate;
      if (filters.endDate) whereCondition.createdAt.lte = filters.endDate;
    }
    if (filters.bankId) whereCondition.bankId = filters.bankId;
    if (filters.partnerId) whereCondition.partnerId = filters.partnerId;
    if (filters.statusId) whereCondition.statusId = filters.statusId;
    if (filters.productId) whereCondition.productId = filters.productId;

    // Fetch active proposals with related status, bank, partner, client
    const proposals = await prisma.proposal.findMany({
      where: whereCondition,
      select: {
        id: true,
        proposalNumber: true,
        contractValue: true,
        releasedValue: true,
        createdAt: true,
        bankId: true,
        partnerId: true,
        statusId: true,
        standardCategory: true,
        client: {
          select: {
            fullName: true,
            cpf: true,
          },
        },
        bank: {
          select: {
            id: true,
            name: true,
          },
        },
        partner: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        status: {
          select: {
            id: true,
            name: true,
            code: true,
            standardCategory: true,
            slaHours: true,
            order: true,
            finalStatus: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    let totalActive = 0;
    let totalOverSla = 0;
    let totalNearSla = 0;
    let totalValueStuck = 0;
    let totalDwellHours = 0;
    let maxDwellHours = 0;

    const alcadaMap = new Map<
      string,
      { count: number; overSla: number; nearSla: number; value: number; totalHours: number }
    >();
    const statusMap = new Map<
      string,
      {
        statusId: string;
        statusCode: string;
        statusName: string;
        standardCategory: string;
        alcada: string;
        slaHours: number;
        count: number;
        overSla: number;
        nearSla: number;
        value: number;
        totalHours: number;
      }
    >();
    const bankMap = new Map<
      string,
      { bankId: string; bankName: string; count: number; overSla: number; value: number; totalHours: number }
    >();
    const partnerMap = new Map<
      string,
      { partnerId: string; partnerName: string; partnerLogin: string; count: number; overSla: number; value: number; totalHours: number }
    >();

    const stuckProposalsSample: BottlenecksResponse['stuckProposalsSample'] = [];

    for (const p of proposals) {
      // Guard: strictly ignore proposals in final status (e.g. CANCELADO, PAGO, REPROVADO)
      if (isStatusFinal(p.status) || isStatusFinal({ standardCategory: (p as any).standardCategory })) {
        continue;
      }

      totalActive++;
      const relVal = Number(p.releasedValue || 0);
      const conVal = Number(p.contractValue || 0);
      totalValueStuck += relVal;

      const createdTime = p.createdAt.getTime();
      const dwellHours = Math.max(0, Math.round((now.getTime() - createdTime) / (1000 * 3600)));
      totalDwellHours += dwellHours;
      if (dwellHours > maxDwellHours) maxDwellHours = dwellHours;

      const status = p.status;
      const slaHours = status?.slaHours || 24;
      const isOverSla = dwellHours > slaHours;
      const isNearSla = !isOverSla && dwellHours >= slaHours * 0.75;

      if (isOverSla) totalOverSla++;
      if (isNearSla) totalNearSla++;

      // Determine Alçada from status code or category
      let alcada = 'NOSSA EQUIPE';
      if (status?.code?.includes('CLIENTE') || status?.code === 'AGUARDAR_FORMALIZACAO') {
        alcada = 'CLIENTE';
      } else if (status?.code?.includes('PARCEIRO') || status?.code?.includes('CORBAN') || status?.code?.includes('PENDENCIA')) {
        alcada = 'PARCEIRO';
      } else if (status?.code?.includes('BANCO') || status?.code?.includes('CIP') || status?.code === 'ANALISE_BANCO') {
        alcada = 'BANCO';
      } else if (status?.code?.includes('SISTEMA') || status?.code === 'INTEGRADO') {
        alcada = 'SISTEMA';
      }

      // Alçada aggregation
      const alcEntry = alcadaMap.get(alcada) || { count: 0, overSla: 0, nearSla: 0, value: 0, totalHours: 0 };
      alcEntry.count++;
      if (isOverSla) alcEntry.overSla++;
      if (isNearSla) alcEntry.nearSla++;
      alcEntry.value += relVal;
      alcEntry.totalHours += dwellHours;
      alcadaMap.set(alcada, alcEntry);

      // Status aggregation
      const sId = status?.id || 'unknown';
      const sEntry = statusMap.get(sId) || {
        statusId: sId,
        statusCode: status?.code || 'DESCONHECIDO',
        statusName: status?.name || 'Não Definido',
        standardCategory: status?.standardCategory || 'ESTEIRA',
        alcada,
        slaHours,
        count: 0,
        overSla: 0,
        nearSla: 0,
        value: 0,
        totalHours: 0,
      };
      sEntry.count++;
      if (isOverSla) sEntry.overSla++;
      if (isNearSla) sEntry.nearSla++;
      sEntry.value += relVal;
      sEntry.totalHours += dwellHours;
      statusMap.set(sId, sEntry);

      // Bank aggregation
      if (p.bank) {
        const bEntry = bankMap.get(p.bank.id) || {
          bankId: p.bank.id,
          bankName: p.bank.name,
          count: 0,
          overSla: 0,
          value: 0,
          totalHours: 0,
        };
        bEntry.count++;
        if (isOverSla) bEntry.overSla++;
        bEntry.value += relVal;
        bEntry.totalHours += dwellHours;
        bankMap.set(p.bank.id, bEntry);
      }

      // Partner aggregation
      if (p.partner) {
        const ptEntry = partnerMap.get(p.partner.id) || {
          partnerId: p.partner.id,
          partnerName: p.partner.name,
          partnerLogin: p.partner.code,
          count: 0,
          overSla: 0,
          value: 0,
          totalHours: 0,
        };
        ptEntry.count++;
        if (isOverSla) ptEntry.overSla++;
        ptEntry.value += relVal;
        ptEntry.totalHours += dwellHours;
        partnerMap.set(p.partner.id, ptEntry);
      }

      // Collect sample of stuck proposals (limit to top 30 most overdue)
      if (isOverSla || isNearSla) {
        const maskedCpf = p.client?.cpf
          ? p.client.cpf.replace(/(\d{3})\d{5}(\d{3})/, '$1.***.**$2')
          : 'Não informado';

        stuckProposalsSample.push({
          id: p.id,
          proposalNumber: p.proposalNumber,
          clientName: p.client?.fullName || 'Cliente sem nome',
          clientCpfMasked: maskedCpf,
          bankName: p.bank?.name || 'Não informado',
          partnerName: p.partner?.name || 'Direto',
          statusName: status?.name || 'Indefinido',
          alcada,
          slaHours,
          dwellHours,
          releasedValue: relVal,
          contractValue: conVal,
          createdAt: p.createdAt.toISOString(),
          isOverSla,
          isNearSla,
        });
      }
    }

    // Sort stuck proposals by highest dwell time and limit to 30
    stuckProposalsSample.sort((a, b) => b.dwellHours - a.dwellHours);
    const trimmedStuckProposals = stuckProposalsSample.slice(0, 30);

    const byAlcada = Array.from(alcadaMap.entries()).map(([alcada, d]) => ({
      alcada,
      count: d.count,
      overSlaCount: d.overSla,
      nearSlaCount: d.nearSla,
      totalValue: Math.round(d.value * 100) / 100,
      avgHours: d.count > 0 ? Math.round(d.totalHours / d.count) : 0,
    }));

    const byStatus = Array.from(statusMap.values())
      .map(s => ({
        statusId: s.statusId,
        statusCode: s.statusCode,
        statusName: s.statusName,
        standardCategory: s.standardCategory,
        alcada: s.alcada,
        slaHours: s.slaHours,
        count: s.count,
        overSlaCount: s.overSla,
        nearSlaCount: s.nearSla,
        totalValue: Math.round(s.value * 100) / 100,
        avgHours: s.count > 0 ? Math.round(s.totalHours / s.count) : 0,
      }))
      .sort((a, b) => b.totalValue - a.totalValue);

    const topRetainedBanks = Array.from(bankMap.values())
      .map(b => ({
        bankId: b.bankId,
        bankName: b.bankName,
        count: b.count,
        overSlaCount: b.overSla,
        totalValue: Math.round(b.value * 100) / 100,
        avgHours: b.count > 0 ? Math.round(b.totalHours / b.count) : 0,
      }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);

    const topRetainedPartners = Array.from(partnerMap.values())
      .map(pt => ({
        partnerId: pt.partnerId,
        partnerName: pt.partnerName,
        partnerLogin: pt.partnerLogin,
        count: pt.count,
        overSlaCount: pt.overSla,
        totalValue: Math.round(pt.value * 100) / 100,
        avgHours: pt.count > 0 ? Math.round(pt.totalHours / pt.count) : 0,
      }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);

    return {
      summary: {
        totalActive,
        totalOverSla,
        totalNearSla,
        totalValueStuck: Math.round(totalValueStuck * 100) / 100,
        avgDwellHours: totalActive > 0 ? Math.round(totalDwellHours / totalActive) : 0,
        maxDwellHours,
      },
      byAlcada,
      byStatus,
      topRetainedBanks,
      topRetainedPartners,
      stuckProposalsSample: trimmedStuckProposals,
    };
  }

  /**
   * 2. GET /api/analytics/dwell-time
   * Analyzes transitions and real dwell time recorded in StatusHistory.
   */
  public static async getDwellTime(
    prisma: PrismaClient,
    tenantId: string,
    filters: AnalyticsFilterOptions = {}
  ): Promise<DwellTimeResponse> {
    const historyWhere: Prisma.StatusHistoryWhereInput = {
      tenantId,
    };

    if (filters.startDate || filters.endDate) {
      historyWhere.createdAt = {};
      if (filters.startDate) historyWhere.createdAt.gte = filters.startDate;
      if (filters.endDate) historyWhere.createdAt.lte = filters.endDate;
    }

    if (filters.statusId) {
      historyWhere.statusId = filters.statusId;
    }

    // Retrieve histories ordered by proposal and timestamp to calculate accurate deltas
    const histories = await prisma.statusHistory.findMany({
      where: historyWhere,
      select: {
        id: true,
        proposalId: true,
        statusId: true,
        statusName: true,
        createdAt: true,
        proposal: {
          select: {
            bankId: true,
            partnerId: true,
            bank: { select: { id: true, name: true } },
            partner: { select: { id: true, name: true } },
            status: { select: { code: true } },
          },
        },
      },
      orderBy: [{ proposalId: 'asc' }, { createdAt: 'asc' }],
    });

    // Compute intervals between consecutive status transitions for the same proposal
    const durationsByStatus = new Map<string, { statusName: string; durationsHours: number[] }>();
    const durationsByBank = new Map<string, { bankName: string; durationsHours: number[] }>();
    const durationsByPartner = new Map<string, { partnerName: string; durationsHours: number[] }>();
    const durationsByAlcada = new Map<string, { durationsHours: number[] }>();

    let totalDurationSum = 0;
    let totalDeltasCount = 0;

    for (let i = 0; i < histories.length; i++) {
      const current = histories[i];
      const next = histories[i + 1];

      // If next history belongs to same proposal, we have an exact completed duration
      let durationHours: number | null = null;
      if (next && next.proposalId === current.proposalId) {
        const diffMs = next.createdAt.getTime() - current.createdAt.getTime();
        durationHours = Math.max(0, diffMs / (1000 * 3600));
      } else {
        // If it is the latest transition of the proposal, compute against now
        const diffMs = Date.now() - current.createdAt.getTime();
        durationHours = Math.max(0, diffMs / (1000 * 3600));
      }

      if (durationHours !== null) {
        totalDurationSum += durationHours;
        totalDeltasCount++;

        // Status Group
        const sKey = current.statusId || current.statusName;
        const sEntry = durationsByStatus.get(sKey) || { statusName: current.statusName, durationsHours: [] };
        sEntry.durationsHours.push(durationHours);
        durationsByStatus.set(sKey, sEntry);

        // Bank Group
        if (current.proposal?.bank) {
          const bKey = current.proposal.bank.id;
          const bEntry = durationsByBank.get(bKey) || { bankName: current.proposal.bank.name, durationsHours: [] };
          bEntry.durationsHours.push(durationHours);
          durationsByBank.set(bKey, bEntry);
        }

        // Partner Group
        if (current.proposal?.partner) {
          const pKey = current.proposal.partner.id;
          const pEntry = durationsByPartner.get(pKey) || { partnerName: current.proposal.partner.name, durationsHours: [] };
          pEntry.durationsHours.push(durationHours);
          durationsByPartner.set(pKey, pEntry);
        }

        // Alçada Group
        let alcada = 'NOSSA EQUIPE';
        const sName = current.statusName.toUpperCase();
        if (sName.includes('CLIENTE') || sName.includes('FORMALIZA')) alcada = 'CLIENTE';
        else if (sName.includes('PARCEIRO') || sName.includes('CORBAN') || sName.includes('PENDENCIA')) alcada = 'PARCEIRO';
        else if (sName.includes('BANCO') || sName.includes('CIP') || sName.includes('ANALISE')) alcada = 'BANCO';
        else if (sName.includes('SISTEMA') || sName.includes('INTEGRADO')) alcada = 'SISTEMA';

        const aEntry = durationsByAlcada.get(alcada) || { durationsHours: [] };
        aEntry.durationsHours.push(durationHours);
        durationsByAlcada.set(alcada, aEntry);
      }
    }

    const calcStats = (arr: number[]) => {
      if (!arr.length) return { avg: null, median: null, min: null, max: null };
      const sum = arr.reduce((acc, v) => acc + v, 0);
      const avg = Math.round((sum / arr.length) * 10) / 10;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 !== 0
          ? Math.round(sorted[mid] * 10) / 10
          : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
      const min = Math.round(sorted[0] * 10) / 10;
      const max = Math.round(sorted[sorted.length - 1] * 10) / 10;
      return { avg, median, min, max };
    };

    const byStatus: DwellTimeStatusStats[] = Array.from(durationsByStatus.entries()).map(([k, val]) => {
      const stats = calcStats(val.durationsHours);
      return {
        statusId: k.startsWith('status_') || k.length > 20 ? k : null,
        statusName: val.statusName,
        countTransitions: val.durationsHours.length,
        avgDurationHours: stats.avg,
        medianDurationHours: stats.median,
        minDurationHours: stats.min,
        maxDurationHours: stats.max,
      };
    });

    const byBank = Array.from(durationsByBank.entries()).map(([bankId, val]) => {
      const stats = calcStats(val.durationsHours);
      return {
        bankId,
        bankName: val.bankName,
        countTransitions: val.durationsHours.length,
        avgDurationHours: stats.avg,
      };
    });

    const byPartner = Array.from(durationsByPartner.entries()).map(([partnerId, val]) => {
      const stats = calcStats(val.durationsHours);
      return {
        partnerId,
        partnerName: val.partnerName,
        countTransitions: val.durationsHours.length,
        avgDurationHours: stats.avg,
      };
    });

    const byAlcada = Array.from(durationsByAlcada.entries()).map(([alcada, val]) => {
      const stats = calcStats(val.durationsHours);
      return {
        alcada,
        countTransitions: val.durationsHours.length,
        avgDurationHours: stats.avg,
      };
    });

    return {
      summary: {
        totalTransitions: totalDeltasCount,
        avgOverallHours: totalDeltasCount > 0 ? Math.round((totalDurationSum / totalDeltasCount) * 10) / 10 : null,
      },
      byStatus,
      byBank,
      byPartner,
      byAlcada,
    };
  }

  /**
   * 3. GET /api/analytics/aging
   * Age distribution of active proposals in standard buckets (0d, 1d, 2d, 3d, 4d, 5d, 6-10d, 11-20d, 20d+).
   */
  public static async getAging(
    prisma: PrismaClient,
    tenantId: string,
    filters: AnalyticsFilterOptions = {}
  ): Promise<AgingResponse> {
    const now = new Date();

    const where: Prisma.ProposalWhereInput = buildActiveProposalWhere(tenantId);

    if (filters.bankId) where.bankId = filters.bankId;
    if (filters.partnerId) where.partnerId = filters.partnerId;
    if (filters.statusId) where.statusId = filters.statusId;

    const proposals = await prisma.proposal.findMany({
      where,
      select: {
        id: true,
        releasedValue: true,
        createdAt: true,
        standardCategory: true,
        status: {
          select: {
            id: true,
            code: true,
            name: true,
            standardCategory: true,
            finalStatus: true,
          },
        },
      },
    });

    const bucketDefinitions: { id: string; label: string; min: number; max: number }[] = [
      { id: '0d', label: '0 dias', min: 0, max: 0 },
      { id: '1d', label: '1 dia', min: 1, max: 1 },
      { id: '2d', label: '2 dias', min: 2, max: 2 },
      { id: '3d', label: '3 dias', min: 3, max: 3 },
      { id: '4d', label: '4 dias', min: 4, max: 4 },
      { id: '5d', label: '5 dias', min: 5, max: 5 },
      { id: '6-10d', label: '6 a 10 dias', min: 6, max: 10 },
      { id: '11-20d', label: '11 a 20 dias', min: 11, max: 20 },
      { id: '20d+', label: '+20 dias', min: 21, max: Infinity },
    ];

    const bucketMap = new Map<
      string,
      { count: number; totalValue: number; statuses: Map<string, { count: number; value: number }> }
    >();

    for (const b of bucketDefinitions) {
      bucketMap.set(b.id, { count: 0, totalValue: 0, statuses: new Map() });
    }

    let totalOpenProposals = 0;
    let totalOpenValue = 0;
    let totalAgeDays = 0;
    let maxAgeDays = 0;

    for (const p of proposals) {
      if (isStatusFinal(p.status) || isStatusFinal({ standardCategory: (p as any).standardCategory })) {
        continue;
      }

      totalOpenProposals++;
      const relVal = Number(p.releasedValue || 0);
      totalOpenValue += relVal;

      const diffDays = Math.floor((now.getTime() - p.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      totalAgeDays += diffDays;
      if (diffDays > maxAgeDays) maxAgeDays = diffDays;

      const statusName = p.status?.name || 'Indefinido';

      let targetBucket = bucketDefinitions.find(b => diffDays >= b.min && diffDays <= b.max);
      if (!targetBucket) targetBucket = bucketDefinitions[bucketDefinitions.length - 1];

      const entry = bucketMap.get(targetBucket.id)!;
      entry.count++;
      entry.totalValue += relVal;

      const st = entry.statuses.get(statusName) || { count: 0, value: 0 };
      st.count++;
      st.value += relVal;
      entry.statuses.set(statusName, st);
    }

    const buckets: AgingBucket[] = bucketDefinitions.map(def => {
      const bData = bucketMap.get(def.id)!;
      const percentageCount = totalOpenProposals > 0 ? Math.round((bData.count / totalOpenProposals) * 1000) / 10 : 0;
      const percentageValue = totalOpenValue > 0 ? Math.round((bData.totalValue / totalOpenValue) * 1000) / 10 : 0;

      const statusDistribution = Array.from(bData.statuses.entries()).map(([sName, sVal]) => ({
        statusName: sName,
        count: sVal.count,
        totalValue: Math.round(sVal.value * 100) / 100,
      }));

      return {
        bucket: def.id,
        label: def.label,
        count: bData.count,
        totalValue: Math.round(bData.totalValue * 100) / 100,
        percentageCount,
        percentageValue,
        statusDistribution,
      };
    });

    return {
      summary: {
        totalOpenProposals,
        totalOpenValue: Math.round(totalOpenValue * 100) / 100,
        avgAgeDays: totalOpenProposals > 0 ? Math.round((totalAgeDays / totalOpenProposals) * 10) / 10 : 0,
        maxAgeDays,
      },
      buckets,
    };
  }

  /**
   * 4. GET /api/analytics/production
   * Aggregates production statistics by period, day, status, bank, partner, digitizer, product.
   */
  public static async getProduction(
    prisma: PrismaClient,
    tenantId: string,
    filters: AnalyticsFilterOptions = {}
  ): Promise<ProductionResponse> {
    const where: Prisma.ProposalWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }
    if (filters.bankId) where.bankId = filters.bankId;
    if (filters.partnerId) where.partnerId = filters.partnerId;
    if (filters.productId) where.productId = filters.productId;

    const proposals = await prisma.proposal.findMany({
      where,
      select: {
        id: true,
        contractValue: true,
        releasedValue: true,
        createdAt: true,
        statusId: true,
        bankId: true,
        partnerId: true,
        productId: true,
        createdById: true,
        standardCategory: true,
        status: {
          select: {
            id: true,
            code: true,
            name: true,
            standardCategory: true,
            finalStatus: true,
          },
        },
        bank: { select: { id: true, name: true } },
        partner: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    let totalProposals = proposals.length;
    let totalContractValue = 0;
    let totalReleasedValue = 0;
    let paidCount = 0;
    let paidReleasedValue = 0;
    let cancelledCount = 0;

    const dayMap = new Map<string, { count: number; contract: number; released: number; paidCount: number; paidVal: number }>();
    const weekMap = new Map<string, { count: number; contract: number; released: number; paidCount: number; paidVal: number }>();
    const statusMap = new Map<string, { statusId: string | null; code: string; name: string; category: string; count: number; contract: number; released: number }>();
    const bankMap = new Map<string, { id: string; name: string; count: number; contract: number; released: number; paidCount: number; paidVal: number }>();
    const partnerMap = new Map<string, { id: string; name: string; login: string; count: number; contract: number; released: number; paidCount: number; paidVal: number }>();
    const digitizerMap = new Map<string, { id: string; name: string; count: number; contract: number; released: number; paidCount: number; paidVal: number }>();
    const productMap = new Map<string, { id: string; name: string; count: number; contract: number; released: number; paidCount: number; paidVal: number }>();

    for (const p of proposals) {
      const conVal = Number(p.contractValue || 0);
      const relVal = Number(p.releasedValue || 0);
      totalContractValue += conVal;
      totalReleasedValue += relVal;

      const isPaid = p.standardCategory === 'PAGO' || p.status?.code === 'PAGO' || p.status?.standardCategory === 'PAGO';
      const isCancelled =
        !isPaid &&
        (isStatusFinal(p.status) ||
          p.standardCategory === 'CANCELADO' ||
          p.standardCategory === 'RECUSADO' ||
          p.status?.code === 'CANCELADO' ||
          p.status?.code === 'REPROVADO' ||
          p.status?.standardCategory === 'CANCELADO' ||
          p.status?.standardCategory === 'RECUSADO');

      if (isPaid) {
        paidCount++;
        paidReleasedValue += relVal;
      }
      if (isCancelled) {
        cancelledCount++;
      }

      // Day Aggregation (YYYY-MM-DD)
      const dayKey = p.createdAt.toISOString().slice(0, 10);
      const dEntry = dayMap.get(dayKey) || { count: 0, contract: 0, released: 0, paidCount: 0, paidVal: 0 };
      dEntry.count++;
      dEntry.contract += conVal;
      dEntry.released += relVal;
      if (isPaid) {
        dEntry.paidCount++;
        dEntry.paidVal += relVal;
      }
      dayMap.set(dayKey, dEntry);

      // Week Aggregation (YYYY-Www)
      const d = new Date(Date.UTC(p.createdAt.getFullYear(), p.createdAt.getMonth(), p.createdAt.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      const weekKey = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;

      const wEntry = weekMap.get(weekKey) || { count: 0, contract: 0, released: 0, paidCount: 0, paidVal: 0 };
      wEntry.count++;
      wEntry.contract += conVal;
      wEntry.released += relVal;
      if (isPaid) {
        wEntry.paidCount++;
        wEntry.paidVal += relVal;
      }
      weekMap.set(weekKey, wEntry);

      // Status Aggregation
      const sKey = p.statusId || 'unknown';
      const sEntry = statusMap.get(sKey) || {
        statusId: p.statusId,
        code: p.status?.code || 'DESCONHECIDO',
        name: p.status?.name || 'Não Definido',
        category: p.status?.standardCategory || p.standardCategory || 'ESTEIRA',
        count: 0,
        contract: 0,
        released: 0,
      };
      sEntry.count++;
      sEntry.contract += conVal;
      sEntry.released += relVal;
      statusMap.set(sKey, sEntry);

      // Bank Aggregation
      if (p.bank) {
        const bEntry = bankMap.get(p.bank.id) || {
          id: p.bank.id,
          name: p.bank.name,
          count: 0,
          contract: 0,
          released: 0,
          paidCount: 0,
          paidVal: 0,
        };
        bEntry.count++;
        bEntry.contract += conVal;
        bEntry.released += relVal;
        if (isPaid) {
          bEntry.paidCount++;
          bEntry.paidVal += relVal;
        }
        bankMap.set(p.bank.id, bEntry);
      }

      // Partner Aggregation
      if (p.partner) {
        const ptEntry = partnerMap.get(p.partner.id) || {
          id: p.partner.id,
          name: p.partner.name,
          login: p.partner.code,
          count: 0,
          contract: 0,
          released: 0,
          paidCount: 0,
          paidVal: 0,
        };
        ptEntry.count++;
        ptEntry.contract += conVal;
        ptEntry.released += relVal;
        if (isPaid) {
          ptEntry.paidCount++;
          ptEntry.paidVal += relVal;
        }
        partnerMap.set(p.partner.id, ptEntry);
      }

      // Digitizer Aggregation
      if (p.createdBy) {
        const dgEntry = digitizerMap.get(p.createdBy.id) || {
          id: p.createdBy.id,
          name: p.createdBy.name,
          count: 0,
          contract: 0,
          released: 0,
          paidCount: 0,
          paidVal: 0,
        };
        dgEntry.count++;
        dgEntry.contract += conVal;
        dgEntry.released += relVal;
        if (isPaid) {
          dgEntry.paidCount++;
          dgEntry.paidVal += relVal;
        }
        digitizerMap.set(p.createdBy.id, dgEntry);
      }

      // Product Aggregation
      if (p.product) {
        const prEntry = productMap.get(p.product.id) || {
          id: p.product.id,
          name: p.product.name,
          count: 0,
          contract: 0,
          released: 0,
          paidCount: 0,
          paidVal: 0,
        };
        prEntry.count++;
        prEntry.contract += conVal;
        prEntry.released += relVal;
        if (isPaid) {
          prEntry.paidCount++;
          prEntry.paidVal += relVal;
        }
        productMap.set(p.product.id, prEntry);
      }
    }

    const conversionRatePercent = totalProposals > 0 ? Math.round((paidCount / totalProposals) * 1000) / 10 : 0;

    const byDay = Array.from(dayMap.entries())
      .map(([date, d]) => ({
        date,
        count: d.count,
        contractValue: Math.round(d.contract * 100) / 100,
        releasedValue: Math.round(d.released * 100) / 100,
        paidCount: d.paidCount,
        paidValue: Math.round(d.paidVal * 100) / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const byWeek = Array.from(weekMap.entries())
      .map(([week, w]) => ({
        week,
        count: w.count,
        contractValue: Math.round(w.contract * 100) / 100,
        releasedValue: Math.round(w.released * 100) / 100,
        paidCount: w.paidCount,
        paidValue: Math.round(w.paidVal * 100) / 100,
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    const byStatus = Array.from(statusMap.values())
      .map(s => ({
        statusId: s.statusId,
        statusCode: s.code,
        statusName: s.name,
        standardCategory: s.category,
        count: s.count,
        contractValue: Math.round(s.contract * 100) / 100,
        releasedValue: Math.round(s.released * 100) / 100,
      }))
      .sort((a, b) => b.count - a.count);

    const byBank = Array.from(bankMap.values())
      .map(b => ({
        bankId: b.id,
        bankName: b.name,
        count: b.count,
        contractValue: Math.round(b.contract * 100) / 100,
        releasedValue: Math.round(b.released * 100) / 100,
        paidCount: b.paidCount,
        paidValue: Math.round(b.paidVal * 100) / 100,
        conversionRatePercent: b.count > 0 ? Math.round((b.paidCount / b.count) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.releasedValue - a.releasedValue);

    const byPartner = Array.from(partnerMap.values())
      .map(pt => ({
        partnerId: pt.id,
        partnerName: pt.name,
        partnerLogin: pt.login,
        count: pt.count,
        contractValue: Math.round(pt.contract * 100) / 100,
        releasedValue: Math.round(pt.released * 100) / 100,
        paidCount: pt.paidCount,
        paidValue: Math.round(pt.paidVal * 100) / 100,
        conversionRatePercent: pt.count > 0 ? Math.round((pt.paidCount / pt.count) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.releasedValue - a.releasedValue);

    const byDigitizer = Array.from(digitizerMap.values())
      .map(dg => ({
        digitizerId: dg.id,
        digitizerName: dg.name,
        count: dg.count,
        contractValue: Math.round(dg.contract * 100) / 100,
        releasedValue: Math.round(dg.released * 100) / 100,
        paidCount: dg.paidCount,
        paidValue: Math.round(dg.paidVal * 100) / 100,
      }))
      .sort((a, b) => b.count - a.count);

    const byProduct = Array.from(productMap.values())
      .map(pr => ({
        productId: pr.id,
        productName: pr.name,
        count: pr.count,
        contractValue: Math.round(pr.contract * 100) / 100,
        releasedValue: Math.round(pr.released * 100) / 100,
        paidCount: pr.paidCount,
        paidValue: Math.round(pr.paidVal * 100) / 100,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      summary: {
        totalProposals,
        totalContractValue: Math.round(totalContractValue * 100) / 100,
        totalReleasedValue: Math.round(totalReleasedValue * 100) / 100,
        paidCount,
        paidReleasedValue: Math.round(paidReleasedValue * 100) / 100,
        cancelledCount,
        conversionRatePercent,
      },
      byDay,
      byWeek,
      byStatus,
      byBank,
      byPartner,
      byDigitizer,
      byProduct,
    };
  }

  /**
   * 5. GET /api/analytics/sla
   * Evaluates overall SLA compliance across all stages and includes CIP Portability calculations.
   */
  public static async getSla(
    prisma: PrismaClient,
    tenantId: string,
    filters: AnalyticsFilterOptions = {}
  ): Promise<SlaResponse> {
    const now = new Date();

    const where: Prisma.ProposalWhereInput = buildActiveProposalWhere(tenantId);

    if (filters.bankId) where.bankId = filters.bankId;
    if (filters.partnerId) where.partnerId = filters.partnerId;
    if (filters.statusId) where.statusId = filters.statusId;

    const proposals = await prisma.proposal.findMany({
      where,
      select: {
        id: true,
        debtBalance: true,
        createdAt: true,
        statusId: true,
        bankId: true,
        partnerId: true,
        productId: true,
        standardCategory: true,
        status: {
          select: {
            id: true,
            name: true,
            code: true,
            standardCategory: true,
            slaHours: true,
            finalStatus: true,
          },
        },
        bank: { select: { id: true, name: true } },
        partner: { select: { id: true, name: true } },
      },
    });

    let totalEvaluated = 0;
    let totalWithinSla = 0;
    let totalNearSla = 0;
    let totalOverSla = 0;

    // CIP Portability tracking
    let totalInCip = 0;
    let normalCount = 0;
    let warningCount = 0;
    let urgentCount = 0;
    let overdueCount = 0;
    let balanceRetainedTotal = 0;

    const statusMap = new Map<string, { statusId: string; statusName: string; slaHours: number; within: number; near: number; over: number }>();
    const bankMap = new Map<string, { bankId: string; bankName: string; within: number; over: number }>();
    const partnerMap = new Map<string, { partnerId: string; partnerName: string; within: number; over: number }>();

    for (const p of proposals) {
      if (isStatusFinal(p.status) || isStatusFinal({ standardCategory: (p as any).standardCategory })) {
        continue;
      }

      totalEvaluated++;
      const createdTime = p.createdAt.getTime();
      const dwellHours = Math.max(0, Math.round((now.getTime() - createdTime) / (1000 * 3600)));
      const slaHours = p.status?.slaHours || 24;

      const isOver = dwellHours > slaHours;
      const isNear = !isOver && dwellHours >= slaHours * 0.75;
      const isWithin = !isOver && !isNear;

      if (isOver) totalOverSla++;
      else if (isNear) totalNearSla++;
      else totalWithinSla++;

      // Portability CIP stage check
      if (p.status?.code === 'AGUARDAR_RETORNO_CIP') {
        totalInCip++;
        balanceRetainedTotal += Number(p.debtBalance || 0);

        // Approximate business days (ignoring weekends)
        const daysElapsed = Math.floor((now.getTime() - createdTime) / (1000 * 60 * 60 * 24));
        if (daysElapsed > 5) overdueCount++;
        else if (daysElapsed === 5) urgentCount++;
        else if (daysElapsed === 4) warningCount++;
        else normalCount++;
      }

      // Status aggregation
      if (p.status) {
        const sEntry = statusMap.get(p.status.id) || {
          statusId: p.status.id,
          statusName: p.status.name,
          slaHours,
          within: 0,
          near: 0,
          over: 0,
        };
        if (isOver) sEntry.over++;
        else if (isNear) sEntry.near++;
        else sEntry.within++;
        statusMap.set(p.status.id, sEntry);
      }

      // Bank aggregation
      if (p.bank) {
        const bEntry = bankMap.get(p.bank.id) || {
          bankId: p.bank.id,
          bankName: p.bank.name,
          within: 0,
          over: 0,
        };
        if (isOver) bEntry.over++;
        else bEntry.within++;
        bankMap.set(p.bank.id, bEntry);
      }

      // Partner aggregation
      if (p.partner) {
        const ptEntry = partnerMap.get(p.partner.id) || {
          partnerId: p.partner.id,
          partnerName: p.partner.name,
          within: 0,
          over: 0,
        };
        if (isOver) ptEntry.over++;
        else ptEntry.within++;
        partnerMap.set(p.partner.id, ptEntry);
      }
    }

    const complianceRatePercent =
      totalEvaluated > 0 ? Math.round(((totalWithinSla + totalNearSla) / totalEvaluated) * 1000) / 10 : 100;

    const byStatus = Array.from(statusMap.values()).map(s => {
      const tot = s.within + s.near + s.over;
      return {
        statusId: s.statusId,
        statusName: s.statusName,
        slaHours: s.slaHours,
        withinSla: s.within,
        nearSla: s.near,
        overSla: s.over,
        complianceRatePercent: tot > 0 ? Math.round(((s.within + s.near) / tot) * 1000) / 10 : 100,
      };
    });

    const byBank = Array.from(bankMap.values()).map(b => {
      const tot = b.within + b.over;
      return {
        bankId: b.bankId,
        bankName: b.bankName,
        withinSla: b.within,
        overSla: b.over,
        complianceRatePercent: tot > 0 ? Math.round((b.within / tot) * 1000) / 10 : 100,
      };
    });

    const byPartner = Array.from(partnerMap.values()).map(pt => {
      const tot = pt.within + pt.over;
      return {
        partnerId: pt.partnerId,
        partnerName: pt.partnerName,
        withinSla: pt.within,
        overSla: pt.over,
        complianceRatePercent: tot > 0 ? Math.round((pt.within / tot) * 1000) / 10 : 100,
      };
    });

    return {
      summary: {
        totalEvaluated,
        totalWithinSla,
        totalNearSla,
        totalOverSla,
        complianceRatePercent,
      },
      portabilityCip: {
        totalInCip,
        normalCount,
        warningCount,
        urgentCount,
        overdueCount,
        balanceRetainedTotal: Math.round(balanceRetainedTotal * 100) / 100,
      },
      byStatus,
      byBank,
      byPartner,
    };
  }
}
