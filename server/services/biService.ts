import { PrismaClient, Prisma, ProposalType, StandardStatusCategory } from '@prisma/client';
import {
  BIFilterOptions,
  BIPeriodPreset,
  BIOverviewResponse,
  BIProductionResponse,
  BIProductionItem,
  BIBankAnalyticsResponse,
  BIBankAnalyticsItem,
  BIProductAnalyticsResponse,
  BIProductAnalyticsItem,
  BIConvenioAnalyticsResponse,
  BIConvenioAnalyticsItem,
  BIPartnerAnalyticsResponse,
  BIPartnerAnalyticsItem,
  BIOperatorAnalyticsResponse,
  BIOperatorAnalyticsItem,
  BIPendencyAnalyticsResponse,
  BIConversionFunnelResponse,
  BIBottlenecksResponse,
  BIBottleneckItem,
  BICancellationsResponse,
  BIRefusalsResponse,
  BIIntegrationsResponse,
  BIIntegrationProviderItem,
  BIOperationalHealthResponse,
} from '../../src/types/bi.js';
import { isStatusFinal } from './statusService.js';

export interface DateRangeResult {
  startDate: Date;
  endDate: Date;
  preset?: BIPeriodPreset;
  label: string;
}

export class BIService {
  /**
   * Normalizes time intervals based on America/Sao_Paulo (UTC-3).
   * Validates user inputs server-side to ensure integrity.
   */
  public static resolveDateRange(filters: BIFilterOptions = {}): DateRangeResult {
    const preset = filters.period || (filters.startDate || filters.endDate ? 'PERSONALIZADO' : 'MES_ATUAL');

    // Current time in Sao Paulo
    const now = new Date();
    // Offset for America/Sao_Paulo is UTC-3 (-180 min)
    const spFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const parts = spFormatter.formatToParts(now);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '01';
    const year = parseInt(getPart('year'), 10);
    const month = parseInt(getPart('month'), 10) - 1; // 0-indexed
    const day = parseInt(getPart('day'), 10);

    const makeSpDate = (y: number, m: number, d: number, hour: number, min: number, sec: number, ms: number): Date => {
      return new Date(Date.UTC(y, m, d, hour + 3, min, sec, ms));
    };

    if (preset === 'HOJE') {
      const start = makeSpDate(year, month, day, 0, 0, 0, 0);
      const end = makeSpDate(year, month, day, 23, 59, 59, 999);
      return { startDate: start, endDate: end, preset, label: 'Hoje' };
    }

    if (preset === 'ONTEM') {
      const yesterday = new Date(Date.UTC(year, month, day - 1));
      const yY = yesterday.getUTCFullYear();
      const yM = yesterday.getUTCMonth();
      const yD = yesterday.getUTCDate();
      const start = makeSpDate(yY, yM, yD, 0, 0, 0, 0);
      const end = makeSpDate(yY, yM, yD, 23, 59, 59, 999);
      return { startDate: start, endDate: end, preset, label: 'Ontem' };
    }

    if (preset === 'ULTIMOS_7_DIAS') {
      const d7 = new Date(Date.UTC(year, month, day - 6));
      const start = makeSpDate(d7.getUTCFullYear(), d7.getUTCMonth(), d7.getUTCDate(), 0, 0, 0, 0);
      const end = makeSpDate(year, month, day, 23, 59, 59, 999);
      return { startDate: start, endDate: end, preset, label: 'Últimos 7 dias' };
    }

    if (preset === 'ULTIMOS_30_DIAS') {
      const d30 = new Date(Date.UTC(year, month, day - 29));
      const start = makeSpDate(d30.getUTCFullYear(), d30.getUTCMonth(), d30.getUTCDate(), 0, 0, 0, 0);
      const end = makeSpDate(year, month, day, 23, 59, 59, 999);
      return { startDate: start, endDate: end, preset, label: 'Últimos 30 dias' };
    }

    if (preset === 'MES_ANTERIOR') {
      const lastMonthYear = month === 0 ? year - 1 : year;
      const lastMonth = month === 0 ? 11 : month - 1;
      const lastDayOfLastMonth = new Date(Date.UTC(lastMonthYear, lastMonth + 1, 0)).getUTCDate();
      const start = makeSpDate(lastMonthYear, lastMonth, 1, 0, 0, 0, 0);
      const end = makeSpDate(lastMonthYear, lastMonth, lastDayOfLastMonth, 23, 59, 59, 999);
      return { startDate: start, endDate: end, preset, label: 'Mês Anterior' };
    }

    if (preset === 'ANO_ATUAL') {
      const start = makeSpDate(year, 0, 1, 0, 0, 0, 0);
      const end = makeSpDate(year, 11, 31, 23, 59, 59, 999);
      return { startDate: start, endDate: end, preset, label: `Ano Atual (${year})` };
    }

    if (preset === 'PERSONALIZADO') {
      let start: Date | null = null;
      let end: Date | null = null;
      const parseCustomDate = (value: string, endOfDay: boolean): Date | null => {
        const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (dateOnly) {
          const y = Number(dateOnly[1]);
          const m = Number(dateOnly[2]) - 1;
          const d = Number(dateOnly[3]);
          const parsed = makeSpDate(y, m, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
          const valid = new Date(Date.UTC(y, m, d));
          if (valid.getUTCFullYear() !== y || valid.getUTCMonth() !== m || valid.getUTCDate() !== d) return null;
          return parsed;
        }
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      };

      if (filters.startDate) {
        start = parseCustomDate(filters.startDate, false);
      }
      if (filters.endDate) {
        end = parseCustomDate(filters.endDate, true);
      }

      if (start && end) {
        if (start > end) {
          const tmp = start;
          start = end;
          end = tmp;
        }
        return {
          startDate: start,
          endDate: end,
          preset: 'PERSONALIZADO',
          label: 'Período Personalizado',
        };
      } else if (start) {
        return {
          startDate: start,
          endDate: makeSpDate(year, month, day, 23, 59, 59, 999),
          preset: 'PERSONALIZADO',
          label: 'Período Personalizado',
        };
      } else if (end) {
        const endParts = spFormatter.formatToParts(end);
        const endYear = Number(endParts.find(part => part.type === 'year')?.value || year);
        const endMonth = Number(endParts.find(part => part.type === 'month')?.value || month + 1) - 1;
        return {
          startDate: makeSpDate(endYear, endMonth, 1, 0, 0, 0, 0),
          endDate: end,
          preset: 'PERSONALIZADO',
          label: 'Período Personalizado',
        };
      }
    }

    // Default: MES_ATUAL
    const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const start = makeSpDate(year, month, 1, 0, 0, 0, 0);
    const end = makeSpDate(year, month, lastDayOfMonth, 23, 59, 59, 999);
    return { startDate: start, endDate: end, preset: 'MES_ATUAL', label: 'Mês Atual' };
  }

  /**
   * Builds the common Prisma Proposal where clause ensuring:
   * 1. Multi-tenant isolation (tenantId).
   * 2. Soft-delete exclusion (deletedAt: null).
   * 3. Sanitized optional filter params.
   */
  public static buildProposalWhere(
    tenantId: string,
    filters: BIFilterOptions,
    dateRange: DateRangeResult
  ): Prisma.ProposalWhereInput {
    const where: Prisma.ProposalWhereInput = {
      tenantId,
      deletedAt: null,
      createdAt: {
        gte: dateRange.startDate,
        lte: dateRange.endDate,
      },
    };

    if (filters.bankId && filters.bankId.trim()) {
      where.bankId = filters.bankId.trim();
    }
    if (filters.partnerId && filters.partnerId.trim()) {
      where.partnerId = filters.partnerId.trim();
    }
    if (filters.digitizerId && filters.digitizerId.trim()) {
      where.createdById = filters.digitizerId.trim();
    }
    if (filters.assignedToId && filters.assignedToId.trim()) {
      where.assignedToId = filters.assignedToId.trim();
    }
    if (filters.productId && filters.productId.trim()) {
      where.productId = filters.productId.trim();
    }
    if (filters.convenioId && filters.convenioId.trim()) {
      where.convenioId = filters.convenioId.trim();
    }
    if (filters.proposalType && Object.values(ProposalType).includes(filters.proposalType as ProposalType)) {
      where.type = filters.proposalType as ProposalType;
    }
    if (filters.statusId && filters.statusId.trim()) {
      where.statusId = filters.statusId.trim();
    }
    if (
      filters.standardCategory &&
      Object.values(StandardStatusCategory).includes(filters.standardCategory as StandardStatusCategory)
    ) {
      where.standardCategory = filters.standardCategory as StandardStatusCategory;
    }

    return where;
  }

  /**
   * 1. GET /api/bi/overview - Strategic Overview KPIs
   */
  public static async getOverview(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIOverviewResponse> {
    const dateRange = this.resolveDateRange(filters);
    const where = this.buildProposalWhere(tenantId, filters, dateRange);

    const [proposals, pendenciesList] = await Promise.all([
      prisma.proposal.findMany({
        where,
        select: {
          id: true,
          contractValue: true,
          releasedValue: true,
          createdAt: true,
          standardCategory: true,
          status: {
            select: {
              code: true,
              name: true,
              standardCategory: true,
              slaHours: true,
              finalStatus: true,
            },
          },
        },
      }),
      prisma.pendency.findMany({
        where: {
          tenantId,
          status: { in: ['ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO'] },
        },
        select: {
          id: true,
          priority: true,
          createdAt: true,
        },
      }),
    ]);

    const now = new Date();
    let totalGrossValue = 0;
    let totalNetValue = 0;
    let paidValue = 0;
    let paidCount = 0;
    let inProgressValue = 0;
    let inProgressCount = 0;
    let cancelledValue = 0;
    let cancelledCount = 0;
    let reprovedValue = 0;
    let reprovedCount = 0;
    let approvedCount = 0;
    let approvedValue = 0;

    let backlogCount = 0;
    let backlogRetainedValue = 0;

    let totalOpenEvaluated = 0;
    let totalWithinSla = 0;
    let totalNearSla = 0;
    let proposalsAtRisk = 0;
    let proposalsOverSla = 0;

    for (const p of proposals) {
      const conVal = Number(p.contractValue || 0);
      const relVal = Number(p.releasedValue || 0);
      totalGrossValue += conVal;
      totalNetValue += relVal;

      const isPaid =
        p.standardCategory === StandardStatusCategory.PAGO ||
        p.status?.code === 'PAGO' ||
        p.status?.standardCategory === StandardStatusCategory.PAGO;

      const isApproved =
        isPaid ||
        p.status?.code === 'APROVADO' ||
        (p.status?.name ? p.status.name.toLowerCase().includes('aprovad') : false);

      const isReproved =
        !isPaid &&
        (p.status?.code === 'REPROVADO' ||
          p.status?.standardCategory === StandardStatusCategory.RECUSADO ||
          p.standardCategory === StandardStatusCategory.RECUSADO);

      const isCancelled =
        !isPaid &&
        (isReproved ||
          isStatusFinal(p.status) ||
          p.standardCategory === StandardStatusCategory.CANCELADO ||
          p.status?.code === 'CANCELADO' ||
          p.status?.standardCategory === StandardStatusCategory.CANCELADO);

      if (isApproved) {
        approvedCount++;
        approvedValue += conVal;
      }

      if (isPaid) {
        paidCount++;
        paidValue += relVal;
      } else if (isCancelled) {
        cancelledCount++;
        cancelledValue += conVal;
        if (isReproved) {
          reprovedCount++;
          reprovedValue += conVal;
        }
      } else {
        // In Progress / Esteira
        inProgressCount++;
        inProgressValue += relVal;
        backlogCount++;
        backlogRetainedValue += relVal;

        // SLA calculation for active items
        totalOpenEvaluated++;
        const dwellHours = Math.max(0, Math.round((now.getTime() - p.createdAt.getTime()) / (1000 * 3600)));
        const slaHours = p.status?.slaHours || 24;

        if (dwellHours > slaHours) {
          proposalsOverSla++;
        } else if (dwellHours >= slaHours * 0.75) {
          proposalsAtRisk++;
          totalNearSla++;
        } else {
          totalWithinSla++;
        }
      }
    }

    const totalProposals = proposals.length;
    const conversionRatePercent = totalProposals > 0 ? Math.round((paidCount / totalProposals) * 1000) / 10 : 0;
    const avgTicketNet = paidCount > 0
      ? Math.round((paidValue / paidCount) * 100) / 100
      : 0;

    const cancelledRatePercent = totalProposals > 0 ? Math.round((cancelledCount / totalProposals) * 1000) / 10 : 0;
    const reprovedRatePercent = totalProposals > 0 ? Math.round((reprovedCount / totalProposals) * 1000) / 10 : 0;

    const slaCompliancePercent = totalOpenEvaluated > 0
      ? Math.round(((totalWithinSla + totalNearSla) / totalOpenEvaluated) * 1000) / 10
      : 100;

    // Active Pendencies SLA stats
    let openPendenciesTotal = pendenciesList.length;
    let pendenciesOverSla = 0;
    for (const pen of pendenciesList) {
      const penDwellHours = (now.getTime() - pen.createdAt.getTime()) / (1000 * 3600);
      const slaThreshold = pen.priority === 'URGENT' ? 12 : pen.priority === 'HIGH' ? 24 : 48;
      if (penDwellHours > slaThreshold) {
        pendenciesOverSla++;
      }
    }
    const pendenciesWithinSla = Math.max(0, openPendenciesTotal - pendenciesOverSla);
    const pendenciesSlaCompliance = openPendenciesTotal > 0
      ? Math.round((pendenciesWithinSla / openPendenciesTotal) * 1000) / 10
      : 100;

    return {
      tenantId,
      period: {
        preset: dateRange.preset,
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
        label: dateRange.label,
      },
      paidProduction: {
        value: Math.round(paidValue * 100) / 100,
        count: paidCount,
      },
      inProgressProduction: {
        value: Math.round(inProgressValue * 100) / 100,
        count: inProgressCount,
      },
      conversionRatePercent,
      avgTicketNet,
      slaCompliancePercent,
      cancelledProduction: {
        value: Math.round(cancelledValue * 100) / 100,
        count: cancelledCount,
        ratePercent: cancelledRatePercent,
      },
      reprovedProduction: {
        value: Math.round(reprovedValue * 100) / 100,
        count: reprovedCount,
        ratePercent: reprovedRatePercent,
      },
      backlog: {
        count: backlogCount,
        retainedValue: Math.round(backlogRetainedValue * 100) / 100,
      },
      proposalsAtRisk,
      proposalsOverSla,
      totalProposals,
      totalGrossValue: Math.round(totalGrossValue * 100) / 100,
      totalNetValue: Math.round(totalNetValue * 100) / 100,
      approvedProposals: {
        count: approvedCount,
        value: Math.round(approvedValue * 100) / 100,
      },
      pendencies: {
        totalOpen: openPendenciesTotal,
        withinSla: pendenciesWithinSla,
        overSla: pendenciesOverSla,
        slaCompliancePercent: pendenciesSlaCompliance,
      },
    };
  }

  /**
   * 2. GET /api/bi/production - Aggregated Time Series
   */
  public static async getProduction(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIProductionResponse> {
    const dateRange = this.resolveDateRange(filters);
    const groupBy = filters.groupBy || 'day';
    const where = this.buildProposalWhere(tenantId, filters, dateRange);

    const proposals = await prisma.proposal.findMany({
      where,
      select: {
        id: true,
        contractValue: true,
        releasedValue: true,
        createdAt: true,
        standardCategory: true,
        status: {
          select: {
            code: true,
            standardCategory: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const groupMap = new Map<
      string,
      {
        date: string;
        formattedDate: string;
        gross: number;
        net: number;
        paid: number;
        cancelled: number;
        reproved: number;
        approved: number;
        count: number;
        paidCount: number;
      }
    >();

    let totalCount = 0;
    let totalGross = 0;
    let totalNet = 0;
    let totalPaidValue = 0;
    let totalPaidCount = 0;
    let totalCancelledValue = 0;
    let totalCancelledCount = 0;
    let totalReprovedValue = 0;
    let totalReprovedCount = 0;
    let totalInProgressValue = 0;
    let totalInProgressCount = 0;

    for (const p of proposals) {
      const conVal = Number(p.contractValue || 0);
      const relVal = Number(p.releasedValue || 0);
      totalCount++;
      totalGross += conVal;
      totalNet += relVal;

      const isPaid =
        p.standardCategory === StandardStatusCategory.PAGO ||
        p.status?.code === 'PAGO' ||
        p.status?.standardCategory === StandardStatusCategory.PAGO;

      const isReproved =
        p.status?.code === 'REPROVADO' ||
        p.status?.standardCategory === StandardStatusCategory.RECUSADO ||
        p.standardCategory === StandardStatusCategory.RECUSADO;

      const isCancelled =
        p.standardCategory === StandardStatusCategory.CANCELADO ||
        p.status?.code === 'CANCELADO' ||
        isReproved ||
        p.status?.standardCategory === StandardStatusCategory.CANCELADO;

      const isApproved =
        isPaid ||
        p.status?.code === 'APROVADO';

      if (isPaid) {
        totalPaidValue += relVal;
        totalPaidCount++;
      } else if (isCancelled) {
        totalCancelledValue += conVal;
        totalCancelledCount++;
        if (isReproved) {
          totalReprovedValue += conVal;
          totalReprovedCount++;
        }
      } else {
        totalInProgressValue += relVal;
        totalInProgressCount++;
      }

      // Group by the same America/Sao_Paulo calendar dates used to resolve BI ranges.
      const proposalDateParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(p.createdAt);
      const proposalDatePart = (type: string) => proposalDateParts.find(part => part.type === type)?.value || '01';
      const proposalYear = Number(proposalDatePart('year'));
      const proposalMonth = Number(proposalDatePart('month'));
      const proposalDay = Number(proposalDatePart('day'));

      // Group key calculation
      let key = '';
      let formattedDate = '';

      if (groupBy === 'month') {
        const y = proposalYear;
        const m = String(proposalMonth).padStart(2, '0');
        key = `${y}-${m}`;
        formattedDate = `${m}/${y}`;
      } else if (groupBy === 'week') {
        const d = new Date(Date.UTC(proposalYear, proposalMonth - 1, proposalDay));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
        key = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
        formattedDate = `Sem ${weekNo}/${d.getUTCFullYear()}`;
      } else {
        const y = proposalYear;
        const m = String(proposalMonth).padStart(2, '0');
        const d = String(proposalDay).padStart(2, '0');
        key = `${y}-${m}-${d}`;
        formattedDate = `${d}/${m}`;
      }

      const entry = groupMap.get(key) || {
        date: key,
        formattedDate,
        gross: 0,
        net: 0,
        paid: 0,
        cancelled: 0,
        reproved: 0,
        approved: 0,
        count: 0,
        paidCount: 0,
      };

      entry.count++;
      entry.gross += conVal;
      entry.net += relVal;
      if (isPaid) {
        entry.paid += relVal;
        entry.paidCount++;
      }
      if (isCancelled) {
        entry.cancelled += conVal;
      }
      if (isReproved) {
        entry.reproved += conVal;
      }
      if (isApproved) {
        entry.approved += conVal;
      }

      groupMap.set(key, entry);
    }

    const series: BIProductionItem[] = Array.from(groupMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(entry => {
        const avgTicket = entry.paidCount > 0
          ? Math.round((entry.paid / entry.paidCount) * 100) / 100
          : 0;

        return {
          date: entry.date,
          formattedDate: entry.formattedDate,
          grossValue: Math.round(entry.gross * 100) / 100,
          netValue: Math.round(entry.net * 100) / 100,
          paidValue: Math.round(entry.paid * 100) / 100,
          cancelledValue: Math.round(entry.cancelled * 100) / 100,
          reprovedValue: Math.round(entry.reproved * 100) / 100,
          approvedValue: Math.round(entry.approved * 100) / 100,
          count: entry.count,
          paidCount: entry.paidCount,
          avgTicket,
        };
      });

    const conversionRatePercent = totalCount > 0 ? Math.round((totalPaidCount / totalCount) * 1000) / 10 : 0;
    const avgTicket = totalPaidCount > 0
      ? Math.round((totalPaidValue / totalPaidCount) * 100) / 100
      : 0;

    return {
      tenantId,
      groupBy,
      period: {
        preset: dateRange.preset,
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      summary: {
        totalCount,
        totalGross: Math.round(totalGross * 100) / 100,
        totalNet: Math.round(totalNet * 100) / 100,
        totalPaidValue: Math.round(totalPaidValue * 100) / 100,
        totalPaidCount,
        totalCancelledValue: Math.round(totalCancelledValue * 100) / 100,
        totalCancelledCount,
        totalReprovedValue: Math.round(totalReprovedValue * 100) / 100,
        totalReprovedCount,
        totalInProgressValue: Math.round(totalInProgressValue * 100) / 100,
        totalInProgressCount,
        conversionRatePercent,
        avgTicket,
      },
      series,
    };
  }

  /**
   * 3. GET /api/bi/conversion - Operational Conversion Funnel (Real Data)
   */
  public static async getConversionFunnel(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIConversionFunnelResponse> {
    const dateRange = this.resolveDateRange(filters);
    const where = this.buildProposalWhere(tenantId, filters, dateRange);

    const [simulationsCount, proposals] = await Promise.all([
      prisma.simulationRequest.count({
        where: {
          tenantId,
          createdAt: {
            gte: dateRange.startDate,
            lte: dateRange.endDate,
          },
          ...(filters.partnerId ? { partnerId: filters.partnerId.trim() } : {}),
          ...(filters.digitizerId ? { createdById: filters.digitizerId.trim() } : {}),
        },
      }),
      prisma.proposal.findMany({
        where,
        select: {
          id: true,
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
      }),
    ]);

    let proposalsCount = proposals.length;
    let proposalsGrossValue = 0;
    let approvedCount = 0;
    let approvedValue = 0;
    let paidCount = 0;
    let paidValue = 0;

    for (const p of proposals) {
      const conVal = Number(p.contractValue || 0);
      const relVal = Number(p.releasedValue || 0);
      proposalsGrossValue += conVal;

      const isPaid =
        p.standardCategory === StandardStatusCategory.PAGO ||
        p.status?.code === 'PAGO' ||
        p.status?.standardCategory === StandardStatusCategory.PAGO;

      const isApproved =
        isPaid ||
        p.status?.code === 'APROVADO';

      if (isApproved) {
        approvedCount++;
        approvedValue += conVal;
      }
      if (isPaid) {
        paidCount++;
        paidValue += relVal;
      }
    }

    // Step rates
    const simToPropRate = simulationsCount > 0 ? Math.round((proposalsCount / simulationsCount) * 1000) / 10 : null;
    const propToAppRate = proposalsCount > 0 ? Math.round((approvedCount / proposalsCount) * 1000) / 10 : null;
    const appToPaidRate = approvedCount > 0 ? Math.round((paidCount / approvedCount) * 1000) / 10 : null;
    const overallRate = proposalsCount > 0 ? Math.round((paidCount / proposalsCount) * 1000) / 10 : null;

    const stages: any[] = [
      {
        stageId: 'SIMULACOES',
        label: 'Simulações Digitadas',
        count: simulationsCount,
        value: 0,
        conversionRateFromPrevious: 100,
        conversionRateFromStart: 100,
        dropCount: Math.max(0, simulationsCount - proposalsCount),
      },
      {
        stageId: 'PROPOSTAS',
        label: 'Propostas Cadastradas',
        count: proposalsCount,
        value: Math.round(proposalsGrossValue * 100) / 100,
        conversionRateFromPrevious: simToPropRate,
        conversionRateFromStart: simToPropRate,
        dropCount: Math.max(0, proposalsCount - approvedCount),
      },
      {
        stageId: 'APROVADAS',
        label: 'Propostas Aprovadas',
        count: approvedCount,
        value: Math.round(approvedValue * 100) / 100,
        conversionRateFromPrevious: propToAppRate,
        conversionRateFromStart: proposalsCount > 0 ? Math.round((approvedCount / proposalsCount) * 1000) / 10 : null,
        dropCount: Math.max(0, approvedCount - paidCount),
      },
      {
        stageId: 'PAGAS',
        label: 'Propostas Pagas (Liquidadas)',
        count: paidCount,
        value: Math.round(paidValue * 100) / 100,
        conversionRateFromPrevious: appToPaidRate,
        conversionRateFromStart: overallRate,
        dropCount: 0,
      },
    ];

    return {
      tenantId,
      period: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
        label: dateRange.label,
      },
      stages,
      summary: {
        simulationsToProposalsPercent: simToPropRate,
        proposalsToApprovalPercent: propToAppRate,
        approvalToPaymentPercent: appToPaidRate,
        overallFunnelConversionPercent: overallRate,
      },
    };
  }

  /**
   * 4. GET /api/bi/banks - Bank Performance, SLA & Integration Telemetry
   */
  public static async getBanks(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIBankAnalyticsResponse> {
    const dateRange = this.resolveDateRange(filters);
    const where = this.buildProposalWhere(tenantId, filters, dateRange);

    const [proposals, healthLogs] = await Promise.all([
      prisma.proposal.findMany({
        where,
        select: {
          id: true,
          contractValue: true,
          releasedValue: true,
          createdAt: true,
          bankId: true,
          standardCategory: true,
          bank: {
            select: {
              id: true,
              code: true,
              name: true,
              color: true,
            },
          },
          status: {
            select: {
              code: true,
              name: true,
              standardCategory: true,
              slaHours: true,
              finalStatus: true,
            },
          },
        },
      }),
      prisma.integrationHealthLog.findMany({
        where: {
          timestamp: {
            gte: dateRange.startDate,
            lte: dateRange.endDate,
          },
          OR: [{ tenantId }, { tenantId: null }],
        },
        select: {
          bank: true,
          success: true,
          latencyMs: true,
          httpStatus: true,
        },
      }),
    ]);

    // Aggregate Telemetry by bank provider
    const telemetryMap = new Map<string, { total: number; success: number; latencySum: number; errors: number }>();
    for (const log of healthLogs) {
      const bKey = (log.bank || '').toUpperCase();
      const t = telemetryMap.get(bKey) || { total: 0, success: 0, latencySum: 0, errors: 0 };
      t.total++;
      if (log.success) t.success++;
      else t.errors++;
      t.latencySum += log.latencyMs || 0;
      telemetryMap.set(bKey, t);
    }

    const now = new Date();
    const bankMap = new Map<
      string,
      {
        bankId: string;
        bankCode: string;
        bankName: string;
        color: string | null;
        gross: number;
        net: number;
        count: number;
        paidCount: number;
        paidValue: number;
        approvedCount: number;
        cancelledCount: number;
        cancelledValue: number;
        reprovedCount: number;
        reprovedValue: number;
        withinSla: number;
        totalSlaEvaluated: number;
      }
    >();

    let totalGrossValue = 0;
    let totalNetValue = 0;
    let totalPaidValue = 0;
    let totalPaidCount = 0;

    for (const p of proposals) {
      const conVal = Number(p.contractValue || 0);
      const relVal = Number(p.releasedValue || 0);
      totalGrossValue += conVal;
      totalNetValue += relVal;

      const bankId = p.bankId || 'sem-banco';
      const bankCode = p.bank?.code || 'S/B';
      const bankName = p.bank?.name || 'Não Informado';
      const color = p.bank?.color || '#3b82f6';

      const entry = bankMap.get(bankId) || {
        bankId,
        bankCode,
        bankName,
        color,
        gross: 0,
        net: 0,
        count: 0,
        paidCount: 0,
        paidValue: 0,
        approvedCount: 0,
        cancelledCount: 0,
        cancelledValue: 0,
        reprovedCount: 0,
        reprovedValue: 0,
        withinSla: 0,
        totalSlaEvaluated: 0,
      };

      entry.count++;
      entry.gross += conVal;
      entry.net += relVal;

      const isPaid =
        p.standardCategory === StandardStatusCategory.PAGO ||
        p.status?.code === 'PAGO' ||
        p.status?.standardCategory === StandardStatusCategory.PAGO;

      const isApproved =
        isPaid ||
        p.status?.code === 'APROVADO' ||
        (p.status?.name ? p.status.name.toLowerCase().includes('aprovad') : false);

      const isReproved =
        !isPaid &&
        (p.status?.code === 'REPROVADO' ||
          p.status?.standardCategory === StandardStatusCategory.RECUSADO ||
          p.standardCategory === StandardStatusCategory.RECUSADO);

      const isCancelled =
        !isPaid &&
        (isReproved ||
          isStatusFinal(p.status) ||
          p.standardCategory === StandardStatusCategory.CANCELADO ||
          p.status?.code === 'CANCELADO' ||
          p.status?.standardCategory === StandardStatusCategory.CANCELADO);

      if (isApproved) entry.approvedCount++;

      if (isPaid) {
        entry.paidCount++;
        entry.paidValue += relVal;
        totalPaidValue += relVal;
        totalPaidCount++;
      } else if (isCancelled) {
        entry.cancelledCount++;
        entry.cancelledValue += conVal;
        if (isReproved) {
          entry.reprovedCount++;
          entry.reprovedValue += conVal;
        }
      }

      // SLA evaluation on open active proposals
      const isOpen = !isPaid && !isCancelled;
      if (isOpen) {
        entry.totalSlaEvaluated++;
        const dwellHours = Math.max(0, Math.round((now.getTime() - p.createdAt.getTime()) / (1000 * 3600)));
        const slaHours = p.status?.slaHours || 24;
        if (dwellHours <= slaHours) {
          entry.withinSla++;
        }
      }

      bankMap.set(bankId, entry);
    }

    const banks: BIBankAnalyticsItem[] = Array.from(bankMap.values())
      .map(entry => {
        const conversionRatePercent = entry.count > 0 ? Math.round((entry.paidCount / entry.count) * 1000) / 10 : 0;
        const approvalRatePercent = entry.count > 0 ? Math.round((entry.approvedCount / entry.count) * 1000) / 10 : 0;
        const avgTicketNet = entry.paidCount > 0
          ? Math.round((entry.paidValue / entry.paidCount) * 100) / 100
          : 0;

        const slaCompliancePercent = entry.totalSlaEvaluated > 0
          ? Math.round((entry.withinSla / entry.totalSlaEvaluated) * 1000) / 10
          : null;

        // Match with integration telemetry
        const bankNormalized = entry.bankName.toUpperCase();
        let telemetryKey = '';
        if (bankNormalized.includes('C6') || entry.bankCode === '626') telemetryKey = 'C6';
        else if (bankNormalized.includes('FACTA') || entry.bankCode === '707') telemetryKey = 'FACTA';
        else if (bankNormalized.includes('BMG') || entry.bankCode === '318') telemetryKey = 'BMG';
        else if (bankNormalized.includes('HAPPY') || bankNormalized.includes('BYX')) telemetryKey = 'HAPPY';

        const tData = telemetryKey ? telemetryMap.get(telemetryKey) : null;
        const totalRequests = tData ? tData.total : undefined;
        const successRate = tData && tData.total > 0 ? Math.round((tData.success / tData.total) * 1000) / 10 : null;
        const avgLatencyMs = tData && tData.total > 0 ? Math.round(tData.latencySum / tData.total) : null;

        return {
          bankId: entry.bankId,
          bankCode: entry.bankCode,
          bankName: entry.bankName,
          color: entry.color,
          grossValue: Math.round(entry.gross * 100) / 100,
          netValue: Math.round(entry.net * 100) / 100,
          count: entry.count,
          paidCount: entry.paidCount,
          paidValue: Math.round(entry.paidValue * 100) / 100,
          approvedCount: entry.approvedCount,
          cancelledCount: entry.cancelledCount,
          cancelledValue: Math.round(entry.cancelledValue * 100) / 100,
          reprovedCount: entry.reprovedCount,
          reprovedValue: Math.round(entry.reprovedValue * 100) / 100,
          conversionRatePercent,
          approvalRatePercent,
          avgTicketNet,
          slaCompliancePercent,
          totalRequests,
          successRate,
          avgLatencyMs,
          incidentCount: tData?.errors || 0,
        };
      })
      .sort((a, b) => b.netValue - a.netValue);

    return {
      tenantId,
      period: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      banks,
      summary: {
        totalBanks: banks.length,
        totalGrossValue: Math.round(totalGrossValue * 100) / 100,
        totalNetValue: Math.round(totalNetValue * 100) / 100,
        totalPaidValue: Math.round(totalPaidValue * 100) / 100,
        totalPaidCount,
        topBankName: banks.length > 0 ? banks[0].bankName : null,
      },
    };
  }

  /**
   * 5. GET /api/bi/products - Product Performance & Distribution
   */
  public static async getProducts(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIProductAnalyticsResponse> {
    const dateRange = this.resolveDateRange(filters);
    const where = this.buildProposalWhere(tenantId, filters, dateRange);

    const proposals = await prisma.proposal.findMany({
      where,
      select: {
        id: true,
        contractValue: true,
        releasedValue: true,
        productId: true,
        type: true,
        standardCategory: true,
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
        status: {
          select: {
            code: true,
            standardCategory: true,
            finalStatus: true,
          },
        },
      },
    });

    const productMap = new Map<
      string,
      {
        productId: string;
        productCode: string;
        productName: string;
        productType: string;
        gross: number;
        net: number;
        count: number;
        paidCount: number;
        paidValue: number;
        approvedCount: number;
        cancelledCount: number;
        cancelledValue: number;
        reprovedCount: number;
        reprovedValue: number;
      }
    >();

    let totalGrossValue = 0;
    let totalNetValue = 0;
    let totalPaidValue = 0;
    let totalPaidCount = 0;

    for (const p of proposals) {
      const conVal = Number(p.contractValue || 0);
      const relVal = Number(p.releasedValue || 0);
      totalGrossValue += conVal;
      totalNetValue += relVal;

      const productId = p.productId || 'sem-produto';
      const productCode = p.product?.code || 'S/P';
      const productName = p.product?.name || (p.type ? `Produto ${p.type}` : 'Não Informado');
      const productType = p.product?.type || p.type || 'NOVO';

      const entry = productMap.get(productId) || {
        productId,
        productCode,
        productName,
        productType,
        gross: 0,
        net: 0,
        count: 0,
        paidCount: 0,
        paidValue: 0,
        approvedCount: 0,
        cancelledCount: 0,
        cancelledValue: 0,
        reprovedCount: 0,
        reprovedValue: 0,
      };

      entry.count++;
      entry.gross += conVal;
      entry.net += relVal;

      const isPaid =
        p.standardCategory === StandardStatusCategory.PAGO ||
        p.status?.code === 'PAGO' ||
        p.status?.standardCategory === StandardStatusCategory.PAGO;

      const isApproved =
        isPaid ||
        p.status?.code === 'APROVADO';

      const isReproved =
        !isPaid &&
        (p.status?.code === 'REPROVADO' ||
          p.status?.standardCategory === StandardStatusCategory.RECUSADO ||
          p.standardCategory === StandardStatusCategory.RECUSADO);

      const isCancelled =
        !isPaid &&
        (isReproved ||
          isStatusFinal(p.status) ||
          p.standardCategory === StandardStatusCategory.CANCELADO ||
          p.status?.code === 'CANCELADO' ||
          p.status?.standardCategory === StandardStatusCategory.CANCELADO);

      if (isApproved) entry.approvedCount++;

      if (isPaid) {
        entry.paidCount++;
        entry.paidValue += relVal;
        totalPaidValue += relVal;
        totalPaidCount++;
      } else if (isCancelled) {
        entry.cancelledCount++;
        entry.cancelledValue += conVal;
        if (isReproved) {
          entry.reprovedCount++;
          entry.reprovedValue += conVal;
        }
      }

      productMap.set(productId, entry);
    }

    const products: BIProductAnalyticsItem[] = Array.from(productMap.values())
      .map(entry => {
        const conversionRatePercent = entry.count > 0 ? Math.round((entry.paidCount / entry.count) * 1000) / 10 : 0;
        const approvalRatePercent = entry.count > 0 ? Math.round((entry.approvedCount / entry.count) * 1000) / 10 : 0;
        const avgTicketNet = entry.paidCount > 0
          ? Math.round((entry.paidValue / entry.paidCount) * 100) / 100
          : 0;

        return {
          productId: entry.productId,
          productCode: entry.productCode,
          productName: entry.productName,
          productType: entry.productType,
          grossValue: Math.round(entry.gross * 100) / 100,
          netValue: Math.round(entry.net * 100) / 100,
          count: entry.count,
          paidCount: entry.paidCount,
          paidValue: Math.round(entry.paidValue * 100) / 100,
          approvedCount: entry.approvedCount,
          cancelledCount: entry.cancelledCount,
          cancelledValue: Math.round(entry.cancelledValue * 100) / 100,
          reprovedCount: entry.reprovedCount,
          reprovedValue: Math.round(entry.reprovedValue * 100) / 100,
          conversionRatePercent,
          approvalRatePercent,
          avgTicketNet,
        };
      })
      .sort((a, b) => b.netValue - a.netValue);

    return {
      tenantId,
      period: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      products,
      summary: {
        totalProducts: products.length,
        totalGrossValue: Math.round(totalGrossValue * 100) / 100,
        totalNetValue: Math.round(totalNetValue * 100) / 100,
        totalPaidValue: Math.round(totalPaidValue * 100) / 100,
        totalPaidCount,
      },
    };
  }

  /**
   * 6. GET /api/bi/convenios - Agreement / Convenio Analytics
   */
  public static async getConvenios(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIConvenioAnalyticsResponse> {
    const dateRange = this.resolveDateRange(filters);
    const where = this.buildProposalWhere(tenantId, filters, dateRange);

    const proposals = await prisma.proposal.findMany({
      where,
      select: {
        id: true,
        contractValue: true,
        releasedValue: true,
        convenioId: true,
        convenio: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        standardCategory: true,
        status: {
          select: {
            code: true,
            standardCategory: true,
            finalStatus: true,
          },
        },
      },
    });

    const convenioMap = new Map<
      string,
      {
        convenioId: string;
        convenioCode: string;
        convenioName: string;
        gross: number;
        net: number;
        count: number;
        paidCount: number;
        paidValue: number;
        cancelledCount: number;
        reprovedCount: number;
      }
    >();

    let totalGrossValue = 0;
    let totalPaidValue = 0;

    for (const p of proposals) {
      const conVal = Number(p.contractValue || 0);
      const relVal = Number(p.releasedValue || 0);
      totalGrossValue += conVal;

      const convenioId = p.convenioId || 'sem-convenio';
      const convenioCode = p.convenio?.code || 'S/C';
      const convenioName = p.convenio?.name || 'Geral / Não Especificado';

      const entry = convenioMap.get(convenioId) || {
        convenioId,
        convenioCode,
        convenioName,
        gross: 0,
        net: 0,
        count: 0,
        paidCount: 0,
        paidValue: 0,
        cancelledCount: 0,
        reprovedCount: 0,
      };

      entry.count++;
      entry.gross += conVal;
      entry.net += relVal;

      const isPaid =
        p.standardCategory === StandardStatusCategory.PAGO ||
        p.status?.code === 'PAGO' ||
        p.status?.standardCategory === StandardStatusCategory.PAGO;

      const isReproved =
        !isPaid &&
        (p.status?.code === 'REPROVADO' ||
          p.status?.standardCategory === StandardStatusCategory.RECUSADO ||
          p.standardCategory === StandardStatusCategory.RECUSADO);

      const isCancelled =
        !isPaid &&
        (isReproved ||
          isStatusFinal(p.status) ||
          p.standardCategory === StandardStatusCategory.CANCELADO ||
          p.status?.code === 'CANCELADO' ||
          p.status?.standardCategory === StandardStatusCategory.CANCELADO);

      if (isPaid) {
        entry.paidCount++;
        entry.paidValue += relVal;
        totalPaidValue += relVal;
      } else if (isCancelled) {
        entry.cancelledCount++;
        if (isReproved) {
          entry.reprovedCount++;
        }
      }

      convenioMap.set(convenioId, entry);
    }

    const convenios: BIConvenioAnalyticsItem[] = Array.from(convenioMap.values())
      .map(entry => {
        const conversionRatePercent = entry.count > 0 ? Math.round((entry.paidCount / entry.count) * 1000) / 10 : 0;
        const avgTicketNet = entry.paidCount > 0
          ? Math.round((entry.paidValue / entry.paidCount) * 100) / 100
          : 0;

        return {
          convenioId: entry.convenioId,
          convenioCode: entry.convenioCode,
          convenioName: entry.convenioName,
          grossValue: Math.round(entry.gross * 100) / 100,
          netValue: Math.round(entry.net * 100) / 100,
          count: entry.count,
          paidCount: entry.paidCount,
          paidValue: Math.round(entry.paidValue * 100) / 100,
          cancelledCount: entry.cancelledCount,
          reprovedCount: entry.reprovedCount,
          avgTicketNet,
          conversionRatePercent,
        };
      })
      .sort((a, b) => b.netValue - a.netValue);

    return {
      tenantId,
      period: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      convenios,
      summary: {
        totalConvenios: convenios.length,
        totalGrossValue: Math.round(totalGrossValue * 100) / 100,
        totalPaidValue: Math.round(totalPaidValue * 100) / 100,
      },
    };
  }

  /**
   * 7. GET /api/bi/partners - Partner CRM Integration & Production Metrics
   */
  public static async getPartners(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIPartnerAnalyticsResponse> {
    const dateRange = this.resolveDateRange(filters);
    const where = this.buildProposalWhere(tenantId, filters, dateRange);

    const [allPartners, proposals, openPendencies, recentInteractions] = await Promise.all([
      prisma.partner.findMany({
        where: { tenantId, deletedAt: null },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          assignedUser: { select: { name: true } },
        },
      }),
      prisma.proposal.findMany({
        where,
        select: {
          id: true,
          contractValue: true,
          releasedValue: true,
          createdAt: true,
          partnerId: true,
          standardCategory: true,
          status: {
            select: {
              code: true,
              name: true,
              standardCategory: true,
              finalStatus: true,
            },
          },
        },
      }),
      prisma.pendency.groupBy({
        by: ['partnerId'],
        where: {
          tenantId,
          partnerId: { not: null },
          status: { in: ['ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO'] },
        },
        _count: { id: true },
      }),
      prisma.partnerInteraction.findMany({
        where: { tenantId },
        orderBy: { date: 'desc' },
        distinct: ['partnerId'],
        select: { partnerId: true, date: true },
      }),
    ]);

    const pendenciesByPartner = new Map<string, number>();
    for (const p of openPendencies) {
      if (p.partnerId) pendenciesByPartner.set(p.partnerId, p._count.id);
    }

    const lastActivityByPartner = new Map<string, Date>();
    for (const it of recentInteractions) {
      lastActivityByPartner.set(it.partnerId, it.date);
    }

    const partnerInfoMap = new Map<string, { code: string; name: string; status: string; assignedUserName?: string }>();
    for (const part of allPartners) {
      partnerInfoMap.set(part.id, {
        code: part.code,
        name: part.name,
        status: part.status,
        assignedUserName: part.assignedUser?.name || undefined,
      });
    }

    const partnerMap = new Map<
      string,
      {
        partnerId: string;
        partnerCode: string;
        partnerName: string;
        status: string;
        assignedUserName?: string;
        gross: number;
        net: number;
        count: number;
        paidCount: number;
        paidValue: number;
        approvedCount: number;
        cancelledCount: number;
        cancelledValue: number;
        reprovedCount: number;
        reprovedValue: number;
        totalDwellHours: number;
      }
    >();

    let totalGrossValue = 0;
    let totalNetValue = 0;
    let totalPaidValue = 0;

    const now = new Date();

    for (const p of proposals) {
      const conVal = Number(p.contractValue || 0);
      const relVal = Number(p.releasedValue || 0);
      totalGrossValue += conVal;
      totalNetValue += relVal;

      const partnerId = p.partnerId || 'sem-parceiro';
      const info = partnerInfoMap.get(partnerId);
      const partnerCode = info?.code || 'S/P';
      const partnerName = info?.name || 'Direto / Sem Parceiro';
      const status = info?.status || 'ATIVO';
      const assignedUserName = info?.assignedUserName;

      const entry = partnerMap.get(partnerId) || {
        partnerId,
        partnerCode,
        partnerName,
        status,
        assignedUserName,
        gross: 0,
        net: 0,
        count: 0,
        paidCount: 0,
        paidValue: 0,
        approvedCount: 0,
        cancelledCount: 0,
        cancelledValue: 0,
        reprovedCount: 0,
        reprovedValue: 0,
        totalDwellHours: 0,
      };

      entry.count++;
      entry.gross += conVal;
      entry.net += relVal;

      const isPaid =
        p.standardCategory === StandardStatusCategory.PAGO ||
        p.status?.code === 'PAGO' ||
        p.status?.standardCategory === StandardStatusCategory.PAGO;

      const isApproved =
        isPaid ||
        p.status?.code === 'APROVADO' ||
        (p.status?.name ? p.status.name.toLowerCase().includes('aprovad') : false);

      const isReproved =
        !isPaid &&
        (p.status?.code === 'REPROVADO' ||
          p.status?.standardCategory === StandardStatusCategory.RECUSADO ||
          p.standardCategory === StandardStatusCategory.RECUSADO);

      const isCancelled =
        !isPaid &&
        (isReproved ||
          isStatusFinal(p.status) ||
          p.standardCategory === StandardStatusCategory.CANCELADO ||
          p.status?.code === 'CANCELADO' ||
          p.status?.standardCategory === StandardStatusCategory.CANCELADO);

      if (isApproved) entry.approvedCount++;

      if (isPaid) {
        entry.paidCount++;
        entry.paidValue += relVal;
        totalPaidValue += relVal;
      } else if (isCancelled) {
        entry.cancelledCount++;
        entry.cancelledValue += conVal;
        if (isReproved) {
          entry.reprovedCount++;
          entry.reprovedValue += conVal;
        }
      } else {
        const dwellHours = Math.max(0, (now.getTime() - p.createdAt.getTime()) / (1000 * 3600));
        entry.totalDwellHours += dwellHours;
      }

      partnerMap.set(partnerId, entry);
    }

    const partners: BIPartnerAnalyticsItem[] = Array.from(partnerMap.values())
      .map(entry => {
        const conversionRatePercent = entry.count > 0 ? Math.round((entry.paidCount / entry.count) * 1000) / 10 : 0;
        const approvalRatePercent = entry.count > 0 ? Math.round((entry.approvedCount / entry.count) * 1000) / 10 : 0;
        const avgTicketNet = entry.paidCount > 0
          ? Math.round((entry.paidValue / entry.paidCount) * 100) / 100
          : 0;

        const avgDwellHours = entry.count > 0 ? Math.round((entry.totalDwellHours / entry.count) * 10) / 10 : null;
        const openPendenciesCount = pendenciesByPartner.get(entry.partnerId) || 0;
        const lastAct = lastActivityByPartner.get(entry.partnerId);

        return {
          partnerId: entry.partnerId,
          partnerCode: entry.partnerCode,
          partnerName: entry.partnerName,
          status: entry.status,
          assignedUserName: entry.assignedUserName,
          grossValue: Math.round(entry.gross * 100) / 100,
          netValue: Math.round(entry.net * 100) / 100,
          count: entry.count,
          paidCount: entry.paidCount,
          paidValue: Math.round(entry.paidValue * 100) / 100,
          approvedCount: entry.approvedCount,
          cancelledCount: entry.cancelledCount,
          cancelledValue: Math.round(entry.cancelledValue * 100) / 100,
          reprovedCount: entry.reprovedCount,
          reprovedValue: Math.round(entry.reprovedValue * 100) / 100,
          conversionRatePercent,
          approvalRatePercent,
          avgTicketNet,
          openPendenciesCount,
          lastActivityDate: lastAct ? lastAct.toISOString() : null,
          avgDwellHours,
        };
      })
      .sort((a, b) => b.netValue - a.netValue);

    const activePartnersCount = allPartners.filter(p => p.status === 'ATIVO').length;
    const partnersWithProdSet = new Set(partners.map(p => p.partnerId));
    const partnersWithProductionCount = allPartners.filter(p => partnersWithProdSet.has(p.id)).length;
    const partnersWithoutProductionCount = Math.max(0, allPartners.length - partnersWithProductionCount);

    return {
      tenantId,
      period: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      partners,
      summary: {
        totalPartners: allPartners.length,
        activePartnersCount,
        partnersWithProductionCount,
        partnersWithoutProductionCount,
        totalGrossValue: Math.round(totalGrossValue * 100) / 100,
        totalNetValue: Math.round(totalNetValue * 100) / 100,
        totalPaidValue: Math.round(totalPaidValue * 100) / 100,
        topPartnerName: partners.length > 0 ? partners[0].partnerName : null,
      },
    };
  }

  /**
   * 8. GET /api/bi/operators - Operator / Internal User Performance
   */
  public static async getOperators(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIOperatorAnalyticsResponse> {
    const dateRange = this.resolveDateRange(filters);
    const where = this.buildProposalWhere(tenantId, filters, dateRange);

    const [users, proposals, pendencies, tasks] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { tenantId },
            { memberships: { some: { tenantId } } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      }),
      prisma.proposal.findMany({
        where,
        select: {
          id: true,
          createdById: true,
          assignedToId: true,
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
      }),
      prisma.pendency.groupBy({
        by: ['assignedToId'],
        where: {
          tenantId,
          assignedToId: { not: null },
          status: { in: ['ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO'] },
        },
        _count: { id: true },
      }),
      prisma.partnerTask.groupBy({
        by: ['assignedToId'],
        where: {
          tenantId,
          assignedToId: { not: null },
          status: { in: ['PENDENTE', 'EM_ANDAMENTO'] },
        },
        _count: { id: true },
      }),
    ]);

    const pendenciesMap = new Map<string, number>();
    for (const pen of pendencies) {
      if (pen.assignedToId) pendenciesMap.set(pen.assignedToId, pen._count.id);
    }

    const tasksMap = new Map<string, number>();
    for (const t of tasks) {
      if (t.assignedToId) tasksMap.set(t.assignedToId, t._count.id);
    }

    const operatorMap = new Map<
      string,
      {
        userId: string;
        userName: string;
        userEmail: string;
        userRole: string;
        createdCount: number;
        assignedCount: number;
        gross: number;
        net: number;
        paidCount: number;
        paidValue: number;
        approvedCount: number;
      }
    >();

    // Seed map with known users
    for (const u of users) {
      operatorMap.set(u.id, {
        userId: u.id,
        userName: u.name,
        userEmail: u.email,
        userRole: u.role,
        createdCount: 0,
        assignedCount: 0,
        gross: 0,
        net: 0,
        paidCount: 0,
        paidValue: 0,
        approvedCount: 0,
      });
    }

    let totalPaidValue = 0;

    for (const p of proposals) {
      const conVal = Number(p.contractValue || 0);
      const relVal = Number(p.releasedValue || 0);

      const isPaid =
        p.standardCategory === StandardStatusCategory.PAGO ||
        p.status?.code === 'PAGO' ||
        p.status?.standardCategory === StandardStatusCategory.PAGO;

      const isApproved =
        isPaid ||
        p.status?.code === 'APROVADO';

      const targetId = p.createdById || p.assignedToId || 'sem-operador';
      let entry = operatorMap.get(targetId);
      if (!entry) {
        entry = {
          userId: targetId,
          userName: 'Sistema / Automático',
          userEmail: '-',
          userRole: 'SISTEMA',
          createdCount: 0,
          assignedCount: 0,
          gross: 0,
          net: 0,
          paidCount: 0,
          paidValue: 0,
          approvedCount: 0,
        };
        operatorMap.set(targetId, entry);
      }

      if (p.createdById) entry.createdCount++;
      if (p.assignedToId) entry.assignedCount++;
      entry.gross += conVal;
      entry.net += relVal;

      if (isApproved) entry.approvedCount++;
      if (isPaid) {
        entry.paidCount++;
        entry.paidValue += relVal;
        totalPaidValue += relVal;
      }
    }

    const operators: BIOperatorAnalyticsItem[] = Array.from(operatorMap.values())
      .filter(o => o.createdCount > 0 || o.assignedCount > 0 || o.gross > 0)
      .map(entry => {
        const totalProposals = Math.max(entry.createdCount, entry.assignedCount);
        const conversionRatePercent = totalProposals > 0 ? Math.round((entry.paidCount / totalProposals) * 1000) / 10 : 0;

        return {
          userId: entry.userId,
          userName: entry.userName,
          userEmail: entry.userEmail,
          userRole: entry.userRole,
          createdProposalsCount: entry.createdCount,
          assignedProposalsCount: entry.assignedCount,
          grossValue: Math.round(entry.gross * 100) / 100,
          netValue: Math.round(entry.net * 100) / 100,
          paidCount: entry.paidCount,
          paidValue: Math.round(entry.paidValue * 100) / 100,
          approvedCount: entry.approvedCount,
          conversionRatePercent,
          openPendenciesCount: pendenciesMap.get(entry.userId) || 0,
          openTasksCount: tasksMap.get(entry.userId) || 0,
        };
      })
      .sort((a, b) => b.paidValue - a.paidValue);

    return {
      tenantId,
      period: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      operators,
      summary: {
        totalOperators: operators.length,
        totalProposals: proposals.length,
        totalPaidValue: Math.round(totalPaidValue * 100) / 100,
      },
    };
  }

  /**
   * 9. GET /api/bi/pendencies - Pendency & SLA Operational Analytics
   */
  public static async getPendencies(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIPendencyAnalyticsResponse> {
    const dateRange = this.resolveDateRange(filters);

    const pendencies = await prisma.pendency.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
        ...(filters.partnerId ? { partnerId: filters.partnerId.trim() } : {}),
      },
      select: {
        id: true,
        type: true,
        priority: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const now = new Date();
    let openCount = 0;
    let inProgressCount = 0;
    let waitingCount = 0;
    let resolvedCount = 0;
    let cancelledCount = 0;
    let withinSlaCount = 0;
    let nearSlaCount = 0;
    let overSlaCount = 0;

    const resolutionHoursList: number[] = [];
    const catMap = new Map<string, { count: number; open: number; resolved: number; overSla: number }>();
    const prioMap = new Map<string, { count: number; open: number; overSla: number }>();
    const statusMap = new Map<string, number>();
    const evoMap = new Map<string, { created: number; resolved: number }>();

    for (const pen of pendencies) {
      const st = pen.status || 'ABERTA';
      statusMap.set(st, (statusMap.get(st) || 0) + 1);

      const isResolved = st === 'RESOLVIDA';
      const isCancelled = st === 'CANCELADA';
      const isOpen = !isResolved && !isCancelled;

      if (st === 'ABERTA') openCount++;
      else if (st === 'EM_ATENDIMENTO') inProgressCount++;
      else if (st === 'AGUARDANDO') waitingCount++;
      else if (isResolved) resolvedCount++;
      else if (isCancelled) cancelledCount++;

      // Resolution time calculation
      if (isResolved && pen.resolvedAt) {
        const resHours = Math.max(0, (pen.resolvedAt.getTime() - pen.createdAt.getTime()) / (1000 * 3600));
        resolutionHoursList.push(resHours);
      }

      // SLA threshold
      const slaThreshold = pen.priority === 'URGENT' ? 12 : pen.priority === 'HIGH' ? 24 : 48;
      let isOver = false;

      if (isOpen) {
        const dwellHours = (now.getTime() - pen.createdAt.getTime()) / (1000 * 3600);
        if (dwellHours > slaThreshold) {
          overSlaCount++;
          isOver = true;
        } else if (dwellHours >= slaThreshold * 0.75) {
          nearSlaCount++;
          withinSlaCount++;
        } else {
          withinSlaCount++;
        }
      }

      // Group by Category
      const cat = pen.type || 'OUTROS';
      const cEntry = catMap.get(cat) || { count: 0, open: 0, resolved: 0, overSla: 0 };
      cEntry.count++;
      if (isOpen) cEntry.open++;
      if (isResolved) cEntry.resolved++;
      if (isOver) cEntry.overSla++;
      catMap.set(cat, cEntry);

      // Group by Priority
      const prio = pen.priority || 'MEDIUM';
      const pEntry = prioMap.get(prio) || { count: 0, open: 0, overSla: 0 };
      pEntry.count++;
      if (isOpen) pEntry.open++;
      if (isOver) pEntry.overSla++;
      prioMap.set(prio, pEntry);

      // Evolution by Day
      const dayKey = pen.createdAt.toISOString().slice(0, 10);
      const eEntry = evoMap.get(dayKey) || { created: 0, resolved: 0 };
      eEntry.created++;
      if (isResolved) eEntry.resolved++;
      evoMap.set(dayKey, eEntry);
    }

    // Average & Median resolution time
    let avgResolutionHours: number | null = null;
    let medianResolutionHours: number | null = null;

    if (resolutionHoursList.length > 0) {
      const sum = resolutionHoursList.reduce((acc, v) => acc + v, 0);
      avgResolutionHours = Math.round((sum / resolutionHoursList.length) * 10) / 10;

      resolutionHoursList.sort((a, b) => a - b);
      const mid = Math.floor(resolutionHoursList.length / 2);
      medianResolutionHours = resolutionHoursList.length % 2 !== 0
        ? Math.round(resolutionHoursList[mid] * 10) / 10
        : Math.round(((resolutionHoursList[mid - 1] + resolutionHoursList[mid]) / 2) * 10) / 10;
    }

    const evaluatedOpenTotal = withinSlaCount + overSlaCount;
    const slaCompliancePercent = evaluatedOpenTotal > 0
      ? Math.round((withinSlaCount / evaluatedOpenTotal) * 1000) / 10
      : 100;

    const byCategory = Array.from(catMap.entries()).map(([category, data]) => ({
      category,
      count: data.count,
      openCount: data.open,
      resolvedCount: data.resolved,
      overSlaCount: data.overSla,
    }));

    const byPriority = Array.from(prioMap.entries()).map(([priority, data]) => {
      const labels: Record<string, string> = {
        LOW: 'Baixa',
        MEDIUM: 'Média',
        HIGH: 'Alta',
        URGENT: 'Urgente / Crítica',
      };
      return {
        priority,
        label: labels[priority] || priority,
        count: data.count,
        openCount: data.open,
        overSlaCount: data.overSla,
      };
    });

    const byStatus = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

    const evolution = Array.from(evoMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, counts]) => ({
        date,
        created: counts.created,
        resolved: counts.resolved,
      }));

    return {
      tenantId,
      period: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      summary: {
        totalCreated: pendencies.length,
        openCount,
        inProgressCount,
        waitingCount,
        resolvedCount,
        cancelledCount,
        withinSlaCount,
        nearSlaCount,
        overSlaCount,
        slaCompliancePercent,
        avgResolutionHours,
        medianResolutionHours,
      },
      byCategory,
      byPriority,
      byStatus,
      evolution,
    };
  }

  /**
   * 10. GET /api/bi/bottlenecks - Objective Pipeline Bottlenecks & Status Distribution
   */
  public static async getBottlenecks(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIBottlenecksResponse> {
    const dateRange = this.resolveDateRange(filters);
    const where = this.buildProposalWhere(tenantId, filters, dateRange);

    const [proposals, activePendenciesOverSla, recentFailedLogs] = await Promise.all([
      prisma.proposal.findMany({
        where,
        select: {
          id: true,
          contractValue: true,
          releasedValue: true,
          createdAt: true,
          statusId: true,
          standardCategory: true,
          status: {
            select: {
              id: true,
              code: true,
              name: true,
              standardCategory: true,
              slaHours: true,
              finalStatus: true,
            },
          },
          bank: { select: { name: true } },
          partner: { select: { name: true } },
        },
      }),
      prisma.pendency.count({
        where: {
          tenantId,
          status: { in: ['ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO'] },
          createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) },
        },
      }),
      prisma.integrationHealthLog.count({
        where: {
          timestamp: { gte: dateRange.startDate, lte: dateRange.endDate },
          success: false,
          OR: [{ tenantId }, { tenantId: null }],
        },
      }),
    ]);

    const totalProposals = proposals.length;
    const statusMap = new Map<
      string,
      {
        statusId: string;
        statusCode: string;
        statusName: string;
        standardCategory: string;
        count: number;
        value: number;
        isFinal: boolean;
      }
    >();

    for (const p of proposals) {
      const sId = p.status?.id || p.statusId || 'sem-status';
      const sCode = p.status?.code || 'S/S';
      const sName = p.status?.name || 'Sem Status Definido';
      const stdCat = p.status?.standardCategory || p.standardCategory || 'ESTEIRA';
      const isFin = isStatusFinal(p.status);

      const entry = statusMap.get(sId) || {
        statusId: sId,
        statusCode: sCode,
        statusName: sName,
        standardCategory: stdCat,
        count: 0,
        value: 0,
        isFinal: isFin,
      };

      entry.count++;
      entry.value += Number(p.contractValue || 0);
      statusMap.set(sId, entry);
    }

    const statusDistribution = Array.from(statusMap.values())
      .map(entry => ({
        ...entry,
        value: Math.round(entry.value * 100) / 100,
        percentageOfTotal: totalProposals > 0 ? Math.round((entry.count / totalProposals) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const bottlenecks: BIBottleneckItem[] = [];

    // Bottleneck 1: Status Concentration > 20% in non-final stage
    for (const stat of statusDistribution) {
      if (!stat.isFinal && stat.percentageOfTotal >= 20.0 && stat.count >= 3) {
        bottlenecks.push({
          type: 'STATUS_CONCENTRATION',
          title: `Concentração no status "${stat.statusName}"`,
          severity: stat.percentageOfTotal >= 40.0 ? 'CRITICO' : 'ATENCAO',
          metricValue: `${stat.percentageOfTotal}%`,
          description: `${stat.count} propostas (${stat.percentageOfTotal}% do volume avaliado) estão concentradas no status "${stat.statusName}".`,
          evidence: {
            entityType: 'STATUS',
            entityId: stat.statusId,
            entityName: stat.statusName,
            count: stat.count,
            value: stat.value,
            percentage: stat.percentageOfTotal,
          },
        });
      }
    }

    // Bottleneck 2: Over SLA Pendencies
    if (activePendenciesOverSla > 0) {
      bottlenecks.push({
        type: 'OVER_SLA_PENDENCIES',
        title: 'Pendências com SLA Estourado',
        severity: activePendenciesOverSla >= 5 ? 'CRITICO' : 'ATENCAO',
        metricValue: activePendenciesOverSla,
        description: `Existem ${activePendenciesOverSla} pendências operacionais abertas há mais de 24 horas aguardando tratativa.`,
        evidence: {
          entityType: 'PENDENCY',
          count: activePendenciesOverSla,
        },
      });
    }

    // Bottleneck 3: Integration Errors
    if (recentFailedLogs >= 5) {
      bottlenecks.push({
        type: 'INTEGRATION_ERRORS',
        title: 'Erros Recorrentes de Integração Bancária',
        severity: recentFailedLogs >= 15 ? 'CRITICO' : 'ATENCAO',
        metricValue: recentFailedLogs,
        description: `Foram registradas ${recentFailedLogs} falhas de comunicação ou timeout nas APIs bancárias no período selecionado.`,
        evidence: {
          entityType: 'INTEGRATION',
          count: recentFailedLogs,
        },
      });
    }

    return {
      tenantId,
      generatedAt: new Date().toISOString(),
      bottlenecks,
      statusDistribution,
    };
  }

  /**
   * 11. GET /api/bi/cancellations - Objective Cancellations Breakdown
   */
  public static async getCancellations(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BICancellationsResponse> {
    const dateRange = this.resolveDateRange(filters);
    const where = this.buildProposalWhere(tenantId, filters, dateRange);

    const [allProposalsCount, cancelledProposals] = await Promise.all([
      prisma.proposal.count({ where }),
      prisma.proposal.findMany({
        where: {
          ...where,
          OR: [
            { standardCategory: StandardStatusCategory.CANCELADO },
            { status: { code: 'CANCELADO' } },
            { status: { standardCategory: StandardStatusCategory.CANCELADO } },
          ],
        },
        select: {
          id: true,
          contractValue: true,
          createdAt: true,
          c6ActivityDescription: true,
          factaRawStatus: true,
          bank: { select: { id: true, name: true } },
          product: { select: { id: true, name: true } },
          partner: { select: { id: true, name: true } },
          status: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    let totalCancelledCount = cancelledProposals.length;
    let totalCancelledValue = 0;

    const reasonMap = new Map<string, { count: number; value: number }>();
    const bankMap = new Map<string, { bankId: string; bankName: string; count: number; value: number }>();
    const prodMap = new Map<string, { productId: string; productName: string; count: number; value: number }>();
    const partMap = new Map<string, { partnerId: string; partnerName: string; count: number; value: number }>();
    const evoMap = new Map<string, { count: number; value: number }>();

    for (const p of cancelledProposals) {
      const conVal = Number(p.contractValue || 0);
      totalCancelledValue += conVal;

      // Reason extraction (real observations or status name)
      const rawReason = (p.c6ActivityDescription && p.c6ActivityDescription.trim().length > 3)
        ? p.c6ActivityDescription.trim()
        : (p.factaRawStatus && p.factaRawStatus.trim().length > 3)
        ? p.factaRawStatus.trim()
        : (p.status?.name || 'Cancelamento Operacional / Desistência');
      const rEntry = reasonMap.get(rawReason) || { count: 0, value: 0 };
      rEntry.count++;
      rEntry.value += conVal;
      reasonMap.set(rawReason, rEntry);

      // Bank
      const bId = p.bank?.id || 'sem-banco';
      const bName = p.bank?.name || 'Não Informado';
      const bEntry = bankMap.get(bId) || { bankId: bId, bankName: bName, count: 0, value: 0 };
      bEntry.count++;
      bEntry.value += conVal;
      bankMap.set(bId, bEntry);

      // Product
      const prId = p.product?.id || 'sem-produto';
      const prName = p.product?.name || 'Não Informado';
      const prEntry = prodMap.get(prId) || { productId: prId, productName: prName, count: 0, value: 0 };
      prEntry.count++;
      prEntry.value += conVal;
      prodMap.set(prId, prEntry);

      // Partner
      const paId = p.partner?.id || 'sem-parceiro';
      const paName = p.partner?.name || 'Direto / Sem Parceiro';
      const paEntry = partMap.get(paId) || { partnerId: paId, partnerName: paName, count: 0, value: 0 };
      paEntry.count++;
      paEntry.value += conVal;
      partMap.set(paId, paEntry);

      // Evolution
      const dKey = p.createdAt.toISOString().slice(0, 10);
      const eEntry = evoMap.get(dKey) || { count: 0, value: 0 };
      eEntry.count++;
      eEntry.value += conVal;
      evoMap.set(dKey, eEntry);
    }

    const rateOverProposalsPercent = allProposalsCount > 0
      ? Math.round((totalCancelledCount / allProposalsCount) * 1000) / 10
      : 0;

    const reasons = Array.from(reasonMap.entries())
      .map(([reason, d]) => ({
        reason,
        count: d.count,
        value: Math.round(d.value * 100) / 100,
        percentage: totalCancelledCount > 0 ? Math.round((d.count / totalCancelledCount) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const byBank = Array.from(bankMap.values())
      .map(b => ({ ...b, value: Math.round(b.value * 100) / 100 }))
      .sort((a, b) => b.count - a.count);

    const byProduct = Array.from(prodMap.values())
      .map(pr => ({ ...pr, value: Math.round(pr.value * 100) / 100 }))
      .sort((a, b) => b.count - a.count);

    const byPartner = Array.from(partMap.values())
      .map(pa => ({ ...pa, value: Math.round(pa.value * 100) / 100 }))
      .sort((a, b) => b.count - a.count);

    const evolution = Array.from(evoMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => ({
        date,
        count: d.count,
        value: Math.round(d.value * 100) / 100,
      }));

    return {
      tenantId,
      period: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      summary: {
        totalCancelledCount,
        totalCancelledValue: Math.round(totalCancelledValue * 100) / 100,
        rateOverProposalsPercent,
      },
      reasons,
      byBank,
      byProduct,
      byPartner,
      evolution,
    };
  }

  /**
   * 12. GET /api/bi/refusals - Objective Refusals / Recusas Breakdown
   */
  public static async getRefusals(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIRefusalsResponse> {
    const dateRange = this.resolveDateRange(filters);
    const where = this.buildProposalWhere(tenantId, filters, dateRange);

    const [allProposalsCount, refusedProposals] = await Promise.all([
      prisma.proposal.count({ where }),
      prisma.proposal.findMany({
        where: {
          ...where,
          OR: [
            { standardCategory: StandardStatusCategory.RECUSADO },
            { status: { code: 'REPROVADO' } },
            { status: { standardCategory: StandardStatusCategory.RECUSADO } },
          ],
        },
        select: {
          id: true,
          contractValue: true,
          createdAt: true,
          c6ActivityDescription: true,
          factaRawStatus: true,
          bank: { select: { id: true, name: true } },
          product: { select: { id: true, name: true } },
          partner: { select: { id: true, name: true } },
          status: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    let totalRefusedCount = refusedProposals.length;
    let totalRefusedValue = 0;

    const reasonMap = new Map<string, { count: number; value: number }>();
    const bankMap = new Map<string, { bankId: string; bankName: string; count: number; value: number }>();
    const prodMap = new Map<string, { productId: string; productName: string; count: number; value: number }>();
    const partMap = new Map<string, { partnerId: string; partnerName: string; count: number; value: number }>();
    const evoMap = new Map<string, { count: number; value: number }>();

    for (const p of refusedProposals) {
      const conVal = Number(p.contractValue || 0);
      totalRefusedValue += conVal;

      const rawReason = (p.c6ActivityDescription && p.c6ActivityDescription.trim().length > 3)
        ? p.c6ActivityDescription.trim()
        : (p.factaRawStatus && p.factaRawStatus.trim().length > 3)
        ? p.factaRawStatus.trim()
        : (p.status?.name || 'Recusa Bancária / Política de Crédito');

      const rEntry = reasonMap.get(rawReason) || { count: 0, value: 0 };
      rEntry.count++;
      rEntry.value += conVal;
      reasonMap.set(rawReason, rEntry);

      const bId = p.bank?.id || 'sem-banco';
      const bName = p.bank?.name || 'Não Informado';
      const bEntry = bankMap.get(bId) || { bankId: bId, bankName: bName, count: 0, value: 0 };
      bEntry.count++;
      bEntry.value += conVal;
      bankMap.set(bId, bEntry);

      const prId = p.product?.id || 'sem-produto';
      const prName = p.product?.name || 'Não Informado';
      const prEntry = prodMap.get(prId) || { productId: prId, productName: prName, count: 0, value: 0 };
      prEntry.count++;
      prEntry.value += conVal;
      prodMap.set(prId, prEntry);

      const paId = p.partner?.id || 'sem-parceiro';
      const paName = p.partner?.name || 'Direto / Sem Parceiro';
      const paEntry = partMap.get(paId) || { partnerId: paId, partnerName: paName, count: 0, value: 0 };
      paEntry.count++;
      paEntry.value += conVal;
      partMap.set(paId, paEntry);

      const dKey = p.createdAt.toISOString().slice(0, 10);
      const eEntry = evoMap.get(dKey) || { count: 0, value: 0 };
      eEntry.count++;
      eEntry.value += conVal;
      evoMap.set(dKey, eEntry);
    }

    const rateOverProposalsPercent = allProposalsCount > 0
      ? Math.round((totalRefusedCount / allProposalsCount) * 1000) / 10
      : 0;

    const reasons = Array.from(reasonMap.entries())
      .map(([reason, d]) => ({
        reason,
        count: d.count,
        value: Math.round(d.value * 100) / 100,
        percentage: totalRefusedCount > 0 ? Math.round((d.count / totalRefusedCount) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const byBank = Array.from(bankMap.values())
      .map(b => ({ ...b, value: Math.round(b.value * 100) / 100 }))
      .sort((a, b) => b.count - a.count);

    const byProduct = Array.from(prodMap.values())
      .map(pr => ({ ...pr, value: Math.round(pr.value * 100) / 100 }))
      .sort((a, b) => b.count - a.count);

    const byPartner = Array.from(partMap.values())
      .map(pa => ({ ...pa, value: Math.round(pa.value * 100) / 100 }))
      .sort((a, b) => b.count - a.count);

    const evolution = Array.from(evoMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => ({
        date,
        count: d.count,
        value: Math.round(d.value * 100) / 100,
      }));

    return {
      tenantId,
      period: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      summary: {
        totalRefusedCount,
        totalRefusedValue: Math.round(totalRefusedValue * 100) / 100,
        rateOverProposalsPercent,
      },
      reasons,
      byBank,
      byProduct,
      byPartner,
      evolution,
    };
  }

  /**
   * 13. GET /api/bi/integrations - Integration Telemetry & Bank API Health
   */
  public static async getIntegrations(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIIntegrationsResponse> {
    const dateRange = this.resolveDateRange(filters);

    const healthLogs = await prisma.integrationHealthLog.findMany({
      where: {
        timestamp: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
        OR: [{ tenantId }, { tenantId: null }],
      },
      select: {
        bank: true,
        success: true,
        httpStatus: true,
        latencyMs: true,
      },
    });

    const providerNames: Record<string, string> = {
      C6: 'Banco C6 Consignado',
      FACTA: 'Facta Financeira',
      BMG: 'Banco BMG',
      HAPPY: 'Happy / BYX Capital',
    };

    const provMap = new Map<
      string,
      {
        total: number;
        success: number;
        err4xx: number;
        err5xx: number;
        timeouts: number;
        latencySum: number;
        latencies: number[];
      }
    >();

    // Initialize the 4 standard providers
    for (const p of ['C6', 'FACTA', 'BMG', 'HAPPY']) {
      provMap.set(p, {
        total: 0,
        success: 0,
        err4xx: 0,
        err5xx: 0,
        timeouts: 0,
        latencySum: 0,
        latencies: [],
      });
    }

    let globalTotal = 0;
    let globalSuccess = 0;
    let globalLatencySum = 0;

    for (const log of healthLogs) {
      const bKey = (log.bank || '').toUpperCase();
      let matchedKey = 'C6';
      if (bKey.includes('FACTA')) matchedKey = 'FACTA';
      else if (bKey.includes('BMG')) matchedKey = 'BMG';
      else if (bKey.includes('HAPPY') || bKey.includes('BYX')) matchedKey = 'HAPPY';
      else if (bKey.includes('C6')) matchedKey = 'C6';
      else continue;

      const pEntry = provMap.get(matchedKey)!;
      pEntry.total++;
      globalTotal++;

      if (log.success) {
        pEntry.success++;
        globalSuccess++;
      } else {
        const status = log.httpStatus || 0;
        if (status >= 400 && status < 500) pEntry.err4xx++;
        else if (status >= 500) pEntry.err5xx++;
        else pEntry.timeouts++;
      }

      const lat = log.latencyMs || 0;
      pEntry.latencySum += lat;
      pEntry.latencies.push(lat);
      globalLatencySum += lat;
    }

    const providers: BIIntegrationProviderItem[] = Array.from(provMap.entries()).map(([provider, d]) => {
      const successRatePercent = d.total > 0 ? Math.round((d.success / d.total) * 1000) / 10 : 100;
      const avgLatencyMs = d.total > 0 ? Math.round(d.latencySum / d.total) : 0;

      // Calculate P95 latency
      let p95LatencyMs = 0;
      if (d.latencies.length > 0) {
        d.latencies.sort((a, b) => a - b);
        const idx = Math.floor(d.latencies.length * 0.95);
        p95LatencyMs = d.latencies[Math.min(idx, d.latencies.length - 1)];
      }

      const status = successRatePercent >= 95 ? 'ONLINE' : successRatePercent >= 80 ? 'DEGRADED' : 'OFFLINE';

      return {
        provider,
        name: providerNames[provider] || provider,
        totalRequests: d.total,
        successCount: d.success,
        error4xxCount: d.err4xx,
        error5xxCount: d.err5xx,
        timeoutCount: d.timeouts,
        successRatePercent,
        avgLatencyMs,
        p95LatencyMs,
        incidentCount: d.err4xx + d.err5xx + d.timeouts,
        status,
      };
    });

    const globalSuccessRatePercent = globalTotal > 0 ? Math.round((globalSuccess / globalTotal) * 1000) / 10 : 100;
    const globalAvgLatencyMs = globalTotal > 0 ? Math.round(globalLatencySum / globalTotal) : 0;
    const activeIncidentsCount = providers.reduce((acc, p) => acc + p.incidentCount, 0);

    return {
      tenantId,
      period: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      summary: {
        totalRequests: globalTotal,
        totalSuccess: globalSuccess,
        totalErrors: globalTotal - globalSuccess,
        globalSuccessRatePercent,
        globalAvgLatencyMs,
        activeIncidentsCount,
      },
      providers,
    };
  }

  /**
   * 14. GET /api/bi/operational-health - Real Consolidated Pipeline & Integration Health
   */
  public static async getOperationalHealth(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIOperationalHealthResponse> {
    const overview = await this.getOverview(prisma, tenantId, filters);
    const integrations = await this.getIntegrations(prisma, tenantId, filters);

    // Proposals pipeline health status
    const propOverSla = overview.proposalsOverSla;
    const propStatus = propOverSla === 0 ? 'SAUDAVEL' : propOverSla <= 5 ? 'ATENCAO' : 'CRITICO';

    // Pendencies health status
    const pendOverSla = overview.pendencies.overSla;
    const pendStatus = pendOverSla === 0 ? 'SAUDAVEL' : pendOverSla <= 3 ? 'ATENCAO' : 'CRITICO';

    // Integrations health status
    const onlineCount = integrations.providers.filter(p => p.status === 'ONLINE').length;
    const intStatus = onlineCount === integrations.providers.length
      ? 'SAUDAVEL'
      : onlineCount >= integrations.providers.length - 1
      ? 'ATENCAO'
      : 'CRITICO';

    return {
      tenantId,
      evaluatedAt: new Date().toISOString(),
      proposals: {
        activeInPipeline: overview.inProgressProduction.count,
        paidInPeriod: overview.paidProduction.count,
        overSlaInPipeline: propOverSla,
        status: propStatus,
      },
      pendencies: {
        openTotal: overview.pendencies.totalOpen,
        overSlaTotal: pendOverSla,
        compliancePercent: overview.pendencies.slaCompliancePercent,
        status: pendStatus,
      },
      integrations: {
        onlineProvidersCount: onlineCount,
        totalProvidersCount: integrations.providers.length,
        overallSuccessRate: integrations.summary.globalSuccessRatePercent,
        status: intStatus,
      },
    };
  }
}
