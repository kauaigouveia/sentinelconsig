import { PrismaClient, Prisma, ProposalType, StandardStatusCategory } from '@prisma/client';
import {
  BIFilterOptions,
  BIPeriodPreset,
  BIOverviewResponse,
  BIProductionResponse,
  BIProductionItem,
  BIBankAnalyticsResponse,
  BIBankAnalyticsItem,
  BIPartnerAnalyticsResponse,
  BIPartnerAnalyticsItem,
} from '../../src/types/bi.js';

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
      // Create UTC date shifted by +3 hours to represent America/Sao_Paulo UTC-3
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

    if (preset === 'PERSONALIZADO') {
      let start: Date | null = null;
      let end: Date | null = null;

      if (filters.startDate) {
        const parsedStart = new Date(filters.startDate);
        if (!isNaN(parsedStart.getTime())) start = parsedStart;
      }
      if (filters.endDate) {
        const parsedEnd = new Date(filters.endDate);
        if (!isNaN(parsedEnd.getTime())) end = parsedEnd;
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
  private static buildProposalWhere(
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
   * 1. GET /api/bi/overview
   * Returns strategic KPIs calculated strictly from PostgreSQL.
   */
  public static async getOverview(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIOverviewResponse> {
    const dateRange = this.resolveDateRange(filters);
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
            slaHours: true,
          },
        },
      },
    });

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
        p.standardCategory === 'PAGO' ||
        p.status?.code === 'PAGO' ||
        p.status?.standardCategory === 'PAGO';

      const isReproved = p.status?.code === 'REPROVADO';

      const isCancelled =
        p.standardCategory === 'CANCELADO' ||
        p.status?.code === 'CANCELADO' ||
        isReproved ||
        p.status?.standardCategory === 'CANCELADO';

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
      : (totalProposals > 0 ? Math.round((totalNetValue / totalProposals) * 100) / 100 : 0);

    const cancelledRatePercent = totalProposals > 0 ? Math.round((cancelledCount / totalProposals) * 1000) / 10 : 0;
    const reprovedRatePercent = totalProposals > 0 ? Math.round((reprovedCount / totalProposals) * 1000) / 10 : 0;

    const slaCompliancePercent = totalOpenEvaluated > 0
      ? Math.round(((totalWithinSla + totalNearSla) / totalOpenEvaluated) * 1000) / 10
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
    };
  }

  /**
   * 2. GET /api/bi/production
   * Aggregates production over time (day, week, month) using PostgreSQL aggregation.
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

    for (const p of proposals) {
      const conVal = Number(p.contractValue || 0);
      const relVal = Number(p.releasedValue || 0);
      totalCount++;
      totalGross += conVal;
      totalNet += relVal;

      const isPaid =
        p.standardCategory === 'PAGO' ||
        p.status?.code === 'PAGO' ||
        p.status?.standardCategory === 'PAGO';

      const isReproved = p.status?.code === 'REPROVADO';

      const isCancelled =
        p.standardCategory === 'CANCELADO' ||
        p.status?.code === 'CANCELADO' ||
        isReproved ||
        p.status?.standardCategory === 'CANCELADO';

      const isApproved = isPaid || p.status?.code === 'APROVADO';

      if (isPaid) {
        totalPaidValue += relVal;
        totalPaidCount++;
      }
      if (isCancelled) {
        totalCancelledValue += conVal;
        totalCancelledCount++;
      }

      // Group key calculation
      let key = '';
      let formattedDate = '';

      if (groupBy === 'month') {
        const y = p.createdAt.getFullYear();
        const m = String(p.createdAt.getMonth() + 1).padStart(2, '0');
        key = `${y}-${m}`;
        formattedDate = `${m}/${y}`;
      } else if (groupBy === 'week') {
        const d = new Date(Date.UTC(p.createdAt.getFullYear(), p.createdAt.getMonth(), p.createdAt.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
        key = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
        formattedDate = `Sem ${weekNo}/${d.getUTCFullYear()}`;
      } else {
        // day (YYYY-MM-DD)
        const y = p.createdAt.getFullYear();
        const m = String(p.createdAt.getMonth() + 1).padStart(2, '0');
        const d = String(p.createdAt.getDate()).padStart(2, '0');
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
      .map(entry => ({
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
      }));

    const conversionRatePercent = totalCount > 0 ? Math.round((totalPaidCount / totalCount) * 1000) / 10 : 0;

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
        conversionRatePercent,
      },
      series,
    };
  }

  /**
   * 3. GET /api/bi/banks
   * Returns bank performance ranking and statistics sorted by netValue DESC.
   */
  public static async getBanks(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIBankAnalyticsResponse> {
    const dateRange = this.resolveDateRange(filters);
    const where = this.buildProposalWhere(tenantId, filters, dateRange);

    const proposals = await prisma.proposal.findMany({
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
            standardCategory: true,
            slaHours: true,
          },
        },
      },
    });

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
        withinSla: number;
        totalSlaEvaluated: number;
      }
    >();

    let totalGrossValue = 0;
    let totalNetValue = 0;
    let totalPaidValue = 0;

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
        withinSla: 0,
        totalSlaEvaluated: 0,
      };

      entry.count++;
      entry.gross += conVal;
      entry.net += relVal;

      const isPaid =
        p.standardCategory === 'PAGO' ||
        p.status?.code === 'PAGO' ||
        p.status?.standardCategory === 'PAGO';

      if (isPaid) {
        entry.paidCount++;
        entry.paidValue += relVal;
        totalPaidValue += relVal;
      }

      // SLA evaluation
      const isOpen = !isPaid && p.standardCategory !== 'CANCELADO' && p.status?.code !== 'CANCELADO';
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
        const avgTicketNet = entry.paidCount > 0
          ? Math.round((entry.paidValue / entry.paidCount) * 100) / 100
          : (entry.count > 0 ? Math.round((entry.net / entry.count) * 100) / 100 : 0);

        const slaCompliancePercent = entry.totalSlaEvaluated > 0
          ? Math.round((entry.withinSla / entry.totalSlaEvaluated) * 1000) / 10
          : null;

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
          conversionRatePercent,
          avgTicketNet,
          slaCompliancePercent,
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
        topBankName: banks.length > 0 ? banks[0].bankName : null,
      },
    };
  }

  /**
   * 4. GET /api/bi/partners
   * Returns partner ranking and statistics sorted by netValue DESC.
   */
  public static async getPartners(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<BIPartnerAnalyticsResponse> {
    const dateRange = this.resolveDateRange(filters);
    const where = this.buildProposalWhere(tenantId, filters, dateRange);

    const proposals = await prisma.proposal.findMany({
      where,
      select: {
        id: true,
        contractValue: true,
        releasedValue: true,
        createdAt: true,
        partnerId: true,
        standardCategory: true,
        partner: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        status: {
          select: {
            code: true,
            standardCategory: true,
          },
        },
      },
    });

    const now = new Date();
    const partnerMap = new Map<
      string,
      {
        partnerId: string;
        partnerCode: string;
        partnerName: string;
        gross: number;
        net: number;
        count: number;
        paidCount: number;
        paidValue: number;
        totalDwellHours: number;
      }
    >();

    let totalGrossValue = 0;
    let totalNetValue = 0;
    let totalPaidValue = 0;

    for (const p of proposals) {
      const conVal = Number(p.contractValue || 0);
      const relVal = Number(p.releasedValue || 0);
      totalGrossValue += conVal;
      totalNetValue += relVal;

      const partnerId = p.partnerId || 'sem-parceiro';
      const partnerCode = p.partner?.code || 'S/P';
      const partnerName = p.partner?.name || 'Direto / Sem Parceiro';

      const entry = partnerMap.get(partnerId) || {
        partnerId,
        partnerCode,
        partnerName,
        gross: 0,
        net: 0,
        count: 0,
        paidCount: 0,
        paidValue: 0,
        totalDwellHours: 0,
      };

      entry.count++;
      entry.gross += conVal;
      entry.net += relVal;

      const dwellHours = Math.max(0, (now.getTime() - p.createdAt.getTime()) / (1000 * 3600));
      entry.totalDwellHours += dwellHours;

      const isPaid =
        p.standardCategory === 'PAGO' ||
        p.status?.code === 'PAGO' ||
        p.status?.standardCategory === 'PAGO';

      if (isPaid) {
        entry.paidCount++;
        entry.paidValue += relVal;
        totalPaidValue += relVal;
      }

      partnerMap.set(partnerId, entry);
    }

    const partners: BIPartnerAnalyticsItem[] = Array.from(partnerMap.values())
      .map(entry => {
        const conversionRatePercent = entry.count > 0 ? Math.round((entry.paidCount / entry.count) * 1000) / 10 : 0;
        const avgTicketNet = entry.paidCount > 0
          ? Math.round((entry.paidValue / entry.paidCount) * 100) / 100
          : (entry.count > 0 ? Math.round((entry.net / entry.count) * 100) / 100 : 0);

        const avgDwellHours = entry.count > 0 ? Math.round((entry.totalDwellHours / entry.count) * 10) / 10 : null;

        return {
          partnerId: entry.partnerId,
          partnerCode: entry.partnerCode,
          partnerName: entry.partnerName,
          grossValue: Math.round(entry.gross * 100) / 100,
          netValue: Math.round(entry.net * 100) / 100,
          count: entry.count,
          paidCount: entry.paidCount,
          paidValue: Math.round(entry.paidValue * 100) / 100,
          conversionRatePercent,
          avgTicketNet,
          avgDwellHours,
        };
      })
      .sort((a, b) => b.netValue - a.netValue);

    return {
      tenantId,
      period: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      partners,
      summary: {
        totalPartners: partners.length,
        totalGrossValue: Math.round(totalGrossValue * 100) / 100,
        totalNetValue: Math.round(totalNetValue * 100) / 100,
        totalPaidValue: Math.round(totalPaidValue * 100) / 100,
        topPartnerName: partners.length > 0 ? partners[0].partnerName : null,
      },
    };
  }
}
