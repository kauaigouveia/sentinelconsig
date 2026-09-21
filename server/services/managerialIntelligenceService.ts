import { PrismaClient, Prisma, StandardStatusCategory } from '@prisma/client';
import {
  ManagerialInsight,
  OperationalHealthScore,
  ExecutiveHealthScore,
  HealthScoreResponse,
  ScoreClassification,
} from '../../src/types/managerialIntelligence.js';
import { BIFilterOptions } from '../../src/types/bi.js';
import { BIService } from './biService.js';
import { BIComparisonService } from './biComparisonService.js';
import { AnalyticsService } from './analyticsService.js';
import { buildActiveProposalWhere, isStatusFinal } from './statusService.js';

export class ManagerialIntelligenceService {
  /**
   * Helper to classify a score (0-100) into SAUDAVEL, ATENCAO, or CRITICO.
   */
  public static classifyScore(score: number): ScoreClassification {
    if (score >= 80) return 'SAUDAVEL';
    if (score >= 60) return 'ATENCAO';
    return 'CRITICO';
  }

  /**
   * Generates deterministic insights based exclusively on PostgreSQL data and BI comparisons.
   */
  public static async getInsights(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<ManagerialInsight[]> {
    const generatedAt = new Date().toISOString();
    const insights: ManagerialInsight[] = [];

    // 1. Fetch Comparison Data & Rankings
    const comparison = await BIComparisonService.getComparison(prisma, tenantId, filters);
    const rankings = await BIComparisonService.getRankings(prisma, tenantId, filters);
    const curRange = BIService.resolveDateRange(filters);
    const prevRange = BIComparisonService.resolvePreviousDateRange(curRange);

    const periodLabel = curRange.label;
    const comparisonLabel = prevRange.label;

    // INS-PROD-01: Queda Relevante na Produção Paga
    const paidDelta = comparison.metrics.paidProduction;
    if (paidDelta.previous > 0 && paidDelta.deltaPercent <= -10.0) {
      insights.push({
        code: 'INS-PROD-01',
        title: 'Queda Relevante na Produção Paga',
        severity: 'CRITICO',
        category: 'PRODUCAO',
        metric: 'paidProduction',
        currentValue: paidDelta.current,
        previousValue: paidDelta.previous,
        deltaAbsolute: paidDelta.deltaAbsolute,
        deltaPercent: paidDelta.deltaPercent,
        entityType: 'TENANT',
        entityId: tenantId,
        explanation: `Produção paga caiu ${Math.abs(paidDelta.deltaPercent).toFixed(1)}%, de R$ ${paidDelta.previous.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para R$ ${paidDelta.current.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
        recommendation: 'Avaliar volume digitado, conversão e concentração por banco/parceiro.',
        period: periodLabel,
        comparisonPeriod: comparisonLabel,
        generatedAt,
      });
    }

    // INS-PROD-UP: Aumento Relevante na Produção Paga (Info Positiva)
    if (paidDelta.previous > 0 && paidDelta.deltaPercent >= 20.0) {
      insights.push({
        code: 'INS-PROD-UP',
        title: 'Crescimento Expressivo na Produção Paga',
        severity: 'INFO',
        category: 'PRODUCAO',
        metric: 'paidProduction',
        currentValue: paidDelta.current,
        previousValue: paidDelta.previous,
        deltaAbsolute: paidDelta.deltaAbsolute,
        deltaPercent: paidDelta.deltaPercent,
        entityType: 'TENANT',
        entityId: tenantId,
        explanation: `Produção paga aumentou ${paidDelta.deltaPercent.toFixed(1)}%, atingindo R$ ${paidDelta.current.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (anterior R$ ${paidDelta.previous.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`,
        recommendation: 'Manter o acompanhamento dos canais com maior tração e garantir agilidade na liquidação.',
        period: periodLabel,
        comparisonPeriod: comparisonLabel,
        generatedAt,
      });
    }

    // INS-CONV-01: Queda/Baixa Conversão no Banco (Min 10 propostas)
    for (const bankItem of rankings.banks) {
      if (bankItem.count >= 10 && bankItem.conversionRatePercent <= 40.0) {
        insights.push({
          code: 'INS-CONV-01',
          title: `Baixa Conversão no Banco ${bankItem.bankName}`,
          severity: 'ATENCAO',
          category: 'CONVERSAO',
          metric: 'conversionRate',
          currentValue: bankItem.conversionRatePercent,
          previousValue: null,
          deltaAbsolute: null,
          deltaPercent: bankItem.growthPercent ?? null,
          entityType: 'BANK',
          entityId: bankItem.bankId,
          entityName: bankItem.bankName,
          explanation: `Banco ${bankItem.bankName} apresentou conversão de ${bankItem.conversionRatePercent.toFixed(1)}% (total de ${bankItem.count} propostas, ${bankItem.paidCount} pagas).`,
          recommendation: 'Avaliar volume de propostas e taxa de aprovação na esteira do banco.',
          period: periodLabel,
          comparisonPeriod: comparisonLabel,
          generatedAt,
        });
      }
    }

    // INS-CONC-01: Alta Concentração em Banco (Top 1 Bank >= 60%)
    if (rankings.banks.length > 0) {
      const topBank = rankings.banks[0];
      if (topBank.sharePercent >= 60.0 && paidDelta.current > 0) {
        insights.push({
          code: 'INS-CONC-01',
          title: `Alta Concentração no Banco ${topBank.bankName}`,
          severity: 'ATENCAO',
          category: 'CONCENTRACAO',
          metric: 'sharePercent',
          currentValue: topBank.sharePercent,
          previousValue: null,
          deltaAbsolute: null,
          deltaPercent: null,
          entityType: 'BANK',
          entityId: topBank.bankId,
          entityName: topBank.bankName,
          explanation: `Banco ${topBank.bankName} representa ${topBank.sharePercent.toFixed(1)}% da produção paga total do período (R$ ${topBank.paidValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de R$ ${paidDelta.current.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`,
          recommendation: 'Acompanhar diversificação da produção para reduzir dependência de um único canal.',
          period: periodLabel,
          comparisonPeriod: comparisonLabel,
          generatedAt,
        });
      }
    }

    // INS-CANCEL-01: Elevação no Valor de Cancelamentos
    const cancelledDelta = comparison.metrics.cancelledValue;
    if (cancelledDelta.previous > 0 && cancelledDelta.deltaPercent >= 20.0) {
      insights.push({
        code: 'INS-CANCEL-01',
        title: 'Elevação de Cancelamentos',
        severity: 'CRITICO',
        category: 'CANCELAMENTO',
        metric: 'cancelledValue',
        currentValue: cancelledDelta.current,
        previousValue: cancelledDelta.previous,
        deltaAbsolute: cancelledDelta.deltaAbsolute,
        deltaPercent: cancelledDelta.deltaPercent,
        entityType: 'TENANT',
        entityId: tenantId,
        explanation: `Valor de cancelamentos aumentou ${cancelledDelta.deltaPercent.toFixed(1)}%, subindo para R$ ${cancelledDelta.current.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (anterior R$ ${cancelledDelta.previous.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`,
        recommendation: 'Auditar os motivos dos cancelamentos e identificar concentrações por banco, parceiro ou produto.',
        period: periodLabel,
        comparisonPeriod: comparisonLabel,
        generatedAt,
      });
    }

    // INS-SLA-01: Gargalo Crítico na Esteira & INS-CIP-01: Retenção em CIP
    try {
      const bottlenecks = await AnalyticsService.getBottlenecks(prisma, tenantId, {
        startDate: curRange.startDate,
        endDate: curRange.endDate,
        bankId: filters.bankId,
        partnerId: filters.partnerId,
        productId: filters.productId,
        statusId: filters.statusId,
      });

      // INS-SLA-01
      if (bottlenecks.byStatus && bottlenecks.byStatus.length > 0) {
        let worstStatus: typeof bottlenecks.byStatus[0] | null = null;
        let worstOverSlaRate = 0;

        for (const statusItem of bottlenecks.byStatus) {
          if (statusItem.count > 0 && statusItem.overSlaCount >= 1) {
            const overSlaRate = (statusItem.overSlaCount / statusItem.count) * 100;
            if (overSlaRate >= 30.0 && overSlaRate > worstOverSlaRate) {
              worstOverSlaRate = overSlaRate;
              worstStatus = statusItem;
            }
          }
        }

        if (worstStatus) {
          insights.push({
            code: 'INS-SLA-01',
            title: `Gargalo Crítico no Status ${worstStatus.statusName}`,
            severity: 'CRITICO',
            category: 'GARGALO_SLA',
            metric: 'overSlaCount',
            currentValue: worstStatus.overSlaCount,
            previousValue: null,
            deltaAbsolute: null,
            deltaPercent: null,
            entityType: 'STATUS',
            entityId: worstStatus.statusId,
            entityName: worstStatus.statusName,
            explanation: `Status ${worstStatus.statusName} possui ${worstStatus.overSlaCount} propostas acima do SLA, equivalentes a ${worstOverSlaRate.toFixed(1)}% do backlog total da etapa (${worstStatus.count} propostas ativas). Dwell time médio: ${worstStatus.avgHours.toFixed(1)} horas.`,
            recommendation: 'Priorizar a fila do status afetado e avaliar redistribuição operacional.',
            period: periodLabel,
            comparisonPeriod: comparisonLabel,
            generatedAt,
          });
        }
      }

      // INS-CIP-01: Retenção em CIP > 48 horas
      const dwellData = await AnalyticsService.getDwellTime(prisma, tenantId, {
        startDate: curRange.startDate,
        endDate: curRange.endDate,
        bankId: filters.bankId,
        partnerId: filters.partnerId,
      });

      if (dwellData.byStatus && dwellData.byStatus.length > 0) {
        const cipStatus = dwellData.byStatus.find(
          s => s.statusName.toUpperCase().includes('CIP') || s.statusName.toUpperCase().includes('PORTABILIDADE')
        );

        if (cipStatus && cipStatus.avgDurationHours && cipStatus.avgDurationHours > 48.0 && cipStatus.countTransitions >= 1) {
          insights.push({
            code: 'INS-CIP-01',
            title: 'Retenção Excessiva em CIP',
            severity: 'ATENCAO',
            category: 'CIP',
            metric: 'avgDurationHours',
            currentValue: Number(cipStatus.avgDurationHours.toFixed(1)),
            previousValue: null,
            deltaAbsolute: null,
            deltaPercent: null,
            entityType: 'STATUS',
            entityId: cipStatus.statusId || 'CIP_STATUS',
            entityName: cipStatus.statusName,
            explanation: `Retenção média em CIP (${cipStatus.statusName}) está em ${cipStatus.avgDurationHours.toFixed(1)} horas (acima do limite operacional de 48h) com ${cipStatus.countTransitions} transições analisadas.`,
            recommendation: 'Acompanhar a liquidação/retorno das operações em CIP junto à esteira responsável.',
            period: periodLabel,
            comparisonPeriod: comparisonLabel,
            generatedAt,
          });
        }
      }
    } catch (err) {
      // Analytics fallback: continue gracefully if analytics queries have partial missing filters
    }

    return insights;
  }

  /**
   * Computes Executive Health Score (EHS) and Operational Health Score (OHS).
   */
  public static async getHealthScores(
    prisma: PrismaClient,
    tenantId: string,
    filters: BIFilterOptions = {}
  ): Promise<HealthScoreResponse> {
    const generatedAt = new Date().toISOString();

    // 1. Compute Operational Health Score (OHS)
    const activeWhere: Prisma.ProposalWhereInput = buildActiveProposalWhere(tenantId);

    if (filters.bankId) activeWhere.bankId = filters.bankId;
    if (filters.partnerId) activeWhere.partnerId = filters.partnerId;
    if (filters.productId) activeWhere.productId = filters.productId;
    if (filters.statusId) activeWhere.statusId = filters.statusId;

    const activeProposals = await prisma.proposal.findMany({
      where: activeWhere,
      select: {
        id: true,
        createdAt: true,
        standardCategory: true,
        status: {
          select: {
            id: true,
            code: true,
            name: true,
            slaHours: true,
            standardCategory: true,
            finalStatus: true,
          },
        },
      },
    });

    let activeProposalsCount = 0;
    let overSlaCount = 0;
    let atRiskCount = 0;
    let cipRetainedCount = 0;
    const now = new Date();

    for (const prop of activeProposals) {
      if (isStatusFinal(prop.status) || isStatusFinal({ standardCategory: prop.standardCategory as any })) {
        continue;
      }

      activeProposalsCount++;
      const slaHours = prop.status?.slaHours ?? 24;
      const ageHours = (now.getTime() - new Date(prop.createdAt).getTime()) / (1000 * 60 * 60);

      if (ageHours > slaHours) {
        overSlaCount++;
      } else if (ageHours >= slaHours * 0.8) {
        atRiskCount++;
      }

      const stName = (prop.status?.name || '').toUpperCase();
      const stCat = prop.status?.standardCategory;
      if (stName.includes('CIP') || stCat === StandardStatusCategory.PENDENTE) {
        cipRetainedCount++;
      }
    }

    // Overdue Tasks
    const overdueTasksCount = await prisma.task.count({
      where: {
        tenantId,
        completed: false,
        dueDate: {
          lt: now,
        },
      },
    });

    const totalOpenTasksCount = await prisma.task.count({
      where: {
        tenantId,
        completed: false,
      },
    });

    // Penalties Calculation
    const slaPenalty = activeProposalsCount > 0
      ? Math.min(40, Number(((overSlaCount / activeProposalsCount) * 40).toFixed(2)))
      : 0;

    const riskPenalty = activeProposalsCount > 0
      ? Math.min(20, Number(((atRiskCount / activeProposalsCount) * 20).toFixed(2)))
      : 0;

    const cipPenalty = activeProposalsCount > 0
      ? Math.min(20, Number(((cipRetainedCount / activeProposalsCount) * 20).toFixed(2)))
      : 0;

    const overduePenalty = totalOpenTasksCount > 0
      ? Math.min(20, Number(((overdueTasksCount / totalOpenTasksCount) * 20).toFixed(2)))
      : (overdueTasksCount > 0 ? Math.min(20, overdueTasksCount * 2) : 0);

    const rawOhs = 100 - slaPenalty - riskPenalty - cipPenalty - overduePenalty;
    const ohsScore = Math.max(0, Math.min(100, Math.round(rawOhs)));

    const operationalScoreObj: OperationalHealthScore = {
      score: ohsScore,
      classification: this.classifyScore(ohsScore),
      slaPenalty,
      riskPenalty,
      cipPenalty,
      overduePenalty,
      baseValues: {
        activeProposals: activeProposalsCount,
        overSlaCount,
        atRiskCount,
        cipRetainedCount,
        overdueTasksCount,
        totalTasksCount: totalOpenTasksCount,
      },
      generatedAt,
    };

    // 2. Compute Executive Health Score (EHS)
    const comparison = await BIComparisonService.getComparison(prisma, tenantId, filters);

    const curConv = comparison.metrics.conversionRate.current;
    const prevConv = comparison.metrics.conversionRate.previous;
    const hasPreviousBase = comparison.metrics.totalProposals.previous > 0;

    let conversionScore = 0;
    let comparisonAvailable = false;

    if (hasPreviousBase) {
      comparisonAvailable = true;
      const deltaPP = curConv - prevConv;

      if (deltaPP >= 0) {
        conversionScore = 35;
      } else if (deltaPP >= -5.0) {
        conversionScore = 25;
      } else if (deltaPP >= -10.0) {
        conversionScore = 15;
      } else if (deltaPP >= -20.0) {
        conversionScore = 5;
      } else {
        conversionScore = 0;
      }
    } else {
      // Baseline when no previous comparison exists: score based on absolute current conversion
      if (curConv >= 70.0) conversionScore = 35;
      else if (curConv >= 50.0) conversionScore = 25;
      else if (curConv >= 30.0) conversionScore = 15;
      else conversionScore = 5;
    }

    // Growth Score (max 35)
    let growthScore = 0;
    const growthDelta = comparison.metrics.paidProduction;

    if (hasPreviousBase && growthDelta.previous > 0) {
      const gPct = growthDelta.deltaPercent;
      if (gPct >= 10.0) growthScore = 35;
      else if (gPct > 0) growthScore = 25;
      else if (gPct >= -1.0) growthScore = 20; // Estabilidade
      else if (gPct >= -10.0) growthScore = 10;
      else growthScore = 0;
    } else {
      if (growthDelta.current > 0) growthScore = 25;
    }

    // Operational Score (max 30)
    const operationalContrib = Number((ohsScore * 0.30).toFixed(2));

    const rawEhs = conversionScore + growthScore + operationalContrib;
    const ehsScore = Math.max(0, Math.min(100, Math.round(rawEhs)));

    const executiveScoreObj: ExecutiveHealthScore = {
      score: ehsScore,
      classification: this.classifyScore(ehsScore),
      conversionScore,
      growthScore,
      operationalScore: operationalContrib,
      comparisonAvailable,
      baseValues: {
        currentConversion: curConv,
        previousConversion: hasPreviousBase ? prevConv : null,
        currentPaidValue: growthDelta.current,
        previousPaidValue: hasPreviousBase ? growthDelta.previous : null,
        ohsScore,
      },
      generatedAt,
    };

    return {
      executive: executiveScoreObj,
      operational: operationalScoreObj,
      generatedAt,
    };
  }
}
