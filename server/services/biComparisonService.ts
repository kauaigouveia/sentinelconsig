import { PrismaClient, Prisma, ProposalType, StandardStatusCategory } from '@prisma/client';
import {
  BIFilterOptions,
  BIPeriodPreset,
  BIComparisonResponse,
  BIMetricDelta,
  BITrend,
  BIRankingsResponse,
  BIBankRankingItem,
  BIPartnerRankingItem,
  BIDigitizerRankingItem,
} from '../../src/types/bi.js';
import { BIService, DateRangeResult } from './biService.js';

export class BIComparisonService {
  /**
   * Centralized math helper to compute delta absolute, delta percent, and deterministic trend.
   */
  public static calculateDelta(current: number, previous: number): BIMetricDelta {
    const curNum = Number(current) || 0;
    const prevNum = Number(previous) || 0;
    const deltaAbsolute = curNum - prevNum;

    let deltaPercent = 0;
    if (prevNum > 0) {
      deltaPercent = ((curNum - prevNum) / prevNum) * 100;
    } else if (prevNum === 0 && curNum > 0) {
      deltaPercent = 100;
    } else if (prevNum === 0 && curNum === 0) {
      deltaPercent = 0;
    } else if (prevNum < 0) {
      deltaPercent = ((curNum - prevNum) / Math.abs(prevNum)) * 100;
    }

    let trend: BITrend = 'ESTABILIDADE';
    if (deltaPercent > 1.0) {
      trend = 'CRESCIMENTO';
    } else if (deltaPercent < -1.0) {
      trend = 'QUEDA';
    }

    return {
      current: Number(curNum.toFixed(2)),
      previous: Number(prevNum.toFixed(2)),
      deltaAbsolute: Number(deltaAbsolute.toFixed(2)),
      deltaPercent: Number(deltaPercent.toFixed(2)),
      trend,
    };
  }

  /**
   * Calculates share % with safe divide-by-zero guard.
   */
  public static calculateSharePercent(part: number, total: number): number {
    if (!total || total <= 0) return 0;
    const share = (part / total) * 100;
    return Number(share.toFixed(2));
  }

  /**
   * Resolves the equivalent previous date range for comparison.
   */
  public static resolvePreviousDateRange(currentRange: DateRangeResult): DateRangeResult {
    const preset = currentRange.preset;
    const curStart = new Date(currentRange.startDate);
    const curEnd = new Date(currentRange.endDate);

    if (preset === 'HOJE') {
      const prevStart = new Date(curStart);
      prevStart.setUTCDate(prevStart.getUTCDate() - 1);
      const prevEnd = new Date(curEnd);
      prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
      return { startDate: prevStart, endDate: prevEnd, preset: 'ONTEM', label: 'Ontem' };
    }

    if (preset === 'ONTEM') {
      const prevStart = new Date(curStart);
      prevStart.setUTCDate(prevStart.getUTCDate() - 1);
      const prevEnd = new Date(curEnd);
      prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
      return { startDate: prevStart, endDate: prevEnd, label: 'Anteontem' };
    }

    if (preset === 'ULTIMOS_7_DIAS') {
      const prevStart = new Date(curStart);
      prevStart.setUTCDate(prevStart.getUTCDate() - 7);
      const prevEnd = new Date(curStart);
      prevEnd.setUTCMilliseconds(-1);
      return { startDate: prevStart, endDate: prevEnd, label: '7 Dias Anteriores' };
    }

    if (preset === 'ULTIMOS_30_DIAS') {
      const prevStart = new Date(curStart);
      prevStart.setUTCDate(prevStart.getUTCDate() - 30);
      const prevEnd = new Date(curStart);
      prevEnd.setUTCMilliseconds(-1);
      return { startDate: prevStart, endDate: prevEnd, label: '30 Dias Anteriores' };
    }

    if (preset === 'MES_ATUAL') {
      // Shift month by -1
      const prevStart = new Date(curStart);
      prevStart.setUTCMonth(prevStart.getUTCMonth() - 1);
      const prevEnd = new Date(curEnd);
      prevEnd.setUTCMonth(prevEnd.getUTCMonth() - 1);
      return { startDate: prevStart, endDate: prevEnd, label: 'Mês Anterior Equivalente' };
    }

    if (preset === 'MES_ANTERIOR') {
      const prevStart = new Date(curStart);
      prevStart.setUTCMonth(prevStart.getUTCMonth() - 1);
      const prevEnd = new Date(curEnd);
      prevEnd.setUTCMonth(prevEnd.getUTCMonth() - 1);
      return { startDate: prevStart, endDate: prevEnd, label: '2 Meses Atrás' };
    }

    // Default or PERSONALIZADO: exact same duration prior to curStart
    const durationMs = Math.max(1, curEnd.getTime() - curStart.getTime() + 1);
    const prevEnd = new Date(curStart.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs + 1);
    return { startDate: prevStart, endDate: prevEnd, label: 'Período Anterior Equivalente' };
  }

  /**
   * GET /api/bi/comparison
   * Computes Current Period vs Previous Period KPIs.
   */
  public static async getComparison(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIComparisonResponse> {
    const currentRange = BIService.resolveDateRange(filters);
    const previousRange = this.resolvePreviousDateRange(currentRange);

    const [currentOverview, previousOverview] = await Promise.all([
      BIService.getOverview(prisma, tenantId, filters),
      BIService.getOverview(prisma, tenantId, {
        ...filters,
        period: 'PERSONALIZADO',
        startDate: previousRange.startDate.toISOString(),
        endDate: previousRange.endDate.toISOString(),
      }),
    ]);

    return {
      tenantId,
      period: {
        current: {
          preset: currentRange.preset,
          startDate: currentRange.startDate.toISOString(),
          endDate: currentRange.endDate.toISOString(),
          label: currentRange.label,
        },
        previous: {
          preset: previousRange.preset,
          startDate: previousRange.startDate.toISOString(),
          endDate: previousRange.endDate.toISOString(),
          label: previousRange.label,
        },
      },
      metrics: {
        paidProduction: this.calculateDelta(
          currentOverview.paidProduction.value,
          previousOverview.paidProduction.value
        ),
        grossProduction: this.calculateDelta(
          currentOverview.totalGrossValue,
          previousOverview.totalGrossValue
        ),
        netProduction: this.calculateDelta(
          currentOverview.totalNetValue,
          previousOverview.totalNetValue
        ),
        totalProposals: this.calculateDelta(
          currentOverview.totalProposals,
          previousOverview.totalProposals
        ),
        paidCount: this.calculateDelta(
          currentOverview.paidProduction.count,
          previousOverview.paidProduction.count
        ),
        conversionRate: this.calculateDelta(
          currentOverview.conversionRatePercent,
          previousOverview.conversionRatePercent
        ),
        avgTicketNet: this.calculateDelta(
          currentOverview.avgTicketNet,
          previousOverview.avgTicketNet
        ),
        cancelledValue: this.calculateDelta(
          currentOverview.cancelledProduction.value,
          previousOverview.cancelledProduction.value
        ),
        backlogCount: this.calculateDelta(
          currentOverview.backlog.count,
          previousOverview.backlog.count
        ),
      },
    };
  }

  /**
   * GET /api/bi/rankings
   * Computes Rankings for Banks, Partners, and Digitizers with share % and growth deltas.
   */
  public static async getRankings(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIRankingsResponse> {
    const currentRange = BIService.resolveDateRange(filters);
    const previousRange = this.resolvePreviousDateRange(currentRange);

    // Fetch bank analytics & partner analytics for current and previous
    const [
      currBanksRes,
      prevBanksRes,
      currPartnersRes,
      prevPartnersRes,
      currOverview,
    ] = await Promise.all([
      BIService.getBanks(prisma, tenantId, filters),
      BIService.getBanks(prisma, tenantId, {
        ...filters,
        period: 'PERSONALIZADO',
        startDate: previousRange.startDate.toISOString(),
        endDate: previousRange.endDate.toISOString(),
      }),
      BIService.getPartners(prisma, tenantId, filters),
      BIService.getPartners(prisma, tenantId, {
        ...filters,
        period: 'PERSONALIZADO',
        startDate: previousRange.startDate.toISOString(),
        endDate: previousRange.endDate.toISOString(),
      }),
      BIService.getOverview(prisma, tenantId, filters),
    ]);

    const totalTenantPaidValue = currOverview.paidProduction.value || currBanksRes.summary.totalPaidValue || 0;

    // Previous Banks Map
    const prevBanksMap = new Map<string, number>();
    for (const b of prevBanksRes.banks) {
      prevBanksMap.set(b.bankId, b.paidValue);
    }

    // Enhance Bank Rankings
    const banks: BIBankRankingItem[] = currBanksRes.banks.map(b => {
      const previousPaidValue = prevBanksMap.get(b.bankId) || 0;
      const growthDelta = this.calculateDelta(b.paidValue, previousPaidValue);
      const sharePercent = this.calculateSharePercent(b.paidValue, totalTenantPaidValue);

      return {
        ...b,
        sharePercent,
        previousPaidValue,
        growthPercent: growthDelta.deltaPercent,
        trend: growthDelta.trend,
      };
    });

    // Previous Partners Map
    const prevPartnersMap = new Map<string, number>();
    for (const p of prevPartnersRes.partners) {
      prevPartnersMap.set(p.partnerId, p.paidValue);
    }

    // Enhance Partner Rankings
    const partners: BIPartnerRankingItem[] = currPartnersRes.partners.map(p => {
      const previousPaidValue = prevPartnersMap.get(p.partnerId) || 0;
      const growthDelta = this.calculateDelta(p.paidValue, previousPaidValue);
      const sharePercent = this.calculateSharePercent(p.paidValue, totalTenantPaidValue);

      return {
        ...p,
        sharePercent,
        previousPaidValue,
        growthPercent: growthDelta.deltaPercent,
        trend: growthDelta.trend,
      };
    });

    // Fetch Digitizers Ranking directly from Prisma
    const digitizerProposals = await prisma.proposal.findMany({
      where: {
        tenantId,
        deletedAt: null,
        createdAt: {
          gte: currentRange.startDate,
          lte: currentRange.endDate,
        },
      },
      select: {
        createdById: true,
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        contractValue: true,
        releasedValue: true,
        standardCategory: true,
        status: {
          select: {
            code: true,
            standardCategory: true,
          },
        },
      },
    });

    // Group by createdById
    const digitizerMap = new Map<
      string,
      {
        digitizerId: string;
        digitizerName: string;
        totalCount: number;
        paidCount: number;
        grossValue: number;
        netValue: number;
        paidValue: number;
      }
    >();

    for (const p of digitizerProposals) {
      const dId = p.createdById || 'NAO_IDENTIFICADO';
      const dName = p.createdBy?.name || 'Não Identificado / Sistema';

      if (!digitizerMap.has(dId)) {
        digitizerMap.set(dId, {
          digitizerId: dId,
          digitizerName: dName,
          totalCount: 0,
          paidCount: 0,
          grossValue: 0,
          netValue: 0,
          paidValue: 0,
        });
      }

      const item = digitizerMap.get(dId)!;
      item.totalCount += 1;

      const conVal = Number(p.contractValue || 0);
      const relVal = Number(p.releasedValue || 0);
      item.grossValue += conVal;
      item.netValue += relVal;

      const isPaid =
        p.standardCategory === 'PAGO' ||
        p.status?.code === 'PAGO' ||
        p.status?.standardCategory === 'PAGO';

      if (isPaid) {
        item.paidCount += 1;
        item.paidValue += relVal || conVal;
      }
    }

    const digitizersList = Array.from(digitizerMap.values());

    const digitizers: BIDigitizerRankingItem[] = digitizersList
      .map(d => {
        const conversionRatePercent = d.totalCount > 0 ? Number(((d.paidCount / d.totalCount) * 100).toFixed(2)) : 0;
        const avgTicketNet = d.paidCount > 0 ? Number((d.paidValue / d.paidCount).toFixed(2)) : 0;
        const sharePercent = this.calculateSharePercent(d.paidValue, totalTenantPaidValue);

        return {
          ...d,
          grossValue: Number(d.grossValue.toFixed(2)),
          netValue: Number(d.netValue.toFixed(2)),
          paidValue: Number(d.paidValue.toFixed(2)),
          conversionRatePercent,
          avgTicketNet,
          sharePercent,
        };
      })
      .sort((a, b) => b.paidValue - a.paidValue || b.totalCount - a.totalCount);

    return {
      tenantId,
      period: {
        startDate: currentRange.startDate.toISOString(),
        endDate: currentRange.endDate.toISOString(),
      },
      banks,
      partners,
      digitizers,
      summary: {
        totalPaidValue: Number(totalTenantPaidValue.toFixed(2)),
        totalProposalsCount: currOverview.totalProposals,
        topBankName: banks[0]?.bankName || null,
        topPartnerName: partners[0]?.partnerName || null,
        topDigitizerName: digitizers[0]?.digitizerName || null,
      },
    };
  }
}
